
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
  Firestore,
  where
} from "firebase/firestore";
import { 
  getAuth, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  User,
  Auth
} from "firebase/auth";
import { firebaseConfig } from "../firebaseConfig";
import { Project, PersonaConfig, Message, ThemeId } from '../types';
import { STORAGE_KEYS, INITIAL_PERSONAS, INITIAL_PROJECTS, USER_ID } from '../constants';

const isFirebaseConfigured = firebaseConfig.apiKey !== "SUA_API_KEY_AQUI";

let db: Firestore | undefined;
let auth: Auth | undefined;

if (isFirebaseConfigured) {
  try {
    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    console.log("Firebase (Modular) inicializado.");
  } catch (e) {
    console.error("Erro ao inicializar Firebase:", e);
  }
}

// --- DEVICE ID HELPER (Modo Convidado - Legacy/Fallback) ---
const getDeviceId = (): string => {
  let id = localStorage.getItem('agora_device_id');
  if (!id) {
    id = Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem('agora_device_id', id);
  }
  return id;
};

const DEVICE_ID = getDeviceId();

// Helper para obter o ID do dono atual (User UID ou Device ID)
const getCurrentOwnerId = () => {
  if (auth?.currentUser) {
    return auth.currentUser.uid;
  }
  return DEVICE_ID;
};

