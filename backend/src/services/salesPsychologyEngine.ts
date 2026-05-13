export type EvidenceTier =
    | 'PRIMARY_RESEARCH'
    | 'BOOK_METHOD'
    | 'PRACTITIONER_SYSTEM'
    | 'CLINICAL_THEORY'
    | 'FIELD_REPORT'
    | 'VENDOR_RESEARCH'
    | 'ANECDOTAL'
    | 'REFERENCE_ONLY';

export type SalesMethodology =
    | 'SPIN'
    | 'NEPQ'
    | 'Raving Fans'
    | 'Sandler'
    | 'Challenger'
    | 'MEDDIC'
    | 'Motivational Interviewing'
    | 'Jungian Depth Psychology'
    | 'Consultative Selling'
    | 'Unknown';

export interface SalesScenarioInput {
    scenario: {
        sector: string;
        dealStage: string;
        channel: string;
        buyerType: string;
        relationshipWarmth: string;
        decisionStructure: string;
        stakes: string;
        constraints?: string[];
    };
    signals: {
        positive: string[];
        negative: string[];
        omissions: string[];
        emotionalTone?: string;
        buyerLanguage?: string[];
        nextStepBehavior?: string;
    };
    psychologyLayers?: string[];
    requestedTactic?: string;
}

export interface SalesInference {
    kind: 'positive_signal' | 'negative_signal' | 'omission_signal';
    label: string;
    evidence: string;
    weight: number;
}

export interface PsychologicalRead {
    layer: string;
    read: string;
    caution: string;
}

export interface SalesAnalysis {
    scores: {
        evidenceStrength: number;
        sectorFit: number;
        stageFit: number;
        positiveMomentum: number;
        omissionRisk: number;
        psychologicalLayerFit: number;
        buyerReadConfidence: number;
        downsideRisk: number;
        nextStepClarity: number;
    };
    inferences: SalesInference[];
    psychologicalRead: PsychologicalRead[];
    recommendedMove: {
        summary: string;
        stage: string;
    };
    questionOptions: string[];
    tacticLineage: SalesMethodology[];
    evidenceTier: EvidenceTier;
    ethicalRisk: {
        blocked: boolean;
        reason: string;
    };
    probability: {
        estimate: 'not_estimable';
        confidence: 'low' | 'medium';
        rationale: string;
    };
    calibrationRow: {
        outcomeToTrack: string;
        signalsToRecheck: string[];
        predictedNextObservable: string;
    };
}

const EVIDENCE_TIER_SCORES: Record<EvidenceTier, number> = {
    PRIMARY_RESEARCH: 1,
    BOOK_METHOD: 0.7,
    PRACTITIONER_SYSTEM: 0.58,
    CLINICAL_THEORY: 0.64,
    FIELD_REPORT: 0.5,
    VENDOR_RESEARCH: 0.42,
    ANECDOTAL: 0.25,
    REFERENCE_ONLY: 0.12
};

const MANIPULATION_PATTERNS = [
    /false scarcity/i,
    /pressure/i,
    /before they can think/i,
    /hide (the )?(truth|price|cost)/i,
    /exploit/i,
    /shame/i,
    /guilt/i
];

const POSITIVE_SIGNAL_PATTERNS: Array<{ label: string; pattern: RegExp; weight: number }> = [
    { label: 'praise', pattern: /prais|love|great|exactly right|aligned|perfect|impressive/i, weight: 0.18 },
    { label: 'implementation_curiosity', pattern: /implement|start|work|onboard|first|campaign|delivery|timeline/i, weight: 0.2 },
    { label: 'fast_reply', pattern: /within an hour|fast|quick|same day|replied/i, weight: 0.12 },
    { label: 'future_tense', pattern: /would|when we|if we|started|next|future/i, weight: 0.13 },
    { label: 'referral_energy', pattern: /refer|recommend|intro|introduce|champion/i, weight: 0.16 },
    { label: 'budget_openness', pattern: /budget|price|cost|investment|rate/i, weight: 0.15 }
];

const OMISSION_SIGNAL_PATTERNS: Array<{ label: string; pattern: RegExp; weight: number }> = [
    { label: 'budget_absent', pattern: /no budget|budget.*absent|missing budget/i, weight: 0.24 },
    { label: 'authority_absent', pattern: /no decision|decision-maker|authority|stakeholder/i, weight: 0.22 },
    { label: 'timeline_absent', pattern: /no timeline|timeline.*absent|no .*commitment/i, weight: 0.18 },
    { label: 'pain_ownership_absent', pattern: /no pain|pain ownership|no problem ownership/i, weight: 0.16 },
    { label: 'curiosity_absent', pattern: /no curiosity|not curious/i, weight: 0.14 },
    { label: 'emotional_reaction_absent', pattern: /no emotional reaction|flat|silence/i, weight: 0.14 }
];

