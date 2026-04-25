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
 * Hierarchy: 
 * - SKELETON_CORE (Claudio): Structural & Barebone Support (Security-Grade)
 * - ENHANCEMENT_LAYER (Marcel): Cognitive Augmentation & Synthesis
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
    skeletonStability: number; // New metric: How stable is the barebone support?
    activeNodes: MemoryNode[];
    lastSync: number;
}

class LiquidMemoryService {
    private static instance: LiquidMemoryService;
    private state: HiddenState;
    private readonly STATE_FILE = SystemConfig.resolve('backend/data/liquid_state.json');
    private readonly DECAY_RATE = 0.03; // Slower decay for EvoNexus stability
    private readonly SKELETON_BOOST = 0.4; // Claudio's things get higher structural priority

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
        const isSkeleton = relativePath.includes('iC2M') || relativePath.includes('06_NETWORK-SYNC/C2MOVIEZ');
        
        let node = this.state.activeNodes.find(n => n.path === relativePath);
        if (node) {
            node.weight = Math.min(1.0, node.weight + (isSkeleton ? 0.4 : 0.2));
            node.lastUpdated = Date.now();
            node.type = isSkeleton ? 'SKELETON' : 'ENHANCEMENT'; // Ensure type is set
        } else {
            this.state.activeNodes.push({
                path: relativePath,
                weight: isSkeleton ? 0.6 : 0.4,
                lastUpdated: Date.now(),
                domain: domain,
                type: isSkeleton ? 'SKELETON' : 'ENHANCEMENT'
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
}

export const liquidMemory = LiquidMemoryService.getInstance();
