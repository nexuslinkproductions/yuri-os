import {
    ActionGate,
    IntegrationSurface,
    RoutingDecision,
    SmartRouter,
    YuriIntegrationLane
} from './smartRouter';

export interface ExternalRepoSource {
    name: string;
    url: string;
    absorbedAs: string;
}

export interface ExecutiveIntegrationLane {
    lane: YuriIntegrationLane;
    title: string;
    integrationSurface: IntegrationSurface;
    actionGate: ActionGate;
    nativeServices: string[];
    inspiredBy: ExternalRepoSource[];
    capabilities: string[];
    blockedActions: string[];
}

export interface ExecutiveIntegrationRoute {
    decision: RoutingDecision;
    lane: ExecutiveIntegrationLane;
    nextAction: string;
    blockedActions: string[];
}

const EXECUTIVE_INTEGRATION_LANES: ExecutiveIntegrationLane[] = [
    {
        lane: 'trading',
        title: 'Trading Intelligence',
        integrationSurface: 'tradingControlPlane',
        actionGate: 'simulation_only',
        nativeServices: ['tradingScoreService', 'smartRouter', 'headlessControlPlaneService'],
        inspiredBy: [
            source('AutoHedge', 'https://github.com/The-Swarm-Corporation/AutoHedge', 'multi-agent market, risk, and execution decomposition'),
            source('Vibe-Trading', 'https://github.com/HKUDS/Vibe-Trading', 'trading skills, memory, MCP, swarm presets, and backtest loop'),
            source('Fincept Terminal', 'https://github.com/Fincept-Corporation/FinceptTerminal', 'finance terminal research UX and market-analysis cockpit')
        ],
        capabilities: ['market_signal_routing', 'risk_gating', 'backtest_preparation', 'paper_execution_preparation'],
        blockedActions: ['live_exchange_execution', 'custodial_key_management']
    },
    {
        lane: 'growth',
        title: 'Growth Audit',
        integrationSurface: 'siteBuilderService',
        actionGate: 'draft_only',
        nativeServices: ['siteBuilderService', 'designAssistantBridgeService', 'browserAutomation'],
        inspiredBy: [
            source('Claude Ads', 'https://github.com/AgriciDaniel/claude-ads', 'weighted ad-audit checks, PPC modeling, and report generation'),
            source('Toprank', 'https://github.com/nowork-studio/toprank', 'SEO, Search Console, Google Ads, Meta Ads, and structured-data audit loops')
        ],
        capabilities: ['seo_audit', 'ads_audit', 'metadata_rewrite_plan', 'structured_report_generation'],
        blockedActions: ['unaudited_site_mutation', 'ad_budget_change']
    },
    {
        lane: 'browser',
        title: 'Browser Research',
        integrationSurface: 'browserAutomation',
        actionGate: 'capture_only',
        nativeServices: ['browserAutomation', 'designAssistantBridgeService'],
        inspiredBy: [
            source('Camofox Browser', 'https://github.com/jo-inc/camofox-browser', 'stable element refs, accessibility snapshots, session isolation, and browser evidence')
        ],
        capabilities: ['page_capture', 'accessibility_snapshot', 'authenticated_session_reuse', 'visual_evidence_collection'],
        blockedActions: ['credential_exfiltration', 'policy_bypass_automation']
    },
    {
        lane: 'inbox',
        title: 'Agentic Inbox',
        integrationSurface: 'agenticInbox',
        actionGate: 'confirm_before_send',
        nativeServices: ['smartRouter', 'memoryGovernorService'],
        inspiredBy: [
            source('Agentic Inbox', 'https://github.com/cloudflare/agentic-inbox', 'inbox triage, search, draft replies, and explicit send confirmation')
        ],
        capabilities: ['mail_triage', 'thread_summary', 'draft_reply', 'brief_extraction'],
        blockedActions: ['send_without_confirmation', 'mailbox_public_exposure']
    },
    {
        lane: 'media',
        title: 'Deterministic Media Render',
        integrationSurface: 'hyperframesPipeline',
        actionGate: 'render_only',
        nativeServices: ['browserAutomation', 'siteBuilderService'],
        inspiredBy: [
            source('Hyperframes', 'https://github.com/heygen-com/hyperframes', 'HTML-native deterministic video rendering for agent workflows')
        ],
        capabilities: ['html_video_plan', 'showreel_render_job', 'social_cut_generation', 'render_artifact_trace'],
        blockedActions: ['untracked_asset_publication']
    }
];

export function listExecutiveIntegrationLanes(): ExecutiveIntegrationLane[] {
    return EXECUTIVE_INTEGRATION_LANES.map((lane) => ({
        ...lane,
        nativeServices: [...lane.nativeServices],
        inspiredBy: lane.inspiredBy.map((item) => ({ ...item })),
        capabilities: [...lane.capabilities],
        blockedActions: [...lane.blockedActions]
    }));
}

export function planExecutiveIntegrationRoute(prompt: string): ExecutiveIntegrationRoute {
    const decision = SmartRouter.route(prompt);
    const lane = getLane(decision.yuriLane);
    return {
        decision,
        lane,
        nextAction: nextActionFor(decision.actionGate),
        blockedActions: [...new Set([...lane.blockedActions, ...blockedActionsFor(decision)])]
    };
}

function getLane(lane: YuriIntegrationLane): ExecutiveIntegrationLane {
    return EXECUTIVE_INTEGRATION_LANES.find((item) => item.lane === lane) || {
        lane: 'core',
        title: 'Core Oracle',
        integrationSurface: 'oracle',
        actionGate: 'none',
        nativeServices: ['smartRouter', 'oracleService'],
        inspiredBy: [],
        capabilities: ['general_reasoning', 'retrieval', 'strategy'],
        blockedActions: []
    };
}

function source(name: string, url: string, absorbedAs: string): ExternalRepoSource {
    return { name, url, absorbedAs };
}

function nextActionFor(actionGate: ActionGate): string {
    if (actionGate === 'approval_required') return 'Prepare approval packet before any external action.';
    if (actionGate === 'confirm_before_send') return 'Create a draft and require explicit send confirmation.';
    if (actionGate === 'simulation_only') return 'Create simulation or paper-trading artifacts only.';
    if (actionGate === 'capture_only') return 'Capture evidence and attach it to the active request.';
    if (actionGate === 'render_only') return 'Create a render job and keep publication separate.';
    if (actionGate === 'draft_only') return 'Create governed draft artifacts for operator review.';
    return 'Route through the core Oracle surface.';
}

function blockedActionsFor(decision: RoutingDecision): string[] {
    if (decision.actionGate === 'approval_required') return ['unapproved_external_execution'];
    if (decision.actionGate === 'confirm_before_send') return ['unconfirmed_send'];
    return [];
}
