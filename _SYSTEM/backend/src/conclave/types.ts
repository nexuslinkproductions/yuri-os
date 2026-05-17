/**
 * ⬡ AEONIC_CONCLAVE_TYPES (v9.1 - Industrial Elaboration) ⬡
 * Deeply typed schemas for autonomous engineering orchestration.
 */

export type AgentRole = 'ARCHITECT' | 'SCRIBE' | 'CRAFTSMAN' | 'GUARDIAN' | 'SYSTEM' | 'OBSERVER';
export type ConclaveTerminalStatus = 'CONCLAVE_SUCCESS' | 'CONCLAVE_TIMEOUT' | 'CONCLAVE_ERROR' | 'FORGE_DEGRADED';
export type ConclaveOverlayType = 'mission_synthesis';
export interface ConclaveUiHint {
    overlay: ConclaveOverlayType;
    mode: 'strategic';
    source: 'conclave';
}
export type ArtifactType = 
    | 'USER_DIRECTIVE' 
    | 'SOP_STRATEGY' 
    | 'AST_DEPENDENCY_GRAPH' 
    | 'ENVIRONMENT_SNAPSHOT'
    | 'RECOVERY_PLAN'
    | 'CODE_PATCH_SET' 
    | 'VALIDATION_REPORT' 
    | 'KNOWLEDGE_DISTILLATION'
    | 'SANCTIFIED_COMMIT';

export interface ArtifactMetadata {
    sessionId: string;
    correlationId: string;
    parentArtifactId?: string;
    tokenUsage: {
        prompt: number;
        completion: number;
        total: number;
        costUsd?: number;
    };
    executionTimeMs: number;
    agentVersion: string;
    checksum?: string; // For artifact integrity
}

export interface Artifact<T = any> {
    id: string;
    type: ArtifactType;
    producer: AgentRole;
    timestamp: number;
    payload: T;
    metadata: ArtifactMetadata;
}

export interface TaskNode {
    id: string;
    description: string;
    status: 'PENDING' | 'ANALYZING' | 'EXECUTING' | 'VERIFYING' | 'COMPLETED' | 'FAILED';
    priority: number; // 1-10
    estimatedComplexity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    dependencies: string[];
    assignedAgent?: string;
    artifactsProduced: string[];
}

export interface CognitiveState {
    sessionId: string;
    stage: 'PLANNING' | 'RESEARCH' | 'FORGING' | 'CRITIC' | 'ARCHIVING';
    globalDirective: string;
    activeTaskContext: TaskNode | null;
    taskDag: TaskNode[];
    memory: {
        core: Record<string, any>; // Persistent user constraints
        shortTerm: Artifact[];     // Sliding window of recent events
        episodic: string[];        // IDs of past artifacts
        semanticBuffer: string[];  // Uncommitted lessons learned
    };
    diagnostics: {
        reworkCount: number;
        interruptionSignal: boolean;
        recoveryMode: boolean;
        lastFaultTrace: string | null;
    };
    performance: {
        totalTokens: number;
        uptimeMs: number;
        checkpointsSaved: number;
    };
}

export interface InternalMonologue {
    observation: string;
    reflection: string;
    strategy: string;
    action_intent: string;
}

export interface ConclaveBootResult {
    sessionId: string;
    status: ConclaveTerminalStatus;
    telemetry: Artifact[];
    finalState: CognitiveState;
    finalSummary: string;
    filePath?: string;
    content?: string;
    error?: string;
    ui?: ConclaveUiHint;
}
