import fs from 'fs';
import path from 'path';
import { SystemConfig } from '../config/SystemConfig';

/**
 * ⬡ LIQUID_MEMORY_SERVICE
 * Inspired by MIT CSAIL's Liquid Neural Networks (LNNs).
 * Implements a time-continuous, adaptive context bridge for NUDIMMUD.
 */

/**
 * ⬡ EVONEXUS_LIQUID_DYNAMICS
 * Tracks Yuri OS activity as a time-decayed adaptive context bridge.
 */

interface MemoryNode {
    path: string;
    weight: number;      // "Neuronal" weight (0.0 to 1.0)
    lastUpdated: number; // Timestamp
    domain: string;
    type: 'SKELETON' | 'ENHANCEMENT'; // New distinction
}

interface HiddenState {
    globalFocus: string; 
    skeletonStability: number;
    activeNodes: MemoryNode[];
    lastSync: number;
}

export interface LiquidMemoryCandidate {
    path: string;
    weight: number;
    domain: string;
    type: 'SKELETON' | 'ENHANCEMENT';
    lastUpdated: number;
}

export type LiquidMemoryDecision = 'PROMOTE' | 'DEMOTE' | 'ARCHIVE' | 'TOMBSTONE';

class LiquidMemoryService {
    private static instance: LiquidMemoryService;
    private state: HiddenState;
    private readonly STATE_FILE = SystemConfig.resolve('backend/data/liquid_state.json');
    private readonly DECAY_RATE = 0.03; // Slower decay for EvoNexus stability

    private constructor() {
        this.state = this.loadState();
        setInterval(() => this.tick(), 1000 * 60 * 30); // Every 30 mins
    }

    private loadState(): HiddenState {
        if (fs.existsSync(this.STATE_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.STATE_FILE, 'utf-8'));
                if (!data.skeletonStability) data.skeletonStability = 1.0;
                return data;
            } catch {
                console.warn('⬡ LIQUID_MEMORY :: STATE_CORRUPT_RESETTING');
            }
        }
        return {
            globalFocus: 'EVONEXUS_INITIALIZING',
            skeletonStability: 1.0,
            activeNodes: [],
            lastSync: Date.now()
        };
    }

    public recordActivity(filePath: string, domain: string) {
        const relativePath = path.relative(SystemConfig.ROOT, filePath);
        
        let node = this.state.activeNodes.find(n => n.path === relativePath);
        if (node) {
            node.weight = Math.min(1.0, node.weight + 0.2);
            node.lastUpdated = Date.now();
            node.type = 'ENHANCEMENT';
        } else {
            this.state.activeNodes.push({
                path: relativePath,
                weight: 0.4,
                lastUpdated: Date.now(),
                domain: domain,
                type: 'ENHANCEMENT'
            });
        }

        this.updateEvolutionaryState();
        this.saveState();
    }

    private updateEvolutionaryState() {
        if (this.state.activeNodes.length === 0) {
            this.state.globalFocus = 'EVONEXUS_IDLE';
            return;
        }

        const skeletonNodes = this.state.activeNodes.filter(n => n.type === 'SKELETON');
        const enhancementNodes = this.state.activeNodes.filter(n => n.type === 'ENHANCEMENT');

        const skeletonWeight = skeletonNodes.reduce((acc, n) => acc + n.weight, 0);
        const enhancementWeight = enhancementNodes.reduce((acc, n) => acc + n.weight, 0);

        // EvoNexus is a combination: Skeleton provides the structure, Enhancement provides the pulse
        if (skeletonWeight > enhancementWeight) {
            this.state.globalFocus = 'EVONEXUS_STRUCTURAL_STABILIZATION';
        } else {
            this.state.globalFocus = 'EVONEXUS_COGNITIVE_EXPANSION';
        }

        this.state.skeletonStability = Math.min(1.0, skeletonWeight / 5 + 0.5);
    }

    public static getInstance(): LiquidMemoryService {
        if (!LiquidMemoryService.instance) {
            LiquidMemoryService.instance = new LiquidMemoryService();
        }
        return LiquidMemoryService.instance;
    }

    private saveState() {
        if (!fs.existsSync(path.dirname(this.STATE_FILE))) {
            fs.mkdirSync(path.dirname(this.STATE_FILE), { recursive: true });
        }
        fs.writeFileSync(this.STATE_FILE, JSON.stringify(this.state, null, 2));
    }

    private tick() {
        this.state.activeNodes = this.state.activeNodes
            .map(node => ({
                ...node,
                weight: node.weight * (1 - this.DECAY_RATE)
            }))
            .filter(node => node.weight > 0.05);

        this.updateEvolutionaryState();
        this.saveState();
    }

    public getActiveMemory(): HiddenState {
        return this.state;
    }

    public getStmCandidates(minWeight = 0.2): LiquidMemoryCandidate[] {
        return this.state.activeNodes
            .filter(node => node.weight >= minWeight)
            .map(node => ({ ...node }));
    }

    public applyGovernanceDecision(filePath: string, decision: LiquidMemoryDecision): void {
        const relativePath = path.isAbsolute(filePath)
            ? path.relative(SystemConfig.ROOT, filePath)
            : filePath;
        const node = this.state.activeNodes.find(n => n.path === relativePath);
        if (!node) return;

        if (decision === 'PROMOTE') {
            node.weight = Math.min(1.0, node.weight + 0.25);
            node.lastUpdated = Date.now();
        } else if (decision === 'DEMOTE') {
            node.weight = Math.max(0.05, node.weight * 0.5);
        } else if (decision === 'ARCHIVE' || decision === 'TOMBSTONE') {
            this.state.activeNodes = this.state.activeNodes.filter(n => n.path !== relativePath);
        }

        this.updateEvolutionaryState();
        this.saveState();
    }
}

export const liquidMemory = LiquidMemoryService.getInstance();
