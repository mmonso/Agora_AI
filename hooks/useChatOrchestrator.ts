
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
    const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
    
    // --- Refs (Latest Values) ---
    const messagesRef = useRef(messages);
    const processingRef = useRef(false);
    const interviewRequestRef = useRef(false);

    // Keep ref synced
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // --- Load History on Mount ---
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
            storageService.saveMessages(project.id, next);
            return next;
        });

        const updatedProject = { ...project, lastActiveAt: Date.now() };
        onUpdateProject(updatedProject);
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
        // Mutex check
        if (processingRef.current || status === 'paused') return;
        
        const isOneOnOne = project.mode === 'chat';

        // Safety check for multi-agent loops (Only for Council mode)
        if (!isOneOnOne && consecutiveBotTurns >= 6 && !interviewRequestRef.current) {
            setStatus('paused');
            onToast("Pausa para reflexão. Envie uma mensagem para continuar.", "info");
            return;
        }

        processingRef.current = true;
        setIsProcessing(true);
        setStatus('thinking');

        try {
            const currentHistory = messagesRef.current;
            const context = project.description;
            const phase = project.phase || 'exploration';
            
            let speakerId: string | null = null;
            let reasoning = '';

            // --- 1. Determine Speaker ---
            if (isOneOnOne) {
                // Direct Chat Logic: Always pick the first (and likely only) active persona
                speakerId = project.activePersonaIds[0];
                if (!speakerId) {
                    console.error("No persona found for 1:1 chat");
                    setStatus('idle'); 
                    processingRef.current = false;
                    setIsProcessing(false);
                    return;
                }
            } else {
                // Council Logic: Use Router to decide
                const routerResult = await determineNextSpeaker(
                    currentHistory, 
                    project.activePersonaIds, 
                    globalPersonas,
                    context,
                    phase,
                    interviewRequestRef.current
                );

                speakerId = routerResult.nextSpeakerId;
                reasoning = routerResult.reasoning;

                // Handle Phase Change from Router (Only in Council)
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
                    }
                }
            }

            if (!speakerId) {
                setStatus('idle');
                processingRef.current = false;
                setIsProcessing(false);
                return;
            }

            // SAFETY CHECK: Verify if the chosen speaker is actually in the project's active list
            if (!project.activePersonaIds.includes(speakerId)) {
                console.warn(`Router selected invalid speaker: ${speakerId}. Stopping turn.`);
                setStatus('idle');
                processingRef.current = false;
                setIsProcessing(false);
                return;
            }

            setActiveSpeakerId(speakerId);
            
            // --- 2. Generate Content ---
            const speaker = globalPersonas[speakerId];
            const responseText = await generatePersonaResponse(
                speaker,
                currentHistory,
                globalPersonas,
                project.activePersonaIds, 
                context,
                phase,
                interviewRequestRef.current ? 'interview' : 'default'
            );
            
            // Reset interview flag
            if (interviewRequestRef.current) {
                interviewRequestRef.current = false;
            }

            // --- 3. Add Message ---
            const newMessage: Message = {
                id: generateId(),
                senderId: speakerId,
                text: responseText,
                timestamp: Date.now(),
                reasoning: reasoning
            };

            await appendMessage(newMessage);
            
            // --- 4. Cleanup & Next State ---
            setTimeout(() => {
                processingRef.current = false;
                setIsProcessing(false);
                setActiveSpeakerId(null);
                
                if (isOneOnOne) {
                    // In 1:1 chat, we ALWAYS stop after one response
                    setStatus('idle');
                    setConsecutiveBotTurns(0);
                } else {
                    // In Council, we increment turns and let the useEffect trigger the loop
                    setConsecutiveBotTurns(prev => prev + 1);
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

    // --- Trigger Loop (The heartbeat of autonomous conversation) ---
    useEffect(() => {
        // Only trigger loop if status is ACTIVE.
        // In 1:1 chat, processTurn sets status to IDLE at the end, preventing the loop.
        if (status === 'active' && !isProcessing && isHistoryLoaded) {
            const timeout = setTimeout(processTurn, 500);
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
        setStatus('active'); // Start the turn
        setConsecutiveBotTurns(0); 
    };

    const togglePause = () => {
        setStatus(prev => prev === 'active' ? 'paused' : 'active');
    };

    const clearHistory = async () => {
        setMessages([]);
        storageService.clearMessages(project.id);
        setStatus('idle');
        setConsecutiveBotTurns(0);
    };

    const startInterview = () => {
        interviewRequestRef.current = true;
        setStatus('active');
        setConsecutiveBotTurns(0);
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
    };

    const nudge = (personaId: string) => {
        // Nudge logic can trigger a turn even in 1:1 if needed, but primarily for council
        setStatus('active');
        setConsecutiveBotTurns(0);
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
        setMessages(prev => {
            const next = prev.filter(m => m.id !== msgId);
            storageService.saveMessages(project.id, next);
            return next;
        });
        setStatus('active');
        setConsecutiveBotTurns(prev => Math.max(0, prev - 1));
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
