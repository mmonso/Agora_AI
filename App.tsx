
import React, { useState, useEffect, useRef } from 'react';
import { PersonaConfig, Project, Toast, ThemeId, AppView, ProjectMode } from './types';
import { INITIAL_PERSONAS, INITIAL_PROJECTS, STORAGE_KEYS, THEMES, USER_ID, COLOR_OPTIONS } from './constants';
import { Dashboard } from './components/Dashboard';
import { ProjectWizard } from './components/ProjectWizard';
import { ChatSession } from './components/ChatSession';
import { GlobalPersonaManager } from './components/GlobalPersonaManager';
import { ExpertWorkspace } from './components/ExpertWorkspace';

// Helper to load from localStorage
const loadFromStorage = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (error) {
    console.warn(`Error loading ${key} from storage:`, error);
    return fallback;
  }
};

const App: React.FC = () => {
  // --- Global App State ---
  // dashboardTheme: The user's preferred theme for the dashboard (persisted)
  const [dashboardTheme, setDashboardTheme] = useState<ThemeId>(() => loadFromStorage(STORAGE_KEYS.THEME, 'sand'));
  // activeTheme: The currently applied theme (visual state)
  const [activeTheme, setActiveTheme] = useState<ThemeId>(dashboardTheme);
  
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // --- Data State ---
  const [personas, setPersonas] = useState<Record<string, PersonaConfig>>(() => 
    loadFromStorage(STORAGE_KEYS.PERSONAS, INITIAL_PERSONAS)
  );
  
  // Use all initial personas as the default order
  const [personaOrder, setPersonaOrder] = useState<string[]>(() => 
    loadFromStorage(STORAGE_KEYS.PERSONA_ORDER, Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID))
  );
  
  const [projects, setProjects] = useState<Project[]>(() => 
    loadFromStorage(STORAGE_KEYS.PROJECTS, INITIAL_PROJECTS)
  );

  // --- View State ---
  const [view, setView] = useState<AppView>('dashboard');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isPersonaManagerOpen, setIsPersonaManagerOpen] = useState(false);

  const activeProject = projects.find(p => p.id === currentProjectId);

  // --- Effects ---
  // Apply the active theme to the DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme);
  }, [activeTheme]);

  // Sync theme: Always enforce the dashboard theme (Global Theme)
  // unless explicitly changed by the user within a session context manually (if implemented).
  // This disables the "Immersive Theme" behavior.
  useEffect(() => {
     setActiveTheme(dashboardTheme);
  }, [dashboardTheme]);

  // Persist data
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.PERSONAS, JSON.stringify(personas)); }, [personas]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.PERSONA_ORDER, JSON.stringify(personaOrder)); }, [personaOrder]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects)); }, [projects]);

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

  // Handle theme change from Dashboard
  const handleDashboardThemeChange = (newTheme: ThemeId) => {
    setActiveTheme(newTheme);
    setDashboardTheme(newTheme);
    localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(newTheme));
    setIsThemeMenuOpen(false);
  };

  // Handle theme change from Chat Session (Manual Override)
  const handleSessionThemeChange = (newTheme: ThemeId) => {
    setActiveTheme(newTheme);
    // Optionally update dashboard theme too if we want persistence across the app
    setDashboardTheme(newTheme);
    localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(newTheme));
  };

  const handleSaveProject = (data: Omit<Project, 'id' | 'createdAt' | 'lastActiveAt'>) => {
    if (editingProject) {
      // Update existing
      const updatedProject: Project = {
        ...editingProject,
        ...data,
      };
      setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
      addToast("Projeto atualizado", "info");
    } else {
      // Create new
      const newProject: Project = {
        ...data,
        id: Math.random().toString(36).substring(2, 9),
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        mode: 'council' // Default mode for wizard
      };
      setProjects(prev => [newProject, ...prev]);
      setCurrentProjectId(newProject.id);
      setView('chat');
    }
    
    setIsWizardOpen(false);
    setEditingProject(null);
  };
  
  // NEW: Handle Import
  const handleImportProject = (importedProject: Project) => {
      setProjects(prev => [importedProject, ...prev]);
      addToast("Projeto importado com sucesso!", "info");
  };

  // NEW: Handle 1:1 Chat Creation
  const handleCreateOneOnOne = (personaId: string) => {
      const persona = personas[personaId];
      if (!persona) return;
      
      const newProject: Project = {
          id: Math.random().toString(36).substring(2, 9),
          title: `Chat com ${persona.name}`,
          description: `Conversa direta com ${persona.name} (${persona.role})`,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
          activePersonaIds: [personaId],
          theme: dashboardTheme, // Use global theme, not persona specific
          mode: 'chat',
          phase: 'exploration',
          starters: ["Olá! Como você pode me ajudar?", "Gostaria de saber sua opinião sobre...", "Me explique sua visão de mundo."]
      };
      
      setProjects(prev => [newProject, ...prev]);
      setCurrentProjectId(newProject.id);
      // Stay in expert-home view, but set ID
      setView('expert-home'); 
  };

  const handleUpdateProject = (updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleDeleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    if (currentProjectId === id) setCurrentProjectId(null);
    localStorage.removeItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${id}`);
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
     // Usually back to dashboard
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
  
  const handleSavePersona = (persona: PersonaConfig) => {
    setPersonas(prev => ({ ...prev, [persona.id]: persona }));
    addToast(`Persona "${persona.name}" salva`, 'info');
  };

  const handleDeletePersona = (id: string) => {
    setPersonas(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
    });
    // Remove from projects
    setProjects(prev => prev.map(p => ({
        ...p,
        activePersonaIds: p.activePersonaIds.filter(pid => pid !== id)
    })));
    addToast('Persona excluída', 'info');
  };

  // --- Render ---
  return (
    <div className="flex flex-col h-full bg-main text-body relative transition-colors duration-500">
      
      {/* Toast Container */}
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

      {/* Global Header (Only for Dashboard) */}
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

      {/* Main Content Area */}
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
                // Chat Props
                onUpdateProject={handleUpdateProject}
                onToast={addToast}
                globalPersonaOrder={personaOrder}
                currentTheme={activeTheme}
                onSetTheme={handleSessionThemeChange}
                onSavePersona={handleSavePersona}
                onDeletePersona={handleDeletePersona}
            />
        )}

        {/* 'chat' view is now strictly for Council mode */}
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

      {/* Project Wizard Modal */}
      {isWizardOpen && (
        <ProjectWizard 
          personas={personas}
          initialData={editingProject} 
          onSave={handleSaveProject}
          onCancel={handleCancelWizard}
        />
      )}

      {/* Global Persona Manager Modal */}
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
