
import React, { useState } from 'react';
import Markdown from 'react-markdown';
import { Message, PersonaConfig } from '../types';

interface ChatMessageProps {
  message: Message;
  persona: PersonaConfig;
  isUser: boolean;
  onReply?: (message: Message) => void;
  onEdit?: (messageId: string, newText: string) => void;
  onRegenerate?: (messageId: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, persona, isUser, onReply, onEdit, onRegenerate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(message.text);

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

        {/* Bubble */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} min-w-0 relative flex-1`}>
          <span className="text-xs text-muted mb-1 px-1 flex items-center gap-2">
            <span className="font-medium">{displayPersona.name}</span>
            {!isUser && <span className="opacity-50">•</span>}
            {!isUser && <span className="opacity-70 text-[10px] uppercase tracking-wider">{displayPersona.role}</span>}
          </span>
          
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
                message.text && (
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
                )
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
