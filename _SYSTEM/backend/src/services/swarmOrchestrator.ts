import Database from 'better-sqlite3';
import { neuralForge } from './neuralForgeService';
import { vectorSearch } from './vectorSearchService';
import { EventBus } from '../conclave/EventBus';
import { ArtifactType, AgentRole } from '../conclave/types';

const conclaveBus = new EventBus();

export enum SwarmState {
    NIGREDO = 'NIGREDO',       // Raw data, chaos, initialization
    ALBEDO = 'ALBEDO',         // Purification, processing, logic extraction
    CITRINITAS = 'CITRINITAS', // Synthesis, wisdom, strategy formulation
    RUBEDO = 'RUBEDO'          // Completion, action, final reporting
}

export const OPERATION_REGISTRY = {
    CHRONOS: ['OP_TIMELINE_AUDIT', 'OP_ICS_SYNC', 'OP_CADENCE_CALC', 'OP_BOOT_LOG_AUDIT'],
    LOGOS: ['OP_VAULT_INGEST', 'OP_TONE_ENFORCEMENT', 'OP_COMM_DISPATCH', 'OP_INTEGRATION_VERIFY'],
    NOMOS: ['OP_TASK_TRIAGE', 'OP_RISK_MATRIX', 'OP_GATE_VERIFY', 'OP_FAILURE_ISOLATION']
};

export class SwarmOrchestrator {
    private db: Database.Database;

    constructor(db: Database.Database) {
        this.db = db;
    }

    async executeSwarmGoal(goal: string, context?: any) {
        console.log(`⬡ SWARM_COMMAND_INIT :: GOAL: ${goal}`);
        
        // Step 1: NIGREDO (Decomposition)
        this.updateOverseerState('CLAWDIIA', SwarmState.NIGREDO, 'DECOMPOSING_GOAL');
        const directives = await this.decomposeGoal(goal, context);
        
        // Step 2: ALBEDO (Parallel Specialist Execution)
        this.updateOverseerState('CLAWDIIA', SwarmState.ALBEDO, 'ORCHESTRATING_SPECIALISTS');
        const results = await Promise.all(directives.map((d: any) => this.executeDirective(d)));

        // Step 3: CITRINITAS (Synthesis)
        this.updateOverseerState('CLAWDIIA', SwarmState.CITRINITAS, 'SYNTHESIZING_REPORTS');
        const finalReport = await this.synthesizeResults(goal, results);
        
        // Step 4: RUBEDO (Completion)
        this.updateOverseerState('CLAWDIIA', SwarmState.RUBEDO, 'IDLE');
        return finalReport;
    }

    private async decomposeGoal(goal: string, context: any) {
        const systemPrompt = `
            ROLE: CLAWDIIA (Overseer)
            DIRECT_ORDER: Decompose the USER_GOAL into specific OP_CODES for your team.
            
            TEAM_DIRECTIVES:
            - CHRONOS: OP_TIMELINE_AUDIT (Verify dates), OP_ICS_SYNC (Sync calendars), OP_CADENCE_CALC (Task pulse).
            - LOGOS: OP_VAULT_INGEST (Read Abzu), OP_TONE_ENFORCEMENT (Brand check), OP_COMM_DISPATCH (Draft response).
            - NOMOS: OP_TASK_TRIAGE (Prioritize), OP_RISK_MATRIX (Budget/Time risk), OP_GATE_VERIFY (Prerequisites).

            OUTPUT: JSON array [{ agent: "CHRONOS", op: "OP_TIMELINE_AUDIT", directive: "..." }]
        `;

        const response = await neuralForge.chat('claude-3-5-sonnet-liberated', [
            { role: 'user', content: `GOAL: ${goal}\nCONTEXT: ${JSON.stringify(context)}` }
        ], systemPrompt);

        try {
            const jsonMatch = response.content.match(/\[.*\]/s);
            return JSON.parse(jsonMatch ? jsonMatch[0] : '[]');
        } catch (e) {
            return [];
        }
    }

