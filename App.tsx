
import React, { useState, useEffect, useRef } from 'react';
import { PersonaConfig, Project, Toast, ThemeId, AppView } from './types';
import { INITIAL_PERSONAS, INITIAL_PROJECTS, STORAGE_KEYS, THEMES, USER_ID } from './constants';
import { Dashboard } from './components/Dashboard';
import { ProjectWizard } from './components/ProjectWizard';
import { ChatSession } from './components/ChatSession';

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

  // --- Effects ---
  // Apply the active theme to the DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', activeTheme);
  }, [activeTheme]);

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
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Handle theme change from Dashboard
  const handleDashboardThemeChange = (newTheme: ThemeId) => {
    setActiveTheme(newTheme);
    setDashboardTheme(newTheme);
    localStorage.setItem(STORAGE_KEYS.THEME, JSON.stringify(newTheme));
    setIsThemeMenuOpen(false);
  };

  // Handle theme change from Chat Session
  const handleSessionThemeChange = (newTheme: ThemeId) => {
    setActiveTheme(newTheme);
    // Note: Project persistence is handled by ChatSession calling onUpdateProject
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
      // If updating the currently active project, switch theme immediately
      if (currentProjectId === updatedProject.id) {
          setActiveTheme(updatedProject.theme);
      }
    } else {
      // Create new
      const newProject: Project = {
        ...data,
        id: Math.random().toString(36).substring(2, 9),
        createdAt: Date.now(),
        lastActiveAt: Date.now()
      };
      setProjects(prev => [newProject, ...prev]);
      setCurrentProjectId(newProject.id);
      setActiveTheme(newProject.theme); // Apply the new project's theme
      setView('chat');
    }
    
    setIsWizardOpen(false);
    setEditingProject(null);
  };

  const handleUpdateProject = (updated: Project) => {
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  };

  const handleDeleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    localStorage.removeItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${id}`);
  };

  const handleSelectProject = (id: string) => {
    const project = projects.find(p => p.id === id);
    if (project) {
        setCurrentProjectId(id);
        if (project.theme) {
            setActiveTheme(project.theme);
        }
        setView('chat');
    }
  };

  const handleExitChat = () => {
    setView('dashboard');
    setActiveTheme(dashboardTheme); // Restore dashboard theme
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

  const activeProject = projects.find(p => p.id === currentProjectId);

  // --- Render ---
  return (
    <div className="flex flex-col h-full bg-main text-body relative transition-colors duration-500">
      
      {/* Toast Container */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300 ${toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-card text-body border border-border'}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {/* Global Header (Only for Dashboard, Chat has its own) */}
      {view === 'dashboard' && (
        <header className="flex-none bg-transparent px-4 py-4 z-20 flex justify-end">
          <div className="relative" ref={themeMenuRef}>
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
            onSelectProject={handleSelectProject}
            onEditProject={handleEditProject}
            onDeleteProject={handleDeleteProject}
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
    </div>
  );
};

export default App;