export function scoreEvidenceTier(tier: EvidenceTier): number {
    return EVIDENCE_TIER_SCORES[tier] ?? EVIDENCE_TIER_SCORES.REFERENCE_ONLY;
}

export function classifySalesMethodology(text: string): SalesMethodology {
    const lowered = text.toLowerCase();
    if (lowered.includes('nepq') || lowered.includes('neuro emotional')) return 'NEPQ';
    if (lowered.includes('raving fan') || lowered.includes('customer vision')) return 'Raving Fans';
    if (lowered.includes('persona') || lowered.includes('shadow') || lowered.includes('archetype') || lowered.includes('projection')) {
        return 'Jungian Depth Psychology';
    }
    if (lowered.includes('spin') || lowered.includes('situation') && lowered.includes('implication')) return 'SPIN';
    if (lowered.includes('meddic')) return 'MEDDIC';
    if (lowered.includes('challenger')) return 'Challenger';
    if (lowered.includes('sandler')) return 'Sandler';
    if (lowered.includes('change talk') || lowered.includes('ambivalence')) return 'Motivational Interviewing';
    if (lowered.includes('consultative')) return 'Consultative Selling';
    return 'Unknown';
}

export function analyzeSalesScenario(input: SalesScenarioInput): SalesAnalysis {
    const ethicalRisk = assessEthicalRisk(input);
    const positiveInferences = inferPositiveSignals(input.signals.positive, input.signals.buyerLanguage ?? []);
    const omissionInferences = inferOmissionSignals(input.signals.omissions);
    const negativeInferences = input.signals.negative.map((signal) => ({
        kind: 'negative_signal' as const,
        label: classifyNegativeSignal(signal),
        evidence: signal,
        weight: 0.18
    }));
    const inferences = [...positiveInferences, ...omissionInferences, ...negativeInferences];
    const positiveMomentum = clamp(sumWeights(positiveInferences));
    const omissionRisk = clamp(sumWeights(omissionInferences));
    const downsideRisk = ethicalRisk.blocked ? 1 : clamp(omissionRisk * 0.65 + negativeInferences.length * 0.12);
    const psychologicalRead = buildPsychologicalRead(input);
    const tacticLineage = buildTacticLineage(input);

    return {
        scores: {
            evidenceStrength: scoreEvidenceTier('BOOK_METHOD'),
            sectorFit: 0.68,
            stageFit: input.scenario.dealStage ? 0.72 : 0.4,
            positiveMomentum,
            omissionRisk,
            psychologicalLayerFit: psychologicalRead.length > 0 ? 0.7 : 0.25,
            buyerReadConfidence: clamp(0.35 + positiveMomentum * 0.3 + Math.min(0.25, inferences.length * 0.04)),
            downsideRisk,
            nextStepClarity: omissionRisk > 0.55 ? 0.78 : 0.58
        },
        inferences,
        psychologicalRead,
        recommendedMove: ethicalRisk.blocked
            ? {
                summary: 'De-escalate and refuse manipulative pressure. Rebuild safety, clarify fit, and give the buyer room to decide.',
                stage: input.scenario.dealStage
            }
            : {
                summary: 'Confirm enthusiasm, then convert missing budget, authority, and timeline into explicit next-step criteria before pitching harder.',
                stage: input.scenario.dealStage
            },
        questionOptions: buildQuestionOptions(input, omissionInferences),
        tacticLineage,
        evidenceTier: 'BOOK_METHOD',
        ethicalRisk,
        probability: {
            estimate: 'not_estimable',
            confidence: 'low',
            rationale: 'The engine has scenario signals but no calibrated local outcome history for this buyer/context class.'
        },
        calibrationRow: {
            outcomeToTrack: 'Whether the buyer accepts a concrete next step after enthusiasm and missing decision criteria are clarified.',
            signalsToRecheck: ['budget language', 'decision authority', 'timeline commitment', 'voluntary next step'],
            predictedNextObservable: 'Buyer either names budget/authority/timeline or reveals the real blocker.'
        }
    };
}

function assessEthicalRisk(input: SalesScenarioInput): SalesAnalysis['ethicalRisk'] {
    const text = [
        input.requestedTactic ?? '',
        ...input.signals.negative,
        input.signals.emotionalTone ?? ''
    ].join(' ');
    const matched = MANIPULATION_PATTERNS.find((pattern) => pattern.test(text));
    if (!matched) return { blocked: false, reason: 'No coercive or deceptive tactic requested.' };
    return {
        blocked: true,
        reason: `Blocked because the requested move signals false scarcity, pressure, deception, shame, or vulnerability exploitation (${matched.source}).`
    };
}

