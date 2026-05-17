import { BaseAgent } from '../BaseAgent';
import { Artifact, InternalMonologue, TaskNode } from '../types';
import { EventBus } from '../EventBus';

/**
 * ⬡ SCRIBE_NODE (NABU) ⬡
 * Mixture-of-Agents (MoA) Context Discovery and Semantic Indexing.
 */
export class ScribeNode extends BaseAgent {
    constructor(bus: EventBus) {
        super(bus, 'SCRIBE', "YOU_ARE_THE_CONCLAVE_SCRIBE");
        this.subscriptionTypes = ['SOP_STRATEGY', 'SANCTIFIED_COMMIT'];
    }

    protected async think(artifact: Artifact): Promise<InternalMonologue> {
        // Find the next pending task in the DAG
        // Payload could be the TaskDAG from Architect or a result from Guardian
        const taskDag: TaskNode[] = Array.isArray(artifact.payload) ? artifact.payload : [];
        const nextTask = taskDag.find(t => t.status === 'PENDING');
        
        if (!nextTask) {
            return {
                observation: "Mission parameters complete.",
                reflection: "No pending tasks remain in the DAG.",
                strategy: "SIGNAL_MISSION_COMPLETE",
                action_intent: "COMPLETE"
            };
        }

        // MoA Routing: Generate parallel search strategies
        const prompt = `[MoA_ROUTER]: Analyze this task and generate 3 parallel search strategies (grep patterns or file paths) to map its dependencies.
        TASK: ${nextTask.description}`;

        const res = await this.callOracle('qwen-liberated', [{ role: 'user', content: prompt }]);
        
        return {
            observation: `Analyzing next task: ${nextTask.id}`,
            reflection: `Need to discover context for: ${nextTask.description}`,
            strategy: "Deploy parallel knowledge discovery queries.",
            action_intent: JSON.stringify({ task: nextTask, knowledgeMap: res.content })
        };
    }

    protected async act(monologue: InternalMonologue, source: Artifact): Promise<Artifact | null> {
        if (monologue.action_intent === 'COMPLETE') {
            // Generate final synthesis before closing
            const history = this.bus.getTelemetry();
            const summaryPrompt = `[FINAL_SYNTHESIS]: Summarize the mission results in 2-3 highly concise, high-impact bullet points. Focus on the core roadmap or plan developed.
            MISSION_HISTORY: ${JSON.stringify(history.map(h => ({ producer: h.producer, type: h.type }))) }`;
            
            const res = await this.callOracle('qwen-liberated', [{ role: 'user', content: summaryPrompt }]);
            
            await this.createArtifact('KNOWLEDGE_DISTILLATION', { 
                knowledgeMap: res.content,
                status: 'COMPLETE'
            }, source);

            this.bus.emit('MISSION_COMPLETE', { sessionId: source.metadata.sessionId });
            return null;
        }

        const payload = JSON.parse(monologue.action_intent);
        return this.createArtifact('KNOWLEDGE_DISTILLATION', payload, source);
    }
}
