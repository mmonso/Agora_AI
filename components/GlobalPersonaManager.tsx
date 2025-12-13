import React, { useState } from 'react';
import { PersonaConfig } from '../types';
import { PersonaForm } from './PersonaForm';

interface GlobalPersonaManagerProps {
  personas: Record<string, PersonaConfig>;
  onSave: (persona: PersonaConfig) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export const GlobalPersonaManager: React.FC<GlobalPersonaManagerProps> = ({ personas, onSave, onDelete, onClose }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const personaList = (Object.values(personas) as PersonaConfig[]).filter(p => p.id !== 'user');
  
  const filteredPersonas = personaList.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = () => {
    setEditingId(null);
    setIsFormOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setIsFormOpen(true);
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta persona? Ela será removida de todos os conselhos.')) {
      onDelete(id);
    }
  };

  const handleFormSubmit = (data: Omit<PersonaConfig, 'id'>) => {
    const id = editingId || Math.random().toString(36).substring(2, 9);
    onSave({ ...data, id });
    setIsFormOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-main animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex-none bg-card border-b border-border px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 -ml-2 text-muted hover:text-body hover:bg-hover rounded-full transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <h1 className="text-xl font-serif font-bold text-body">Biblioteca de Personas</h1>
          <span className="px-2 py-0.5 rounded-full bg-hover text-xs font-bold text-muted">{personaList.length}</span>
        </div>
        
        <div className="flex gap-3">
          <div className="relative hidden md:block">
            <input 
                type="text" 
                placeholder="Buscar..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 bg-hover border border-border rounded-lg text-sm text-body focus:ring-2 focus:ring-accent focus:outline-none w-64 transition-all"
            />
            <svg className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <button onClick={handleCreate} className="flex items-center gap-2 px-4 py-2 bg-body text-main rounded-lg font-medium hover:opacity-90 shadow-md transition-all">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Nova Persona
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl mx-auto">
          {filteredPersonas.map(persona => (
            <div key={persona.id} className="group bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-all flex items-start gap-4 relative overflow-hidden">
               {/* Background Tint */}
               <div className={`absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none ${persona.avatarColor}`}></div>

               <div className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md shrink-0 overflow-hidden ${persona.avatar ? 'bg-transparent' : persona.avatarColor}`}>
                  {persona.avatar ? <img src={persona.avatar} alt="" className="w-full h-full object-cover" /> : persona.name.charAt(0)}
               </div>

               <div className="flex-1 min-w-0 z-10">
                 <h3 className="font-bold text-body truncate">{persona.name}</h3>
                 <p className="text-xs text-muted uppercase tracking-wider mb-2 truncate">{persona.role}</p>
                 <p className="text-sm text-muted line-clamp-2 leading-relaxed">{persona.systemInstruction}</p>
               </div>

               <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20 bg-card/80 backdrop-blur-sm rounded-lg p-1">
                 <button onClick={() => handleEdit(persona.id)} className="p-1.5 text-muted hover:text-body hover:bg-hover rounded" title="Editar">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                 </button>
                 <button onClick={() => handleDelete(persona.id)} className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded" title="Excluir">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                 </button>
               </div>
            </div>
          ))}
          
          {/* Empty State */}
          {filteredPersonas.length === 0 && (
             <div className="col-span-full py-12 text-center opacity-50">
               <p className="text-muted text-lg">Nenhuma persona encontrada.</p>
             </div>
          )}
        </div>
      </div>

      {isFormOpen && (
        <PersonaForm 
          isOpen={true} 
          initialData={editingId ? personas[editingId] : undefined}
          onSubmit={handleFormSubmit}
          onCancel={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
};
