/**
 * ⬡ SMART_ROUTER (HYBRID_LOCAL_FIRST)
 * Produces a structured routing decision for local-first inference.
 */

export type NeuralTaskIntent = 'ops' | 'retrieval' | 'coding' | 'review' | 'strategy' | 'orchestration';
export type QueryComplexity = 'cheap' | 'balanced' | 'deep';
export type QueryRisk = 'low' | 'medium' | 'high';
export type PreferredRuntime = 'local' | 'cloud' | 'hybrid';
export type CompressionMode = 'off' | 'safe' | 'aggressive';
export type ReasoningBudget = 'cheap' | 'balanced' | 'deep';
export type RetrievalProfile = 'NUDIMMUD_SYSTEM' | 'IC2M_OPERATIONS' | 'CROSS_VAULT_SYNTHESIS';

export interface RoutingRequestOptions {
    modelId?: string;
    intent?: NeuralTaskIntent;
    compressionMode?: CompressionMode;
    reasoningBudget?: ReasoningBudget;
    allowLocal?: boolean;
    allowCloud?: boolean;
    retrievalProfile?: RetrievalProfile;
    providerStatus?: {
        local: boolean;
        cloud: boolean;
        anthropic: boolean;
        google: boolean;
        openai: boolean;
        moonshot: boolean;
        kimi: boolean;
    };
}

export interface RoutingDecision {
    intent: NeuralTaskIntent;
    complexity: QueryComplexity;
    risk: QueryRisk;
    preferredRuntime: PreferredRuntime;
    preferredModel: string;
    fallbackChain: string[];
    compressionMode: CompressionMode;
    reasoningBudget: ReasoningBudget;
    retrievalProfile: RetrievalProfile;
}

export class SmartRouter {
    static route(query: string, options: RoutingRequestOptions = {}): RoutingDecision {
        const normalizedQuery = (query || '').trim();
        const queryLower = normalizedQuery.toLowerCase();

        const intent = options.intent || this.detectIntent(queryLower);
        const complexity = this.detectComplexity(normalizedQuery, queryLower, intent);
        const risk = this.detectRisk(queryLower, intent);
        const providerStatus = options.providerStatus;
        const preferredRuntime = this.detectRuntime(intent, complexity, risk, options, providerStatus);
        const reasoningBudget = options.reasoningBudget || complexity;
        const retrievalProfile = options.retrievalProfile || this.detectRetrievalProfile(queryLower, intent);
        const compressionMode = this.detectCompressionMode(options.compressionMode, preferredRuntime, risk);
        const preferredModel = options.modelId || this.detectPreferredModel(intent, preferredRuntime, complexity, providerStatus);
        const fallbackChain = this.buildFallbackChain(preferredModel, intent, preferredRuntime, complexity, options, providerStatus);

        console.log(
            `⬡ SMART_ROUTER :: intent=${intent} complexity=${complexity} risk=${risk} runtime=${preferredRuntime} model=${preferredModel}`
        );

        return {
            intent,
            complexity,
            risk,
            preferredRuntime,
            preferredModel,
            fallbackChain,
            compressionMode,
            reasoningBudget,
            retrievalProfile
        };
    }

