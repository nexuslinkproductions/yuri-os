import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../config/SystemConfig';
import { Database } from 'better-sqlite3';
import { EventBus } from './EventBus';
import { Checkpointer } from './Checkpointer';
import { ArchitectNode } from './nodes/ArchitectNode';
import { ScribeNode } from './nodes/ScribeNode';
import { CraftsmanNode } from './nodes/CraftsmanNode';
import { GuardianNode } from './nodes/GuardianNode';
import { Artifact, CognitiveState, ConclaveBootResult, ConclaveTerminalStatus } from './types';

const CONCLAVE_TIMEOUT_MS = 180000;

/**
 * ⬡ CONCLAVE_OS_KERNEL (v9.1 - Industrial Elaboration) ⬡
 * The industrial-grade orchestrator binding the event-driven agents.
 */
export class ConclaveOS {
    private bus: EventBus;
    private checkpointer: Checkpointer;
    private state: CognitiveState | null = null;
    
    private agents: any[] = [];

    constructor(db: Database) {
        this.bus = new EventBus();
        this.checkpointer = new Checkpointer(db);
        
        // Initialize Agent Pool
        this.agents.push(new ArchitectNode(this.bus));
        this.agents.push(new ScribeNode(this.bus));
        this.agents.push(new CraftsmanNode(this.bus));
        this.agents.push(new GuardianNode(this.bus));
        
        this.bindEvents();
    }

    private bindEvents() {
        this.bus.on('ARTIFACT_PUBLISHED', async (artifact: Artifact) => {
            if (this.state) {
                this.state.memory.shortTerm.push(artifact);
                this.state.memory.episodic.push(artifact.id);
                
                // Telemetry Tracking
                this.state.performance.totalTokens += artifact.metadata.tokenUsage.total;
                
                await this.checkpointer.save(this.state, artifact.producer);
            }

            if (artifact.type === 'RECOVERY_PLAN') {
                if (this.state) {
                    this.state.diagnostics.recoveryMode = true;
                    this.state.diagnostics.lastFaultTrace = this.summarizeArtifact(artifact);
                }
                this.bus.emit('MISSION_FAILED', {
                    reason: 'RECOVERY_PLAN_EMITTED',
                    artifact
                });
                return;
            }
            
            // Broadcast to all agents in the pool (they filter internally via SOP Layer 1)
            for (const agent of this.agents) {
                agent.onArtifactPublished(artifact);
            }
        });

        this.bus.on('AGENT_FAULT', (fault: any) => {
            if (this.state) {
                this.state.diagnostics.recoveryMode = true;
                this.state.diagnostics.lastFaultTrace = fault?.error || 'AGENT_FAULT';
            }
            this.bus.emit('MISSION_FAILED', {
                reason: fault?.error || 'AGENT_FAULT',
                fault
            });
        });
    }

