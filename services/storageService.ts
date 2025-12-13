
import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy,
  Firestore
} from "firebase/firestore";
import { firebaseConfig } from "../firebaseConfig";
import { Project, PersonaConfig, Message, ThemeId } from '../types';
import { STORAGE_KEYS, INITIAL_PERSONAS, INITIAL_PROJECTS, USER_ID } from '../constants';

const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY_AQUI";

let db: Firestore | undefined;

if (isFirebaseConfigured) {
  try {
    // Padrão Singleton para evitar "Firebase App already exists"
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    console.log("Firebase (Modular) inicializado.");
  } catch (e) {
    console.error("Erro ao inicializar Firebase:", e);
  }
} else {
  console.warn("Firebase não configurado. Edite o arquivo firebaseConfig.ts");
}

export const storageService = {
  
  // --- HEALTH CHECK ---
  checkConnection: async (): Promise<{ online: boolean; error?: string }> => {
    if (!db) return { online: false, error: 'not_configured' };
    try {
      // Tenta ler um doc de teste.
      await getDoc(doc(db, "settings", "ping"));
      return { online: true };
    } catch (e: any) {
      console.error("Health check failed:", e);
      let friendlyError = e?.message || 'unknown';
      
      // Diagnóstico de erros comuns do Console
      if (e?.code === 'permission-denied') {
        friendlyError = "PERMISSÃO NEGADA: Vá no Firebase Console > Firestore > Regras e mude para 'allow read, write: if true;'";
      } else if (e?.code === 'unimplemented' || e?.code === 'not-found' || e?.message?.includes('project')) {
         friendlyError = "BANCO NÃO ENCONTRADO: Vá no Firebase Console > Firestore Database e clique em 'Criar Banco de Dados'.";
      } else if (e?.message?.includes('offline')) {
         friendlyError = "Você está offline.";
      }

      return { online: false, error: friendlyError };
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
    if (!db) return INITIAL_PERSONAS;
    try {
      const snapshot = await getDocs(collection(db, "personas"));
      if (snapshot.empty) {
        storageService.savePersonas(INITIAL_PERSONAS).catch(e => console.warn("Erro ao seedar personas:", e));
        return INITIAL_PERSONAS;
      }
      
      const personas: Record<string, PersonaConfig> = {};
      snapshot.forEach(d => {
        personas[d.id] = d.data() as PersonaConfig;
      });
      if (!personas[USER_ID]) personas[USER_ID] = INITIAL_PERSONAS[USER_ID];
      return personas;
    } catch (e) {
      console.error("Erro ao buscar personas (fallback local):", e);
      return INITIAL_PERSONAS;
    }
  },

  savePersonas: async (personas: Record<string, PersonaConfig>) => {
    if (!db) throw new Error("Firebase não inicializado");
    const promises = Object.values(personas).map(p => 
      setDoc(doc(db, "personas", p.id), p)
    );
    await Promise.all(promises);
  },
  
  // --- ORDEM ---
  getPersonaOrder: async (): Promise<string[]> => {
    if (!db) return Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
    try {
      const docSnap = await getDoc(doc(db, "settings", "personaOrder"));
      if (docSnap.exists()) {
        return docSnap.data()?.order || [];
      }
      return Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
    } catch (e) {
      return Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
    }
  },

  savePersonaOrder: async (order: string[]) => {
    if (!db) throw new Error("Firebase não inicializado");
    await setDoc(doc(db, "settings", "personaOrder"), { order });
  },

  // --- PROJETOS ---
  getProjects: async (): Promise<Project[]> => {
    if (!db) return INITIAL_PROJECTS;
    try {
      const q = query(collection(db, "projects"), orderBy("lastActiveAt", "desc"));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        Promise.all(INITIAL_PROJECTS.map(p => setDoc(doc(db, "projects", p.id), p)))
          .catch(e => console.warn("Erro ao seedar projetos:", e));
        return INITIAL_PROJECTS;
      }

      return snapshot.docs.map(d => d.data() as Project);
    } catch (e) {
      console.error("Erro ao buscar projetos (fallback local):", e);
      return INITIAL_PROJECTS;
    }
  },

  saveProjects: async (projects: Project[]) => {
    if (!db) throw new Error("Firebase não inicializado");
    const promises = projects.map(p => setDoc(doc(db, "projects", p.id), p));
    await Promise.all(promises);
  },
  
  saveSingleProject: async (project: Project) => {
    if (!db) throw new Error("Firebase não inicializado");
    await setDoc(doc(db, "projects", project.id), project);
  },

  deleteProject: async (projectId: string) => {
    if (!db) throw new Error("Firebase não inicializado");
    await deleteDoc(doc(db, "projects", projectId));
  },
  
  // --- MENSAGENS ---
  getMessages: async (projectId: string): Promise<Message[]> => {
    if (!db) return [];
    try {
      const messagesRef = collection(db, "projects", projectId, "messages");
      const q = query(messagesRef, orderBy("timestamp", "asc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as Message);
    } catch (e) {
      console.error("Erro ao buscar mensagens:", e);
      return [];
    }
  },
  
  saveMessages: async (projectId: string, messages: Message[]) => {
    if (!db) throw new Error("Firebase não inicializado");
    const batchPromises = messages.map(msg => 
       setDoc(doc(db, "projects", projectId, "messages", msg.id), msg)
    );
    await Promise.all(batchPromises);
  },
  
  clearMessages: async (projectId: string) => {
    if (!db) throw new Error("Firebase não inicializado");
    const msgs = await storageService.getMessages(projectId);
    const promises = msgs.map(m => deleteDoc(doc(db, "projects", projectId, "messages", m.id)));
    await Promise.all(promises);
  }
};
