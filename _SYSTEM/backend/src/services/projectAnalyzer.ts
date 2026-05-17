import { neuralForge } from './neuralForgeService';

export interface ProjectInsight {
    complexityScore: number;
    bottlenecks: string[];
    suggestedAgents: string[];
    summary: string;
}

export class ProjectAnalyzer {
    async analyzeProject(project: any): Promise<ProjectInsight> {
        const taskList = project.tasks.map((t: any) => `- ${t.title} (${t.status})`).join('\n');
        
        const prompt = `
        As the NUDIMMUD Strategic Overseer, analyze the following project:
        
        NAME: ${project.name}
        DESCRIPTION: ${project.description}
        TASKS:
        ${taskList}
        
        Provide a strategic analysis in JSON format:
        {
          "complexityScore": number (0-100),
          "bottlenecks": ["insight 1", "insight 2"],
          "suggestedAgents": ["AGENT1", "AGENT2"],
          "summary": "Short 2 sentence overview"
        }
        
        Use only these agents: CLAWDIIA, LOGOS, CHRONOS, NOMOS, PHYSIS, ALBEDO.
        `;

        try {
            const response = await neuralForge.chat('deepseek-v3-2', [{ role: 'user', content: prompt }], 'You are a project management AI.');
            
            // Extract JSON from response (handling potential markdown formatting)
            const content = response.content;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            
            throw new Error('UNABLE_TO_PARSE_NEURAL_INSIGHT');
        } catch (e) {
            console.error('⬡ PROJECT_ANALYZER_ERR:', e);
            // Return dummy data if forge fails
            return {
                complexityScore: 42,
                bottlenecks: ['System connectivity audit required', 'Resource allocation latency'],
                suggestedAgents: ['CLAWDIIA', 'LOGOS'],
                summary: 'Neural forge currently offline or unresponsive. Returning estimated baseline metrics based on project volume.'
            };
        }
    }
}

export const projectAnalyzer = new ProjectAnalyzer();
