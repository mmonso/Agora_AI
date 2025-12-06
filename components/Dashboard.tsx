import React from 'react';
import { Project, PersonaConfig } from '../types';

interface DashboardProps {
  projects: Project[];
  personas: Record<string, PersonaConfig>;
  onCreateNew: () => void;
  onSelectProject: (id: string) => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ projects, personas, onCreateNew, onSelectProject, onEditProject, onDeleteProject }) => {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 md:py-12">
      <div className="text-center mb-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <h1 className="text-4xl md:text-5xl font-serif font-bold text-body mb-4 tracking-tight">Agora AI</h1>
        <p className="text-muted text-lg max-w-xl mx-auto mb-8">
          Orquestre conselhos de IA. Reúna especialistas para debater ideias, resolver conflitos e expandir horizontes.
        </p>

        {/* Discrete Create Button */}
        <button 
          onClick={onCreateNew}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-card hover:bg-hover border border-border rounded-full text-body font-medium transition-all shadow-sm hover:shadow-md active:scale-95"
        >
          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo Conselho
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Project List */}
        {projects.map(project => (
          <div 
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className="group relative bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[200px]"
          >
            <div>
              <h3 className="text-xl font-bold text-body mb-2 line-clamp-2">{project.title}</h3>
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

            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
        {projects.length === 0 && (
           <div className="col-span-full py-12 flex flex-col items-center justify-center text-center opacity-50 border-2 border-dashed border-border rounded-2xl">
              <div className="w-16 h-16 bg-hover rounded-full flex items-center justify-center mb-4">
                 <svg className="w-8 h-8 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <p className="text-muted">Nenhum conselho criado ainda.</p>
           </div>
        )}
      </div>
    </div>
  );
};