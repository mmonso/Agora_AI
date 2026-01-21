
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { Message, PersonaConfig, ProjectPhase, ActionPlan } from "../types";
import { PHASE_INSTRUCTIONS } from "../constants";

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Helper for Retry Logic ---
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function callWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === 429 || error?.status === 'RESOURCE_EXHAUSTED' || error?.message?.includes('429');

    if (retries > 0 && isRateLimit) {
      console.warn(`Rate limit hit (429). Retrying in ${delay}ms...`);
      await wait(delay);
      return callWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Generates a response from a specific persona based on conversation history.
 * Supports 'interview' mode to force questions.
 */
export const generatePersonaResponse = async (
  targetPersona: PersonaConfig,
  history: Message[],
  personas: Record<string, PersonaConfig>,
  activePersonaIds: string[],
  projectContext?: string,
  phase: ProjectPhase = 'exploration',
  mode: 'default' | 'interview' = 'default'
): Promise<string> => {
  try {
    const recentHistory = history;

    // Check if the very last message has attachments
    const lastMessage = recentHistory[recentHistory.length - 1];
    const hasAttachments = lastMessage?.attachments && lastMessage.attachments.length > 0;

    // Identify who spoke last to encourage interaction
    const isUserLast = lastMessage.senderId === 'user';

    // Create a list of who is actually in the room to prevent hallucinations
    const presentColleagues = activePersonaIds
      .filter(id => id !== targetPersona.id)
      .map(id => `- ${personas[id]?.name} (${personas[id]?.role})`)
      .join('\n');

    // Full History formatting
    const formattedHistory = recentHistory.map(msg => {
      if (msg.type === 'system') {
        return `[EVENTO DO SISTEMA]: ${msg.text}`;
      }
      const name = personas[msg.senderId]?.name || 'Usuário';
      const attInfo = msg.attachments?.length ? `[Anexo: ${msg.attachments.map(a => a.name).join(', ')}]` : '';
      return `${name}: ${msg.text} ${attInfo}`;
    }).join('\n\n');

    const phaseInstruction = PHASE_INSTRUCTIONS[phase] || PHASE_INSTRUCTIONS.exploration;

    let specialInstruction = "";
    if (mode === 'interview') {
      specialInstruction = `
        *** MODO ENTREVISTA ATIVO ***
        SEU OBJETIVO: Você NÃO está aqui para dar conselhos agora. Você precisa entender o Usuário mais profundamente.
        TAREFA: Faça UMA única pergunta provocativa e profunda baseada na sua especialidade para obter mais contexto do Usuário.
        RESTRIÇÃO: Não dê palestras. Não responda perguntas anteriores. APENAS PERGUNTE.
        `;
    }

    let promptText = `
      Você está participando de uma mesa redonda (O Conselho de Ágora).
      
      SUA PERSONA:
      Nome: ${targetPersona.name}
      Papel: ${targetPersona.role}
      Identidade/Base Teórica: ${targetPersona.systemInstruction}

      QUEM ESTÁ NA SALA COM VOCÊ (Colegas Presentes):
      ${presentColleagues}
      *O Usuário (Paciente/Analisando) também está presente.*

      CONTEXTO DA DISCUSSÃO:
      "${projectContext || 'Discussão Geral'}"

      ${phaseInstruction}
      ${specialInstruction}

      HISTÓRICO DA CONVERSA:
      ${formattedHistory}
      
      *** INSTRUÇÕES CRÍTICAS PARA ESTE TURNO ***
      
      1. **DINÂMICA DE DEBATE:** 
         - Você está conversando com o USUÁRIO e com seus COLEGAS PRESENTES.
         - IMPORTANTE: Se você mencionar um colega, certifique-se de que ele está na lista "QUEM ESTÁ NA SALA". Não chame especialistas que não estão presentes (como Freud ou Jung se eles não estiverem na lista acima).
         - Se um colega presente falou antes, reaja ao que ele disse.

      2. **CONSCIÊNCIA DA FASE:**
         - Respeite rigorosamente a fase atual (${phase}).

      3. **TRATAMENTO DO INPUT DO USUÁRIO:**
         - O Usuário foi o último a falar? "${isUserLast ? 'SIM' : 'NÃO'}".
         - Se o Usuário falou por último, ENDERECE o ponto dele diretamente.
      
      4. **ACESSIBILIDADE:**
         - EXPLIQUE COMO SE EU TIVESSE 5 ANOS (ELI5).
      
      5. **BREVIDADE:**
         - Mantenha o tom de conversa. Máximo 3 parágrafos curtos.
    `;

    let contentParts: any[] = [{ text: promptText }];

    // If the last message has attachments, add them as inlineData parts
    if (hasAttachments && lastMessage.attachments) {
      lastMessage.attachments.forEach(att => {
        const base64Data = att.data.split(',')[1];
        if (base64Data) {
          contentParts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: base64Data
            }
          });
        }
      });
    }

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: contentParts },
      config: {
        temperature: mode === 'interview' ? 0.9 : 0.8,
        tools: [{ googleSearch: {} }]
      }
    }));

    return response.text || "...";
  } catch (error) {
    console.error("Error generating persona response:", error);
    throw error;
  }
};

