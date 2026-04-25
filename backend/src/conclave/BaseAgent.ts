import { EventBus } from './EventBus';
import { AgentRole, Artifact, ArtifactType, InternalMonologue } from './types';
import { neuralForge } from '../services/neuralForgeService';

/**
 * ⬡ CONCLAVE_BASE_AGENT (v9.1 - Industrial Elaboration) ⬡
 * Abstract base class implementing a high-fidelity SOP lifecycle.
 * Modeled after MetaGPT's 'observe -> think -> act' and LangGraph's node processing.
 */
export abstract class BaseAgent {
    protected bus: EventBus;
    protected role: AgentRole;
    protected systemPrompt: string;
    protected subscriptionTypes: ArtifactType[] = [];

    constructor(bus: EventBus, role: AgentRole, systemPrompt: string) {
        this.bus = bus;
        this.role = role;
        this.systemPrompt = systemPrompt;
    }

    /**
     * LAYER 1: OBSERVATION
     * Subscribes to specific artifact types on the Global Event Bus.
     */
    public async onArtifactPublished(artifact: Artifact): Promise<void> {
        if (!this.subscriptionTypes.includes(artifact.type)) return;
        
        // Log observation telemetry
        console.log(`⬡ [OBSERVE] :: [${this.role}] synchronized with [${artifact.id}]`);
        
        await this.runSOP(artifact);
    }

    /**
     * THE STANDARD OPERATING PROCEDURE (SOP)
     */
    private async runSOP(artifact: Artifact): Promise<void> {
        try {
            // LAYER 2: THINK (Cognitive Deliberation)
            const monologue = await this.think(artifact);
            
            // LAYER 3: ACT (Artifact Production)
            const resultArtifact = await this.act(monologue, artifact);
            
            if (resultArtifact) {
                this.bus.publish(resultArtifact);
            }
        } catch (error) {
            this.handleFault(error, artifact);
        }
    }

    /**
     * COGNITIVE DELIBERATION
     * Must be implemented by specialized agent nodes.
     */
    protected abstract think(artifact: Artifact): Promise<InternalMonologue>;

    /**
     * ARTIFACT PRODUCTION
     * Must be implemented by specialized agent nodes.
     */
    protected abstract act(monologue: InternalMonologue, source: Artifact): Promise<Artifact | null>;

    /**
     * TELEMETRY-AWARE LLM INTERFACE
     */
    protected async callOracle(model: string, messages: any[], temperature: number = 0.2) {
        const startTime = Date.now();
        const response = await neuralForge.chat(model, messages, this.systemPrompt);
        const duration = Date.now() - startTime;
        
        return {
            content: response.content,
            metadata: {
                executionTimeMs: duration,
                tokenUsage: response.usage || { prompt: 0, completion: 0, total: 0 }
            }
        };
    }

    private handleFault(error: any, context: Artifact) {
        console.error(`⬡ [FAULT] :: [${this.role}] encountered critical exception:`, error);
        this.bus.emit('AGENT_FAULT', {
            agent: this.role,
            error: error.message,
            correlationId: context.metadata.correlationId
        });
    }

    protected createArtifact<T>(type: ArtifactType, payload: T, source: Artifact): Artifact<T> {
        return {
            id: `art_${Math.random().toString(36).substring(7)}`,
            type,
            producer: this.role,
            timestamp: Date.now(),
            payload,
            metadata: {
                sessionId: source.metadata.sessionId,
                correlationId: source.metadata.correlationId,
                parentArtifactId: source.id,
                tokenUsage: { prompt: 0, completion: 0, total: 0 },
                executionTimeMs: 0,
                agentVersion: '9.1.0-alpha'
            }
        };
    }
}
