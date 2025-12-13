
import { useState, useEffect, useRef, useCallback } from 'react';
import { Message, ConversationStatus, Project, PersonaConfig, ProjectPhase, Attachment, ActionPlan } from '../types';
import { STORAGE_KEYS, TURN_DELAY_MS, USER_ID } from '../constants';
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
    
    // --- Refs (Latest Values) ---
    const messagesRef = useRef(messages);
    const processingRef = useRef(false); // Mutex lock
    const interviewRequestRef = useRef(false);

    // Sync refs
    useEffect(() => { messagesRef.current = messages; }, [messages]);
    useEffect(() => { interviewRequestRef.current = interviewModeRequest; }, [interviewModeRequest]);

    // Load Messages
    useEffect(() => {
        const key = `${STORAGE_KEYS.MESSAGES_PREFIX}${project.id}`;
        const stored = localStorage.getItem(key);
        if (stored) {
            try {
                setMessages(JSON.parse(stored));
            } catch (e) { console.error("Failed to load messages"); }
        } else {
            setMessages([]);
            setStatus('idle');
            setConsecutiveBotTurns(0);
        }
    }, [project.id]);

    // Save Messages
    useEffect(() => {
        const key = `${STORAGE_KEYS.MESSAGES_PREFIX}${project.id}`;
        localStorage.setItem(key, JSON.stringify(messages));
    }, [messages, project.id]);

    // Update Last Active
    useEffect(() => {
        if (messages.length > 0) {
            onUpdateProject({ ...project, lastActiveAt: Date.now() });
        }
    }, [messages.length]);

    // --- Helpers ---
    const addSystemMessage = (text: string) => {
        const msg: Message = {
            id: generateId(),
            senderId: 'system',
            text: text,
            timestamp: Date.now(),
            type: 'system'
        };
        setMessages(prev => [...prev, msg]);
    };

    // --- Core Logic: Process a Single Turn ---
    const processTurn = useCallback(async () => {
        // Double check locks
        if (processingRef.current) return;
        if (status !== 'active') return;
        
        const activePersonaIds = project.activePersonaIds;
        if (activePersonaIds.length === 0) return;

        // Safety break
        if (consecutiveBotTurns >= 15) {
            setStatus('idle');
            setConsecutiveBotTurns(0);
            onToast("Moderador: Pausa automática após 15 turnos.", "info");
            return;
        }

        // Lock & Set Visual State
        processingRef.current = true;
        setIsProcessing(true);
        setActiveSpeakerId(null); // Clear previous speaker visual
        setStatus('thinking'); 

        try {
            const isInterview = interviewRequestRef.current;
            const isOneOnOne = project.mode === 'chat';

            let nextId: string | null = null;
            let reasoning = "";

            if (isOneOnOne) {
                // --- ONE-ON-ONE MODE ---
                // Skip the Router. Just pick the only active persona.
                nextId = activePersonaIds[0];
                reasoning = "Resposta direta do especialista.";
            } else {
                // --- COUNCIL MODE ---
                // 1. Router: Who speaks next?
                let decision = await determineNextSpeaker(
                    messagesRef.current,
                    activePersonaIds,
                    globalPersonas,
                    project.description,
                    project.phase,
                    isInterview
                );

                // 2. Phase Transition Check
                if (decision.shouldAdvancePhase && !isInterview) {
                    let nextPhase: ProjectPhase | null = null;
                    if (project.phase === 'exploration') nextPhase = 'synthesis';
                    else if (project.phase === 'synthesis') nextPhase = 'action';
                    
                    if (nextPhase) {
                        onUpdateProject({ ...project, phase: nextPhase });
                        addSystemMessage(`O moderador avançou a fase para: ${nextPhase.toUpperCase()}`);
                        onToast("Fase avançada. Debate continua...", "info");
                        
                        // Unlock but keep status Active
                        setStatus('active'); 
                        processingRef.current = false;
                        setIsProcessing(false);
                        return; 
                    }
                }
                
                nextId = decision.nextSpeakerId;
                reasoning = decision.reasoning;
            }

            // --- ROBUSTNESS: FALLBACK LOGIC (Only for Council) ---
            if (!isOneOnOne && (!nextId || !activePersonaIds.includes(nextId))) {
                const lastSpeakerId = messagesRef.current.length > 0 
                    ? messagesRef.current[messagesRef.current.length - 1].senderId 
                    : null;
                const available = activePersonaIds.filter(id => id !== lastSpeakerId);
                const candidates = available.length > 0 ? available : activePersonaIds;
                nextId = candidates[Math.floor(Math.random() * candidates.length)];
                if (!reasoning) reasoning = "Decisão automática (Fallback).";
                console.log("Router fallback triggered. Selected:", nextId);
            }

            // 3. Generate Content
            if (nextId) {
                setActiveSpeakerId(nextId); // Show specific speaker thinking immediately
                
                const speakerConfig = globalPersonas[nextId];
                const responseText = await generatePersonaResponse(
                    speakerConfig,
                    messagesRef.current,
                    globalPersonas,
                    project.description,
                    project.phase,
                    isInterview ? 'interview' : 'default'
                );

                if (isInterview) setInterviewModeRequest(false);

                const newMessage: Message = {
                    id: generateId(),
                    senderId: nextId,
                    text: responseText,
                    timestamp: Date.now(),
                    reasoning: reasoning,
                    type: 'normal'
                };

                // Update State -> Triggers Effect -> Triggers Next Turn
                setMessages(prev => [...prev, newMessage]);
                setConsecutiveBotTurns(prev => prev + 1);

                if (isInterview || isOneOnOne) {
                    setStatus('idle'); // Stop loop for 1:1 or after interview question
                    setConsecutiveBotTurns(0);
                } else {
                    setStatus('active'); // Continue loop for council
                }

            } else {
                setStatus('idle');
                setConsecutiveBotTurns(0);
                onToast("Erro: Nenhum orador disponível.", "error");
            }

        } catch (error) {
            console.error("Turn failed", error);
            onToast("Erro na geração. Tentando recuperar...", "error");
            setStatus('idle');
        } finally {
            // Unlock
            processingRef.current = false;
            setIsProcessing(false);
            setActiveSpeakerId(null);
        }
    }, [status, project.activePersonaIds, project.phase, project.description, consecutiveBotTurns, globalPersonas, onToast, onUpdateProject, project]);


    // --- The Loop Driver (Event Driven) ---
    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        // Only schedule next turn if:
        // 1. Status is Active (User pressed Play or loop continued)
        // 2. Not currently processing (Mutex)
        // 3. Have personas
        if (status === 'active' && !isProcessing && project.activePersonaIds.length > 0) {
            
            // Determine dynamic delay
            const lastMsg = messages[messages.length - 1];
            const isUserLast = lastMsg?.senderId === USER_ID;
            // Shorter delay if user just spoke (feels more responsive)
            const delay = isUserLast ? 1000 : TURN_DELAY_MS;

            timeoutId = setTimeout(() => {
                processTurn();
            }, delay);
        }

        return () => clearTimeout(timeoutId);
    }, [messages, status, isProcessing, processTurn, project.activePersonaIds.length]);


    // --- Actions ---

    const sendMessage = useCallback((text: string, attachments: Attachment[], replyingTo?: { message: Message, senderName: string }) => {
        let finalText = text;
        if (replyingTo) {
            const truncated = replyingTo.message.text.substring(0, 100).replace(/\n/g, ' ');
            const quote = `> **${replyingTo.senderName}**: ${truncated}${replyingTo.message.text.length > 100 ? '...' : ''}\n\n`;
            finalText = quote + text;
        }

        const userMessage: Message = {
            id: generateId(),
            senderId: USER_ID,
            text: finalText,
            timestamp: Date.now(),
            attachments,
            type: 'normal'
        };

        setMessages(prev => [...prev, userMessage]);
        setConsecutiveBotTurns(0);
        
        // Auto-start
        if (project.activePersonaIds.length > 0) {
            setStatus('active');
        }
    }, [project.activePersonaIds]);

    const togglePause = useCallback(() => {
        if (project.activePersonaIds.length === 0 && status === 'idle') return;
        setStatus(prev => (prev === 'active' || prev === 'thinking' ? 'paused' : 'active'));
    }, [status, project.activePersonaIds]);

    const clearHistory = useCallback(() => {
        if (window.confirm('Apagar histórico deste projeto?')) {
            setMessages([]);
            setStatus('idle');
            setConsecutiveBotTurns(0);
        }
    }, []);

    const startInterview = useCallback(() => {
        onToast("Iniciando entrevista...", "info");
        addSystemMessage("O usuário solicitou ser entrevistado para aprofundar o contexto.");
        setInterviewModeRequest(true);
        setStatus('active');
    }, []);

    const generatePlan = useCallback(async () => {
        if (project.activePersonaIds.length === 0) return;
        onToast("Gerando Plano de Ação...", "info");
        setActiveSpeakerId(project.activePersonaIds[0]);
        setStatus('thinking');
        setIsProcessing(true);
        processingRef.current = true;

        try {
            const plan = await generateActionPlan(messagesRef.current, globalPersonas, project.title);
            const msg: Message = {
                id: generateId(),
                senderId: project.activePersonaIds[0],
                text: "Aqui está um plano prático baseado em nossa discussão:",
                timestamp: Date.now(),
                type: 'normal',
                actionPlan: plan
            };
            setMessages(prev => [...prev, msg]);
            onToast("Plano de Ação Criado!", "info");
        } catch (e) {
            onToast("Erro ao gerar plano", "error");
        } finally {
            setIsProcessing(false);
            processingRef.current = false;
            setStatus('idle');
            setActiveSpeakerId(null);
        }
    }, [project, globalPersonas]);

    const nudge = useCallback(async (id: string) => {
        if (processingRef.current) return;
        setActiveSpeakerId(id);
        setStatus('thinking');
        processingRef.current = true;
        setIsProcessing(true);

        try {
            const resp = await generatePersonaResponse(
                globalPersonas[id],
                messagesRef.current,
                globalPersonas,
                project.description,
                project.phase
            );
            const msg: Message = {
                id: generateId(),
                senderId: id,
                text: resp,
                timestamp: Date.now(),
                reasoning: "Intervenção Manual do Usuário",
                type: 'normal'
            };
            setMessages(prev => [...prev, msg]);
            setConsecutiveBotTurns(prev => prev + 1);
            setStatus('active');
        } catch (e) {
            onToast("Erro ao forçar fala", "error");
            setStatus('idle');
        } finally {
            setActiveSpeakerId(null);
            processingRef.current = false;
            setIsProcessing(false);
        }
    }, [globalPersonas, project]);

    const toggleActionItem = (msgId: string, itemId: string) => {
        setMessages(prev => prev.map(msg => {
            if (msg.id === msgId && msg.actionPlan) {
                const newItems = msg.actionPlan.items.map(item => 
                   item.id === itemId ? { ...item, completed: !item.completed } : item
                );
                return { ...msg, actionPlan: { ...msg.actionPlan, items: newItems } };
            }
            return msg;
        }));
    };

    const editMessage = (msgId: string, newText: string) => {
        setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: newText } : m));
    };

    const regenerateLast = () => {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg && lastMsg.senderId !== USER_ID) {
            setMessages(prev => prev.slice(0, -1));
            setStatus('active');
            setConsecutiveBotTurns(Math.max(0, consecutiveBotTurns - 1));
        }
    };

    return {
        messages,
        status,
        isProcessing,
        activeSpeakerId,
        consecutiveBotTurns,
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
