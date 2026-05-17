import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

export class GoogleProvider {
    private genAI: GoogleGenerativeAI | null = null;

    constructor() {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }
    }

    private modelMap: Record<string, string> = {
        'gemini-3-1-pro-liberated': 'gemini-1.5-pro',
        'gemini-3-1-pro': 'gemini-1.5-pro',
        'gemini-3-1-flash-liberated': 'gemini-1.5-flash',
        'gemini-3-1-flash': 'gemini-1.5-flash',
        'gemini-4-ultra-liberated': 'gemini-1.5-pro'
    };

    async chat(messages: any[], modelName: string = 'gemini-1.5-pro', system?: string) {
        if (!this.genAI) throw new Error('GOOGLE_CLIENT_NOT_INITIALIZED');

        const actualModel = this.modelMap[modelName] || modelName;

        const model = this.genAI.getGenerativeModel({ 
            model: actualModel,
            systemInstruction: system
        });
        
        // Convert messages to Gemini format (ensuring alternating roles)
        const history: any[] = [];
        let lastRole = '';
        
        for (const m of messages.slice(0, -1)) {
            const role = m.role === 'assistant' ? 'model' : 'user';
            if (role !== lastRole) {
                history.push({
                    role,
                    parts: [{ text: m.content }]
                });
                lastRole = role;
            } else {
                // Merge consecutive messages of the same role
                history[history.length - 1].parts[0].text += `\n\n${m.content}`;
            }
        }
        
        const chatSession = model.startChat({ history });
        const lastMessage = messages[messages.length - 1].content;
        
        const result = await chatSession.sendMessage(lastMessage);
        const response = await result.response;
        
        return {
            content: response.text(),
            model: actualModel
        };
    }
}

export const googleProvider = new GoogleProvider();
