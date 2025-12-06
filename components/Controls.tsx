
import React, { useState, useRef, useEffect } from 'react';
import { Attachment, Message } from '../types';

interface ControlsProps {
  isPaused: boolean;
  isActive: boolean;
  onTogglePause: () => void;
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  disabled: boolean;
  replyingTo?: { message: Message; senderName: string } | null;
  onCancelReply?: () => void;
}

export const Controls: React.FC<ControlsProps> = ({
  isPaused,
  isActive,
  onTogglePause,
  onSendMessage,
  disabled,
  replyingTo,
  onCancelReply
}) => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current === 0) setIsDragging(false);
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
         processFiles(e.dataTransfer.files);
      }
    };
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const processFiles = (files: FileList) => {
     if (files.length > 0) {
      const file = files[0];
      if (file.size > 5 * 1024 * 1024) { alert("Max 5MB."); return; }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : 'file';
        setAttachments(prev => [...prev, { type, mimeType: file.type, data: base64String, name: file.name }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() || attachments.length > 0) {
      onSendMessage(inputText, attachments);
      setInputText('');
      setAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  let placeholder = "Compartilhe seus pensamentos...";
  let containerClasses = "border-border shadow-lg bg-card";
  
  if (isDragging) {
      placeholder = "Solte o arquivo aqui...";
      containerClasses = "border-accent ring-4 ring-accent/20 bg-hover shadow-xl scale-[1.01]";
  } else if (isPaused) {
      placeholder = "O conselho está pausado. Envie uma mensagem para retomar...";
      containerClasses = "border-amber-500 ring-2 ring-amber-500/20 shadow-lg";
  } else if (isActive && !disabled) {
      containerClasses = "border-border shadow-lg hover:border-accent/50 focus-within:border-accent focus-within:shadow-xl";
  } else {
      containerClasses = "border-border opacity-60 cursor-not-allowed shadow-none";
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-6 pt-2">
      {replyingTo && (
        <div className="flex items-center justify-between bg-hover px-4 py-2 mb-2 rounded-xl border border-border animate-in slide-in-from-bottom-2 fade-in">
          <div className="flex items-center gap-3 overflow-hidden">
             <div className="w-1 h-8 bg-muted rounded-full shrink-0"></div>
             <div className="flex flex-col text-xs truncate">
                <span className="font-bold text-body">Respondendo a {replyingTo.senderName}</span>
                <span className="text-muted truncate max-w-[200px] md:max-w-md">{replyingTo.message.text}</span>
             </div>
          </div>
          <button onClick={onCancelReply} className="p-1.5 hover:bg-card rounded-full text-muted hover:text-body">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      <div className={`relative rounded-2xl border transition-all duration-300 ease-out flex flex-col overflow-hidden ${containerClasses}`}>
        {attachments.length > 0 && (
          <div className="px-3 pt-3 flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative group animate-in zoom-in-95 duration-200">
                <div className="bg-hover border border-border rounded-lg p-1.5 flex items-center gap-2 pr-7">
                  {att.type === 'image' ? (
                    <img src={att.data} alt="preview" className="w-8 h-8 object-cover rounded-md" />
                  ) : (
                    <div className="w-8 h-8 bg-card rounded-md flex items-center justify-center">
                        <svg className="w-4 h-4 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 3-2 3-2zm0 0v-2m12 0v-2" />
                        </svg>
                    </div>
                  )}
                  <span className="text-[10px] font-medium text-muted max-w-[80px] truncate">{att.name}</span>
                </div>
                <button onClick={() => removeAttachment(idx)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-sm transition-colors opacity-0 group-hover:opacity-100">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-end gap-2 p-2 w-full">
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*,audio/*" onChange={(e) => { if(e.target.files) processFiles(e.target.files); if(fileInputRef.current) fileInputRef.current.value = ''; }} />
          
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled} className="p-2.5 mb-0.5 rounded-xl text-muted hover:text-body hover:bg-hover transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          {isActive && (
            <button type="button" onClick={onTogglePause} className={`p-2.5 mb-0.5 rounded-xl transition-colors shrink-0 ${isPaused ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' : 'text-muted hover:text-body hover:bg-hover'}`} title={isPaused ? "Retomar" : "Pausar"}>
              {isPaused ? <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> : <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>}
            </button>
          )}

          <div className="flex-1 min-w-0 py-3">
             <textarea ref={textareaRef} value={inputText} onChange={handleInput} onKeyDown={handleKeyDown} placeholder={placeholder} disabled={disabled} rows={1} className="w-full bg-transparent border-none focus:ring-0 resize-none p-0 text-body placeholder-muted max-h-32 min-h-[24px] leading-relaxed" />
          </div>

          <button type="submit" disabled={(!inputText.trim() && attachments.length === 0) || disabled} className={`p-2.5 mb-0.5 rounded-xl transition-all shrink-0 ${(!inputText.trim() && attachments.length === 0) ? 'bg-hover text-muted cursor-not-allowed' : 'bg-body text-main hover:opacity-90 shadow-sm'}`}>
            <svg className="w-5 h-5 transform rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};