    private async executeDirective(directive: { agent: string, op: string, directive: string }) {
        const { agent, op, directive: task } = directive;
        
        this.updateAgentStatus(agent, SwarmState.ALBEDO, op);

        // ── KNOWLEDGE INJECTION ──
        // Semantically search the vault for context related to this specific task
        const localContextNodes = await vectorSearch.search(this.db, task, 2);
        const contextString = localContextNodes.length > 0 
            ? `\n[LOCAL_VAULT_CONTEXT]:\n${localContextNodes.map(n => `--- ${n.title} ---\n${n.content}`).join('\n')}\n`
            : '';

        const sopMap: Record<string, string> = {
            'CHRONOS': `ROLE: CHRONOS. ORDER: Maintain timeline integrity. OP: ${op}. Task: ${task}. ${contextString}`,
            'LOGOS': `ROLE: LOGOS. ORDER: Translate raw data to YURI dialect. OP: ${op}. Task: ${task}. ${contextString}`,
            'NOMOS': `ROLE: NOMOS. ORDER: Apply strict logic gates. OP: ${op}. Task: ${task}. ${contextString}`
        };

        const response = await neuralForge.chat('qwen-liberated:latest', [
            { role: 'user', content: `EXECUTE: ${task}` }
        ], sopMap[agent]);

        this.updateAgentStatus(agent, SwarmState.CITRINITAS, 'REPORTING');
        this.logSwarmMessage(agent, `[${op}] :: ${response.content}`, 'REPORT');

        return { agent, op, report: response.content };
    }

    private async synthesizeResults(goal: string, results: any[]) {
        const systemPrompt = `
            ROLE: CLAWDIIA (Overseer)
            ORDER: Synthesize reports into an actionable BUSINESS_BRIEF.
            Format: Use industrial, monospaced headers. Resolve all logic collisions.
        `;

        const response = await neuralForge.chat('claude-3-5-sonnet-liberated', [
            { role: 'user', content: `GOAL: ${goal}\nRESULTS: ${JSON.stringify(results)}` }
        ], systemPrompt);

        return response.content;
    }

    private updateAgentStatus(name: string, state: SwarmState, op: string) {
        const progressMap: Record<SwarmState, number> = {
            [SwarmState.NIGREDO]: 25,
            [SwarmState.ALBEDO]: 50,
            [SwarmState.CITRINITAS]: 75,
            [SwarmState.RUBEDO]: 100
        };

        this.db.prepare(`
            UPDATE agents SET current_state = ?, current_op = ?, learning_cycles = ?, status = 'ACTIVE', last_pulse = datetime('now') 
            WHERE name = ?
        `).run(state, op, progressMap[state], name);
    }

    private updateOverseerState(name: string, state: SwarmState, op: string) {
        this.updateAgentStatus(name, state, op);
        conclaveBus.publish({
            id: `swarm_pulse_${Date.now()}`,
            type: 'USER_DIRECTIVE' as ArtifactType,
            producer: 'SYSTEM' as AgentRole,
            payload: { state, op },
            timestamp: Date.now(),
            metadata: {
                sessionId: `swarm_${Date.now()}`,
                correlationId: `swarm_${name}_${state}`,
                tokenUsage: { prompt: 0, completion: 0, total: 0 },
                executionTimeMs: 0,
                agentVersion: 'swarm-1.0.0'
            }
        });
    }

    private logSwarmMessage(sender: string, content: string, type: string) {
        const senderId = (this.db.prepare("SELECT id FROM agents WHERE name = ?").get(sender) as any)?.id;
        const receiverId = (this.db.prepare("SELECT id FROM agents WHERE name = 'CLAWDIIA'").get() as any)?.id;
        
        this.db.prepare(`
            INSERT INTO swarm_messages (sender_agent_id, receiver_agent_id, content, message_type)
            VALUES (?, ?, ?, ?)
        `).run(senderId, receiverId, content, type);

        conclaveBus.publish({
            id: `msg_${Date.now()}`,
            type: 'USER_DIRECTIVE' as ArtifactType,
            producer: sender as AgentRole,
            payload: { sender, content, type },
            timestamp: Date.now(),
            metadata: {
                sessionId: `swarm_${Date.now()}`,
                correlationId: `msg_${sender}_${Date.now()}`,
                tokenUsage: { prompt: 0, completion: 0, total: 0 },
                executionTimeMs: 0,
                agentVersion: 'swarm-1.0.0'
            }
        });
    }
}
