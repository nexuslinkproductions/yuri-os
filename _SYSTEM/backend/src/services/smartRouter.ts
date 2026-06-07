/**
 * ⬡ SMART_ROUTER (HYBRID_LOCAL_FIRST)
 * Produces a structured routing decision for local-first inference.
 */

declare const require: any;
declare const __dirname: string;

const fs = require('fs');
const path = require('path');

export type BridgeTaskIntent =
    'code_edit_small'
    | 'code_edit_large'
    | 'research_repo'
    | 'summarization'
    | 'extraction'
    | 'architecture_review'
    | 'audit_security'
    | 'custom';
export type YuriIntegrationIntent =
    'growth_audit'
    | 'browser_research'
    | 'inbox_comms'
    | 'media_render';
export type NeuralTaskIntent =
    'ops'
    | 'retrieval'
    | 'coding'
    | 'review'
    | 'strategy'
    | 'orchestration'
    | BridgeTaskIntent
    | YuriIntegrationIntent;
export type QueryComplexity = 'cheap' | 'balanced' | 'deep';
export type QueryRisk = 'low' | 'medium' | 'high';
export type PreferredRuntime = 'local' | 'cloud' | 'hybrid';
export type CompressionMode = 'off' | 'safe' | 'aggressive';
export type ReasoningBudget = 'cheap' | 'balanced' | 'deep';
export type RetrievalProfile = 'YURI_SYSTEM' | 'CROSS_VAULT_SYNTHESIS';
export type YuriIntegrationLane = 'core' | 'growth' | 'browser' | 'inbox' | 'media';
export type ActionGate =
    'none'
    | 'draft_only'
    | 'approval_required'
    | 'confirm_before_send'
    | 'capture_only'
    | 'render_only';
export type IntegrationSurface =
    'oracle'
    | 'siteBuilderService'
    | 'browserAutomation'
    | 'agenticInbox'
    | 'hyperframesPipeline';

interface RouterPolicyTask {
    lane: string;
    fallback?: string;
    max_files?: number;
}

interface RouterPolicy {
    tasks?: Partial<Record<BridgeTaskIntent, RouterPolicyTask>>;
}

const ROUTER_POLICY_PATH = path.resolve(__dirname, '../../../_SYSTEM/Scripts/router-policy.json');
const ROUTER_POLICY = loadRouterPolicy();
const LOCAL_MODEL_POLICY_PATH = path.resolve(__dirname, '../../../.claude/config/models.json');
const LOCAL_MODEL_POLICY = loadLocalModelPolicy();
const LOCAL_MODEL_POLICY_LOCAL = LOCAL_MODEL_POLICY.local || {};
const LOCAL_PRIMARY_MODEL = LOCAL_MODEL_POLICY_LOCAL.primary || 'qwen2.5:7b';
const LOCAL_UTILITY_MODEL = LOCAL_MODEL_POLICY_LOCAL.utility || 'qwen3.5:4b';
const LOCAL_CODE_MODEL = LOCAL_MODEL_POLICY_LOCAL.code || 'qwen2.5-coder:7b';
const LOCAL_CODE_FALLBACK_MODEL = LOCAL_MODEL_POLICY_LOCAL.code_fallback || 'starcoder2:latest';
const LOCAL_DEEP_REASONING_MODEL = LOCAL_MODEL_POLICY_LOCAL.deep_reasoning || 'deepseek-r1:8b';
const LOCAL_FALLBACK_MODEL = LOCAL_MODEL_POLICY_LOCAL.fallback || 'llama3.2:latest';

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
    yuriLane: YuriIntegrationLane;
    actionGate: ActionGate;
    integrationSurface: IntegrationSurface;
    policySource?: string;
    maxFiles?: number;
}

interface IntegrationProfile {
    yuriLane: YuriIntegrationLane;
    actionGate: ActionGate;
    integrationSurface: IntegrationSurface;
}

const DEFAULT_INTEGRATION_PROFILE: IntegrationProfile = {
    yuriLane: 'core',
    actionGate: 'none',
    integrationSurface: 'oracle'
};

const INTEGRATION_PROFILES: Partial<Record<NeuralTaskIntent, IntegrationProfile>> = {
    growth_audit: {
        yuriLane: 'growth',
        actionGate: 'draft_only',
        integrationSurface: 'siteBuilderService'
    },
    browser_research: {
        yuriLane: 'browser',
        actionGate: 'capture_only',
        integrationSurface: 'browserAutomation'
    },
    inbox_comms: {
        yuriLane: 'inbox',
        actionGate: 'confirm_before_send',
        integrationSurface: 'agenticInbox'
    },
    media_render: {
        yuriLane: 'media',
        actionGate: 'render_only',
        integrationSurface: 'hyperframesPipeline'
    }
};