    public async boot(directive: string): Promise<ConclaveBootResult> {
        const sessionId = `sid_${Date.now()}`;
        const correlationId = `cid_${Math.random().toString(36).substring(7)}`;
        
        this.state = {
            sessionId,
            stage: 'PLANNING',
            globalDirective: directive,
            activeTaskContext: null,
            taskDag: [],
            memory: {
                core: {},
                shortTerm: [],
                episodic: [],
                semanticBuffer: []
            },
            diagnostics: {
                reworkCount: 0,
                interruptionSignal: false,
                recoveryMode: false,
                lastFaultTrace: null
            },
            performance: {
                totalTokens: 0,
                uptimeMs: 0,
                checkpointsSaved: 0
            }
        };

        return new Promise((resolve) => {
            let settled = false;

            const finalize = (status: ConclaveTerminalStatus, payload: any = {}) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                cleanup();

                if (this.state && payload?.reason && status !== 'CONCLAVE_SUCCESS') {
                    this.state.diagnostics.lastFaultTrace = payload.reason;
                }

            const summaryData = this.buildFinalSummary(status, directive, payload);

                resolve({
                    sessionId,
                    status,
                    telemetry: this.bus.getTelemetry(),
                    finalState: this.state!,
                    finalSummary: typeof summaryData === 'string' ? summaryData : summaryData.summary,
                    filePath: typeof summaryData === 'string' ? undefined : summaryData.filePath,
                    content: typeof summaryData === 'string' ? undefined : summaryData.content,
                    ui: typeof summaryData === 'string' ? undefined : summaryData.ui,
                    error: payload?.reason
                });
            };

            const onComplete = () => finalize('CONCLAVE_SUCCESS');
            const onFailure = (payload: any) => finalize(payload?.status === 'FORGE_DEGRADED' ? 'FORGE_DEGRADED' : 'CONCLAVE_ERROR', payload);
            const onTimeout = (payload: any) => finalize('CONCLAVE_TIMEOUT', payload);

            const cleanup = () => {
                this.bus.removeListener('MISSION_COMPLETE', onComplete);
                this.bus.removeListener('MISSION_FAILED', onFailure);
                this.bus.removeListener('MISSION_TIMEOUT', onTimeout);
            };

            const timeoutId = setTimeout(() => {
                if (this.state) {
                    this.state.diagnostics.recoveryMode = true;
                    this.state.diagnostics.lastFaultTrace = `CONCLAVE_TIMEOUT_${CONCLAVE_TIMEOUT_MS}MS`;
                }
                this.bus.emit('MISSION_TIMEOUT', {
                    reason: `CONCLAVE_TIMEOUT_${CONCLAVE_TIMEOUT_MS}MS`
                });
            }, CONCLAVE_TIMEOUT_MS);

            this.bus.once('MISSION_COMPLETE', onComplete);
            this.bus.once('MISSION_FAILED', onFailure);
            this.bus.once('MISSION_TIMEOUT', onTimeout);

            const startArtifact: Artifact = {
                id: `art_init_${sessionId}`,
                type: 'USER_DIRECTIVE',
                producer: 'SYSTEM',
                timestamp: Date.now(),
                payload: directive,
                metadata: {
                    sessionId,
                    correlationId,
                    tokenUsage: { prompt: 0, completion: 0, total: 0 },
                    executionTimeMs: 0,
                    agentVersion: '9.1.0'
                }
            };

            this.bus.publish(startArtifact);
        });
    }

    private buildFinalSummary(status: ConclaveTerminalStatus, directive: string, payload: any = {}): string | { summary: string, filePath: string, content: string, ui?: ConclaveBootResult['ui'] } {
        const artifacts = this.state?.memory.shortTerm || [];
        let summary = '';
        let uiHint: ConclaveBootResult['ui'];
        
        if (status === 'CONCLAVE_SUCCESS') {
            let reportContent = '';
            let relPath = '';
            // Priority 1: Sanctified results / Code patches
            const results = artifacts.filter(a => a.type === 'SANCTIFIED_COMMIT' || a.type === 'CODE_PATCH_SET');
            if (results.length > 0) {
                const latest = results[results.length - 1];
                summary = latest.payload.trace || latest.payload.content || `The Conclave successfully implemented the solution for: ${directive.substring(0, 50)}...`;
            }

            // Priority 2: Knowledge Distillations
            if (!summary) {
                const distillations = artifacts.filter(a => a.type === 'KNOWLEDGE_DISTILLATION');
                if (distillations.length > 0) {
                    const latest = distillations[distillations.length - 1];
                    if (latest.payload.knowledgeMap) summary = latest.payload.knowledgeMap;
                    else if (typeof latest.payload === 'string') summary = latest.payload;
                }
            }

            // Priority 3: SOP Strategies (Planning)
            if (!summary) {
                const strategies = artifacts.filter(a => a.type === 'SOP_STRATEGY');
                if (strategies.length > 0) {
                    const latest = strategies[strategies.length - 1];
                    if (typeof latest.payload === 'string') summary = latest.payload;
                    else if (Array.isArray(latest.payload)) {
                        summary = `Strategic roadmap developed:\n` + latest.payload.map((t: any) => `- ${t.description}`).join('\n');
                    }
                    if (summary) {
                        uiHint = { overlay: 'mission_synthesis', mode: 'strategic', source: 'conclave' };
                    }
                }
            }

            if (!summary) summary = `Directive processed successfully. The Conclave generated ${artifacts.length} artifacts to resolve your request.`;

            // CREATE_MISSION_REPORT
            try {
                reportContent = [
                    `# Mission Report: ${directive.substring(0, 50)}`,
                    `**Timestamp**: ${new Date().toISOString()}`,
                    `**Session ID**: ${this.state?.sessionId}`,
                    `**Global Directive**: ${directive}`,
                    '',
                    `## Final Synthesis`,
                    summary,
                    '',
                    `## Deliberation History`,
                    ...artifacts.map(a => [
                        `### [${a.producer}] Protocol: ${a.type}`,
                        `> ${typeof a.payload === 'string' ? a.payload : JSON.stringify(a.payload, null, 2)}`,
                        ''
                    ].join('\n'))
                ].join('\n');

                const fileName = `Mission_Report_${Date.now()}.md`;
                relPath = `00_COMMAND-CENTER/SESSION-REPORTS/${fileName}`;
                const fullPath = SystemConfig.resolve(relPath);

                if (!fs.existsSync(path.dirname(fullPath))) {
                    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                }

                fs.writeFileSync(fullPath, reportContent, 'utf-8');
                console.log(`⬡ CONCLAVE_OS :: Mission report saved to ${relPath}`);

                return {
                    summary,
                    filePath: relPath,
                    content: reportContent,
                    ui: uiHint
                };
            } catch (e: any) {
                console.warn(`⬡ CONCLAVE_OS :: Failed to save mission report: ${e.message}`);
                if (uiHint) {
                    return {
                        summary,
                        filePath: relPath,
                        content: reportContent,
                        ui: uiHint
                    };
                }
            }
        }

        if (status === 'CONCLAVE_TIMEOUT') {
            summary = `The Conclave timed out before completing "${directive.substring(0, 80)}". Partial deliberations were preserved in the neural vault.`;
        } else if (status === 'FORGE_DEGRADED') {
            summary = `The Conclave fell back to degraded mode while processing "${directive.substring(0, 80)}". Local inference remains active.`;
        } else {
            summary = `The Conclave could not complete "${directive.substring(0, 80)}". ${payload?.reason || 'A recovery path was emitted.'}`;
        }

        return summary;
    }

    private summarizeArtifact(artifact: Artifact) {
        if (typeof artifact.payload === 'string') return artifact.payload;
        return JSON.stringify(artifact.payload).slice(0, 300);
    }
}
