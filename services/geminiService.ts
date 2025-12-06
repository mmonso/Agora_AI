
import { GoogleGenAI, Type } from "@google/genai";
import { Message, PersonaConfig } from "../types";

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Generates a response from a specific persona based on conversation history.
 * NOW INCLUDES: Grounding (Google Search) and Long-term Memory injection.
 */
export const generatePersonaResponse = async (
  targetPersona: PersonaConfig,
  history: Message[],
  personas: Record<string, PersonaConfig>,
  projectContext?: string,
  longTermMemory?: string
): Promise<string> => {
  try {
    // Construct a context string from the recent history
    // We take the last 15 messages to keep context relevant but manageable
    const recentHistory = history.slice(-15);
    
    // Check if the very last message has attachments (multimodal context)
    const lastMessage = recentHistory[recentHistory.length - 1];
    const hasAttachments = lastMessage?.attachments && lastMessage.attachments.length > 0;
    
    const formattedHistory = recentHistory.map(msg => {
      // Safe access to persona name from the dynamic map
      const name = personas[msg.senderId]?.name || 'Unknown';
      const attInfo = msg.attachments?.length ? `[Attached: ${msg.attachments.map(a => a.name).join(', ')}]` : '';
      return `${name}: ${msg.text} ${attInfo}`;
    }).join('\n\n');

    let promptText = `
      The following is a conversation between several wise entities.
    `;

    // Inject Project Context if available
    if (projectContext) {
      promptText += `
      CONTEXT / OBJECTIVE OF THIS DISCUSSION:
      "${projectContext}"
      All participants should keep this context in mind when speaking.
      `;
    }

    // Inject Long Term Memory
    if (longTermMemory) {
        promptText += `
        PREVIOUS DISCUSSION SUMMARY (Long Term Memory):
        "${longTermMemory}"
        Use this to recall facts or topics discussed earlier that are no longer in the immediate history.
        `;
    }

    promptText += `
      CONVERSATION HISTORY:
      ${formattedHistory}
      
      INSTRUCTION:
      Please respond to the last message or the general topic as your persona.
      Stay in character. Do not output your name at the start, just the message content.
      If the last message quotes you or asks you directly, address it.
      If there is an attachment in the last message, analyze it within the context of your persona.
      You have access to Google Search tools to verify facts or get current information if needed.
    `;

    let contentParts: any[] = [{ text: promptText }];

    // If the last message has attachments, add them as inlineData parts
    if (hasAttachments && lastMessage.attachments) {
       lastMessage.attachments.forEach(att => {
         // Strip the data:mime;base64, prefix for the API
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: contentParts },
      config: {
        systemInstruction: targetPersona.systemInstruction,
        temperature: 0.7, 
        maxOutputTokens: 64000,
        tools: [{googleSearch: {}}] // Enable Grounding
      }
    });

    return response.text || "...";
  } catch (error) {
    console.error("Error generating persona response:", error);
    throw error; // Throw error to be handled by the loop (skip turn)
  }
};

/**
 * AI ROUTER: Decides who should speak next.
 */