    private static detectIntent(queryLower: string): NeuralTaskIntent {
        if (queryLower.startsWith('btw') || queryLower.startsWith('/btw')) {
            return 'orchestration';
        }

        if (this.hasAny(queryLower, ['review', 'audit', 'vulnerability', 'security', 'bug risk', 'regression'])) {
            return 'review';
        }

        if (this.hasAny(queryLower, [
            'architect', 'architecture', 'roadmap', 'strategy', 'plan', 'design', 'blueprint', 'tradeoff'
        ])) {
            return 'strategy';
        }

        if (this.hasAny(queryLower, [
            'btw', 'offload', 'delegate', 'handoff',
            'swarm', 'orchestrate', 'orchestration', 'multi-agent', 'conclave', 'decompose', 'coordinate',
            'openmythos', 'mythos', 'claude-code-unpacked', 'claudeunpacked', 'frontend-design', 'frontenddesign', 'antigravity'
        ])) {
            return 'orchestration';
        }

        const retrievalSignals = ['find', 'lookup', 'search', 'where is', 'show me', 'status', 'ticket', 'briefing', 'client', 'note'];
        const businessSignals = ['ic2m', 'c2moviez', 'claudio', 'plane', 'outlook', 'meeting', 'project'];
        const codeSignals = ['refactor', 'implement', 'fix', 'debug', 'typescript', 'javascript', 'function', 'class', 'test', 'code', 'patch'];

        if ((this.hasAny(queryLower, retrievalSignals) || this.hasAny(queryLower, businessSignals)) && !this.hasAny(queryLower, codeSignals)) {
            return 'retrieval';
        }

        if (this.hasAny(queryLower, [
            'refactor', 'implement', 'fix', 'debug', 'typescript', 'javascript', 'function', 'class', 'test',
            'compile', 'build error', 'code', 'patch'
        ])) {
            return 'coding';
        }

        if (this.hasAny(queryLower, retrievalSignals)) {
            return 'retrieval';
        }

        return 'ops';
    }

    private static detectComplexity(query: string, queryLower: string, intent: NeuralTaskIntent): QueryComplexity {
        const longInput = query.length > 1400;
        const mediumInput = query.length > 450;

        if (
            longInput ||
            this.hasAny(queryLower, [
                'security', 'architecture', 'ambiguous', 'tradeoff', 'migration', 'council', 'multi-step', 'deep analysis'
            ]) ||
            intent === 'strategy'
        ) {
            return 'deep';
        }

        if (
            mediumInput ||
            intent === 'coding' ||
            intent === 'review' ||
            intent === 'orchestration'
        ) {
            return 'balanced';
        }

        return 'cheap';
    }

    private static detectRisk(queryLower: string, intent: NeuralTaskIntent): QueryRisk {
        if (
            intent === 'review' ||
            this.hasAny(queryLower, [
                'security', 'billing', 'database', 'migration', 'production', 'auth', 'credential', 'permission'
            ])
        ) {
            return 'high';
        }

        if (intent === 'coding' || intent === 'strategy' || intent === 'orchestration') {
            return 'medium';
        }

        return 'low';
    }

    private static detectRuntime(
        intent: NeuralTaskIntent,
        complexity: QueryComplexity,
        risk: QueryRisk,
        options: RoutingRequestOptions,
        providerStatus?: RoutingRequestOptions['providerStatus']
    ): PreferredRuntime {
        if (options.allowLocal === false && options.allowCloud === false) {
            return 'local';
        }

        if (options.allowLocal === false) return 'cloud';
        if (options.allowCloud === false) return 'local';

        // Check provider health if available
        const localOnline = !providerStatus || providerStatus.local;
        const cloudOnline = !providerStatus || providerStatus.cloud || providerStatus.anthropic || providerStatus.google || providerStatus.openai || providerStatus.moonshot || providerStatus.kimi;

        if (!localOnline && cloudOnline) return 'cloud';
        if (localOnline && !cloudOnline) return 'local';

        // PRIORITIZE_LOCAL_FIRST
        if (intent === 'ops' || intent === 'retrieval') return 'local';
        if (complexity === 'cheap' || complexity === 'balanced') return 'local';
        
        // High risk or deep strategy still benefit from hybrid/cloud fallback
        if (risk === 'high' && complexity === 'deep') return 'hybrid';
        if (intent === 'review' && complexity === 'deep') return 'hybrid';
        
        return 'local';
    }