interface RouterResponse {
  nextSpeakerId: string | null;
  reasoning: string;
  shouldAdvancePhase: boolean;
}

/**
 * AI ROUTER: Decides who should speak next based on History AND Phase.
 */
export const determineNextSpeaker = async (
  history: Message[],
  activePersonaIds: string[],
  personas: Record<string, PersonaConfig>,
  projectContext?: string,
  phase: ProjectPhase = 'exploration',
  forceInterview: boolean = false
): Promise<RouterResponse> => {
  try {
    const recentHistory = history;

    const formattedHistory = recentHistory.map(msg => {
      if (msg.type === 'system') return `[EVENTO DO SISTEMA]: ${msg.text}`;
      return `${personas[msg.senderId]?.name || 'Usuário'}: ${msg.text}`;
    }).join('\n');

    // Calculate turns in current phase
    let turnsInCurrentPhase = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].type === 'system') break;
      if (history[i].senderId !== 'user') turnsInCurrentPhase++;
    }

    const candidates = activePersonaIds.map(id => ({
      id,
      name: personas[id]?.name,
      role: personas[id]?.role
    }));

    const prompt = `
            Você é o "Moderador Invisível" de um conselho de especialistas.
            
            Fase Atual: ${phase.toUpperCase()}
            Contexto: "${projectContext}"
            ${forceInterview ? 'MODO ESPECIAL: O usuário pediu uma entrevista. Selecione o melhor especialista para fazer uma pergunta profunda.' : ''}
            
            **MÉTRICAS:**
            - Turnos na fase atual: ${turnsInCurrentPhase}

            Sua Tarefa:
            1. Decidir QUEM fala agora.
            2. Decidir SE a fase deve avançar automaticamente.

            **CANDIDATOS VÁLIDOS (APENAS ESTES PODEM FALAR):**
            ${JSON.stringify(candidates)}

            **REGRAS ESTRITAS:**
            1. **Retorne APENAS um ID que esteja na lista de Candidatos acima.**
            2. Se o último falante chamou alguém que NÃO está na lista (ex: chamou Freud, mas Freud não está aqui), IGNORE o chamado e escolha um candidato presente que possa responder melhor.
            3. **Variedade:** Evite repetir o mesmo falante consecutivamente se possível.
            4. **Silêncio:** Se a conversa parece estar concluída ou saturada, retorne nextSpeakerId como null.

            Histórico Recente:
            ${formattedHistory}
            
            Retorne JSON: 
            { 
              "nextSpeakerId": "string_id_from_candidates" | null, 
              "reasoning": "Por que escolheu essa pessoa?",
              "shouldAdvancePhase": boolean
            }
        `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            nextSpeakerId: { type: Type.STRING, nullable: true },
            reasoning: { type: Type.STRING },
            shouldAdvancePhase: { type: Type.BOOLEAN }
          }
        }
      }
    }));

    const result = JSON.parse(response.text || '{}') as RouterResponse;

    // Guardrails
    if (result.shouldAdvancePhase && turnsInCurrentPhase < 4) {
      result.shouldAdvancePhase = false;
    }

    return result;

  } catch (error) {
    console.error("Router error:", error);
    return { nextSpeakerId: null, reasoning: "Error", shouldAdvancePhase: false };
  }
}