export class SmartRouter {
    static route(query: string, options: RoutingRequestOptions = {}): RoutingDecision {
        const normalizedQuery = (query || '').trim();
        const queryLower = normalizedQuery.toLowerCase();

        const intent = options.intent || this.detectIntent(queryLower);
        const policyRoute = this.getPolicyRoute(intent);
        const complexity = this.detectComplexity(normalizedQuery, queryLower, intent);
        const risk = this.detectRisk(queryLower, intent);
        const providerStatus = options.providerStatus;
        const preferredRuntime = policyRoute
            ? this.runtimeForLane(policyRoute.lane)
            : this.detectRuntime(intent, complexity, risk, options, providerStatus);
        const reasoningBudget = options.reasoningBudget || complexity;
        const retrievalProfile = options.retrievalProfile || this.detectRetrievalProfile(queryLower, intent);
        const compressionMode = this.detectCompressionMode(options.compressionMode, preferredRuntime, risk);
        const preferredModel = options.modelId || policyRoute?.lane || this.detectPreferredModel(intent, preferredRuntime, complexity, providerStatus);
        const fallbackChain = policyRoute
            ? this.buildPolicyFallbackChain(preferredModel, policyRoute)
            : this.buildFallbackChain(preferredModel, intent, preferredRuntime, complexity, options, providerStatus);
        const integrationProfile = this.integrationProfileFor(intent);

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
            retrievalProfile,
            ...integrationProfile,
            ...(policyRoute ? { policySource: '_SYSTEM/Scripts/router-policy.json', maxFiles: policyRoute.max_files } : {})
        };
    }

    private static detectIntent(queryLower: string): NeuralTaskIntent {
        if (this.hasAny(queryLower, [
            'seo', 'google ads', 'meta ads', 'ppc', 'search console', 'structured data',
            'campaign audit', 'ad audit', 'ads audit', 'landing page audit', 'toprank', 'claude ads'
        ])) {
            return 'growth_audit';
        }

        if (this.hasAny(queryLower, [
            'accessibility snapshot', 'capture page', 'capture the page', 'inspect page', 'screenshot', 'browser', 'browser session',
            'authenticated browsing', 'camofox', 'playwright'
        ])) {
            return 'browser_research';
        }

        if (this.hasAny(queryLower, [
            'inbox', 'mailbox', 'client email', 'draft a reply', 'reply to this email', 'agentic inbox'
        ])) {
            return 'inbox_comms';
        }

        if (this.hasAny(queryLower, [
            'showreel', 'html video', 'render video', 'render a video', 'mp4', 'hyperframes',
            'social cut', 'motion graphic', 'motion graphics'
        ])) {
            return 'media_render';
        }

        if (this.hasAny(queryLower, ['audit security', 'security audit', 'vulnerability review'])) {
            return 'audit_security';
        }

        if (this.hasAny(queryLower, ['architecture review', 'architecture audit', 'system design review'])) {
            return 'architecture_review';
        }

        if (this.hasAny(queryLower, ['summarize', 'summary', 'condense'])) {
            return 'summarization';
        }

        if (this.hasAny(queryLower, ['extract', 'extraction', 'pull fields', 'parse fields'])) {
            return 'extraction';
        }

        if (this.hasAny(queryLower, ['repo research', 'codebase research', 'scan repository', 'multi-file scan'])) {
            return 'research_repo';
        }

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
            'skill evolution', 'xref', 'cross-reference', 'propagation law', 'capability census', 'frontend-design', 'frontenddesign'
        ])) {
            return 'orchestration';
        }

        const retrievalSignals = ['find', 'lookup', 'search', 'where is', 'show me', 'status', 'ticket', 'briefing', 'client', 'note'];
        const businessSignals = ['meeting', 'project'];
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

        if (intent === 'code_edit_small' || intent === 'summarization' || intent === 'extraction') return 'cheap';
        if (intent === 'code_edit_large' || intent === 'research_repo') return 'balanced';
        if (intent === 'architecture_review' || intent === 'audit_security') return 'deep';
        if (intent === 'growth_audit' || intent === 'media_render') return 'balanced';
        if (intent === 'browser_research' || intent === 'inbox_comms') return mediumInput ? 'balanced' : 'cheap';

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
        if (intent === 'audit_security') return 'high';
        if (intent === 'code_edit_large' || intent === 'architecture_review') return 'medium';
        if (intent === 'code_edit_small' || intent === 'research_repo' || intent === 'summarization' || intent === 'extraction') return 'low';
        if (intent === 'growth_audit') return 'medium';
        if (intent === 'browser_research') return 'low';
        if (intent === 'inbox_comms') return 'high';
        if (intent === 'media_render') return 'low';

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

        if (intent === 'coding') return LOCAL_CODE_MODEL;
        if (intent === 'media_render') return LOCAL_PRIMARY_MODEL;
        if (complexity === 'cheap' || intent === 'ops' || intent === 'retrieval') return LOCAL_UTILITY_MODEL;
        if (complexity === 'deep') return LOCAL_DEEP_REASONING_MODEL;

        return LOCAL_PRIMARY_MODEL;
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
        const yuriKeywords = [
            'yuri', 'forge', 'runtime', 'router', 'provider', 'backend', 'conclave', 'swarm', 'codebase'
        ];

        const mentionsYuri = this.hasAny(queryLower, yuriKeywords) || intent === 'coding';

        if (mentionsYuri) return 'YURI_SYSTEM';
        return 'YURI_SYSTEM';
    }

    private static buildFallbackChain(
        preferredModel: string,
        intent: NeuralTaskIntent,
        preferredRuntime: PreferredRuntime,
        complexity: QueryComplexity,
        options: RoutingRequestOptions,
        providerStatus?: RoutingRequestOptions['providerStatus']
    ): string[] {
        const localAllowed = !providerStatus || providerStatus.local;
        const localCoding = localAllowed ? [LOCAL_CODE_MODEL, LOCAL_CODE_FALLBACK_MODEL] : [];
        const localGeneral = localAllowed ? [LOCAL_UTILITY_MODEL, LOCAL_PRIMARY_MODEL, LOCAL_FALLBACK_MODEL] : [];
        const localDeep = localAllowed ? [LOCAL_DEEP_REASONING_MODEL, LOCAL_PRIMARY_MODEL, LOCAL_UTILITY_MODEL, LOCAL_FALLBACK_MODEL] : [];
        const cloudGeneral = ['claude-3-5-sonnet-liberated', 'kimi-k2.6', 'kimi-k2.5-liberated', 'gpt-4o-liberated'];

        const filteredLocal = complexity === 'deep' ? localDeep : localGeneral;
        const filteredCloud = cloudGeneral.filter(m => {
            if (!providerStatus) return true;
            if (m.includes('claude')) return providerStatus.anthropic;
            if (m.includes('kimi')) return providerStatus.kimi || providerStatus.moonshot;
            if (m.includes('gpt')) return providerStatus.openai;
            return true;
        });

        const localChain = intent === 'coding' ? localCoding : filteredLocal;
        const cloudChain = filteredCloud;

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

    private static integrationProfileFor(intent: NeuralTaskIntent): IntegrationProfile {
        const profile = INTEGRATION_PROFILES[intent] || DEFAULT_INTEGRATION_PROFILE;
        return profile;
    }

    private static getPolicyRoute(intent: NeuralTaskIntent): RouterPolicyTask | undefined {
        if (!isBridgeTaskIntent(intent)) return undefined;
        if (intent === 'custom') return undefined;
        return ROUTER_POLICY.tasks?.[intent];
    }

    private static buildPolicyFallbackChain(preferredModel: string, policyRoute: RouterPolicyTask): string[] {
        return [...new Set([preferredModel, policyRoute.fallback].filter(Boolean) as string[])];
    }

    private static runtimeForLane(lane: string): PreferredRuntime {
        if (lane === 'self') return 'local';
        if (lane.includes('local') || lane === 'deepseek' || lane === 'gpt-oss') return 'local';
        if (lane.includes('cloud') || lane.startsWith('deepseek-v4') || lane.startsWith('codex') || lane.startsWith('gpt-5')) return 'cloud';
        return 'local';
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

function loadRouterPolicy(): RouterPolicy {
    try {
        if (!fs.existsSync(ROUTER_POLICY_PATH)) return {};
        return JSON.parse(fs.readFileSync(ROUTER_POLICY_PATH, 'utf8')) as RouterPolicy;
    } catch (error) {
        console.warn(`⬡ SMART_ROUTER_POLICY_UNAVAILABLE :: ${(error as Error).message}`);
        return {};
    }
}

function loadLocalModelPolicy(): Record<string, any> {
    try {
        if (!fs.existsSync(LOCAL_MODEL_POLICY_PATH)) return {};
        return JSON.parse(fs.readFileSync(LOCAL_MODEL_POLICY_PATH, 'utf8'));
    } catch (error) {
        console.warn(`⬡ SMART_ROUTER_MODEL_POLICY_UNAVAILABLE :: ${(error as Error).message}`);
        return {};
    }
}

function isBridgeTaskIntent(intent: NeuralTaskIntent): intent is BridgeTaskIntent {
    return [
        'code_edit_small',
        'code_edit_large',
        'research_repo',
        'summarization',
        'extraction',
        'architecture_review',
        'audit_security',
        'custom'
    ].includes(intent);
}
