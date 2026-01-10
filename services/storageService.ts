
import { supabase } from "../supabaseClient";
import { Project, PersonaConfig, Message, ThemeId } from '../types';
import { STORAGE_KEYS, INITIAL_PERSONAS, INITIAL_PROJECTS, USER_ID } from '../constants';

export const storageService = {
  
  // --- AUTHENTICATION ---
  initAuth: (callback: (user: any | null) => void) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  },

  loginWithEmail: async (email: string, pass: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    return data;
  },

  registerWithEmail: async (email: string, pass: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: { display_name: name }
      }
    });
    if (error) throw error;
    return data;
  },

  logout: async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.reload();
  },

  // --- HEALTH CHECK ---
  checkConnection: async (): Promise<{ online: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.from('personas').select('id').limit(1);
      if (error) throw error;
      return { online: true };
    } catch (e: any) {
      console.error("Supabase Connection Check Failed:", e);
      return { online: false, error: e.message };
    }
  },

  // --- SEEDING (Onde os conselhos iniciais "nascem" no seu DB) ---
  seedInitialData: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    try {
        // 1. Seed Personas (Globais)
        const { data: existingPersonas } = await supabase.from('personas').select('id').limit(1);
        if (!existingPersonas || existingPersonas.length === 0) {
            console.log("Seeding personas...");
            const personaPayload = Object.values(INITIAL_PERSONAS);
            await supabase.from('personas').upsert(personaPayload);
        }

        // 2. Seed Projects (Específicos do Usuário)
        const { data: existingProjects } = await supabase.from('projects').select('id').eq('ownerId', user.id).limit(1);
        if (!existingProjects || existingProjects.length === 0) {
            console.log("Seeding initial projects for user:", user.id);
            const projectsPayload = INITIAL_PROJECTS.map(p => ({
                ...p,
                ownerId: user.id,
                // Garantimos que o ID seja único para o usuário para evitar conflitos de RLS
                id: `${p.id}_${user.id.substring(0, 8)}` 
            }));
            const { error: pError } = await supabase.from('projects').upsert(projectsPayload);
            if (pError) throw pError;
        }
    } catch (err) {
        console.error("Error during seeding:", err);
    }
  },

  // --- TEMAS ---
  getTheme: async (): Promise<ThemeId> => {
    return localStorage.getItem(STORAGE_KEYS.THEME) as ThemeId || 'sand';
  },
  saveTheme: async (theme: ThemeId) => {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  },

  // --- PERSONAS ---
  getPersonas: async (): Promise<Record<string, PersonaConfig>> => {
    try {
      const { data, error } = await supabase.from('personas').select('*');
      if (error) throw error;
      
      const personas: Record<string, PersonaConfig> = {};
      if (data && data.length > 0) {
          data.forEach(p => {
            personas[p.id] = p as PersonaConfig;
          });
      } else {
          return INITIAL_PERSONAS;
      }
      
      if (!personas[USER_ID]) personas[USER_ID] = INITIAL_PERSONAS[USER_ID];
      return personas;
    } catch (e) {
      console.error("Error fetching personas:", e);
      return INITIAL_PERSONAS;
    }
  },

  savePersonas: async (personas: Record<string, PersonaConfig>) => {
    const payload = Object.values(personas);
    const { error } = await supabase.from('personas').upsert(payload);
    if (error) console.error("Erro ao salvar personas:", error);
  },
  
  // --- SETTINGS ---
  getPersonaOrder: async (): Promise<string[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
    
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', `order_${user.id}`)
      .single();
      
    return data?.value?.order ?? Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
  },

  savePersonaOrder: async (order: string[]) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    await supabase.from('settings').upsert({
      key: `order_${user.id}`,
      value: { order },
      user_id: user.id
    });
  },

  // --- PROJETOS ---
  getProjects: async (): Promise<Project[]> => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return [];

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('ownerId', user.id)
      .order('lastActiveAt', { ascending: false });

    if (error) {
        console.error("Error fetching projects:", error);
        return [];
    }
    return data as Project[];
  },

  saveSingleProject: async (project: Project) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;
    
    const projectWithOwner = { ...project, ownerId: user.id };
    const { error } = await supabase.from('projects').upsert(projectWithOwner);
    if (error) {
        console.error("Error saving project:", error);
        throw error;
    }
  },

  deleteProject: async (projectId: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw error;
  },
  
  // --- MENSAGENS ---
  getMessages: async (projectId: string): Promise<Message[]> => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: true });

    if (error) {
        console.error("Error fetching messages:", error);
        return [];
    }
    return data as Message[];
  },
  
  saveMessages: async (projectId: string, messages: Message[]) => {
    if (!messages.length) return;
    
    // Filtramos para salvar apenas o diferencial ou usamos upsert no array todo
    const messagesWithRef = messages.map(m => ({ 
      ...m, 
      project_id: projectId 
    }));
    
    const { error } = await supabase.from('messages').upsert(messagesWithRef);
    if (error) console.error("Erro ao salvar mensagens no Supabase:", error);
  },
  
  clearMessages: async (projectId: string) => {
    const { error } = await supabase.from('messages').delete().eq('project_id', projectId);
    if (error) console.error("Error clearing messages:", error);
  }
};