export const storageService = {
  
  // --- AUTHENTICATION ---
  initAuth: (callback: (user: User | null) => void) => {
    if (!auth) {
      callback(null);
      return;
    }
    return onAuthStateChanged(auth, (user) => {
      callback(user);
    });
  },

  loginWithEmail: async (email: string, pass: string) => {
    if (!auth) throw new Error("Firebase Auth não configurado");
    return await signInWithEmailAndPassword(auth, email, pass);
  },

  registerWithEmail: async (email: string, pass: string, name: string) => {
    if (!auth) throw new Error("Firebase Auth não configurado");
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: name });
    }
    return userCredential;
  },

  logout: async () => {
    if (!auth) return;
    await signOut(auth);
    // Limpar cache local de projetos para evitar mistura
    localStorage.removeItem(STORAGE_KEYS.PROJECTS);
    window.location.reload(); // Recarregar para resetar estado limpo
  },

  getCurrentUser: () => auth?.currentUser,

  // --- HEALTH CHECK ---
  checkConnection: async (): Promise<{ online: boolean; error?: string }> => {
    if (!db) return { online: false, error: 'not_configured' };
    try {
      // Pequeno ping
      await getDoc(doc(db, "settings", "ping"));
      return { online: true };
    } catch (e: any) {
      // Ignorar erro se for apenas "document not found", significa que conectou
      if (e?.code === 'not-found') return { online: true };
      
      console.error("Health check failed:", e);
      let friendlyError = e?.message || 'unknown';
      if (e?.code === 'permission-denied') {
        friendlyError = "PERMISSÃO: Verifique as regras do Firestore.";
      } else if (e?.code === 'unimplemented') {
         friendlyError = "API Key inválida ou Firestore não ativado.";
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
    // Personas são globais/sistema, então buscamos todas
    if (!db) return INITIAL_PERSONAS;
    try {
      const snapshot = await getDocs(collection(db, "personas"));
      if (snapshot.empty) {
        // Se estiver vazio, tenta seedar (apenas se tiver permissão)
        storageService.savePersonas(INITIAL_PERSONAS).catch(() => {});
        return INITIAL_PERSONAS;
      }
      
      const personas: Record<string, PersonaConfig> = {};
      snapshot.forEach(d => {
        personas[d.id] = d.data() as PersonaConfig;
      });
      if (!personas[USER_ID]) personas[USER_ID] = INITIAL_PERSONAS[USER_ID];
      return personas;
    } catch (e) {
      console.warn("Fallback Local (Personas):", e);
      return INITIAL_PERSONAS;
    }
  },

  savePersonas: async (personas: Record<string, PersonaConfig>) => {
    if (!db) return; // Fallback silencioso
    const promises = Object.values(personas).map(p => 
      setDoc(doc(db, "personas", p.id), p)
    );
    await Promise.all(promises);
  },
  
  // --- ORDEM ---
  getPersonaOrder: async (): Promise<string[]> => {
    const ownerId = getCurrentOwnerId();
    if (!db) return Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
    try {
      const docSnap = await getDoc(doc(db, "settings", `order_${ownerId}`));
      if (docSnap.exists()) {
        return docSnap.data()?.order || [];
      }
      return Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
    } catch (e) {
      return Object.keys(INITIAL_PERSONAS).filter(id => id !== USER_ID);
    }
  },

  savePersonaOrder: async (order: string[]) => {
    const ownerId = getCurrentOwnerId();
    if (!db) return;
    await setDoc(doc(db, "settings", `order_${ownerId}`), { order });
  },

  // --- PROJETOS (AUTH AWARE) ---
  getProjects: async (): Promise<Project[]> => {
    const ownerId = getCurrentOwnerId();
    
    // 1. Tenta carregar do LocalStorage primeiro (Cache/Offline)
    // Se estiver logado, usamos uma chave diferente para não misturar
    const storageKey = auth?.currentUser ? `${STORAGE_KEYS.PROJECTS}_${auth.currentUser.uid}` : STORAGE_KEYS.PROJECTS;
    
    const localStr = localStorage.getItem(storageKey);
    let localProjects: Project[] = localStr ? JSON.parse(localStr) : [];
    
    if (!db) return localProjects.length ? localProjects : (auth?.currentUser ? [] : INITIAL_PROJECTS);

    try {
      // 2. Busca no Firebase
      // Nota: Idealmente usaria 'where("ownerId", "==", ownerId)', mas requer index composto com 'orderBy'.
      // Buscamos tudo e filtramos no cliente para evitar erros de setup do usuário.
      const q = query(collection(db, "projects"), orderBy("lastActiveAt", "desc"));
      const snapshot = await getDocs(q);
      
      // Se for convidado e não tiver nada, seeda iniciais
      if (snapshot.empty && !auth?.currentUser && localProjects.length === 0) {
        const seeded = INITIAL_PROJECTS.map(p => ({ ...p, ownerId: DEVICE_ID }));
        Promise.all(seeded.map(p => setDoc(doc(db!, "projects", p.id), p))).catch(() => {});
        return seeded;
      }

      const remoteProjects = snapshot.docs
        .map(d => d.data() as Project)
        .filter(p => p.ownerId === ownerId || (!p.ownerId && !auth?.currentUser && p.ownerId !== 'system')); // Compatibilidade

      // 3. Atualiza cache local
      localStorage.setItem(storageKey, JSON.stringify(remoteProjects));
      return remoteProjects;

    } catch (e) {
      console.warn("Usando projetos locais devido a erro:", e);
      // Se der erro (ex: offline), retorna local se tiver
      return localProjects;
    }
  },

  saveProjects: async (projects: Project[]) => {
    const ownerId = getCurrentOwnerId();
    const storageKey = auth?.currentUser ? `${STORAGE_KEYS.PROJECTS}_${auth.currentUser.uid}` : STORAGE_KEYS.PROJECTS;

    // Salva local
    localStorage.setItem(storageKey, JSON.stringify(projects));
    
    if (!db) return;
    // Salva remoto com ID do dono
    const promises = projects.map(p => {
       const projectWithOwner = { ...p, ownerId };
       return setDoc(doc(db!, "projects", p.id), projectWithOwner);
    });
    await Promise.all(promises);
  },
  
  saveSingleProject: async (project: Project) => {
    const ownerId = getCurrentOwnerId();
    const storageKey = auth?.currentUser ? `${STORAGE_KEYS.PROJECTS}_${auth.currentUser.uid}` : STORAGE_KEYS.PROJECTS;

    // Atualiza lista local
    const localStr = localStorage.getItem(storageKey);
    let localProjects: Project[] = localStr ? JSON.parse(localStr) : [];
    const idx = localProjects.findIndex(p => p.id === project.id);
    if (idx >= 0) localProjects[idx] = project; else localProjects.unshift(project);
    localStorage.setItem(storageKey, JSON.stringify(localProjects));

    if (!db) return;
    const projectWithOwner = { ...project, ownerId };
    await setDoc(doc(db, "projects", project.id), projectWithOwner);
  },

  deleteProject: async (projectId: string) => {
     const storageKey = auth?.currentUser ? `${STORAGE_KEYS.PROJECTS}_${auth.currentUser.uid}` : STORAGE_KEYS.PROJECTS;

     // Remove local
     const localStr = localStorage.getItem(storageKey);
     if (localStr) {
         const localProjects: Project[] = JSON.parse(localStr);
         const filtered = localProjects.filter(p => p.id !== projectId);
         localStorage.setItem(storageKey, JSON.stringify(filtered));
     }

    if (!db) return;
    await deleteDoc(doc(db, "projects", projectId));
  },
  
  // --- MENSAGENS ---
  getMessages: async (projectId: string): Promise<Message[]> => {
    // Mensagens são subcoleção, então o ID do projeto já protege (se o projeto for privado)
    if (!db) {
        const localKey = `${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`;
        const local = localStorage.getItem(localKey);
        return local ? JSON.parse(local) : [];
    }
    try {
      const messagesRef = collection(db, "projects", projectId, "messages");
      const q = query(messagesRef, orderBy("timestamp", "asc"));
      const snapshot = await getDocs(q);
      const msgs = snapshot.docs.map(d => d.data() as Message);
      
      // Cache local
      localStorage.setItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`, JSON.stringify(msgs));
      return msgs;
    } catch (e) {
      console.warn("Fallback mensagens locais:", e);
      const local = localStorage.getItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`);
      return local ? JSON.parse(local) : [];
    }
  },
  
  saveMessages: async (projectId: string, messages: Message[]) => {
    // Salva local
    localStorage.setItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`, JSON.stringify(messages));

    if (!db) return;
    const batchPromises = messages.map(msg => 
       setDoc(doc(db!, "projects", projectId, "messages", msg.id), msg)
    );
    await Promise.all(batchPromises);
  },
  
  clearMessages: async (projectId: string) => {
    localStorage.removeItem(`${STORAGE_KEYS.MESSAGES_PREFIX}${projectId}`);
    
    if (!db) return;
    const msgs = await storageService.getMessages(projectId);
    const promises = msgs.map(m => deleteDoc(doc(db!, "projects", projectId, "messages", m.id)));
    await Promise.all(promises);
  }
};
