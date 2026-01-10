
import React, { useRef } from 'react';
import { Project, PersonaConfig } from '../types';

interface DashboardProps {
  projects: Project[];
  personas: Record<string, PersonaConfig>;
  onCreateNew: () => void;
  onOpenPersonaManager: () => void;
  onSelectProject: (id: string) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
  onImportProject?: (project: Project) => void;
  onOpenExpertWorkspace: () => void;
  onSeedDefaults: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ 
  projects, personas, onCreateNew, onOpenPersonaManager, onSelectProject, onEditProject, onDeleteProject, onImportProject, onOpenExpertWorkspace, onSeedDefaults
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Only show Council projects in the main dashboard
  const councilProjects = projects.filter(p => p.mode === 'council');

  const handleExport = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `agora-project-${project.title.replace(/\s+/g, '-').toLowerCase()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportProject) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        // Basic validation
        if (json.id && json.title && Array.isArray(json.activePersonaIds)) {
            // Generate new ID to avoid collisions if importing same project
            const newProject = { ...json, id: Math.random().toString(36).substring(2, 9) + Date.now().toString(36) };
            onImportProject(newProject);
        } else {
            alert("Arquivo inválido. Formato de projeto não reconhecido.");
        }
      } catch (err) {
        alert("Erro ao ler arquivo JSON.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = ''; // Reset
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12 relative">
      <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-body mb-4 tracking-tight">Agora AI</h1>
        <p className="text-muted text-lg max-w-xl mx-auto mb-8">
          Orquestre conselhos de IA. Reúna especialistas para debater ideias, resolver conflitos e expandir horizontes.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4">
            <button 
            onClick={onCreateNew}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-body text-main hover:opacity-90 rounded-full font-medium transition-all shadow-lg hover:shadow-xl active:scale-95"
            >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Conselho
            </button>

             <button 
            onClick={onOpenExpertWorkspace}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-accent-fg hover:opacity-90 rounded-full font-medium transition-all shadow-lg hover:shadow-xl active:scale-95"
            >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            Chat com Especialista
            </button>

            <button 
            onClick={onOpenPersonaManager}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-card hover:bg-hover border border-border rounded-full text-body font-medium transition-all shadow-sm hover:shadow-md active:scale-95"
            >
            <svg className="w-5 h-5 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            Personas
            </button>

            <div className="w-px h-8 bg-border mx-2 hidden md:block"></div>

            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
            <button 
            onClick={handleImportClick}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-card hover:bg-hover border border-border rounded-full text-muted hover:text-body text-sm font-medium transition-all"
            title="Importar Projeto (JSON)"
            >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Importar
            </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Project List */}
        {councilProjects.map(project => (
          <div 
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className={`group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[200px]`}
          >
            <div>
              <h3 className="text-xl font-bold text-body mb-2 line-clamp-2 pr-12">{project.title}</h3>
              <p className="text-sm text-muted line-clamp-3 mb-6">
                {project.description || "Sem contexto definido."}
              </p>
            </div>

            <div className="mt-auto">
              <div className="flex items-center justify-between">
                <div className="flex -space-x-2 overflow-hidden py-1">
                  {project.activePersonaIds.slice(0, 5).map(id => {
                    const persona = personas[id];
                    if (!persona) return null;
                    return (
                      <div key={id} className={`inline-block w-8 h-8 rounded-full ring-2 ring-card flex items-center justify-center text-[10px] text-white font-bold overflow-hidden ${persona.avatar ? 'bg-transparent' : persona.avatarColor}`} title={persona.name}>
                         {persona.avatar ? <img src={persona.avatar} alt="" className="w-full h-full object-cover" /> : persona.name.charAt(0)}
                      </div>
                    );
                  })}
                  {project.activePersonaIds.length > 5 && (
                    <div className="inline-block w-8 h-8 rounded-full ring-2 ring-card bg-hover flex items-center justify-center text-xs font-bold text-muted">
                      +{project.activePersonaIds.length - 5}
                    </div>
                  )}
                </div>
                
                <span className="text-xs text-muted font-medium">
                  {new Date(project.lastActiveAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Floating Actions */}
            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
               <button 
                onClick={(e) => handleExport(e, project)}
                className="p-2 text-muted hover:text-accent hover:bg-accent/10 rounded-full"
                title="Exportar JSON"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onEditProject(project); }}
                className="p-2 text-muted hover:text-body hover:bg-hover rounded-full"
                title="Editar"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); if(confirm("Excluir projeto?")) onDeleteProject(project.id); }}
                className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-full"
                title="Excluir"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {councilProjects.length === 0 && (
           <div className="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-70 border-2 border-dashed border-border rounded-2xl bg-hover/10">
              <div className="w-16 h-16 bg-hover rounded-full flex items-center justify-center mb-4">
                 <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <p className="text-body font-bold mb-2">Nenhum conselho criado ainda.</p>
              <p className="text-muted text-sm mb-6 max-w-xs">Você pode começar um do zero ou usar nossos modelos sugeridos.</p>
              
              <button 
                onClick={onSeedDefaults}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-accent text-accent-fg hover:opacity-90 rounded-xl font-bold transition-all shadow-lg active:scale-95"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Restaurar Conselhos de Fábrica
              </button>
           </div>
        )}
      </div>
    </div>
  );
};
