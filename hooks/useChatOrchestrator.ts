
import { useState, useEffect, useRef, useCallback } from 'react';
import { Message, ConversationStatus, Project, PersonaConfig, ProjectPhase, Attachment, ActionPlan } from '../types';
import { TURN_DELAY_MS, USER_ID } from '../constants';
import { storageService } from '../services/storageService';
import { 
    determineNextSpeaker, 
    generatePersonaResponse, 
    generateActionPlan 
} from '../services/geminiService';

const generateId = () => Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

export const useChatOrchestrator = (
    project: Project,
    globalPersonas: Record<string, PersonaConfig>,
    onUpdateProject: (project: Project) => void,
    onToast: (msg: string, type: 'error' | 'info') => void
) => {
    // --- State ---
    const [messages, setMessages] = useState<Message[]>([]);
    const [status, setStatus] = useState<ConversationStatus>('idle');
    const [isProcessing, setIsProcessing] = useState(false);
    const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
    const [consecutiveBotTurns, setConsecutiveBotTurns] = useState(0);
    const [interviewModeRequest, setInterviewModeRequest] = useState(false);
    const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
    
    // --- Refs (Latest Values) ---
    const messagesRef = useRef(messages);
    const processingRef = useRef(false); // Mutex lock
    const interviewRequestRef = useRef(false);

    // Keep ref synced
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // --- Load History on Mount (Async) ---
    useEffect(() => {
        const loadHistory = async () => {
            setIsHistoryLoaded(false);
            const history = await storageService.getMessages(project.id);
            setMessages(history);
            setIsHistoryLoaded(true);
        };
        loadHistory();
    }, [project.id]);

    // --- Helper to Append Message ---
    const appendMessage = useCallback(async (msg: Message) => {
        setMessages(prev => {
            const next = [...prev, msg];
            // Fire and forget save (or await if critical)
            storageService.saveMessages(project.id, next);
            return next;
        });

        // Update Project 'lastActiveAt'
        const updatedProject = { ...project, lastActiveAt: Date.now() };
        onUpdateProject(updatedProject);
        // We don't need to explicitly saveProject here as onUpdateProject usually handles state,
        // but storageService needs to persist it.
        storageService.saveSingleProject(updatedProject);
    }, [project, onUpdateProject]);

    // --- Update Existing Message ---
    const updateMessage = useCallback((msgId: string, updates: Partial<Message>) => {
        setMessages(prev => {
            const next = prev.map(m => m.id === msgId ? { ...m, ...updates } : m);
            storageService.saveMessages(project.id, next);
            return next;
        });
    }, [project.id]);

    // --- Orchestration Logic ---
    const processTurn = useCallback(async () => {
        if (processingRef.current || status === 'paused') return;
        
        // Safety check: Don't let bots talk forever (limit 5 turns before pausing)
        if (consecutiveBotTurns >= 5 && !interviewRequestRef.current) {
            setStatus('paused');
            return;
        }

        processingRef.current = true;
        setIsProcessing(true);
        setStatus('thinking');

        try {
            const currentHistory = messagesRef.current;
            const context = project.description;
            const phase = project.phase || 'exploration';
            
            // 1. Determine Next Speaker
            const routerResult = await determineNextSpeaker(
                currentHistory, 
                project.activePersonaIds, 
                globalPersonas,
                context,
                phase,
                interviewRequestRef.current
            );

            // Handle Phase Change from Router
            if (routerResult.shouldAdvancePhase) {
                let nextPhase: ProjectPhase = phase;
                if (phase === 'exploration') nextPhase = 'synthesis';
                else if (phase === 'synthesis') nextPhase = 'action';
                
                if (nextPhase !== phase) {
                    onUpdateProject({ ...project, phase: nextPhase });
                    await appendMessage({
                        id: generateId(),
                        senderId: 'system',
                        text: `Fase alterada automaticamente para: ${nextPhase.toUpperCase()}`,
                        timestamp: Date.now(),
                        type: 'system'
                    });
                    onToast(`Fase avançada para ${nextPhase}`, 'info');
                }
            }

            const speakerId = routerResult.nextSpeakerId;

            if (!speakerId) {
                setStatus('idle'); // No one wants to speak
                processingRef.current = false;
                setIsProcessing(false);
                return;
            }

            setActiveSpeakerId(speakerId);
            
            // 2. Generate Content
            const speaker = globalPersonas[speakerId];
            const responseText = await generatePersonaResponse(
                speaker,
                currentHistory,
                globalPersonas,
                context,
                phase,
                interviewRequestRef.current ? 'interview' : 'default'
            );
            
            // Reset interview flag if it was active
            if (interviewRequestRef.current) {
                setInterviewModeRequest(false);
                interviewRequestRef.current = false;
            }

            // 3. Add Message
            const newMessage: Message = {
                id: generateId(),
                senderId: speakerId,
                text: responseText,
                timestamp: Date.now(),
                reasoning: routerResult.reasoning
            };

            await appendMessage(newMessage);
            setConsecutiveBotTurns(prev => prev + 1);

            // 4. Schedule Next Turn
            setTimeout(() => {
                processingRef.current = false;
                setIsProcessing(false);
                setActiveSpeakerId(null);
                
                // If not paused, continue
                if (status === 'active') {
                    processTurn();
                } else {
                    setStatus('idle');
                }
            }, TURN_DELAY_MS);

        } catch (error) {
            console.error("Turn error:", error);
            processingRef.current = false;
            setIsProcessing(false);
            setStatus('idle');
            onToast("Erro na rodada de conversa", 'error');
        }
    }, [status, project, globalPersonas, consecutiveBotTurns, onToast, appendMessage, onUpdateProject]);

    // --- Trigger Loop ---
    useEffect(() => {
        if (status === 'active' && !isProcessing && isHistoryLoaded) {
            const timeout = setTimeout(processTurn, 1000);
            return () => clearTimeout(timeout);
        }
    }, [status, isProcessing, processTurn, isHistoryLoaded]);


    // --- User Actions ---
    const sendMessage = async (text: string, attachments: Attachment[] = [], replyTo?: Message) => {
        if (!text.trim() && attachments.length === 0) return;
        
        const userMsg: Message = {
            id: generateId(),
            senderId: USER_ID,
            text,
            attachments,
            timestamp: Date.now()
        };

        if (replyTo) {
            userMsg.text = `> Respondendo a ${globalPersonas[replyTo.senderId]?.name || 'Alguém'}: "${replyTo.text.substring(0, 50)}..."\n\n${text}`;
        }

        await appendMessage(userMsg);
        setStatus('active');
        setConsecutiveBotTurns(0); // Reset bot counter on user intervention
    };

    const togglePause = () => {
        setStatus(prev => prev === 'active' ? 'paused' : 'active');
    };

    const clearHistory = async () => {
        setMessages([]);
        storageService.clearMessages(project.id);
        setStatus('idle');
    };

    const startInterview = () => {
        setInterviewModeRequest(true);
        interviewRequestRef.current = true;
        setStatus('active');
        onToast("Modo Entrevista Ativado. Aguarde a pergunta.", 'info');
    };

    const generatePlan = async () => {
        onToast("Gerando plano de ação...", 'info');
        const plan = await generateActionPlan(messagesRef.current, globalPersonas, project.title);
        
        const planMsg: Message = {
            id: generateId(),
            senderId: 'system',
            text: `Plano de Ação Gerado: **${plan.title}**`,
            timestamp: Date.now(),
            type: 'system',
            actionPlan: plan
        };
        await appendMessage(planMsg);
        onToast("Plano de Ação criado!", 'info');
    };

    const nudge = (personaId: string) => {
        // Manually trigger a specific persona? 
        // For now, we just set status active. 
        // To implement forced speaker, we'd need to change determineNextSpeaker or pass an override.
        // Simplified: User sends a system message "Please speak, [Name]" hiddenly?
        // Let's just resume for now.
        setStatus('active');
        onToast(`Solicitando intervenção de ${globalPersonas[personaId]?.name}...`, 'info');
        // Advanced: We could add a "Nudge" queue.
    };
    
    const toggleActionItem = (msgId: string, itemId: string) => {
        const msg = messages.find(m => m.id === msgId);
        if (msg && msg.actionPlan) {
            const newItems = msg.actionPlan.items.map(i => i.id === itemId ? { ...i, completed: !i.completed } : i);
            updateMessage(msgId, { actionPlan: { ...msg.actionPlan, items: newItems } });
        }
    };
    
    const editMessage = (msgId: string, newText: string) => {
        updateMessage(msgId, { text: newText });
    };

    const regenerateLast = async (msgId: string) => {
        // Remove the last message and try again
        setMessages(prev => {
            const next = prev.filter(m => m.id !== msgId);
            storageService.saveMessages(project.id, next);
            return next;
        });
        setStatus('active');
    };
    
    const addSystemMessage = (text: string) => {
        appendMessage({
            id: generateId(),
            senderId: 'system',
            text,
            timestamp: Date.now(),
            type: 'system'
        });
    };

    return {
        messages,
        status,
        isProcessing,
        activeSpeakerId,
        sendMessage,
        togglePause,
        clearHistory,
        startInterview,
        generatePlan,
        nudge,
        toggleActionItem,
        editMessage,
        regenerateLast,
        addSystemMessage
    };
};
