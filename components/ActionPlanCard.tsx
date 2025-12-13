
import React from 'react';
import { ActionPlan } from '../types';

interface ActionPlanCardProps {
  plan: ActionPlan;
  onToggle: (itemId: string) => void;
  isUser: boolean;
}

export const ActionPlanCard: React.FC<ActionPlanCardProps> = ({ plan, onToggle, isUser }) => {
  return (
    <div className={`
      mt-4 mb-2 overflow-hidden rounded-xl border-2 shadow-sm
      ${isUser ? 'bg-white/10 border-white/20' : 'bg-card border-accent/20'}
    `}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center gap-2 border-b ${isUser ? 'bg-white/10 border-white/20' : 'bg-accent/10 border-accent/10'}`}>
        <div className={`p-1.5 rounded-md ${isUser ? 'bg-white/20' : 'bg-accent text-white'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        </div>
        <h3 className={`font-serif font-bold ${isUser ? 'text-white' : 'text-body'}`}>{plan.title}</h3>
      </div>

      {/* List */}
      <div className="p-2 space-y-1">
        {plan.items.map((item) => (
          <label 
            key={item.id} 
            className={`
              flex items-start gap-3 p-3 rounded-lg transition-all cursor-pointer select-none
              ${item.completed ? 'opacity-60' : 'opacity-100'}
              ${isUser ? 'hover:bg-white/10' : 'hover:bg-hover'}
            `}
          >
            <div className="relative flex items-center mt-0.5">
              <input 
                type="checkbox" 
                checked={item.completed} 
                onChange={() => onToggle(item.id)}
                className="peer appearance-none w-5 h-5 border-2 border-muted rounded cursor-pointer transition-colors checked:bg-accent checked:border-accent"
              />
              <svg className="absolute w-3.5 h-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className={`text-sm leading-relaxed ${item.completed ? 'line-through text-muted' : isUser ? 'text-white' : 'text-body'}`}>
              {item.text}
            </span>
          </label>
        ))}
      </div>
      
      {/* Footer / Progress */}
      <div className={`px-4 py-2 text-xs text-right border-t ${isUser ? 'border-white/10 text-white/60' : 'border-border text-muted'}`}>
         {plan.items.filter(i => i.completed).length} de {plan.items.length} completados
      </div>
    </div>
  );
};