export const determineNextSpeaker = async (
  history: Message[],
  activePersonaIds: string[],
  personas: Record<string, PersonaConfig>,
  projectContext?: string
): Promise<string | null> => {
    try {
        const recentHistory = history.slice(-10);
        const formattedHistory = recentHistory.map(msg => `${personas[msg.senderId]?.name || 'User'}: ${msg.text}`).join('\n');
        
        const candidates = activePersonaIds.map(id => ({
            id,
            name: personas[id]?.name,
            role: personas[id]?.role
        }));

        const prompt = `
            Analyze the conversation history and decide who should speak next from the list of candidates.
            
            Context: "${projectContext || 'General Discussion'}"
            
            Candidates:
            ${JSON.stringify(candidates)}
            
            History:
            ${formattedHistory}
            
            Rules:
            1. If a specific persona was asked a question, pick them.
            2. If the topic fits a specific persona's expertise perfectly, pick them.
            3. If the conversation seems resolved or needs user input, return null (User).
            4. Avoid having the same persona speak twice in a row unless they are answering a follow-up.
            
            Return JSON: { "nextSpeakerId": "string_id" | null, "reasoning": "string" }
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        nextSpeakerId: { type: Type.STRING, nullable: true },
                        reasoning: { type: Type.STRING }
                    }
                }
            }
        });

        const result = JSON.parse(response.text || '{}');
        console.log("AI Router Decision:", result);
        return result.nextSpeakerId || null;

    } catch (error) {
        console.error("Router error:", error);
        return null; // Fallback to user
    }
}

/**
 * SUMMARIZATION: Generates a summary of the conversation for long-term memory.
 */
export const summarizeConversation = async (history: Message[], personas: Record<string, PersonaConfig>): Promise<string> => {
    try {
        const textHistory = history.map(msg => `${personas[msg.senderId]?.name || 'User'}: ${msg.text}`).join('\n');
        const prompt = `
            Summarize the key points, decisions, and facts from this conversation history.
            This summary will be used as long-term memory for an AI council.
            Keep it dense and factual.
            
            History:
            ${textHistory}
        `;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] }
        });
        
        return response.text || "";
    } catch (error) {
        return "";
    }
}

/**
 * MEETING MINUTES: Generates a structured Markdown report.
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

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] }
        });

        return response.text || "# Error generating minutes";
    } catch (e) {
        return "# Error generating minutes";
    }
}

/**
 * META-CONTEXT: Updates the project description based on the conversation evolution.
 */
export const updateProjectContextFromConversation = async (currentContext: string, history: Message[], personas: Record<string, PersonaConfig>): Promise<string> => {
    try {
         const textHistory = history.slice(-20).map(msg => `${personas[msg.senderId]?.name || 'User'}: ${msg.text}`).join('\n');
         const prompt = `
            Based on the recent conversation, evolve and refine the Global Context/Objective of this project.
            
            Current Context: "${currentContext}"
            
            Recent Conversation:
            ${textHistory}
            
            Task: Rewrite the context to reflect the new direction, discoveries, or specific focus of the group.
            Keep it professional and concise (max 3 sentences).
         `;
         
         const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [{ text: prompt }] }
        });
        
        return response.text || currentContext;
    } catch (e) {
        return currentContext;
    }
}


// --- Existing functions below ---

export const generateAvatar = async (name: string, role: string, description: string): Promise<string | null> => {
  try {
    const prompt = `A high-quality, digital art style portrait avatar of a character named ${name}, who is a ${role}. 
    Description: ${description}. 
    The image should be a square close-up face shot, suitable for a profile picture, with a clean background.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      },
      config: {
        // No system instruction for image models usually
      }
    });

    // Iterate through parts to find the image data
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
      
      The questions should be open-ended, engaging, and relevant to the specific context provided.
      IMPORTANT: Keep the questions concise and short (maximum 15 words each).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    
    const text = response.text;
    if (!text) return [];
    
    return JSON.parse(text) as string[];
  } catch (error) {
    console.error("Error generating starters:", error);
    return [
      "Quais são os principais desafios aqui?",
      "Qual o impacto disso no longo prazo?",
      "O que estamos ignorando?",
      "Qual a perspectiva ética?",
      "Como inovar neste cenário?"
    ];
  }
};

export const refineProjectContext = async (originalText: string): Promise<string> => {
  try {
    const prompt = `
      Act as a prompt engineer and professional editor.
      Rewrite the following "Global Context" description to be clearer, more objective, and inspiring for AI personas participating in a council.
      
      Original Text:
      "${originalText}"
      
      Goal: The output will be used as the context setting for a group of AI experts. It needs to clearly define the scenario, the problem to be solved, or the topic to be discussed.
      Language: Portuguese (Brazil).
      Keep it concise but impactful.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [{ text: prompt }] },
    });
    
    return response.text?.trim() || originalText;
  } catch (error) {
    console.error("Error refining context:", error);
    return originalText;
  }
};
