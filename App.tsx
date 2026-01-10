
import React, { useState, useEffect, useRef } from 'react';
import { PersonaConfig, Project, Toast, ThemeId, AppView } from './types';
import { INITIAL_PERSONAS, THEMES } from './constants';
import { storageService } from './services/storageService';
import { Dashboard } from './components/Dashboard';
import { ProjectWizard } from './components/ProjectWizard';
import { ChatSession } from './components/ChatSession';
import { GlobalPersonaManager } from './components/GlobalPersonaManager';
import { ExpertWorkspace } from './components/ExpertWorkspace';
import { LoginScreen } from './components/LoginScreen';

const App: React.FC = () => {
  // --- Auth State ---
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);

  // --- Loading State ---
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connectionError, setConnectionError] = useState<{isError: boolean, msg: string}>({ isError: false, msg: '' });

  // --- Global App State ---
  const [dashboardTheme, setDashboardTheme] = useState<ThemeId>('sand');
  const [activeTheme, setActiveTheme] = useState<ThemeId>('sand');
  
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // --- Data State ---
  const [personas, setPersonas] = useState<Record<string, PersonaConfig>>(INITIAL_PERSONAS);
  const [personaOrder, setPersonaOrder] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // --- View State ---
  const [view, setView] = useState<AppView>('dashboard');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isPersonaManagerOpen, setIsPersonaManagerOpen] = useState(false);

  const activeProject = projects.find(p => p.id === currentProjectId);
  
  // --- INITIAL DATA LOADING ---
  const loadData = async () => {
    setIsLoading(true);
    setIsSyncing(true);
    setConnectionError({ isError: false, msg: '' });
    
    try {
      const status = await storageService.checkConnection();
      if (!status.online) {
          addToast("Conexão com Supabase falhou. Verifique as tabelas.", "error");
      }

      // Seed e Load
      await storageService.seedInitialData();

      const [loadedTheme, loadedPersonas, loadedOrder, loadedProjects] = await Promise.all([
        storageService.getTheme(),
        storageService.getPersonas(),
        storageService.getPersonaOrder(),
        storageService.getProjects()
      ]);

      setDashboardTheme(loadedTheme);
      setActiveTheme(loadedTheme);
      setPersonas(loadedPersonas);
      setPersonaOrder(loadedOrder);
      setProjects(loadedProjects);
    } catch (error) {
      console.error("Failed to load initial data", error);
      addToast("Erro ao sincronizar dados com a nuvem.", "error");
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  };

  // --- AUTH FLOW ---
  useEffect(() => {
    const unsubscribe = storageService.initAuth((user) => {
      setCurrentUser(user);
      setAuthInitialized(true);
      
      if (user) {
        loadData();
      } else {
        storageService.getTheme().then(theme => {
            setDashboardTheme(theme);
            setActiveTheme(theme);
        });
      }
    });
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await storageService.logout();
    setCurrentUser(null);
  };

  // --- Effects ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme);
  }, [activeTheme]);

  useEffect(() => {
     setActiveTheme(dashboardTheme);
  }, [dashboardTheme]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    if (isThemeMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isThemeMenuOpen]);

  // --- Actions ---
  const addToast = (message: string, type: 'error' | 'info') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  };

  const handleDashboardThemeChange = (newTheme: ThemeId) => {
    setActiveTheme(newTheme);
    setDashboardTheme(newTheme);
    storageService.saveTheme(newTheme);
    setIsThemeMenuOpen(false);
  };

  const handleSessionThemeChange = (newTheme: ThemeId) => {
    setActiveTheme(newTheme);
    setDashboardTheme(newTheme);
    storageService.saveTheme(newTheme);
  };

  const handleSaveProject = async (data: Omit<Project, 'id' | 'createdAt' | 'lastActiveAt'>) => {
    setIsSyncing(true);
    try {
      if (editingProject) {
        const updatedProject: Project = { ...editingProject, ...data };
        setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
        await storageService.saveSingleProject(updatedProject);
        addToast("Sincronizado na nuvem", "info");
      } else {
        const newProject: Project = {
          ...data,
          id: Math.random().toString(36).substring(2, 9),
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          mode: 'council'
        };
        setProjects(prev => [newProject, ...prev]);
        await storageService.saveSingleProject(newProject);
        setCurrentProjectId(newProject.id);
        setView('chat');
      }
      setIsWizardOpen(false);
      setEditingProject(null);
    } catch (e) {
      addToast("Erro ao salvar no backend.", "error");
    } finally {
      setIsSyncing(false);
    }
  };
  
  const handleUpdateProject = async (updated: Project) => {
    setIsSyncing(true);
    try {
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      await storageService.saveSingleProject(updated);
    } catch (e) {
      console.error("Erro autosave:", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteProject = async (id: string) => {
    setIsSyncing(true);
    try {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (currentProjectId === id) setCurrentProjectId(null);
      await storageService.deleteProject(id);
      addToast("Removido da nuvem", "info");
    } catch (e) {
      addToast("Erro ao excluir.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Project Management Handlers ---

  /**
   * Sets the current project as active and navigates to the chat view.
   */
  const handleSelectProject = (id: string) => {
    setCurrentProjectId(id);
    setView('chat');
  };

  /**
   * Prepares a project for editing by opening the wizard.
   */
  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setIsWizardOpen(true);
  };

  /**
   * Creates or opens a one-on-one chat project with a specific persona.
   */
  const handleCreateOneOnOne = async (personaId: string) => {
    const existing = projects.find(p => p.mode === 'chat' && p.activePersonaIds.length === 1 && p.activePersonaIds[0] === personaId);
    if (existing) {
      handleSelectProject(existing.id);
      return;
    }

    setIsSyncing(true);
    try {
      const persona = personas[personaId];
      const newProject: Project = {
        id: `chat_${personaId}_${Date.now()}`,
        title: `Chat com ${persona.name}`,
        description: `Conversa privada com ${persona.role}.`,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        activePersonaIds: [personaId],
        theme: activeTheme,
        mode: 'chat',
        phase: 'exploration'
      };
      setProjects(prev => [newProject, ...prev]);
      await storageService.saveSingleProject(newProject);
      setCurrentProjectId(newProject.id);
      setView('chat');
    } catch (e) {
      addToast("Erro ao iniciar conversa.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Navigates back to the dashboard.
   */
  const handleExitChat = () => {
    setView('dashboard');
    setCurrentProjectId(null);
  };

  /**
   * Closes the project wizard without saving.
   */
  const handleCancelWizard = () => {
    setIsWizardOpen(false);
    setEditingProject(null);
  };

  // --- Persona Management Handlers ---

  /**
   * Saves a persona (new or existing) and updates state and storage.
   */
  const handleSavePersona = async (persona: PersonaConfig) => {
    setIsSyncing(true);
    try {
      const newPersonas = { ...personas, [persona.id]: persona };
      setPersonas(newPersonas);
      
      let newOrder = [...personaOrder];
      if (!newOrder.includes(persona.id)) {
        newOrder.push(persona.id);
        setPersonaOrder(newOrder);
        await storageService.savePersonaOrder(newOrder);
      }
      
      await storageService.savePersonas(newPersonas);
      addToast("Persona salva!", "info");
    } catch (e) {
      addToast("Erro ao salvar persona.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Deletes a persona and updates state and storage.
   */
  const handleDeletePersona = async (id: string) => {
    setIsSyncing(true);
    try {
      const newPersonas = { ...personas };
      delete newPersonas[id];
      setPersonas(newPersonas);
      
      const newOrder = personaOrder.filter(pid => pid !== id);
      setPersonaOrder(newOrder);
      await storageService.savePersonaOrder(newOrder);
      
      await storageService.savePersonas(newPersonas);
      addToast("Persona removida.", "info");
    } catch (e) {
      addToast("Erro ao remover persona.", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSeedDefaults = async () => {
    setIsLoading(true);
    setIsSyncing(true);
    try {
        await storageService.seedInitialData();
        const loadedProjects = await storageService.getProjects();
        setProjects(loadedProjects);
        addToast("Conselhos iniciais restaurados!", "info");
    } catch (err) {
        addToast("Erro ao restaurar conselhos.", "error");
    } finally {
        setIsLoading(false);
        setIsSyncing(false);
    }
  };

  // --- RENDER ---
  if (!authInitialized) {
    return (
      <div className="flex items-center justify-center h-screen bg-main text-body flex-col gap-4">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginScreen 
            currentTheme={activeTheme}
            onSetTheme={handleDashboardThemeChange}
           />;
  }

  return (
    <div className="flex flex-col h-full bg-main text-body relative transition-colors duration-500">
      
      {/* Toast System */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4">
        {toasts.map(toast => (
          <div key={toast.id} className={`px-4 py-3 rounded-xl shadow-xl text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300 flex items-start gap-3 ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-card text-body border border-accent/20 ring-1 ring-accent/10'}`}>
            <span className="shrink-0 mt-0.5 text-lg">
                {toast.type === 'error' ? '🚫' : '💡'}
            </span>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Sync Status Icon */}
      <div className={`fixed bottom-4 left-4 z-50 flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-full text-[10px] font-bold uppercase tracking-widest transition-opacity duration-500 ${isSyncing ? 'opacity-100' : 'opacity-30'}`}>
          <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-green-500 animate-pulse' : 'bg-muted'}`}></div>
          {isSyncing ? 'Sincronizando...' : 'Nuvem OK'}
      </div>

      {(view === 'dashboard' || (view === 'expert-home' && !activeProject)) && (
        <header className="fixed top-0 right-0 p-4 z-30 flex justify-end pointer-events-none gap-2">
          
          <div className="pointer-events-auto flex items-center gap-2 bg-card border border-border rounded-lg shadow-sm p-1">
             <div className="w-8 h-8 rounded-full bg-accent text-accent-fg flex items-center justify-center font-bold text-xs overflow-hidden">
                {currentUser?.user_metadata?.avatar_url ? (
                    <img src={currentUser.user_metadata.avatar_url} alt="User" className="w-full h-full object-cover" />
                ) : (
                    currentUser?.email?.charAt(0).toUpperCase() || 'U'
                )}
             </div>
             <button onClick={handleLogout} className="p-1.5 text-muted hover:text-red-500 rounded-md transition-colors" title="Sair">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
             </button>
          </div>

          <div className="relative pointer-events-auto" ref={themeMenuRef}>
            <button onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)} className="p-2 text-muted hover:text-body hover:bg-hover rounded-lg transition-colors bg-card border border-border shadow-sm h-full" title="Mudar Tema">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
            </button>
            {isThemeMenuOpen && (
              <div className="absolute top-full right-0 mt-2 w-48 bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                 <div className="p-2 space-y-1">
                    {THEMES.map(t => (
                      <button key={t.id} onClick={() => handleDashboardThemeChange(t.id)} className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors ${activeTheme === t.id ? 'bg-hover font-bold text-body' : 'text-muted hover:bg-hover hover:text-body'}`}>
                         <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: t.color }}></div>
                         {t.label}
                      </button>
                    ))}
                 </div>
              </div>
            )}
          </div>
        </header>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-screen bg-main text-body flex-col gap-4">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
            <p className="animate-pulse font-serif italic">Sincronizando com a nuvem...</p>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden h-full">
            {view === 'dashboard' && (
            <Dashboard 
                projects={projects} 
                personas={personas}
                onCreateNew={() => { setEditingProject(null); setIsWizardOpen(true); }}
                onOpenPersonaManager={() => setIsPersonaManagerOpen(true)}
                onSelectProject={handleSelectProject}
                onEditProject={handleEditProject}
                onDeleteProject={handleDeleteProject}
                onOpenExpertWorkspace={() => setView('expert-home')}
                onSeedDefaults={handleSeedDefaults}
            />
            )}
            
            {view === 'expert-home' && (
                <ExpertWorkspace 
                    activeProject={activeProject || null}
                    projects={projects}
                    personas={personas}
                    onSelectProject={handleSelectProject}
                    onCreateChat={handleCreateOneOnOne}
                    onDeleteProject={handleDeleteProject}
                    onBack={() => setView('dashboard')}
                    onNewChat={() => setCurrentProjectId(null)}
                    onUpdateProject={handleUpdateProject}
                    onToast={addToast}
                    globalPersonaOrder={personaOrder}
                    currentTheme={activeTheme}
                    onSetTheme={handleSessionThemeChange}
                    onSavePersona={handleSavePersona}
                    onDeletePersona={handleDeletePersona}
                />
            )}

            {view === 'chat' && activeProject && (
            <ChatSession 
                project={activeProject}
                globalPersonas={personas}
                onUpdateProject={handleUpdateProject}
                onExit={handleExitChat}
                onToast={addToast}
                globalPersonaOrder={personaOrder}
                currentTheme={activeTheme}
                onSetTheme={handleSessionThemeChange}
                isEmbedded={false}
                onSavePersona={handleSavePersona}
                onDeletePersona={handleDeletePersona}
            />
            )}
        </div>
      )}

      {isWizardOpen && (
        <ProjectWizard 
          personas={personas}
          initialData={editingProject} 
          onSave={handleSaveProject}
          onCancel={handleCancelWizard}
        />
      )}

      {isPersonaManagerOpen && (
        <GlobalPersonaManager 
           personas={personas}
           onSave={handleSavePersona}
           onDelete={handleDeletePersona}
           onClose={() => setIsPersonaManagerOpen(false)}
        />
      )}
    </div>
  );
};

export default App;
