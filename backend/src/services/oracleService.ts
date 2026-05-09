import { Database } from 'better-sqlite3';
import { ConclaveOS } from '../conclave/ConclaveOS';
import { SmartRouter } from './smartRouter';
import { neuralForge } from './neuralForgeService';
import {
    ensurePersonalityTable,
    detectCommandType,
    detectTopicTags,
    logPersonalityEntry,
    getPersonalityProfile,
    buildPersonalitySystemPrompt
} from './personalityService';
import { telemetryService } from './telemetryService';
import {
    deriveAutoScore,
    finalizeSessionImprovement,
    startSessionImprovement
} from './sessionImprovementService';

/**
 * THE AEONIC CONCLAVE (OS v9.0 - Industrial Implementation)
 * This service now acts as a high-level wrapper for the modular Conclave OS Kernel.
 */
export class OracleService {
    private db: Database;

    constructor(db: Database) {
        this.db = db;
        ensurePersonalityTable(db);
    }

    /**
     * Entry point for incoming directives.
     */
    async processCommand(command: string, options: { useCouncil?: boolean; modelId?: string } = {}) {
        const routingDecision = SmartRouter.route(command, {
            modelId: options.modelId,
            intent: options.useCouncil === false ? 'ops' : 'strategy'
        });
        const { useCouncil = true, modelId = routingDecision.preferredModel } = options;
        const sessionId = `oracle_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        console.log(`⬡ ORACLE_ADAPTER :: [${routingDecision.preferredRuntime.toUpperCase()}] :: HANDOFF_TO_KERNEL`);
        const buildTelemetry = (status: string, runtime?: string, extras: { decision?: any; escalated?: boolean; loopCount?: number } = {}) => {
            const decision = extras.decision || routingDecision;
            const risk = String(decision?.risk || routingDecision.risk || 'medium').toUpperCase();
            const escalated = Boolean(extras.escalated);
            const confidenceBand = status === 'FORGE_DEGRADED'
                ? 'LOW'
                : escalated
                    ? 'GUARDED'
                    : risk === 'HIGH'
                        ? 'LOW'
                        : risk === 'MEDIUM'
                            ? 'MEDIUM'
                            : 'HIGH';

            return {
                runtime: String(runtime || decision?.preferredRuntime || routingDecision.preferredRuntime || 'local').toUpperCase(),
                risk,
                escalated,
                loopCount: extras.loopCount || 1,
                disagreement: escalated || risk === 'HIGH' || status === 'FORGE_DEGRADED',
                confidenceBand,
                heartbeat: status === 'FORGE_DEGRADED'
                    ? 'DEGRADED'
                    : status === 'CONCLAVE_TIMEOUT'
                        ? 'DELAYED'
                        : 'NOMINAL'
            };
        };
        
        try {
            // Log command for personality learning
            logPersonalityEntry(this.db, command);
            const profile = getPersonalityProfile(this.db);
            const personalityPrompt = buildPersonalitySystemPrompt(profile);
            const commandType = detectCommandType(command);
            const topicTags = detectTopicTags(command);

            startSessionImprovement(this.db, {
                sessionId,
                command,
                commandType,
                voiceMode: 'deadpool-annunaki',
                topicTags,
                goal: options.useCouncil === false ? 'direct-answer' : 'council-synthesis',
                metadata: {
                    preferredModel: modelId,
                    useCouncil,
                    preferredRuntime: routingDecision.preferredRuntime,
                    risk: routingDecision.risk
                }
            });

            await telemetryService.initSession({
                sessionId,
                startTime: Date.now(),
                tokensEstimated: 0,
                toolsLoaded: 1,
                status: 'ACTIVE',
                metadata: JSON.stringify({
                    command,
                    modelId,
                    useCouncil,
                    route: routingDecision
                })
            });

            if (!useCouncil) {
                let response = await neuralForge.chat(
                    modelId,
                    [{ role: 'user', content: command }],
                    personalityPrompt,
                    {
                        intent: 'strategy',
                        retrievalProfile: routingDecision.retrievalProfile,
                        reasoningBudget: routingDecision.reasoningBudget
                    }
                );

                if (response.status === 'FORGE_DEGRADED' && modelId !== 'qwen-liberated:latest') {
                    response = await neuralForge.chat(
                        'qwen-liberated:latest',
                        [{ role: 'user', content: command }],
                        'SYSTEM_NODE: ORACLE_DIRECTIVE_CHANNEL',
                        {
                            intent: 'ops',
                            allowCloud: false,
                            retrievalProfile: routingDecision.retrievalProfile
                        }
                    );
                }

                const responseTelemetry = buildTelemetry(response.status || 'CONCLAVE_SUCCESS', response.runtime, {
                    decision: response.decision || routingDecision,
                    escalated: response.escalated,
                    loopCount: response.loopCount
                });
                const tokensEstimated = Math.max(0, Math.round((command.length + (response.content?.length || 0)) / 4));
                const autoScore = deriveAutoScore({
                    status: response.status || 'CONCLAVE_SUCCESS',
                    confidenceBand: responseTelemetry.confidenceBand,
                    loopCount: response.loopCount,
                    escalated: response.escalated
                });
                await telemetryService.updateSession(sessionId, {
                    endTime: Date.now(),
                    tokensEstimated,
                    toolsLoaded: 1,
                    status: 'FINALIZED',
                    metadata: JSON.stringify({
                        command,
                        modelId,
                        useCouncil,
                        route: routingDecision,
                        status: response.status || 'CONCLAVE_SUCCESS',
                        autoScore
                    })
                });
                finalizeSessionImprovement(this.db, {
                    sessionId,
                    whatHappened: response.content || response.final_summary || 'Directive processed.',
                    autoScore,
                    outcome: autoScore >= 75 ? 'improved' : autoScore >= 55 ? 'stable' : autoScore >= 40 ? 'mixed' : 'regressed',
                    whatGotBetter: response.status !== 'FORGE_DEGRADED'
                        ? 'response stayed grounded in local evidence'
                        : 'fallback path preserved continuity',
                    whatGotWorse: response.status === 'FORGE_DEGRADED'
                        ? 'runtime degraded and the mask slipped'
                        : response.escalated
                            ? 'response required escalation'
                            : undefined,
                    notes: response.final_summary || response.content || 'Directive processed.'
                });

                return {
                    status: response.status || 'CONCLAVE_SUCCESS',
                    final_summary: response.final_summary || response.content || 'Directive processed.',
                    content: response.content || response.final_summary || 'Directive processed.',
                    model: response.model,
                    timestamp: response.timestamp,
                    runtime: response.runtime || routingDecision.preferredRuntime,
                    decision: response.decision || routingDecision,
                    escalated: Boolean(response.escalated),
                    loopCount: response.loopCount || 1,
                    telemetry: buildTelemetry(response.status || 'CONCLAVE_SUCCESS', response.runtime, {
                        decision: response.decision || routingDecision,
                        escalated: response.escalated,
                        loopCount: response.loopCount
                    })
                };
            }

            const kernel = new ConclaveOS(this.db);
            const result = await kernel.boot(command);

            if (result.status === 'CONCLAVE_TIMEOUT') {
                const autoScore = deriveAutoScore({
                    status: result.status,
                    confidenceBand: 'LOW',
                    loopCount: 1
                });
                await telemetryService.updateSession(sessionId, {
                    endTime: Date.now(),
                    tokensEstimated: Math.max(0, Math.round((command.length + (result.finalSummary?.length || 0)) / 4)),
                    toolsLoaded: 1,
                    status: 'FINALIZED',
                    metadata: JSON.stringify({
                        command,
                        modelId,
                        useCouncil,
                        route: routingDecision,
                        status: result.status,
                        autoScore
                    })
                });
                finalizeSessionImprovement(this.db, {
                    sessionId,
                    whatHappened: result.finalSummary,
                    autoScore,
                    outcome: 'regressed',
                    whatGotWorse: 'the council timed out',
                    notes: result.error || result.finalSummary
                });

                return {
                    status: result.status,
                    memory_bank: result.finalState,
                    final_summary: result.finalSummary,
                    error: result.error,
                    model: 'aeonic-council',
                    runtime: routingDecision.preferredRuntime,
                    decision: routingDecision,
                    escalated: false,
                    loopCount: 1,
                    telemetry: buildTelemetry(result.status, routingDecision.preferredRuntime, {
                        decision: routingDecision
                    })
                };
            }

            if (result.status !== 'CONCLAVE_SUCCESS') {
                const fallback = await neuralForge.chat(
                    'qwen-liberated:latest',
                    [{ role: 'user', content: this.buildCouncilPrompt(command) }],
                    'SYSTEM_NODE: AEONIC_COUNCIL_ORCHESTRATOR',
                    {
                        intent: 'strategy',
                        allowCloud: false,
                        retrievalProfile: routingDecision.retrievalProfile
                    }
                );

                const fallbackTelemetry = buildTelemetry(fallback.status || result.status, fallback.runtime, {
                    decision: fallback.decision || routingDecision,
                    escalated: fallback.escalated,
                    loopCount: fallback.loopCount
                });
                const autoScore = deriveAutoScore({
                    status: fallback.status || result.status,
                    confidenceBand: fallbackTelemetry.confidenceBand,
                    loopCount: fallback.loopCount,
                    escalated: fallback.escalated
                });
                await telemetryService.updateSession(sessionId, {
                    endTime: Date.now(),
                    tokensEstimated: Math.max(0, Math.round((command.length + (fallback.content?.length || 0)) / 4)),
                    toolsLoaded: 1,
                    status: 'FINALIZED',
                    metadata: JSON.stringify({
                        command,
                        modelId,
                        useCouncil,
                        route: routingDecision,
                        status: fallback.status || result.status,
                        autoScore
                    })
                });
                finalizeSessionImprovement(this.db, {
                    sessionId,
                    whatHappened: fallback.content || fallback.final_summary || result.finalSummary,
                    autoScore,
                    outcome: autoScore >= 75 ? 'improved' : autoScore >= 55 ? 'stable' : autoScore >= 40 ? 'mixed' : 'regressed',
                    whatGotBetter: 'fallback council preserved continuity',
                whatGotWorse: 'the primary council path failed',
                notes: fallback.final_summary || fallback.content || result.finalSummary
            });

                return {
                    status: fallback.status || 'CONCLAVE_SUCCESS',
                    memory_bank: this.buildCouncilFallbackMemory(command, fallback.content, result.status),
                    final_summary: fallback.final_summary || fallback.content || result.finalSummary,
                    error: result.error,
                    model: fallback.model || 'aeonic-council-fallback',
                    runtime: fallback.runtime || 'degraded',
                    decision: fallback.decision || routingDecision,
                    escalated: Boolean(fallback.escalated),
                    loopCount: fallback.loopCount || 1,
                    telemetry: buildTelemetry(fallback.status || result.status, fallback.runtime, {
                        decision: fallback.decision || routingDecision,
                        escalated: fallback.escalated,
                        loopCount: fallback.loopCount
                    })
                };
            }

            const autoScore = deriveAutoScore({
                status: result.status,
                confidenceBand: 'HIGH',
                loopCount: 1
            });
            await telemetryService.updateSession(sessionId, {
                endTime: Date.now(),
                tokensEstimated: Math.max(0, Math.round((command.length + (result.finalSummary?.length || 0)) / 4)),
                toolsLoaded: 1,
                status: 'FINALIZED',
                metadata: JSON.stringify({
                    command,
                    modelId,
                    useCouncil,
                    route: routingDecision,
                    status: result.status,
                    autoScore
                })
            });
            finalizeSessionImprovement(this.db, {
                sessionId,
                whatHappened: result.finalSummary || result.content || 'Directive processed.',
                autoScore,
                outcome: result.status === 'CONCLAVE_SUCCESS'
                    ? 'improved'
                    : autoScore >= 55
                        ? 'stable'
                        : autoScore >= 40
                            ? 'mixed'
                            : 'regressed',
                whatGotBetter: result.status === 'CONCLAVE_SUCCESS'
                    ? 'response stayed grounded in local evidence'
                    : 'fallback council preserved continuity',
                whatGotWorse: result.status === 'CONCLAVE_SUCCESS'
                    ? undefined
                    : 'the primary council path failed',
                notes: result.finalSummary || result.content || 'Directive processed.'
            });

            return {
                status: result.status,
                memory_bank: result.finalState,
                final_summary: result.finalSummary,
                file_path: result.filePath,
                content: result.content,
                ui: result.ui,
                error: result.error,
                model: 'aeonic-council',
                runtime: routingDecision.preferredRuntime,
                decision: routingDecision,
                escalated: false,
                loopCount: 1,
                telemetry: buildTelemetry(result.status, routingDecision.preferredRuntime, {
                    decision: routingDecision
                })
            };
        } catch (error: any) {
            console.error(`⬡ ORACLE_ADAPTER_ERROR ::`, error);
            try {
                await telemetryService.updateSession(sessionId, {
                    endTime: Date.now(),
                    tokensEstimated: Math.max(0, Math.round((command.length || 0) / 4)),
                    toolsLoaded: 1,
                    status: 'FINALIZED',
                    metadata: JSON.stringify({
                        command,
                        modelId,
                        useCouncil,
                        route: routingDecision,
                        error: error.message
                    })
                });
                finalizeSessionImprovement(this.db, {
                    sessionId,
                    whatHappened: error.message,
                    autoScore: 0,
                    outcome: 'regressed',
                    whatGotWorse: error.message,
                    notes: `Oracle failed: ${error.message}`
                });
            } catch (_) {}
            return {
                status: 'CONCLAVE_ERROR',
                error: error.message,
                final_summary: `Oracle could not process "${command.substring(0, 80)}". ${error.message}`,
                runtime: 'degraded',
                decision: routingDecision,
                escalated: false,
                loopCount: 0,
                telemetry: buildTelemetry('CONCLAVE_ERROR', 'degraded')
            };
        }
    }

    private buildCouncilPrompt(command: string) {
        return `As the Aeonic Council, respond to this directive with a concise, actionable council brief: "${command}".
Break the response into:
1. ENLIL (Mission Logistics & Tasks)
2. NABU (Search & Routing)
3. ENKI (Technical Implementation)
4. INANNA (Context & Impact)`;
    }

    private buildCouncilFallbackMemory(command: string, response: string, priorStatus: string) {
        return {
            mission_log: [
                { agent: 'ENLIL', action: `Fallback council mobilized for: ${command.substring(0, 50)}...` },
                { agent: 'NABU', action: 'Routing via qwen-liberated local council channel.' },
                { agent: 'ENKI', action: 'Synthesizing a local response path for reliable delivery.' },
                { agent: 'INANNA', action: `Kernel reported ${priorStatus}; preserving conversational continuity.` }
            ],
            memory: {
                shortTerm: []
            },
            fallback_response: response,
            prior_status: priorStatus
        };
    }
}
