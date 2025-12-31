
import { supabase } from "../supabaseClient";
import { Project, PersonaConfig, Message, ThemeId } from '../types';
import { STORAGE_KEYS, INITIAL_PERSONAS, INITIAL_PROJECTS, USER_ID } from '../constants';
import { User, Session } from '@supabase/supabase-js';

// --- DEVICE ID HELPER (Fallback para convidados) ---
const getDeviceId = (): string => {
  let id = localStorage.getItem('agora_device_id');
  if (!id) {
    id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('agora_device_id', id);
  }
  return id;
};

const DEVICE_ID = getDeviceId();

// Helper para obter o ID do dono atual
const getCurrentOwnerId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || DEVICE_ID;
};

export const storageService = {

  // --- AUTHENTICATION ---
  initAuth: (callback: (user: User | null) => void) => {
    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      callback(session?.user ?? null);
    });

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  },

  loginWithEmail: async (email: string, pass: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) throw error;
    return data;
  },

  registerWithEmail: async (email: string, pass: string, name: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: {
          display_name: name,
        }
      }
    });
    if (error) throw error;
    return data;
  },

  logout: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(STORAGE_KEYS.PROJECTS);
    window.location.reload();
  },

  getCurrentUser: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  // --- HEALTH CHECK ---
  checkConnection: async (): Promise<{ online: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('personas').select('id').limit(1);
      if (error) throw error;
      return { online: true };
    } catch (e: any) {
      console.error("Health check failed:", e);
      return { online: false, error: e.message };
    }
  },

  // --- TEMAS (LocalStorage fallback + metadata) ---
  getTheme: async (): Promise<ThemeId> => {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME) as ThemeId;
    if (theme) return theme;

    const { data: { user } } = await supabase.auth.getUser();
    return (user?.user_metadata?.theme as ThemeId) || 'sand';
  },

  saveTheme: async (theme: ThemeId) => {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    await supabase.auth.updateUser({
      data: { theme }
    });
  },

  // --- PERSONAS ---
  getPersonas: async (): Promise<Record<string, PersonaConfig>> => {
    try {
      const { data, error } = await supabase.from('personas').select('*');
      if (error) throw error;

      if (!data || data.length === 0) {
        // Seed initial if empty (might fail due to permissions, but okay)
        storageService.savePersonas(INITIAL_PERSONAS).catch(() => { });
        return INITIAL_PERSONAS;
      }

      const personas: Record<string, PersonaConfig> = {};
      data.forEach(p => {
        personas[p.id] = p as PersonaConfig;
      });
      if (!personas[USER_ID]) personas[USER_ID] = INITIAL_PERSONAS[USER_ID];
      return personas;
    } catch (e) {
      console.warn("Supabase Personas Error, using initial:", e);
      return INITIAL_PERSONAS;
    }
  },

  savePersonas: async (personas: Record<string, PersonaConfig>) => {
    const payload = Object.values(personas);
    const { error } = await supabase.from('personas').upsert(payload);
    if (error) console.error("Error saving personas:", error);
  },

  // --- ORDEM ---
  getPersonaOrder: async (): Promise<string[]> => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.user_metadata?.persona_order || Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
  },

  savePersonaOrder: async (order: string[]) => {
    await supabase.auth.updateUser({
      data: { persona_order: order }
    });
  },

  // --- PROJETOS ---
  getProjects: async (): Promise<Project[]> => {
    const ownerId = await getCurrentOwnerId();
    const storageKey = `${STORAGE_KEYS.PROJECTS}_${ownerId}`;

    const localStr = localStorage.getItem(storageKey);
    let localProjects: Project[] = localStr ? JSON.parse(localStr) : [];

    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('owner_id', ownerId)
        .order('last_active_at', { ascending: false });

      if (error) throw error;

      const remoteProjects = (data || []).map(p => ({
        ...p,
        ownerId: p.owner_id,
        activePersonaIds: p.active_persona_ids,
        createdAt: p.created_at,
        lastActiveAt: p.last_active_at
      } as Project));

      localStorage.setItem(storageKey, JSON.stringify(remoteProjects));
      return remoteProjects;
    } catch (e) {
      console.warn("Using local projects due to error:", e);
      return localProjects;
    }
  },

  saveSingleProject: async (project: Project) => {
    const ownerId = await getCurrentOwnerId();
    const storageKey = `${STORAGE_KEYS.PROJECTS}_${ownerId}`;

    // Update local
    const localStr = localStorage.getItem(storageKey);
    let localProjects: Project[] = localStr ? JSON.parse(localStr) : [];
    const idx = localProjects.findIndex(p => p.id === project.id);
    if (idx >= 0) localProjects[idx] = project; else localProjects.unshift(project);
    localStorage.setItem(storageKey, JSON.stringify(localProjects));

    // Remoto
    const payload = {
      id: project.id,
      owner_id: ownerId,
      title: project.title,
      description: project.description,
      created_at: project.createdAt,
      last_active_at: project.lastActiveAt,
      active_persona_ids: project.activePersonaIds,
      starters: project.starters,
      theme: project.theme,
      phase: project.phase,
      mode: project.mode
    };

    const { error } = await supabase.from('projects').upsert(payload);
    if (error) console.error("Error saving project:", error);
  },

  deleteProject: async (projectId: string) => {
    const ownerId = await getCurrentOwnerId();
    const storageKey = `${STORAGE_KEYS.PROJECTS}_${ownerId}`;

    const localStr = localStorage.getItem(storageKey);
    if (localStr) {
      const localProjects: Project[] = JSON.parse(localStr);
      const filtered = localProjects.filter(p => p.id !== projectId);
      localStorage.setItem(storageKey, JSON.stringify(filtered));
    }

    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) console.error("Error deleting project:", error);
  },

  // --- MENSAGENS ---
  getMessages: async (projectId: string): Promise<Message[]> => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('project_id', projectId)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      const msgs = (data || []) as Message[];
      localStorage.setItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`, JSON.stringify(msgs));
      return msgs;
    } catch (e) {
      const local = localStorage.getItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`);
      return local ? JSON.parse(local) : [];
    }
  },

  saveMessages: async (projectId: string, messages: Message[]) => {
    localStorage.setItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`, JSON.stringify(messages));

    const payload = messages.map(m => ({
      ...m,
      project_id: projectId
    }));

    const { error } = await supabase.from('messages').upsert(payload);
    if (error) console.error("Error saving messages:", error);
  },

  clearMessages: async (projectId: string) => {
    localStorage.removeItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`);
    const { error } = await supabase.from('messages').delete().eq('project_id', projectId);
    if (error) console.error("Error clearing messages:", error);
  }
};
