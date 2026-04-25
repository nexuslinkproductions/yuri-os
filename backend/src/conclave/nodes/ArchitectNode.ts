import { BaseAgent } from '../BaseAgent';
import { Artifact, InternalMonologue, TaskNode } from '../types';
import { EventBus } from '../EventBus';

/**
 * ⬡ ARCHITECT_NODE (ENLIL) (v9.1 - Industrial Elaboration) ⬡
 * Responsible for Hierarchical Task Network (HTN) Strategic Decomposition.
 */
export class ArchitectNode extends BaseAgent {
    constructor(bus: EventBus) {
        super(bus, 'ARCHITECT', "YOU_ARE_THE_CONCLAVE_ARCHITECT_v9_1");
        this.subscriptionTypes = ['USER_DIRECTIVE'];
    }

    protected async think(artifact: Artifact): Promise<InternalMonologue> {
        const prompt = `[ARCHITECT_ANALYSIS]: Analyze the following directive for architectural complexity and potential failure points.
        DIRECTIVE: ${artifact.payload}
        
        Output your analysis in <internal_monologue> format with:
        observation: current state of requirements
        reflection: hidden dependencies or risks
        strategy: how to decompose into an HTN graph
        action_intent: the specific TASK_DAG to produce`;

        const res = await this.callOracle('qwen-liberated', [{ role: 'user', content: prompt }]);
        
        // Simple extraction for demonstration; in prod we use regex or structured output
        return {
            observation: "Requirements identified.",
            reflection: "Potential risk in state management.",
            strategy: "Decompose into 3 parallel streams.",
            action_intent: res.content
        };
    }

    protected async act(monologue: InternalMonologue, source: Artifact): Promise<Artifact> {
        // Parse the action_intent into the Task DAG
        let taskDag: TaskNode[] = [];
        try {
            const match = monologue.action_intent.match(/\[.*\]/s);
            taskDag = match ? JSON.parse(match[0]) : [];
        } catch (e) {
            taskDag = [{ id: 't1', description: monologue.observation, status: 'PENDING', priority: 5, estimatedComplexity: 'MEDIUM', dependencies: [], artifactsProduced: [] }];
        }

        return this.createArtifact('SOP_STRATEGY', taskDag, source);
    }
}
