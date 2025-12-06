
import React, { useState, useEffect } from 'react';
import { PersonaId, PersonaConfig } from '../types';
import { PersonaForm } from './PersonaForm';

interface PersonaSelectorProps {
  personas: Record<string, PersonaConfig>;
  activeIds: PersonaId[];
  onToggle: (id: PersonaId) => void;
  onSave: (persona: PersonaConfig) => void;
  onDelete: (id: PersonaId) => void;
  isOpen: boolean;
  onClose: () => void;
  nextSpeakerId?: string;
  onNudge: (id: string) => void;
  order?: string[];
  onReorder?: (newOrder: string[]) => void;
}

export const PersonaSelector: React.FC<PersonaSelectorProps> = ({ 
  personas, activeIds, onToggle, onSave, onDelete, isOpen, onClose, nextSpeakerId, onNudge, order, onReorder
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFormOpen) setIsFormOpen(false); else onClose();
      }
    };
    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isFormOpen, onClose]);

  let availablePersonas = (Object.values(personas) as PersonaConfig[]).filter(p => p.id !== 'user');
  if (order) {
    availablePersonas.sort((a, b) => {
      const indexA = order.indexOf(a.id);
      const indexB = order.indexOf(b.id);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  const handleCreate = () => { setEditingId(null); setIsFormOpen(true); };
  const handleEdit = (e: React.MouseEvent, id: string) => { e.stopPropagation(); setEditingId(id); setIsFormOpen(true); };
  const handleFormSubmit = (data: Omit<PersonaConfig, 'id'>) => { const id = editingId || Math.random().toString(36).substring(2, 9); onSave({ ...data, id }); setIsFormOpen(false); };
  const handleDelete = (e: React.MouseEvent, id: string) => { e.stopPropagation(); if (window.confirm('Tem certeza?')) onDelete(id); };
  const handleNudgeClick = (e: React.MouseEvent, id: string) => { e.stopPropagation(); onNudge(id); onClose(); }
  
  const handleDragStart = (e: React.DragEvent, id: string) => { setDraggedItemId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggedItemId;
    setDraggedItemId(null);
    if (!sourceId || sourceId === targetId || !onReorder || !order) return;
    const sourceIndex = order.indexOf(sourceId);
    const targetIndex = order.indexOf(targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;
    const reordered = [...order];
    const [movedItem] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedItem);
    onReorder(reordered);
  };

  if (isFormOpen) return <PersonaForm isOpen={true} initialData={editingId ? personas[editingId] : undefined} onSubmit={handleFormSubmit} onCancel={() => setIsFormOpen(false)} />;
  if (!isOpen) return null;

  return (
    <div className="absolute top-full right-0 mt-2 z-50 w-96 max-w-[90vw] bg-card rounded-xl shadow-xl border border-border overflow-hidden animate-in fade-in zoom-in-95 origin-top-right duration-200 flex flex-col max-h-[80vh]">
      <div className="bg-hover px-4 py-3 border-b border-border flex justify-between items-center shrink-0">
        <h3 className="font-serif font-bold text-body flex items-center gap-2">Participantes <span className="text-muted text-xs font-normal">({activeIds.length}/{availablePersonas.length})</span></h3>
        <button onClick={onClose} className="text-muted hover:text-body"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
      </div>
      
      <div className="p-2 overflow-y-auto flex-1">
        {availablePersonas.map((persona) => {
          const isActive = activeIds.includes(persona.id);
          const isNext = isActive && nextSpeakerId === persona.id;
          const isDragging = draggedItemId === persona.id;
          
          return (
            <div key={persona.id} draggable={!!onReorder} onDragStart={(e) => handleDragStart(e, persona.id)} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, persona.id)} onClick={() => onToggle(persona.id)} className={`group relative w-full flex items-center gap-3 p-3 rounded-lg transition-all cursor-pointer mb-1 border border-transparent ${isActive ? 'bg-hover' : 'opacity-60 hover:opacity-100 hover:bg-hover'} ${isDragging ? 'opacity-30 border-dashed border-muted' : ''}`}>
              {onReorder && <div className="cursor-grab active:cursor-grabbing text-muted hover:text-body -ml-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" /></svg></div>}

              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0 overflow-hidden relative ${persona.avatar ? 'bg-transparent' : persona.avatarColor} transition-transform ${isActive ? 'scale-100' : 'scale-90 grayscale'}`}>
                {persona.avatar ? <img src={persona.avatar} alt={persona.name} className="w-full h-full object-cover" /> : persona.name.charAt(0)}
                {isNext && <div className="absolute inset-0 ring-2 ring-accent rounded-full animate-pulse z-10" />}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium truncate ${isActive ? 'text-body' : 'text-muted'}`}>{persona.name}</span>
                </div>
                <div className="text-xs text-muted truncate">{persona.role}</div>
              </div>

              {/* Controls Area */}
              <div className="flex items-center gap-1 shrink-0">
                 {isActive && (
                    <>
                        {isNext ? (
                            <div className="flex items-center gap-1 px-2 py-1 bg-accent/10 rounded text-accent font-bold text-[10px] border border-accent/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse"></span>
                                VEZ
                            </div>
                        ) : (
                             <button 
                               onClick={(e) => handleNudgeClick(e, persona.id)} 
                               className="p-1.5 text-muted hover:text-accent hover:bg-card border border-transparent hover:border-border rounded transition-colors group-hover:block hidden" 
                               title="Falar Agora (Intervir)"
                             >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" /></svg>
                             </button>
                        )}
                        
                        {!isNext && <svg className="w-5 h-5 text-green-500 group-hover:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                    </>
                 )}
                 
                 {/* Divider */}
                 <div className="w-px h-4 bg-border mx-1 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                 {/* Admin Actions */}
                 <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => handleEdit(e, persona.id)} className="p-1.5 text-muted hover:text-body hover:bg-card rounded" title="Editar"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                    <button onClick={(e) => handleDelete(e, persona.id)} className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded" title="Excluir"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                 </div>
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="p-3 border-t border-border bg-hover shrink-0">
         <button onClick={handleCreate} className="w-full flex items-center justify-center gap-2 py-2 bg-body text-main rounded-lg text-sm font-medium hover:opacity-90 transition-colors">
           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
           Criar Nova Persona
         </button>
      </div>
    </div>
  );
};
