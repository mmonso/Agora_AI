
import React, { useState, useEffect, useRef } from 'react';
import { PersonaConfig } from '../types';
import { COLOR_OPTIONS, LOADING_MESSAGES } from '../constants';
import { generateAvatar } from '../services/geminiService';

interface PersonaFormProps {
  initialData?: PersonaConfig;
  onSubmit: (data: Omit<PersonaConfig, 'id'>) => void;
  onCancel: () => void;
  isOpen: boolean;
}

const resizeImage = (base64Str: string, maxWidth = 128): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64Str); return; }
      const scale = maxWidth / Math.max(img.width, img.height);
      const width = img.width * scale;
      const height = img.height * scale;
      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => resolve(base64Str);
  });
};

export const PersonaForm: React.FC<PersonaFormProps> = ({ initialData, onSubmit, onCancel, isOpen }) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [selectedColorIndex, setSelectedColorIndex] = useState(0);
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingText, setLoadingText] = useState(LOADING_MESSAGES[0]);
  const [showLightbox, setShowLightbox] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setName(initialData.name);
        setRole(initialData.role);
        setSystemInstruction(initialData.systemInstruction);
        const colorIdx = COLOR_OPTIONS.findIndex(c => c.bg === initialData.avatarColor);
        setSelectedColorIndex(colorIdx >= 0 ? colorIdx : 0);
        setAvatar(initialData.avatar);
      } else {
        setName(''); setRole(''); setSystemInstruction(''); setSelectedColorIndex(0); setAvatar(undefined);
      }
    }
  }, [isOpen, initialData]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isGenerating) {
      let i = 0;
      interval = setInterval(() => { i = (i + 1) % LOADING_MESSAGES.length; setLoadingText(LOADING_MESSAGES[i]); }, 2000);
    }
    return () => clearInterval(interval);
  }, [isGenerating]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const colorTheme = COLOR_OPTIONS[selectedColorIndex];
    onSubmit({ name, role, systemInstruction, avatarColor: colorTheme.bg, borderColor: colorTheme.border, textColor: colorTheme.text, avatar });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => { setAvatar(await resizeImage(reader.result as string)); };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateAvatar = async () => {
    if (!name || !role) { alert("Preencha Nome e Papel."); return; }
    setIsGenerating(true); setLoadingText(LOADING_MESSAGES[0]);
    try {
      const promptDesc = systemInstruction || `${name} is a ${role}`;
      const generatedBase64 = await generateAvatar(name, role, promptDesc);
      if (generatedBase64) setAvatar(await resizeImage(generatedBase64)); else alert("Falha ao gerar.");
    } catch (error) { console.error(error); alert("Erro ao gerar."); } finally { setIsGenerating(false); }
  };

  const selectedColor = COLOR_OPTIONS[selectedColorIndex];

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-colors duration-200">
        <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
          <div className="bg-hover px-6 py-4 border-b border-border flex justify-between items-center shrink-0">
            <h2 className="text-lg font-serif font-bold text-body">{initialData ? 'Editar Persona' : 'Nova Persona'}</h2>
            <button onClick={onCancel} className="text-muted hover:text-body"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            <div className="flex items-center gap-4 mb-2">
              <div className="relative shrink-0 group">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-md overflow-hidden cursor-pointer ${selectedColor.bg} ring-4 ring-border`} onClick={() => avatar && setShowLightbox(true)}>
                  {avatar ? <img src={avatar} alt="Avatar" className="w-full h-full object-cover" /> : name.charAt(0).toUpperCase() || '?'}
                </div>
                {avatar && <button type="button" onClick={() => setAvatar(undefined)} className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-sm hover:bg-red-600 z-10"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
              </div>
              
              <div className="flex flex-col gap-2 w-full">
                 <label className="text-xs font-semibold text-muted uppercase tracking-wide">Avatar (Opcional)</label>
                 <div className="flex gap-2">
                   <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 px-3 py-1.5 text-xs font-medium border border-border rounded-md text-body hover:bg-hover">Upload</button>
                   <button type="button" onClick={handleGenerateAvatar} disabled={isGenerating || !name} className="flex-1 px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded-md hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1 min-w-[100px]">
                     {isGenerating ? <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> : <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                     Gerar IA
                   </button>
                 </div>
                 {isGenerating && <span className="text-[10px] text-accent animate-pulse font-medium">{loadingText}</span>}
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
              </div>
            </div>

            <div><label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Nome</label><input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Mestre Yoda" className="w-full px-3 py-2 bg-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-body" /></div>
            <div><label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Papel / Título</label><input type="text" required value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex: Mestre Jedi" className="w-full px-3 py-2 bg-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent text-body" /></div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-2">Cor do Tema</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((option, idx) => (
                  <button key={idx} type="button" onClick={() => setSelectedColorIndex(idx)} className={`w-8 h-8 rounded-full ${option.bg} flex items-center justify-center transition-all relative ${selectedColorIndex === idx ? 'ring-2 ring-offset-2 ring-muted scale-110' : 'hover:scale-105 opacity-80 hover:opacity-100'}`} title={option.label}>
                    {selectedColorIndex === idx && <div className="absolute inset-0 flex items-center justify-center"><svg className="w-4 h-4 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></div>}
                  </button>
                ))}
              </div>
            </div>
            <div><label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1">Instrução do Sistema</label><textarea required value={systemInstruction} onChange={(e) => setSystemInstruction(e.target.value)} placeholder="Comportamento..." className="w-full px-3 py-2 bg-hover border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent h-24 resize-none text-sm text-body" /></div>

            <div className="pt-2 flex gap-3 sticky bottom-0 bg-card">
              <button type="button" onClick={onCancel} className="flex-1 px-4 py-2 text-body bg-hover hover:bg-border rounded-lg font-medium transition-colors">Cancelar</button>
              <button type="submit" className="flex-1 px-4 py-2 text-main bg-body hover:opacity-90 rounded-lg font-medium transition-colors">{initialData ? 'Salvar' : 'Criar'}</button>
            </div>
          </form>
        </div>
      </div>
      {showLightbox && avatar && <div className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setShowLightbox(false)}><img src={avatar} alt="Avatar Full" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" /></div>}
    </>
  );
};