function inferPositiveSignals(positive: string[], buyerLanguage: string[]): SalesInference[] {
    const sourceSignals = [...positive, ...buyerLanguage];
    return inferSignals(sourceSignals, POSITIVE_SIGNAL_PATTERNS, 'positive_signal');
}

function inferOmissionSignals(omissions: string[]): SalesInference[] {
    return inferSignals(omissions, OMISSION_SIGNAL_PATTERNS, 'omission_signal');
}

function inferSignals(
    signals: string[],
    patterns: Array<{ label: string; pattern: RegExp; weight: number }>,
    kind: SalesInference['kind']
): SalesInference[] {
    const found = new Map<string, SalesInference>();
    for (const signal of signals) {
        for (const matcher of patterns) {
            if (matcher.pattern.test(signal) && !found.has(matcher.label)) {
                found.set(matcher.label, {
                    kind,
                    label: matcher.label,
                    evidence: signal,
                    weight: matcher.weight
                });
            }
        }
    }
    return [...found.values()];
}

function classifyNegativeSignal(signal: string): string {
    if (/unsafe|scared|anxious|fear/i.test(signal)) return 'buyer_safety_concern';
    if (/expensive|price|cost/i.test(signal)) return 'price_resistance';
    if (/doubt|skeptic/i.test(signal)) return 'trust_gap';
    return 'negative_signal';
}

function buildPsychologicalRead(input: SalesScenarioInput): PsychologicalRead[] {
    const layers = input.psychologyLayers ?? [];
    const reads: PsychologicalRead[] = [];
    if (layers.includes('jungian_depth')) {
        reads.push({
            layer: 'jungian_depth',
            read: 'The buyer may be testing whether the seller can hold the guide role without collapsing into vendor pressure.',
            caution: 'Use only as a symbolic hypothesis; do not treat archetype, shadow, or projection language as diagnosis.'
        });
    }
    if (layers.includes('self_determination')) {
        reads.push({
            layer: 'self_determination',
            read: 'Protect autonomy while clarifying competence and relatedness: choice, ability to execute, and trust all matter.',
            caution: 'Infer motivational needs from behavior only; do not claim inner states as fact.'
        });
    }
    if (layers.includes('motivational_interviewing')) {
        reads.push({
            layer: 'motivational_interviewing',
            read: 'The buyer is showing change talk through future-oriented implementation questions while still withholding commitment criteria.',
            caution: 'Evoke and clarify ambivalence; do not push past resistance.'
        });
    }
    if (layers.includes('raving_fans')) {
        reads.push({
            layer: 'raving_fans',
            read: 'Praise and fit language are early fan-energy; convert it into a designed experience and concrete next step.',
            caution: 'Delight must be systematized after fit is real, not promised as vague overdelivery.'
        });
    }
    return reads;
}

function buildTacticLineage(input: SalesScenarioInput): SalesMethodology[] {
    const lineage = new Set<SalesMethodology>(['Consultative Selling']);
    const layers = input.psychologyLayers ?? [];
    const allText = [
        input.requestedTactic ?? '',
        ...input.signals.positive,
        ...input.signals.negative,
        ...input.signals.omissions,
        ...(input.signals.buyerLanguage ?? [])
    ].join(' ');

    const classified = classifySalesMethodology(allText);
    if (classified !== 'Unknown') lineage.add(classified);
    if (layers.includes('motivational_interviewing')) lineage.add('Motivational Interviewing');
    if (layers.includes('raving_fans')) lineage.add('Raving Fans');
    if (layers.includes('jungian_depth')) lineage.add('Jungian Depth Psychology');
    if (/problem|pain|implication|question/i.test(allText)) lineage.add('SPIN');
    return [...lineage];
}

function buildQuestionOptions(input: SalesScenarioInput, omissions: SalesInference[]): string[] {
    if (input.requestedTactic && assessEthicalRisk(input).blocked) {
        return [
            'What would help you feel safe enough to evaluate this without pressure?',
            'Would it be better to pause, reduce scope, or revisit this when the timing is healthier?'
        ];
    }

    const questions = [
        'It sounds like the fit is real. What budget range would make this decision practical on your side?',
        'Who else needs to be involved before this becomes a yes or no?',
        'If this starts with one campaign, what date would make the first delivery useful?'
    ];

    if (!omissions.some((item) => item.label === 'budget_absent')) {
        questions[0] = 'What would need to be true for the investment to feel clearly justified?';
    }
    return questions;
}

function sumWeights(items: Array<{ weight: number }>): number {
    return items.reduce((sum, item) => sum + item.weight, 0);
}

function clamp(value: number): number {
    return Math.max(0, Math.min(1, Number(value.toFixed(3))));
}
