
import React, { useState, useEffect } from 'react';
import { PersonaConfig, Project, ThemeId } from '../types';
import { generateConversationStarters, refineProjectContext } from '../services/geminiService';
import { THEMES } from '../constants';

interface ProjectWizardProps {
  personas: Record<string, PersonaConfig>;
  initialData?: Project | null;
  onSave: (project: Omit<Project, 'id' | 'createdAt' | 'lastActiveAt'>) => void;
  onCancel: () => void;
}

export const ProjectWizard: React.FC<ProjectWizardProps> = ({ personas, initialData, onSave, onCancel }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [starters, setStarters] = useState<string[]>([]);
  const [isGeneratingStarters, setIsGeneratingStarters] = useState(false);
  const [isRefiningContext, setIsRefiningContext] = useState(false);
  const [theme, setTheme] = useState<ThemeId>('sand');
  
  // Default selection: everyone except user
  const personaList = Object.values(personas) as PersonaConfig[];
  const initialSelection = personaList
    .filter(p => p.id !== 'user')
    .map(p => p.id);
    
  const [selectedPersonaIds, setSelectedPersonaIds] = useState<string[]>(initialSelection);

  // Initialize form with existing data if editing
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setDescription(initialData.description);
      setSelectedPersonaIds(initialData.activePersonaIds);
      if (initialData.starters) {
        setStarters(initialData.starters);
      }
      if (initialData.theme) {
        setTheme(initialData.theme);
      }
    }
  }, [initialData]);

  const togglePersona = (id: string) => {
    setSelectedPersonaIds(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const handleRefineContext = async () => {
    if (!description.trim()) return;
    setIsRefiningContext(true);
    try {
      const refined = await refineProjectContext(description);
      setDescription(refined);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefiningContext(false);
    }
  };

  const handleGenerateStarters = async () => {
    if (!title.trim()) return;
    setIsGeneratingStarters(true);
    try {
      const generated = await generateConversationStarters(title, description);
      setStarters(generated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingStarters(false);
    }
  };

  const updateStarter = (index: number, val: string) => {
    const newStarters = [...starters];
    newStarters[index] = val;
    setStarters(newStarters);
  };

  const addStarter = () => setStarters([...starters, ""]);
  const removeStarter = (index: number) => setStarters(starters.filter((_, i) => i !== index));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title,
      description,
      activePersonaIds: selectedPersonaIds,
      starters: starters.filter(s => s.trim().length > 0),
      theme
    });
  };

  const availablePersonas = personaList.filter(p => p.id !== 'user');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="bg-hover px-6 py-4 border-b border-border flex justify-between items-center shrink-0">
          <h2 className="text-xl font-serif font-bold text-body">{initialData ? 'Editar Conselho' : 'Novo Conselho'}</h2>
          <button onClick={onCancel} className="text-muted hover:text-body">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
          {/* Main Info */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Nome do Caso / Projeto</label>
              <input 
                type="text" 
                required 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="Ex: Análise Ética da IA, Brainstorm Criativo..." 
                className="w-full px-4 py-3 bg-hover border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent text-body text-lg" 
              />
            </div>
            
            {/* Theme Selector */}
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Tema Visual</label>
              <div className="flex flex-wrap gap-2">
                {THEMES.map(t => (
                  <button 
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${theme === t.id ? 'bg-hover border-accent shadow-sm' : 'border-border opacity-70 hover:opacity-100 hover:bg-hover'}`}
                  >
                    <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: t.color }}></div>
                    <span className="text-sm font-medium text-body">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide">Contexto Global (Opcional)</label>
                <button 
                  type="button" 
                  onClick={handleRefineContext} 
                  disabled={isRefiningContext || !description.trim()}
                  className="text-xs flex items-center gap-1.5 px-2 py-1 bg-accent/10 text-accent hover:bg-accent/20 rounded-md transition-colors font-medium disabled:opacity-50"
                  title="Melhorar texto com IA"
                >
                  {isRefiningContext ? (
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  )}
                  Aprimorar com IA
                </button>
              </div>
              <p className="text-xs text-muted mb-2">Defina o cenário ou objetivo. Isso guiará todos os especialistas.</p>
              <textarea 
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
                placeholder="Ex: Estamos discutindo as implicações de um carro autônomo ter que escolher quem salvar em um acidente..." 
                className="w-full px-4 py-3 bg-hover border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent h-24 resize-none text-body" 
              />
              
              <div className="mt-2 flex justify-end">
                <button 
                  type="button" 
                  onClick={handleGenerateStarters} 
                  disabled={isGeneratingStarters || !title.trim()}
                  className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border text-muted hover:text-body hover:bg-hover rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  {isGeneratingStarters ? (
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                  )}
                  Gerar Perguntas de Início
                </button>
              </div>
            </div>

            {/* Conversation Starters */}
            {starters.length > 0 && (
              <div className="bg-hover/50 p-4 rounded-xl border border-border">
                <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Sugestões de Início</label>
                <div className="space-y-2">
                  {starters.map((starter, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input 
                        type="text" 
                        value={starter} 
                        onChange={(e) => updateStarter(idx, e.target.value)}
                        className="flex-1 px-3 py-1.5 text-sm bg-card border border-border rounded-lg text-body"
                      />
                      <button type="button" onClick={() => removeStarter(idx)} className="text-muted hover:text-red-500 p-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                  ))}
                  <button type="button" onClick={addStarter} className="text-xs text-accent hover:underline font-medium">+ Adicionar pergunta</button>
                </div>
              </div>
            )}
          </div>

          {/* Team Selection */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-3">Selecione o Time de Especialistas</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {availablePersonas.map(persona => {
                const isSelected = selectedPersonaIds.includes(persona.id);
                return (
                  <div 
                    key={persona.id} 
                    onClick={() => togglePersona(persona.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'bg-hover border-accent shadow-sm' : 'border-border opacity-60 hover:opacity-100 hover:bg-hover'}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden ${persona.avatar ? 'bg-transparent' : persona.avatarColor}`}>
                       {persona.avatar ? <img src={persona.avatar} alt="" className="w-full h-full object-cover" /> : persona.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-medium text-body">{persona.name}</div>
                      <div className="text-xs text-muted">{persona.role}</div>
                    </div>
                    <div className={`ml-auto w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? 'bg-accent border-accent' : 'border-muted'}`}>
                      {isSelected && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onCancel} className="flex-1 px-4 py-3 text-body bg-hover hover:bg-border rounded-xl font-medium transition-colors">Cancelar</button>
            <button type="submit" className="flex-1 px-4 py-3 text-main bg-body hover:opacity-90 rounded-xl font-bold transition-colors shadow-lg">{initialData ? 'Atualizar Conselho' : 'Criar Conselho'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