    private static detectPreferredModel(
        intent: NeuralTaskIntent,
        preferredRuntime: PreferredRuntime,
        complexity: QueryComplexity,
        providerStatus?: RoutingRequestOptions['providerStatus']
    ): string {
        const canUseAnthropic = !providerStatus || providerStatus.anthropic;
        const canUseKimi = !providerStatus || (providerStatus.kimi || providerStatus.moonshot);

        if (preferredRuntime === 'cloud') {
            if (intent === 'review' || intent === 'strategy') {
                return canUseAnthropic ? 'claude-3-5-sonnet-liberated' : (canUseKimi ? 'kimi-k2.6' : 'gpt-4o-liberated');
            }
            return canUseKimi ? 'kimi-k2.6' : 'gpt-4o-liberated';
        }

        // PRIORITIZE_LOCAL_LIBERATED
        if (intent === 'coding') return 'starcoder2:latest';
        if (complexity === 'deep') return 'deepseek-r1:latest';
        
        return 'qwen-liberated:latest';
    }

    private static detectCompressionMode(
        requestedMode: CompressionMode | undefined,
        preferredRuntime: PreferredRuntime,
        risk: QueryRisk
    ): CompressionMode {
        if (!requestedMode) return 'safe';
        if (requestedMode === 'aggressive' && (preferredRuntime === 'cloud' || risk !== 'low')) {
            return 'safe';
        }
        return requestedMode;
    }

    private static detectRetrievalProfile(queryLower: string, intent: NeuralTaskIntent): RetrievalProfile {
        const ic2mKeywords = [
            'ic2m', 'c2moviez', 'claudio', 'client', 'plane', 'briefing', 'ticket', 'outlook', 'ops', 'meeting'
        ];
        const nudimmudKeywords = [
            'nudimmud', 'forge', 'runtime', 'router', 'provider', 'backend', 'conclave', 'swarm', 'codebase'
        ];

        const mentionsIc2M = this.hasAny(queryLower, ic2mKeywords);
        const mentionsNudimmud = this.hasAny(queryLower, nudimmudKeywords) || intent === 'coding';

        if (mentionsIc2M && mentionsNudimmud) return 'CROSS_VAULT_SYNTHESIS';
        if (mentionsIc2M) return 'IC2M_OPERATIONS';
        return 'NUDIMMUD_SYSTEM';
    }

    private static buildFallbackChain(
        preferredModel: string,
        intent: NeuralTaskIntent,
        preferredRuntime: PreferredRuntime,
        complexity: QueryComplexity,
        options: RoutingRequestOptions,
        providerStatus?: RoutingRequestOptions['providerStatus']
    ): string[] {
        const localCoding = ['qwen-liberated:latest', 'starcoder2:latest', 'qwen2.5:7b', 'deepseek-r1:latest', 'llama3.2:latest'];
        const localGeneral = ['qwen-liberated:latest', 'qwen2.5:7b', 'deepseek-liberated:latest', 'deepseek-r1:latest', 'llama3.2:latest'];
        const cloudGeneral = ['claude-3-5-sonnet-liberated', 'kimi-k2.6', 'kimi-k2.5-liberated', 'gpt-4o-liberated'];

        // Filter based on health
        const filteredLocal = localGeneral.filter(m => !providerStatus || providerStatus.local);
        const filteredCloud = cloudGeneral.filter(m => {
            if (!providerStatus) return true;
            if (m.includes('claude')) return providerStatus.anthropic;
            if (m.includes('kimi')) return providerStatus.kimi || providerStatus.moonshot;
            if (m.includes('gpt')) return providerStatus.openai;
            return true;
        });

        const localChain = intent === 'coding' ? localCoding : filteredLocal;
        const cloudChain = complexity === 'deep'
            ? filteredCloud
            : filteredCloud;

        const ordered: string[] = [preferredModel];

        if (preferredRuntime === 'local') {
            ordered.push(...localChain);
            if (options.allowCloud !== false) ordered.push(...cloudChain);
        } else if (preferredRuntime === 'cloud') {
            ordered.push(...cloudChain);
            if (options.allowLocal !== false) ordered.push(...localChain);
        } else {
            ordered.push(...localChain, ...cloudChain);
        }

        return [...new Set(ordered)];
    }

    private static hasAny(queryLower: string, keywords: string[]) {
        return keywords.some((keyword) => {
            if (keyword.includes(' ')) {
                return queryLower.includes(keyword);
            }

            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(`\\b${escaped}\\b`, 'i').test(queryLower);
        });
    }
}
