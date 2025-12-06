
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

export interface Message {
  id: string;
  senderId: PersonaId;
  text: string;
  timestamp: number;
  attachments?: Attachment[];
}

export interface Toast {
  id: string;
  message: string;
  type: 'error' | 'info';
}

export interface Project {
  id: string;
  title: string;
  description: string; // Context/Objective
  createdAt: number;
  lastActiveAt: number;
  activePersonaIds: PersonaId[];
  starters?: string[];
  theme: ThemeId;
  longTermMemory?: string; // Summarized history
}

export type ConversationStatus = 'idle' | 'active' | 'paused' | 'thinking';

export type ThemeId = 'sand' | 'autumn' | 'dark' | 'eco' | 'hitech';

export type AppView = 'dashboard' | 'chat';
