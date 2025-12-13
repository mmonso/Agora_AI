import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { Controls } from './Controls';
import { PersonaSelector } from './PersonaSelector';
import { Message, PersonaId, PersonaConfig, Attachment, Project, ThemeId, ProjectPhase } from '../types';
import { CONVERSATION_STARTERS, THEMES, USER_ID } from '../constants';
import { 
    generateConversationStarters, 
    generateMeetingMinutes,
    updateProjectContextFromConversation
} from '../services/geminiService';
import { useChatOrchestrator } from '../hooks/useChatOrchestrator';

interface ChatSessionProps {
  project: Project;
  globalPersonas: Record<string, PersonaConfig>;
  onUpdateProject: (updatedProject: Project) => void;
  onExit: () => void;
  onToast: (msg: string, type: 'error' | 'info') => void;
  globalPersonaOrder: string[];
  currentTheme: ThemeId;
  onSetTheme: (theme: ThemeId) => void;
  onSavePersona?: (persona: PersonaConfig) => void;
  onDeletePersona?: (id: string) => void;
  isEmbedded?: boolean; // New prop to hide back button/adjust layout
}

export const ChatSession: React.FC<ChatSessionProps> = ({ 
  project, globalPersonas, onUpdateProject, onExit, onToast, globalPersonaOrder, currentTheme, onSetTheme, onSavePersona, onDeletePersona, isEmbedded = false
}) => {
  // Use the Orchestrator Hook
  const {
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
  } = useChatOrchestrator(project, globalPersonas, onUpdateProject, onToast);

  // --- UI Local State ---
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ message: Message; senderName: string } | null>(null);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPhaseMenuOpen, setIsPhaseMenuOpen] = useState(false);
  const [isRegeneratingStarters, setIsRegeneratingStarters] = useState(false);

  // Computed
  const activePersonaIds = project.activePersonaIds;
  const currentPhase = project.phase || 'exploration';
  const activeStarters = project.starters && project.starters.length > 0 ? project.starters : CONVERSATION_STARTERS;
  const isOneOnOne = project.mode === 'chat';

  // Refs for UI interactions
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const phaseMenuRef = useRef<HTMLDivElement>(null);

  // Click outside for menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) setIsThemeMenuOpen(false);
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) setIsMenuOpen(false);
      if (phaseMenuRef.current && !phaseMenuRef.current.contains(event.target as Node)) setIsPhaseMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Scroll Logic ---
  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const distanceToBottom = scrollHeight - (scrollTop + clientHeight);
      const isNear = distanceToBottom < 100;
      isNearBottomRef.current = isNear;
      setShowScrollButton(!isNear);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (isNearBottomRef.current && scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    } else if (!isNearBottomRef.current) {
      setShowScrollButton(true);
    }
  }, [messages, isProcessing, activeSpeakerId]);

  // --- Handlers (UI/Bridge) ---
  const handleSendMessageBridge = (text: string, attachments: Attachment[] = []) => {
      sendMessage(text, attachments, replyingTo?.message);
      setReplyingTo(null);
      isNearBottomRef.current = true;
  };

  const handleGenerateMinutes = async () => {
      onToast("Gerando Ata de Reunião...", "info");
      const minutes = await generateMeetingMinutes(messages, globalPersonas, project.title);
      const blob = new Blob([minutes], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ATA-${project.title.replace(/\s+/g, '-')}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setIsMenuOpen(false);
  };

  const handleAutoUpdateContext = async () => {
      onToast("Analisando conversa e atualizando contexto...", "info");
      const newDesc = await updateProjectContextFromConversation(project.description, messages, globalPersonas);
      onUpdateProject({ ...project, description: newDesc });
      onToast("Contexto Global Atualizado!", "info");
      setIsMenuOpen(false);
  };

  const handleRegenerateStarters = async () => {
    setIsRegeneratingStarters(true);
    try {
        const newStarters = await generateConversationStarters(project.title, project.description);
        onUpdateProject({ ...project, starters: newStarters });
        onToast("Sugestões atualizadas!", "info");
    } catch (e) {
        onToast("Erro ao gerar sugestões", "error");
    } finally {
        setIsRegeneratingStarters(false);
    }
  };
  
  const handleThemeChange = (newTheme: ThemeId) => {
      onSetTheme(newTheme);
      onUpdateProject({ ...project, theme: newTheme });
  };

  const handlePhaseChange = (phase: ProjectPhase) => {
      if (phase === project.phase) return;
      addSystemMessage(`O usuário optou por mudar para a fase: ${phase.toUpperCase()}`);
      onUpdateProject({ ...project, phase });
      setIsPhaseMenuOpen(false);
      onToast(`Fase alterada para: ${phase.toUpperCase()}`, 'info');
  };

  const handleTogglePersona = (id: PersonaId) => {
    const currentIds = project.activePersonaIds;
    const exists = currentIds.includes(id);
    let newIds: string[];
    if (exists) {
      if (currentIds.length === 1 && status !== 'idle') return; 
      newIds = currentIds.filter(pid => pid !== id);
    } else {
      newIds = [...currentIds, id];
    }
    onUpdateProject({ ...project, activePersonaIds: newIds });
  };

  // Actions map for Menu
  const handleStartInterviewUI = () => { startInterview(); setIsMenuOpen(false); }
  const handleGeneratePlanUI = () => { generatePlan(); setIsMenuOpen(false); }

  return (
    <div className={`flex flex-col h-full relative ${isEmbedded ? 'bg-main' : ''}`}>
       {/* Session Header */}
      <header className={`flex-none bg-card border-b border-border shadow-sm z-20 flex flex-col ${isEmbedded ? 'bg-opacity-50' : ''}`}>
        <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
                {!isEmbedded && (
                    <button onClick={onExit} className="p-2 -ml-2 text-muted hover:text-body hover:bg-hover rounded-lg">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    </button>
                )}
                {isEmbedded && (
                     <div className="md:hidden">
                        {/* Mobile back button strictly for navigating back to list in ExpertWorkspace, usually handled by parent but added here for safety if needed or just empty */}
                        <button onClick={onExit} className="p-2 -ml-2 text-muted hover:text-body">
                             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                        </button>
                     </div>
                )}
                <div className="min-w-0 group cursor-default relative">
                    <h2 className="font-bold text-body truncate text-lg">{project.title.replace('Chat com ', '')}</h2>
                    <p className="text-xs text-muted truncate max-w-md">{project.description || (isOneOnOne ? "Conversa privada" : "Conversa Livre")}</p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                
                {/* Phase Selector (Only for Council) */}
                {!isOneOnOne && (
                  <div className="relative hidden md:block" ref={phaseMenuRef}>
                    <button 
                        onClick={() => setIsPhaseMenuOpen(!isPhaseMenuOpen)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors"
                        title="Fase Atual (Clique para alterar)"
                    >
                        <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                        <span className="text-xs font-bold text-accent uppercase tracking-wide">
                            {currentPhase === 'exploration' && '1. Exploração'}
                            {currentPhase === 'synthesis' && '2. Síntese'}
                            {currentPhase === 'action' && '3. Ação'}
                        </span>
                        <svg className="w-3 h-3 text-accent opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </button>

                    {isPhaseMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95">
                             <div className="p-1">
                                <button onClick={() => handlePhaseChange('exploration')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${currentPhase === 'exploration' ? 'bg-accent text-white' : 'text-body hover:bg-hover'}`}>1. Exploração</button>
                                <button onClick={() => handlePhaseChange('synthesis')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${currentPhase === 'synthesis' ? 'bg-accent text-white' : 'text-body hover:bg-hover'}`}>2. Síntese</button>
                                <button onClick={() => handlePhaseChange('action')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${currentPhase === 'action' ? 'bg-accent text-white' : 'text-body hover:bg-hover'}`}>3. Ação</button>
                             </div>
                        </div>
                    )}
                  </div>
                )}

                {/* Mobile Phase Button (Only for Council) */}
                {!isOneOnOne && (
                  <div className="md:hidden relative">
                    <button onClick={() => setIsPhaseMenuOpen(!isPhaseMenuOpen)} className="p-2 text-accent bg-accent/10 rounded-lg">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                    {isPhaseMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50">
                             <div className="p-1">
                                <button onClick={() => handlePhaseChange('exploration')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${currentPhase === 'exploration' ? 'bg-accent text-white' : 'text-body hover:bg-hover'}`}>1. Exploração</button>
                                <button onClick={() => handlePhaseChange('synthesis')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${currentPhase === 'synthesis' ? 'bg-accent text-white' : 'text-body hover:bg-hover'}`}>2. Síntese</button>
                                <button onClick={() => handlePhaseChange('action')} className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium ${currentPhase === 'action' ? 'bg-accent text-white' : 'text-body hover:bg-hover'}`}>3. Ação</button>
                             </div>
                        </div>
                    )}
                  </div>
                )}
                
                {!isOneOnOne && <div className="w-px h-6 bg-border mx-1"></div>}

                {/* Global Actions Menu */}
                <div className="relative" ref={actionMenuRef}>
                    <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="p-2 text-muted hover:text-body hover:bg-hover rounded-lg" title="Opções do Projeto">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                    </button>
                    {isMenuOpen && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95">
                            <div className="p-1">
                                {!isOneOnOne && currentPhase !== 'action' && (
                                    <button onClick={handleStartInterviewUI} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors text-left">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                        <span>Me Entreviste</span>
                                    </button>
                                )}

                                {!isOneOnOne && currentPhase === 'action' && (
                                    <button onClick={handleGeneratePlanUI} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-green-600 hover:bg-green-600/10 rounded-lg transition-colors text-left">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                                        <span>Gerar Plano de Ação</span>
                                    </button>
                                )}

                                {!isOneOnOne && <div className="h-px bg-border my-1"></div>}

                                <button onClick={handleGenerateMinutes} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-muted hover:text-body hover:bg-hover rounded-lg transition-colors text-left">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span>Baixar Ata de Reunião</span>
                                </button>
                                {!isOneOnOne && (
                                    <button onClick={handleAutoUpdateContext} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-muted hover:text-body hover:bg-hover rounded-lg transition-colors text-left">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        <span>Atualizar Contexto (IA)</span>
                                    </button>
                                )}
                                <div className="h-px bg-border my-1"></div>
                                <button onClick={clearHistory} className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-500 hover:bg-red-500/10 rounded-lg transition-colors text-left">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    <span>Limpar Histórico</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Theme Selector */}
                <div className="relative" ref={themeMenuRef}>
                <button onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)} className="p-2 text-muted hover:text-body hover:bg-hover rounded-lg transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
                </button>
                {isThemeMenuOpen && (
                    <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-2 space-y-1">
                        {THEMES.map(t => (
                            <button key={t.id} onClick={() => { handleThemeChange(t.id); setIsThemeMenuOpen(false); }} className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${currentTheme === t.id ? 'bg-hover font-bold text-body' : 'text-muted hover:bg-hover hover:text-body'}`}>
                            <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: t.color }}></div>
                            {t.label}
                            </button>
                        ))}
                    </div>
                    </div>
                )}
                </div>
                
                {/* Team Selector (Only for Council) */}
                {!isOneOnOne && (
                  <div className="relative">
                    <button 
                        ref={null}
                        onClick={() => setIsSelectorOpen(!isSelectorOpen)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isSelectorOpen ? 'bg-hover text-body' : 'text-muted hover:bg-hover hover:text-body'}`}
                    >
                        <span className="hidden md:inline">Time</span>
                        <span className="md:hidden">Bots</span>
                        <span className="bg-body text-main text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {activePersonaIds.length}
                        </span>
                    </button>
                    
                    <PersonaSelector 
                        personas={globalPersonas}
                        activeIds={activePersonaIds} 
                        onToggle={handleTogglePersona}
                        onSave={onSavePersona || (() => {})}
                        onDelete={onDeletePersona || (() => {})} 
                        isOpen={isSelectorOpen}
                        onClose={() => setIsSelectorOpen(false)}
                        nextSpeakerId={undefined} 
                        onNudge={nudge}
                    />
                  </div>
                )}
            </div>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 relative overflow-hidden" onClick={() => setIsSelectorOpen(false)}>
        <div ref={scrollRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto px-4 py-6 scroll-smooth">
          <div className="max-w-4xl mx-auto min-h-full flex flex-col justify-end">
            
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center text-center py-20 animate-in fade-in zoom-in-95 duration-500 opacity-60">
                <div className="w-20 h-20 bg-hover rounded-full flex items-center justify-center mb-6 text-muted">
                   <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </div>
                <p className="text-muted max-w-md">
                   {isOneOnOne 
                     ? "Inicie a conversa direta com o especialista." 
                     : "O Conselho está reunido. Ao enviar sua primeira mensagem, os especialistas iniciarão o debate autônomo entre si."}
                </p>
                 <div className="flex flex-col items-center gap-4 max-w-2xl mt-6">
                    <div className="flex flex-wrap justify-center gap-2">
                        {activeStarters.map((starter, idx) => (
                            <button key={idx} onClick={() => handleSendMessageBridge(starter)} className="px-3 py-1.5 bg-card border border-border rounded-full text-xs text-muted hover:bg-hover hover:text-body transition-all">
                                {starter}
                            </button>
                        ))}
                    </div>
                    
                    <button 
                        onClick={handleRegenerateStarters} 
                        disabled={isRegeneratingStarters}
                        className="flex items-center gap-1.5 text-xs text-accent opacity-80 hover:opacity-100 hover:underline disabled:opacity-50 transition-all mt-2"
                    >
                         {isRegeneratingStarters ? (
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        )}
                        Refazer sugestões
                    </button>
                </div>
              </div>
            )}

            {messages.map((msg, index) => (
              <ChatMessage 
                key={msg.id} 
                message={msg} 
                persona={globalPersonas[msg.senderId]}
                isUser={msg.senderId === USER_ID}
                onReply={(m) => setReplyingTo({ message: m, senderName: globalPersonas[m.senderId]?.name || 'Desconhecido' })}
                onEdit={editMessage}
                onRegenerate={index === messages.length - 1 && msg.senderId !== USER_ID ? regenerateLast : undefined}
                onActionToggle={toggleActionItem}
              />
            ))}

            {status === 'thinking' && activeSpeakerId && (
               <div className="flex items-center gap-2 mb-4 text-muted animate-pulse pl-2">
                 <div className={`w-2 h-2 rounded-full ${globalPersonas[activeSpeakerId]?.avatarColor || 'bg-gray-400'}`}></div>
                 <span className="text-xs font-medium uppercase tracking-wider">
                   {globalPersonas[activeSpeakerId]?.role || '...'} está formulando...
                 </span>
               </div>
            )}
             {status === 'thinking' && !activeSpeakerId && (
               <div className="flex items-center gap-2 mb-4 text-muted animate-pulse pl-2">
                 <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                 <span className="text-xs font-medium uppercase tracking-wider">
                   Conselho está deliberando...
                 </span>
               </div>
            )}

            <div className="h-4" />
          </div>
        </div>
        
        {showScrollButton && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 animate-bounce">
                <button onClick={scrollToBottom} className="flex items-center gap-2 px-4 py-2 bg-accent text-accent-fg rounded-full shadow-lg text-sm font-medium hover:opacity-90 transition-opacity">
                    Novas mensagens ↓
                </button>
            </div>
        )}
      </main>

      <footer className="flex-none bg-main border-t border-border z-10" onClick={() => setIsSelectorOpen(false)}>
        <Controls 
          isPaused={status === 'paused'} 
          isActive={status !== 'idle'}
          onTogglePause={togglePause}
          onSendMessage={handleSendMessageBridge}
          disabled={isProcessing || (activePersonaIds.length === 0 && status === 'idle')}
          replyingTo={replyingTo}
          onCancelReply={() => setReplyingTo(null)}
        />
      </footer>
    </div>
  );
};