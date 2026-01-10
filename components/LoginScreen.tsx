
import React, { useState } from 'react';
import { ThemeId } from '../types';
import { THEMES } from '../constants';
import { storageService } from '../services/storageService';

interface LoginScreenProps {
  currentTheme: ThemeId;
  onSetTheme: (theme: ThemeId) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ currentTheme, onSetTheme }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State - Pre-filled with provided test credentials as requested
  const [email, setEmail] = useState('marcelomonso.art@gmail.com');
  const [password, setPassword] = useState('JojoPlatinado1');
  const [name, setName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
        if (isRegistering) {
            if (!name.trim()) throw new Error("Por favor, informe seu nome.");
            await storageService.registerWithEmail(email, password, name);
        } else {
            await storageService.loginWithEmail(email, password);
        }
        // Sucesso é capturado pelo onAuthStateChange no App.tsx
    } catch (err: any) {
        console.error("Auth error:", err);
        // Supabase retorna o erro com uma propriedade 'message'
        let msg = err.message || "Erro na autenticação.";
        
        // Traduções amigáveis para erros comuns do Supabase/GoTrue
        if (msg.includes('Invalid login credentials')) msg = "E-mail ou senha incorretos.";
        if (msg.includes('User already registered')) msg = "Este e-mail já está cadastrado.";
        if (msg.includes('Password should be')) msg = "A senha deve ser mais forte (mínimo 6 caracteres).";
        if (msg.includes('invalid format')) msg = "Formato de e-mail inválido.";
        
        setError(msg);
        setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsRegistering(!isRegistering);
    setError('');
    // Keep credentials even when toggling mode for testing convenience
  };

  return (
    <div className="min-h-screen bg-main flex flex-col items-center justify-center p-4 text-body transition-colors duration-500">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-8 animate-fade-in-up">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-accent rounded-full mx-auto flex items-center justify-center mb-4 shadow-lg text-accent-fg ring-4 ring-offset-4 ring-offset-main ring-accent/20 transition-all duration-500">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               {isRegistering ? (
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
               ) : (
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
               )}
            </svg>
          </div>
          <h1 className="text-3xl font-serif font-bold mb-1">Agora AI</h1>
          <p className="text-muted text-sm uppercase tracking-widest font-semibold">{isRegistering ? 'Criar Conta' : 'Bem-vindo de volta'}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
          {error && (
             <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-lg text-center animate-pulse">
                {error}
             </div>
          )}

          {isRegistering && (
             <div className="space-y-1">
                <label className="text-xs font-bold text-muted uppercase ml-1">Nome</label>
                <input 
                    type="text" 
                    required 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-hover border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent transition-all text-body placeholder-muted/50"
                    placeholder="Como devemos te chamar?"
                />
             </div>
          )}

          <div className="space-y-1">
             <label className="text-xs font-bold text-muted uppercase ml-1">E-mail</label>
             <input 
                type="email" 
                required 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-hover border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent transition-all text-body placeholder-muted/50"
                placeholder="seu@email.com"
             />
          </div>

          <div className="space-y-1">
             <label className="text-xs font-bold text-muted uppercase ml-1">Senha</label>
             <input 
                type="password" 
                required 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-hover border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent transition-all text-body placeholder-muted/50"
                placeholder="••••••••"
                minLength={6}
             />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-body text-main hover:opacity-90 py-4 rounded-xl font-bold transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-50 mt-6"
          >
            {loading ? (
               <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : (
                isRegistering ? 'Cadastrar' : 'Entrar'
            )}
          </button>
        </form>
        
        <div className="mt-6 text-center">
             <button onClick={toggleMode} className="text-sm text-muted hover:text-accent transition-colors font-medium">
                 {isRegistering ? 'Já tem uma conta? Faça login.' : 'Não tem conta? Cadastre-se.'}
             </button>
        </div>
        
        {/* Theme Selector */}
        <div className="mt-8 pt-6 border-t border-border flex flex-col items-center gap-3">
             <span className="text-[10px] text-muted font-bold uppercase tracking-widest">Tema Visual</span>
             <div className="flex flex-wrap justify-center gap-3">
                {THEMES.map(t => (
                  <button
                    key={t.id}
                    onClick={() => onSetTheme(t.id)}
                    className={`w-6 h-6 rounded-full border shadow-sm transition-all duration-300 ${currentTheme === t.id ? 'ring-2 ring-offset-2 ring-offset-card ring-accent scale-110' : 'hover:scale-110 opacity-50 hover:opacity-100 border-border'}`}
                    style={{ backgroundColor: t.color }}
                    title={t.label}
                  />
                ))}
             </div>
        </div>
      </div>
    </div>
  );
};
