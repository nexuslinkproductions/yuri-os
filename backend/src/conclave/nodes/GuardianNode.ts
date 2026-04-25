import { BaseAgent } from '../BaseAgent';
import { Artifact, InternalMonologue } from '../types';
import { EventBus } from '../EventBus';

/**
 * ⬡ GUARDIAN_NODE (INANNA) ⬡
 * Verification, Linting, and Semantic Archival.
 */
export class GuardianNode extends BaseAgent {
    constructor(bus: EventBus) {
        super(bus, 'GUARDIAN', "YOU_ARE_THE_CONCLAVE_GUARDIAN");
        this.subscriptionTypes = ['CODE_PATCH_SET'];
    }

    protected async think(artifact: Artifact): Promise<InternalMonologue> {
        const { task } = artifact.payload;
        
        // 1. Semantic Verification via LLM
        const prompt = `[VERIFIER]: Validate the implementation for task: ${task.description}.
        Check for logical errors or missing dependencies.
        Output SUCCESS or REWORK.`;

        const res = await this.callOracle('qwen-liberated', [{ role: 'user', content: prompt }]);
        
        let status = res.content.includes('REWORK') ? 'REWORK' : 'SUCCESS';
        let trace = res.content;

        return {
            observation: `Analyzing patch for ${task.id}`,
            reflection: status === 'SUCCESS' ? "Code is semantically and structurally sound." : "Structural or logical failure detected.",
            strategy: status === 'SUCCESS' ? "Proceed to SANCTIFICATION." : "Issue RECOVERY_PLAN.",
            action_intent: JSON.stringify({ status, trace, task })
        };
    }

    protected async act(monologue: InternalMonologue, source: Artifact): Promise<Artifact | null> {
        const payload = JSON.parse(monologue.action_intent);
        const isSuccess = payload.status === 'SUCCESS';
        
        return this.createArtifact(
            isSuccess ? 'SANCTIFIED_COMMIT' : 'RECOVERY_PLAN',
            payload,
            source
        );
    }
}
