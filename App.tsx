
import React, { useState, useEffect, useRef } from 'react';
import { PersonaConfig, Project, Toast, ThemeId, AppView } from './types';
import { INITIAL_PERSONAS, USER_ID, THEMES } from './constants';
import { storageService } from './services/storageService';
import { firebaseConfig } from './firebaseConfig';
import { Dashboard } from './components/Dashboard';
import { ProjectWizard } from './components/ProjectWizard';
import { ChatSession } from './components/ChatSession';
import { GlobalPersonaManager } from './components/GlobalPersonaManager';
import { ExpertWorkspace } from './components/ExpertWorkspace';

const App: React.FC = () => {
  // --- Loading State ---
  const [isLoading, setIsLoading] = useState(true);
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
  
  // CHECK CONFIGURATION (Chave de exemplo vs Real)
  const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY_AQUI";

  // --- INITIAL DATA LOADING ---
  const loadData = async () => {
    setIsLoading(true);
    setConnectionError({ isError: false, msg: '' });
    
    try {
      // Verificar conexão primeiro
      const status = await storageService.checkConnection();
      if (!status.online) {
          let errorMsg = "Banco de dados não detectado.";
          if (status.error?.includes('permission-denied')) {
              errorMsg = "ERRO DE PERMISSÃO: O banco está no 'Modo Produção'. Mude para 'Modo Teste' no Console Firebase.";
          } else if (status.error?.includes('not-found') || status.error?.includes('unavailable') || status.error?.includes('failed-precondition')) {
              errorMsg = "Banco de dados não encontrado ou índices ausentes. Aguarde alguns instantes.";
          } else {
             errorMsg = `Erro de Conexão: ${status.error}. Verifique sua internet ou console.`;
          }
          setConnectionError({ isError: true, msg: errorMsg });
          addToast("Modo Offline / Erro de Conexão", "error");
      } else {
          addToast("Conectado ao Banco de Dados!", "info");
      }

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
      addToast("Erro crítico ao carregar dados.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isFirebaseConfigured) {
        setIsLoading(false);
        return;
    }
    loadData();
  }, [isFirebaseConfigured]);

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
    try {
      if (editingProject) {
        // Update existing
        const updatedProject: Project = { ...editingProject, ...data };
        setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
        await storageService.saveSingleProject(updatedProject);
        addToast("Projeto atualizado", "info");
      } else {
        // Create new
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
      console.error(e);
      addToast("Erro ao salvar! Verifique conexão com Firebase.", "error");
    }
  };
  
  const handleImportProject = async (importedProject: Project) => {
    try {
      setProjects(prev => [importedProject, ...prev]);
      await storageService.saveSingleProject(importedProject);
      addToast("Projeto importado com sucesso!", "info");
    } catch (e) {
      addToast("Erro ao salvar projeto importado.", "error");
    }
  };

  const handleCreateOneOnOne = async (personaId: string) => {
      const persona = personas[personaId];
      if (!persona) return;
      
      const newProject: Project = {
          id: Math.random().toString(36).substring(2, 9),
          title: `Chat com ${persona.name}`,
          description: `Conversa direta com ${persona.name} (${persona.role})`,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          activePersonaIds: [personaId],
          theme: dashboardTheme,
          mode: 'chat',
          phase: 'exploration',
          starters: ["Olá! Como você pode me ajudar?", "Gostaria de saber sua opinião sobre...", "Me explique sua visão de mundo."]
      };
      
      try {
        setProjects(prev => [newProject, ...prev]);
        await storageService.saveSingleProject(newProject);
        setCurrentProjectId(newProject.id);
        setView('expert-home'); 
      } catch (e) {
        addToast("Erro ao criar chat. Firestore indisponível?", "error");
      }
  };

  const handleUpdateProject = async (updated: Project) => {
    try {
      setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
      await storageService.saveSingleProject(updated);
    } catch (e) {
      console.error("Erro autosave:", e);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      setProjects(prev => prev.filter(p => p.id !== id));
      if (currentProjectId === id) setCurrentProjectId(null);
      await storageService.deleteProject(id);
      await storageService.clearMessages(id);
    } catch (e) {
      addToast("Erro ao excluir. Tente novamente.", "error");
    }
  };

  const handleSelectProject = (id: string) => {
    const project = projects.find(p => p.id === id);
    if (project) {
        setCurrentProjectId(id);
        if (project.mode === 'chat') {
            setView('expert-home');
        } else {
            setView('chat');
        }
    }
  };

  const handleExitChat = () => {
    setView('dashboard');
    setCurrentProjectId(null);
  };

  const handleEditProject = (project: Project) => {
    setEditingProject(project);
    setIsWizardOpen(true);
  };

  const handleCancelWizard = () => {
    setIsWizardOpen(false);
    setEditingProject(null);
  };
  
  const handleSavePersona = async (persona: PersonaConfig) => {
    try {
      const newPersonas = { ...personas, [persona.id]: persona };
      setPersonas(newPersonas);
      await storageService.savePersonas(newPersonas);
      addToast(`Persona "${persona.name}" salva`, 'info');
    } catch (e) {
      addToast("Erro ao salvar persona no banco.", "error");
    }
  };

  const handleDeletePersona = async (id: string) => {
    try {
      const newPersonas = { ...personas };
      delete newPersonas[id];
      setPersonas(newPersonas);
      await storageService.savePersonas(newPersonas);
      
      const updatedProjects = projects.map(p => ({
          ...p,
          activePersonaIds: p.activePersonaIds.filter(pid => pid !== id)
      }));
      setProjects(updatedProjects);
      updatedProjects.forEach(p => storageService.saveSingleProject(p));

      addToast('Persona excluída', 'info');
    } catch (e) {
      addToast("Erro ao excluir persona.", "error");
    }
  };

  // --- RENDER ---
  if (!isFirebaseConfigured) {
      return (
          <div className="flex items-center justify-center min-h-screen bg-stone-900 text-stone-100 p-6 font-sans">
              <div className="max-w-xl text-center">
                  <h1 className="text-2xl font-bold mb-4">Configuração Necessária</h1>
                  <p className="text-stone-400">Edite o arquivo <code>firebaseConfig.ts</code> com suas chaves.</p>
              </div>
          </div>
      );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-main text-body flex-col gap-4">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
        <p className="animate-pulse">Conectando ao Firebase...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-main text-body relative transition-colors duration-500">
      
      {/* Global Connection Warning */}
      {connectionError.isError && (
          <div className="bg-red-600 text-white px-4 py-3 text-center text-sm font-bold z-[101] shadow-lg flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 animate-in slide-in-from-top-full duration-300">
              <div className="flex items-center gap-2">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                 <span>{connectionError.msg}</span>
              </div>
              <button 
                onClick={loadData}
                className="px-3 py-1 bg-white/20 hover:bg-white/30 rounded-md text-xs font-bold uppercase tracking-wider transition-colors border border-white/40"
              >
                Tentar Conectar Novamente
              </button>
          </div>
      )}
      
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

      {(view === 'dashboard' || (view === 'expert-home' && !activeProject)) && (
        <header className="fixed top-0 right-0 p-4 z-30 flex justify-end pointer-events-none">
          <div className="relative pointer-events-auto" ref={themeMenuRef}>
            <button onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)} className="p-2 text-muted hover:text-body hover:bg-hover rounded-lg transition-colors bg-card border border-border shadow-sm">
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
            onImportProject={handleImportProject}
            onOpenExpertWorkspace={() => setView('expert-home')}
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
            onSavePersona={handleSavePersona}
            onDeletePersona={handleDeletePersona}
            isEmbedded={false}
          />
        )}
      </div>

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