/**
 * ACTION PLAN GENERATOR (Artifacts)
 */
export const generateActionPlan = async (
  history: Message[],
  personas: Record<string, PersonaConfig>,
  title: string
): Promise<ActionPlan> => {
  try {
    const textHistory = history.map(msg => `${personas[msg.senderId]?.name || 'Usuário'}: ${msg.text}`).join('\n');
    const prompt = `
            Com base na discussão "${title}", crie um PLANO DE AÇÃO concreto.
            
            Histórico da Conversa:
            ${textHistory}
            
            Instruções:
            - Extraia conselhos práticos e consensos do debate.
            - Transforme-os em itens de checklist acionáveis.
            - Crie um título motivador.
            - Limite a 3-6 itens de alto impacto.
        `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  text: { type: Type.STRING },
                  completed: { type: Type.BOOLEAN }
                }
              }
            }
          }
        }
      }
    }));

    const result = JSON.parse(response.text || '{}') as ActionPlan;
    if (result.items) {
      result.items.forEach((item, idx) => {
        if (!item.id) item.id = `action-${idx}-${Date.now()}`;
        if (item.completed === undefined) item.completed = false;
      });
    }
    return result;

  } catch (e) {
    console.error("Error generating action plan", e);
    return { title: "Plano de Ação", items: [] };
  }
}

/**
 * MEETING MINUTES
 */
export const generateMeetingMinutes = async (history: Message[], personas: Record<string, PersonaConfig>, title: string): Promise<string> => {
  try {
    const textHistory = history.map(msg => `${personas[msg.senderId]?.name || 'Usuário'}: ${msg.text}`).join('\n');
    const prompt = `
            Gere uma Ata de Reunião estruturada para a sessão "${title}".
            Formato: Markdown.
            Linguagem: Português.
            Inclua: Sumário Executivo, Pontos Chave, Consensos, Divergências e Próximos Passos.
            
            Conversa:
            ${textHistory}
        `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] }
    }));

    return response.text || "# Erro ao gerar ata";
  } catch (e) {
    return "# Erro ao gerar ata";
  }
}

/**
 * META-CONTEXT
 */
export const updateProjectContextFromConversation = async (currentContext: string, history: Message[], personas: Record<string, PersonaConfig>): Promise<string> => {
  try {
    const textHistory = history.map(msg => `${personas[msg.senderId]?.name || 'Usuário'}: ${msg.text}`).join('\n');
    const prompt = `
            Com base na conversa recente, evolua o Contexto Global/Objetivo deste projeto.
            Contexto Atual: "${currentContext}"
            
            Conversa:
            ${textHistory}
            
            Tarefa: Reescreva o contexto para refletir a nova direção ou descobertas. Máximo 3 frases.
         `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] }
    }));

    return response.text || currentContext;
  } catch (e) {
    return currentContext;
  }
}

export const generateAvatar = async (name: string, role: string, description: string): Promise<string | null> => {
  try {
    const prompt = `A high-quality, digital art style portrait avatar of a character named ${name}, who is a ${role}. 
    Description: ${description}. Square close-up face shot.`;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] }
    }));

    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating avatar:", error);
    throw error;
  }
};

export const generateConversationStarters = async (title: string, context: string): Promise<string[]> => {
  try {
    const prompt = `
      Gere 5 perguntas provocativas (em Português) para iniciar uma discussão.
      Título: "${title}"
      Contexto: "${context}"
      Máximo 15 palavras por pergunta.
    `;

    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    }));
    return JSON.parse(response.text || '[]') as string[];
  } catch (error) {
    return [];
  }
};

export const refineProjectContext = async (originalText: string): Promise<string> => {
  try {
    const prompt = `
      Atue como um editor profissional. Melhore este texto de "Contexto Global" para ser mais claro e inspirador para IAs especialistas.
      Texto: "${originalText}"
      Linguagem: Português.
    `;
    const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
    }));
    return response.text?.trim() || originalText;
  } catch (error) {
    return originalText;
  }
};
