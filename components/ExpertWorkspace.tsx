import React, { useState } from 'react';
import { PersonaConfig, Project, ThemeId, Toast } from '../types';
import { ChatSession } from './ChatSession';

interface ExpertWorkspaceProps {
  activeProject: Project | null;
  projects: Project[];
  personas: Record<string, PersonaConfig>;
  onSelectProject: (id: string) => void;
  onCreateChat: (personaId: string) => void;
  onDeleteProject: (id: string) => void;
  onBack: () => void;
  onNewChat: () => void;
  // ChatSession Props
  onUpdateProject: (updatedProject: Project) => void;
  onToast: (msg: string, type: 'error' | 'info') => void;
  globalPersonaOrder: string[];
  currentTheme: ThemeId;
  onSetTheme: (theme: ThemeId) => void;
  onSavePersona?: (persona: PersonaConfig) => void;
  onDeletePersona?: (id: string) => void;
}

export const ExpertWorkspace: React.FC<ExpertWorkspaceProps> = ({
  activeProject,
  projects,
  personas,
  onSelectProject,
  onCreateChat,
  onDeleteProject,
  onBack,
  onNewChat,
  onUpdateProject,
  onToast,
  globalPersonaOrder,
  currentTheme,
  onSetTheme,
  onSavePersona,
  onDeletePersona
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // Filter only 1:1 chat projects
  const chatProjects = projects
    .filter(p => p.mode === 'chat')
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);

  const availablePersonas = (Object.values(personas) as PersonaConfig[]).filter(p => p.id !== 'user');
  
  const filteredPersonas = availablePersonas.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-full bg-main overflow-hidden animate-in fade-in duration-300">
      
      {/* Sidebar - Chat History */}
      <aside className={`w-80 bg-card border-r border-border flex flex-col shrink-0 z-20 shadow-xl md:shadow-none absolute md:relative h-full transition-transform duration-300 ${activeProject ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
        <div className="p-4 border-b border-border flex items-center justify-between shrink-0">
            <button onClick={onBack} className="flex items-center gap-2 text-muted hover:text-body text-sm font-medium transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                Dashboard
            </button>
            <h2 className="font-serif font-bold text-body">Conversas</h2>
        </div>
        
        {/* New Chat Button */}
        <div className="p-3">
             <button 
                onClick={onNewChat}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent/10 text-accent hover:bg-accent/20 rounded-xl font-bold transition-all shadow-sm border border-accent/20"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Nova Conversa
            </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chatProjects.length === 0 && (
                <div className="text-center py-8 text-muted text-sm">
                    Nenhuma conversa recente.
                </div>
            )}
            
            {chatProjects.map(project => {
                const personaId = project.activePersonaIds[0];
                const persona = personas[personaId];
                if (!persona) return null;
                const isActive = activeProject?.id === project.id;

                return (
                    <div 
                        key={project.id} 
                        className={`group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${isActive ? 'bg-hover border-l-4 border-accent shadow-sm' : 'hover:bg-hover border-l-4 border-transparent'}`} 
                        onClick={() => onSelectProject(project.id)}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden ${persona.avatar ? 'bg-transparent' : persona.avatarColor}`}>
                             {persona.avatar ? <img src={persona.avatar} alt="" className="w-full h-full object-cover" /> : persona.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className={`font-bold text-sm truncate ${isActive ? 'text-body' : 'text-muted'}`}>{persona.name}</h3>
                            <p className="text-xs text-muted truncate">
                                {new Date(project.lastActiveAt).toLocaleDateString()}
                            </p>
                        </div>
                        <button 
                            onClick={(e) => { e.stopPropagation(); if(confirm('Excluir conversa?')) onDeleteProject(project.id); }}
                            className="p-1.5 text-muted hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                    </div>
                );
            })}
        </div>
      </aside>

      {/* Main Area */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-main transition-all duration-300">
         
         {activeProject ? (
             <div className="h-full flex flex-col">
                 <ChatSession 
                    project={activeProject}
                    globalPersonas={personas}
                    onUpdateProject={onUpdateProject}
                    onExit={onNewChat} // "Exit" in this context goes back to grid
                    onToast={onToast}
                    globalPersonaOrder={globalPersonaOrder}
                    currentTheme={currentTheme}
                    onSetTheme={onSetTheme}
                    onSavePersona={onSavePersona}
                    onDeletePersona={onDeletePersona}
                    isEmbedded={true}
                 />
             </div>
         ) : (
             <div className="h-full flex flex-col">
                 {/* Mobile Header for Sidebar Toggle fallback - actually not needed if sidebar is full width on mobile, but let's keep clean */}
                 <div className="md:hidden p-4 border-b border-border bg-card flex items-center gap-3">
                     <button onClick={onBack} className="p-2 -ml-2 text-body"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg></button>
                     <span className="font-bold">Especialistas</span>
                 </div>

                 <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="max-w-5xl mx-auto">
                        <div className="text-center mb-10">
                            <h1 className="text-3xl md:text-4xl font-serif font-bold text-body mb-3">Com quem você quer conversar?</h1>
                            <p className="text-muted text-lg">Inicie uma sessão privada com um especialista.</p>
                        </div>

                        <div className="max-w-md mx-auto mb-8 relative">
                            <input 
                                type="text" 
                                placeholder="Buscar especialista..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-full shadow-sm focus:ring-2 focus:ring-accent focus:outline-none transition-all"
                            />
                            <svg className="w-5 h-5 text-muted absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-10">
                            {filteredPersonas.map(persona => (
                                <button 
                                    key={persona.id}
                                    onClick={() => onCreateChat(persona.id)}
                                    className="group flex flex-col items-center p-6 bg-card border border-border rounded-2xl hover:border-accent hover:shadow-lg transition-all text-center relative overflow-hidden"
                                >
                                    <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity ${persona.avatarColor}`}></div>
                                    
                                    <div className={`w-16 h-16 mb-4 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md overflow-hidden ${persona.avatar ? 'bg-transparent' : persona.avatarColor} group-hover:scale-110 transition-transform duration-300`}>
                                        {persona.avatar ? <img src={persona.avatar} alt="" className="w-full h-full object-cover" /> : persona.name.charAt(0)}
                                    </div>
                                    
                                    <h3 className="font-bold text-body text-lg mb-1">{persona.name}</h3>
                                    <p className="text-sm text-muted uppercase tracking-wider text-[10px] mb-2">{persona.role}</p>
                                    <p className="text-sm text-muted line-clamp-2 opacity-80">{persona.systemInstruction.substring(0, 60)}...</p>
                                </button>
                            ))}
                        </div>
                    </div>
                 </div>
             </div>
         )}
      </main>
    </div>
  );
};