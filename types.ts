
export type PersonaId = string;

export interface PersonaConfig {
  id: PersonaId;
  name: string;
  role: string;
  avatarColor: string;
  borderColor: string;
  textColor: string;
  systemInstruction: string;
  avatar?: string; // Base64 string of the custom avatar image
}

export interface Attachment {
  type: 'image' | 'audio' | 'file';
  mimeType: string;
  data: string; // Base64 string
  name: string;
}

export interface ActionItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface ActionPlan {
  title: string;
  items: ActionItem[];
}

export interface Message {
  id: string;
  senderId: PersonaId;
  text: string;
  timestamp: number;
  attachments?: Attachment[];
  reasoning?: string; // "Behind the scenes" reason why this message exists
  type?: 'normal' | 'system'; // 'system' messages are timeline events
  actionPlan?: ActionPlan; // structured output for Action phase
}

export interface Toast {
  id: string;
  message: string;
  type: 'error' | 'info';
  duration?: number;
}

export type ProjectPhase = 'exploration' | 'synthesis' | 'action';

export type ProjectMode = 'council' | 'chat';

export interface Project {
  id: string;
  ownerId?: string; // ID do dispositivo/usuário para "login invisível"
  title: string;
  description: string; // Context/Objective
  createdAt: number;
  lastActiveAt: number;
  activePersonaIds: PersonaId[];
  starters?: string[];
  theme: ThemeId;
  longTermMemory?: string; // Summarized history
  phase?: ProjectPhase; // Current phase of the session
  mode?: ProjectMode; // 'council' (default) or 'chat' (1:1)
}

export type ConversationStatus = 'idle' | 'active' | 'paused' | 'thinking';

export type ThemeId = 'sand' | 'autumn' | 'dark' | 'eco' | 'hitech' | 'midnight' | 'nordic' | 'mystic' | 'rose';

export type AppView = 'dashboard' | 'expert-home' | 'chat';
