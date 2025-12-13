
import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Message, PersonaConfig } from '../types';
import { ActionPlanCard } from './ActionPlanCard';

interface ChatMessageProps {
  message: Message;
  persona: PersonaConfig;
  isUser: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (messageId: string, newText: string) => void;
  onRegenerate?: (messageId: string) => void;
  onActionToggle?: (messageId: string, itemId: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, persona, isUser, onReply, onEdit, onRegenerate, onActionToggle }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);
  const [showReasoning, setShowReasoning] = useState(false);

  // --- SYSTEM MESSAGE RENDERER ---
  if (message.type === 'system') {
      return (
          <div className="flex w-full mb-6 justify-center animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-hover/50 border border-border/50 px-4 py-1.5 rounded-full text-xs text-muted font-medium uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-accent/50"></span>
                  {message.text}
                  <span className="w-2 h-2 rounded-full bg-accent/50"></span>
              </div>
          </div>
      );
  }

  const displayPersona = persona || {
    name: 'Desconhecido',
    role: '?',
    avatarColor: 'bg-gray-400',
    borderColor: 'border-gray-400',
    textColor: 'text-gray-900',
    avatar: undefined
  };

  const handleSaveEdit = () => {
    if (onEdit && editText.trim() !== message.text) {
        onEdit(message.id, editText);
    }
    setIsEditing(false);
  };

  return (
    <div className={`flex w-full mb-8 group ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-backwards`}>
      <div className={`flex max-w-[95%] md:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
        
        {/* Avatar */}
        <div 
          className={`
            w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center 
            text-white text-xs md:text-sm font-bold shadow-md shrink-0 overflow-hidden mt-1
            ${displayPersona.avatar ? 'bg-transparent' : displayPersona.avatarColor}
          `}
          title={displayPersona.role}
        >
          {displayPersona.avatar ? (
            <img src={displayPersona.avatar} alt={displayPersona.name} className="w-full h-full object-cover" />
          ) : (
            displayPersona.name.charAt(0)
          )}
        </div>

        {/* Bubble Container */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0 relative flex-1`}>
          
          {/* Metadata & Reasoning */}
          <div className={`flex flex-col mb-1 ${isUser ? 'items-end' : 'items-start'}`}>
            <span className="text-xs text-muted px-1 flex items-center gap-2 select-none">
                <span className="font-medium">{displayPersona.name}</span>
                {!isUser && <span className="opacity-50">•</span>}
                {!isUser && <span className="opacity-70 text-[10px] uppercase tracking-wider">{displayPersona.role}</span>}
                
                 {/* Reasoning Toggle Button */}
                 {message.reasoning && !isUser && (
                   <button 
                     onClick={() => setShowReasoning(!showReasoning)}
                     className={`ml-1 p-0.5 rounded transition-colors ${showReasoning ? 'text-accent bg-accent/10' : 'text-muted/40 hover:text-accent hover:bg-accent/5'}`}
                     title={showReasoning ? "Ocultar raciocínio" : "Ver raciocínio do moderador"}
                   >
                     <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 017 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/></svg>
                   </button>
                )}
            </span>
            
            {/* Reasoning Display (Collapsible) */}
            {message.reasoning && !isUser && showReasoning && (
                <div className="mt-1 mb-1 px-3 py-2 bg-accent/5 rounded-lg text-[10px] text-muted border border-accent/10 flex items-start gap-2 max-w-md animate-in fade-in slide-in-from-top-1 origin-top">
                    <span className="shrink-0 text-xs mt-0.5">🧠</span>
                    <span className="italic leading-relaxed opacity-90">{message.reasoning}</span>
                </div>
            )}
          </div>
          
          <div className={`
            p-3 md:p-5 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed transition-colors duration-200 break-words w-full relative
            ${isUser 
                ? 'bg-body text-main rounded-tr-none' 
                : 'bg-card border border-border text-body rounded-tl-none'}
            ${!isUser ? `bg-opacity-80 ${displayPersona.avatarColor.replace('bg-', 'bg-').replace('600', '50').replace('700', '50').replace('500', '50').replace('800', '50')}/10` : ''}
          `}>
            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="flex flex-col gap-2 mb-2">
                {message.attachments.map((att, idx) => (
                  <div key={idx} className="overflow-hidden rounded-lg">
                    {att.type === 'image' && (
                      <img src={att.data} alt="attachment" className="max-w-full h-auto max-h-64 object-cover" />
                    )}
                    {att.type === 'audio' && (
                      <audio controls src={att.data} className="w-full" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Message Content or Edit Mode */}
            {isEditing ? (
                <div className="flex flex-col gap-2 min-w-[200px]">
                    <textarea 
                        value={editText} 
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full p-2 bg-main border border-border rounded-md text-body focus:ring-1 focus:ring-accent min-h-[100px]"
                    />
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setIsEditing(false)} className="px-3 py-1 text-xs text-muted hover:bg-hover rounded">Cancelar</button>
                        <button onClick={handleSaveEdit} className="px-3 py-1 text-xs bg-accent text-accent-fg rounded font-medium">Salvar</button>
                    </div>
                </div>
            ) : (
                <>
                    {message.text && (
                        <Markdown
                            components={{
                            p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                            a: ({node, ...props}) => (
                                <a className="underline decoration-1 underline-offset-2 opacity-80 hover:opacity-100" target="_blank" rel="noopener noreferrer" {...props} />
                            ),
                            ul: ({node, ...props}) => <ul className="list-disc list-outside ml-4 mb-2 space-y-1" {...props} />,
                            ol: ({node, ...props}) => <ol className="list-decimal list-outside ml-4 mb-2 space-y-1" {...props} />,
                            li: ({node, ...props}) => <li className="pl-1" {...props} />,
                            blockquote: ({node, ...props}) => (
                                <blockquote className="border-l-4 border-border pl-3 italic mb-2 my-2 py-1 bg-hover/50 opacity-80" {...props} />
                            ),
                            strong: ({node, ...props}) => <strong className="font-bold opacity-100" {...props} />,
                            em: ({node, ...props}) => <em className="italic opacity-90" {...props} />,
                            pre: ({node, ...props}) => (
                                <pre className="block p-3 rounded-lg font-mono text-xs overflow-x-auto my-2 border border-border bg-hover/50" {...props} />
                            ),
                            code: ({node, className, children, ...props}) => {
                                const isBlock = /language-(\w+)/.exec(className || '');
                                return (
                                <code className={`${!isBlock ? 'px-1.5 py-0.5 rounded font-mono text-xs bg-hover/50' : 'font-mono text-xs'}`} {...props}>
                                    {children}
                                </code>
                                );
                            }
                            }}
                        >
                            {message.text}
                        </Markdown>
                    )}
                    
                    {/* Render Action Plan if exists */}
                    {message.actionPlan && onActionToggle && (
                        <ActionPlanCard 
                           plan={message.actionPlan} 
                           onToggle={(itemId) => onActionToggle(message.id, itemId)} 
                           isUser={isUser} 
                        />
                    )}
                </>
            )}
            
            {/* Action Buttons (Reply, Edit, Regenerate) */}
            {!isEditing && (
                <div className={`absolute -bottom-8 ${isUser ? 'right-0' : 'left-0'} flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity`}>
                    {onReply && (
                        <button 
                            onClick={() => onReply(message)}
                            className="text-muted hover:text-body text-xs font-medium flex items-center gap-1 p-1"
                            title="Responder"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
                            Responder
                        </button>
                    )}
                    
                    {!isUser && onEdit && (
                         <button 
                            onClick={() => setIsEditing(true)}
                            className="text-muted hover:text-body text-xs font-medium flex items-center gap-1 p-1"
                            title="Editar Resposta (Corrigir)"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                    )}

                    {!isUser && onRegenerate && (
                         <button 
                            onClick={() => onRegenerate(message.id)}
                            className="text-muted hover:text-body text-xs font-medium flex items-center gap-1 p-1"
                            title="Tentar Outro Caminho"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                    )}
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
