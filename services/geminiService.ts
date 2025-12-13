
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
  projectContext?: string,
  phase: ProjectPhase = 'exploration',
  mode: 'default' | 'interview' = 'default'
): Promise<string> => {
  try {
    // REVERTED: Sending Full History as requested (No Sliding Window)
    const recentHistory = history;

    // Check if the very last message has attachments
    const lastMessage = recentHistory[recentHistory.length - 1];
    const hasAttachments = lastMessage?.attachments && lastMessage.attachments.length > 0;
    
    // Identify who spoke last to encourage interaction
    const lastSpeakerName = personas[lastMessage.senderId]?.name || 'User';
    const isUserLast = lastMessage.senderId === 'user';
    const isSystemLast = lastMessage.type === 'system';
    
    // Full History formatting
    const formattedHistory = recentHistory.map(msg => {
      if (msg.type === 'system') {
          return `[SYSTEM EVENT]: ${msg.text}`;
      }
      const name = personas[msg.senderId]?.name || 'User';
      const attInfo = msg.attachments?.length ? `[Attached: ${msg.attachments.map(a => a.name).join(', ')}]` : '';
      return `${name}: ${msg.text} ${attInfo}`;
    }).join('\n\n');

    const phaseInstruction = PHASE_INSTRUCTIONS[phase] || PHASE_INSTRUCTIONS.exploration;

    let specialInstruction = "";
    if (mode === 'interview') {
        specialInstruction = `
        *** INTERVIEW MODE ACTIVE ***
        YOUR GOAL: You are NOT here to give advice right now. You need to understand the User deeper.
        TASK: Ask ONE single, provocative, deep question based on your persona's expertise to get more context from the User.
        CONSTRAINT: Do not lecture. Do not answer previous questions. JUST ASK.
        `;
    }

    let promptText = `
      You are participating in a roundtable discussion (The Agora Council).
      
      YOUR PERSONA:
      Name: ${targetPersona.name}
      Role: ${targetPersona.role}
      Identity: ${targetPersona.systemInstruction}

      CONTEXT OF DISCUSSION:
      "${projectContext || 'General Discussion'}"

      ${phaseInstruction}
      ${specialInstruction}

      CONVERSATION HISTORY:
      ${formattedHistory}
      
      *** CRITICAL INSTRUCTIONS FOR THIS TURN ***
      
      1. **CURRENT PHASE AWARENESS:**
         - You MUST adhere to the goal of the current phase (${phase}).
         - EXPLORATION: Be expansive, theoretical, curious.
         - SYNTHESIS: Connect ideas, summarize, find consensus.
         - ACTION: Be practical, prescriptive, give homework/tasks.

      2. **SYSTEM EVENTS:**
         - If the last message was a [SYSTEM EVENT] (e.g., "User changed phase"), ACKNOWLEDGE it implicitly by shifting your tone to match the new phase immediately.
         - Do not say "I see we changed phases". Just ACT according to the new phase.

      3. **HANDLING USER INPUT:**
         - The User spoke last: "${isUserLast ? 'YES' : 'NO'}".
         - If the User spoke last, ADDRESS THEIR POINT DIRECTLY.
      
      4. **INTERACTION:** 
         - ${!isUserLast && !isSystemLast ? `You are replying to your colleague, ${lastSpeakerName}.` : `You are speaking to the group/user.`}
         - If replying to a colleague, use their name.
      
      5. **ACCESSIBILITY:**
         - EXPLAIN LIKE I'M 5. No complex jargon without immediate simple definition.
      
      6. **BREVITY:**
         - Keep it conversational. Max 3 short paragraphs.
         ${mode === 'interview' ? '- Keep it very short. Just the question and a brief lead-in.' : ''}
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
        tools: [{googleSearch: {}}]
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
  shouldAdvancePhase: boolean; // "Invisible Moderator" Logic
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
        // REVERTED: Sending Full History as requested (No Sliding Window)
        const recentHistory = history;
        
        const formattedHistory = recentHistory.map(msg => {
            if (msg.type === 'system') return `[SYSTEM EVENT]: ${msg.text}`;
            return `${personas[msg.senderId]?.name || 'User'}: ${msg.text}`;
        }).join('\n');
        
        // Calculate turns in current phase (distance since last System message)
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
            You are the "Invisible Moderator" of a debate. 
            
            Current Phase: ${phase.toUpperCase()}
            Project Context: "${projectContext}"
            ${forceInterview ? 'SPECIAL MODE: The user requested an interview. Select the BEST expert to ask a probing question.' : ''}
            
            **METRICS:**
            - Turns in current phase: ${turnsInCurrentPhase}
            - Minimum turns required to advance: 8

            Your Tasks:
            1. Decide WHO speaks next.
            2. Decide IF the discussion phase should advance automatically (Saturation Check).

            **PHASE ADVANCEMENT RULES (STRICT):**
            - **DO NOT ADVANCE** if turns in current phase < 8 (unless user explicitly requested).
            - **EXPLORATION -> SYNTHESIS:** Only advance if the topic is SATURATED. If ideas are still flowing, stay in Exploration. If arguments are repeating circularly, advance.
            - **SYNTHESIS -> ACTION:** Only advance if a clear consensus OR a clear irreconcilable difference has been established.
            - **ACTION:** Stay here until practical steps are clear.

            Candidates:
            ${JSON.stringify(candidates)}
            
            Recent History:
            ${formattedHistory}
            
            Rules for Speaker Selection:
            1. **User Input:** If the User just asked a question, pick the expert best suited to answer that SPECIFIC question. Set 'shouldAdvancePhase' to false.
            2. **System Event:** If the last message was a System Event (Phase Change), pick someone to START the new phase.
            3. **Variety:** Avoid picking the same person who just spoke if possible.
            
            Return JSON: 
            { 
              "nextSpeakerId": "string_id" | null, 
              "reasoning": "string",
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
                        shouldAdvancePhase: { type: Type.BOOLEAN, description: "True ONLY if we should move to the next phase immediately." }
                    }
                }
            }
        }));

        const result = JSON.parse(response.text || '{}') as RouterResponse;
        
        // Double check safety on client side
        if (result.shouldAdvancePhase && turnsInCurrentPhase < 5) {
            console.log("Client-side override: Too early to advance phase.");
            result.shouldAdvancePhase = false;
        }

        console.log(`AI Router Decision (${phase}):`, result);
        return result;

    } catch (error) {
        console.error("Router error:", error);
        return { nextSpeakerId: null, reasoning: "Error", shouldAdvancePhase: false }; // Fallback handled in Orchestrator
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
        const textHistory = history.map(msg => `${personas[msg.senderId]?.name || 'User'}: ${msg.text}`).join('\n');
        const prompt = `
            Based on the discussion "${title}", create a concrete ACTION PLAN (Manifesto).
            
            Conversation History (Summary):
            ${textHistory}
            
            Instructions:
            - Extract practical advice and consensus.
            - Convert them into actionable checkboxes.
            - Create a catchy title for the plan.
            - Limit to 3-6 high-impact items.
        `;

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        title: { type: Type.STRING, description: "A catchy, motivating title for the plan" },
                        items: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    text: { type: Type.STRING, description: "The action item text" },
                                    completed: { type: Type.BOOLEAN }
                                }
                            }
                        }
                    }
                }
            }
        }));

        const result = JSON.parse(response.text || '{}') as ActionPlan;
        // Ensure IDs exist
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
        const textHistory = history.map(msg => `${personas[msg.senderId]?.name || 'User'}: ${msg.text}`).join('\n');
        const prompt = `
            Generate structured Meeting Minutes for the session "${title}".
            Output format: Markdown.
            Include:
            1. Executive Summary
            2. Key Discussion Points (Bulleted)
            3. Consensus Reached (if any)
            4. Divergent Opinions (Conflicts)
            5. Recommended Actions / Next Steps
            
            Conversation:
            ${textHistory}
        `;

        const response = await callWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] }
        }));

        return response.text || "# Error generating minutes";
    } catch (e) {
        return "# Error generating minutes";
    }
}

/**
 * META-CONTEXT
 */
export const updateProjectContextFromConversation = async (currentContext: string, history: Message[], personas: Record<string, PersonaConfig>): Promise<string> => {
    try {
        // Send FULL history for context update
         const textHistory = history.map(msg => `${personas[msg.senderId]?.name || 'User'}: ${msg.text}`).join('\n');
         const prompt = `
            Based on the recent conversation, evolve and refine the Global Context/Objective of this project.
            
            Current Context: "${currentContext}"
            
            Conversation:
            ${textHistory}
            
            Task: Rewrite the context to reflect the new direction, discoveries, or specific focus of the group.
            Keep it professional and concise (max 3 sentences).
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

// --- Existing helper functions ---
export const generateAvatar = async (name: string, role: string, description: string): Promise<string | null> => {
  try {
    const prompt = `A high-quality, digital art style portrait avatar of a character named ${name}, who is a ${role}. 
    Description: ${description}. 
    The image should be a square close-up face shot.`;

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
      Generate 5 thought-provoking conversation starter questions (in Portuguese) for a discussion panel.
      Project Title: "${title}"
      Context/Objective: "${context}"
      IMPORTANT: Keep the questions concise and short (maximum 15 words each).
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
      Act as a prompt engineer and professional editor.
      Rewrite the following "Global Context" description to be clearer, more objective, and inspiring for AI personas participating in a council.
      Original Text: "${originalText}"
      Goal: The output will be used as the context setting for a group of AI experts.
      Language: Portuguese (Brazil).
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
