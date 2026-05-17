import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import OpenAI from 'openai';

const deepseekClient = process.env.DEEPSEEK_API_KEY || process.env.CODE_DEEPSEEK_API_KEY
    ? new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY || process.env.CODE_DEEPSEEK_API_KEY || '',
        baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    })
    : null;

const DOCTRINE_HEADER = (() => {
    try {
        return readFileSync(
            join(process.cwd(), '_SYSTEM/campaigns/c2moviez-acquisition-workbench/18-profiler-prompt-header.md'),
            'utf-8'
        );
    } catch {
        return 'You are a B2B outreach profiler. Generate 3-sentence bodies, end with a direct question, max 60 words, no hedging.';
    }
})();

export type ColdLeadCountry = 'CH' | 'AT';
export type ColdLeadChannel = 'linkedin' | 'email' | 'both' | 'blocked';
export type ColdLeadStatus = 'intake' | 'enriched' | 'scored' | 'needs_review' | 'ready' | 'pushed' | 'sent' | 'replied';
export type ColdLeadCrmStage = 'new' | 'needs_review' | 'ready' | 'sent' | 'replied' | 'qualified' | 'blocked';
export type ColdLeadSource = 'zefix' | 'wko' | 'firmenabc' | 'linkedin' | 'manual';
export type ColdLeadLegalBasis = 'public_register' | 'website_published_email' | 'linkedin_platform';

export interface ColdLeadCompany {
    name: string;
    country: ColdLeadCountry;
    canton_or_bezirk?: string;
    postal_code?: string;
    city?: string;
    uid_or_fn?: string;
    legal_form?: string;
    date_of_entry?: string;
    employee_count?: number | null;
    industry?: string;
    website?: string;
    linkedin_url?: string;
}

export interface ColdLeadContact {
    name?: string;
    title?: string;
    email?: string | null;
    linkedin_url?: string;
}

export interface ColdLeadEvidence {
    kind:
        | 'zefix_bulk'
        | 'zefix_purpose'
        | 'wko_directory'
        | 'firmenabc_directory'
        | 'website_check'
        | 'website_about'
        | 'website_about_page'
        | 'website_team'
        | 'website_tech_signal'
        | 'website_news';
    label: string;
    detail: string;
    url?: string;
    captured_at?: string;
}

export interface ColdLeadScoringSignals {
    websiteHasEnglish?: boolean;
    linkedinCompanyEnglish?: boolean;
    decisionMakerEnglish?: boolean;
    dotComTld?: boolean;
    internationalSignal?: boolean;
    highFitIndustry?: boolean;
}

export interface ColdLeadComplianceInput {
    source: ColdLeadSource;
    source_url: string;
    source_timestamp: string;
    legal_basis: ColdLeadLegalBasis;
}

export interface ColdLeadInput {
    company: ColdLeadCompany;
    contact?: ColdLeadContact;
    scoringSignals?: ColdLeadScoringSignals;
    evidence?: ColdLeadEvidence[];
    compliance: ColdLeadComplianceInput;
    notes?: string;
}

export interface ColdLeadScoring {
    english_score: number;
    size_score: number;
    industry_fit_score: number;
    recency_score: number;
    evidence_score: number;
    personalization_score: number;
    total_score: number;
}

export interface ColdLeadComplianceRecord extends ColdLeadComplianceInput {
    email_allowed: boolean;
    email_block_reason: string | null;
    legal_review_required: boolean;
    compliance_badge: 'ok' | 'review' | 'blocked';
    guardrail_notes: string[];
}

export interface CompiledCompanyProfile {
    company_name: string;
    contact_name: string;
    contact_role: string;
    market: string;
    website: string;
    primary_source_url: string;
    best_surface: string;
    what_we_noticed: string;
    why_it_might_matter: string;
    c2moviez_relevance: string;
    safe_opening_angle: string;
    subject_line: string;
    cold_outreach_body: string;
    linkedin_body: string;
    claims_to_avoid: string[];
    evidence_confidence: 'high' | 'medium' | 'low';
}

export interface ColdLeadDrafts {
    linkedin_intro: string;
    linkedin_followup: string;
    email_cold: string | null;
    email_followup: string | null;
}

export interface ColdLeadDedupe {
    key: string;
    primary_domain: string | null;
    is_duplicate: boolean;
    duplicate_of: string | null;
    matched_on: 'uid_or_fn' | 'domain' | 'none';
}

export type ColdLeadDraftReadiness = 'ready_to_rework' | 'draft_review' | 'needs_research' | 'needs_rework' | 'blocked';
export type SourceConfidenceLevel = 'high' | 'medium' | 'low';
export type DraftFlag =
    | 'unrelated_claim'
    | 'generic_language'
    | 'fake_familiarity'
    | 'ai_spam_tone'
    | 'inflated_promise'
    | 'diagnosis_heavy';

export interface SourceConfidence {
    score: number;
    level: SourceConfidenceLevel;
    signals: string[];
}

export interface DraftEvaluationResult {
    passed: boolean;
    flags: DraftFlag[];
}

export interface ColdLeadOutreachProfile extends CompiledCompanyProfile {
    observed_signal: string;
    why_it_might_matter: string;
    opening_angle: string;
    source_urls: string[];
    do_not_claim: string[];
    confidence: 'low' | 'medium' | 'high';
}

export interface ColdLeadDraftVersion {
    id: string;
    draft_type: keyof ColdLeadDrafts;
    text: string;
    source: 'generated' | 'fanny_edit';
    created_at: string;
}

export interface ColdLeadDraftSpecificity {
    valid: boolean;
    proof_chips: string[];
    missing: string[];
    warnings: string[];
    readiness: ColdLeadDraftReadiness;
    profile: ColdLeadOutreachProfile;
    evaluation_flags?: DraftFlag[];
}

export interface ColdLeadRecord {
    id: string;
    company: Required<ColdLeadCompany>;
    contact: Required<ColdLeadContact>;
    scoring: ColdLeadScoring;
    scoringSignals: ColdLeadScoringSignals;
    evidence: ColdLeadEvidence[];
    compliance: ColdLeadComplianceRecord;
    channel: ColdLeadChannel;
    status: ColdLeadStatus;
    priority_flag: boolean;
    outreach_drafts: ColdLeadDrafts;
    draft_versions: ColdLeadDraftVersion[];
    draft_specificity: ColdLeadDraftSpecificity;
    dedupe: ColdLeadDedupe;
    notes: string;
    webhook_lead_id: string | null;
    webhook_status: string | null;
    webhook_response: unknown | null;
    reply_text: string | null;
    crm_stage: ColdLeadCrmStage;
    owner_user_id: string | null;
    last_touch_at: string | null;
    next_follow_up_at: string | null;
    fanny_notes: string;
    source_batch?: string | null;
    created_at: string;
    updated_at: string;
}

type DraftsWithCompiledProfile = ColdLeadDrafts & {
    __compiledProfile?: CompiledCompanyProfile;
};

export interface ColdAcquisitionDashboard {
    total_leads: number;
    weekly_quota: {
        target: number;
        pushed: number;
        remaining: number;
    };
    market_split: Record<ColdLeadCountry, number>;
    score_distribution: {
        priority: number;
        qualified: number;
        nurture: number;
        blocked: number;
    };
    pipeline_counts: Record<ColdLeadStatus, number>;
    compliance_warnings: Array<{ lead_id: string; company: string; message: string }>;
    webhook_health: {
        configured: boolean;
        last_status: string | null;
        last_pushed_at: string | null;
    };
}

export interface PushReadyBatchOptions {
    dryRun?: boolean;
    limit?: number;
    webhookUrl?: string;
    apiKey?: string;
}

export interface ZefixBulkRecord {
    name: string;
    uid?: string;
    status?: string;
    legal_form?: string;
    canton?: string;
    city?: string;
    postal_code?: string;
    date_of_entry?: string;
    employee_count?: number;
    industry?: string;
    website?: string;
    linkedin_url?: string;
    contact_name?: string;
    contact_title?: string;
    contact_email?: string;
    contact_linkedin_url?: string;
    source_url: string;
    purpose?: string;
}

export interface AustriaDirectoryRecord {
    source: 'wko' | 'firmenabc';
    name: string;
    fn?: string;
    bezirk?: string;
    postal_code?: string;
    city?: string;
    legal_form?: string;
    date_of_entry?: string;
    employee_count?: number;
    industry?: string;
    website?: string;
    linkedin_url?: string;
    contact_name?: string;
    contact_title?: string;
    contact_email?: string;
    contact_linkedin_url?: string;
    source_url: string;
    published_b2b_email?: boolean;
    evidence_detail?: string;
}

export interface IngestResult {
    created: number;
    skipped: number;
    errors: Array<{ name?: string; reason: string }>;
    lead_ids: string[];
}

type ColdLeadRow = {
    id: string;
    company_json: string;
    contact_json: string;
    scoring_json: string;
    scoring_signals_json: string;
    evidence_json: string;
    compliance_json: string;
    channel: ColdLeadChannel;
    status: ColdLeadStatus;
    priority_flag: number;
    outreach_drafts_json: string;
    draft_versions_json: string | null;
    draft_specificity_json: string;
    dedupe_json: string;
    notes: string | null;
    webhook_lead_id: string | null;
    webhook_status: string | null;
    webhook_response_json: string | null;
    reply_text: string | null;
    crm_stage: ColdLeadCrmStage | null;
    owner_user_id: string | null;
    last_touch_at: string | null;
    next_follow_up_at: string | null;
    fanny_notes: string | null;
    uid_or_fn: string | null;
    primary_domain: string | null;
    source_batch?: string | null;
    created_at: string;
    updated_at: string;
};

const WEEKLY_TARGET = 20;
const ACTIVE_CUSTOMER_NAMES = [
    'PDR Tech',
    'Boviro Security AG',
    'Carosserie RIBO GmbH',
    'Med For Balance GmbH',
    'ALPHAVIVO AG',
    'GRYD SWISS',
    'SHIPSTER AG',
    'NOBA Shop',
    'Kappiserie GmbH',
    'SLTECH GmbH',
    'Isorol Tacker AG',
    'Power2Sales',
    'OREA CARE',
    'GANZ BOATS AG',
    'Gianluca Giardino GmbH',
    'BBA Baumaschinen AG',
    'UPGREAT AG',
    'ALPEAHOMES',
    'Balas Pflasterungen GmbH'
];

export function computeSourceConfidence(lead: Pick<ColdLeadRecord, 'company' | 'contact' | 'evidence' | 'compliance'>): SourceConfidence {
    const signals: string[] = [];
    let score = 0;
    const source = String(lead.compliance.source || '').toLowerCase();
    const sourceUrl = String(lead.compliance.source_url || '').toLowerCase();

    if (source === 'zefix' || sourceUrl.includes('zefix')) {
        score += 0.35;
        signals.push('Zefix source');
    } else if (source === 'wko' || sourceUrl.includes('wko.at') || sourceUrl.includes('firmen.wko')) {
        score += 0.25;
        signals.push('WKO source');
    } else if (source === 'firmenabc' || sourceUrl.includes('firmenabc')) {
        score += 0.15;
        signals.push('Directory source');
    } else {
        score += 0.05;
        signals.push('Unknown source type');
    }

    const evidenceCount = lead.evidence.length;
    signals.push(`${evidenceCount} evidence ${evidenceCount === 1 ? 'item' : 'items'}`);
    if (evidenceCount > 3) {
        score += 0.2;
        signals.push('More than 3 evidence items');
    }

    const uniqueEvidenceKinds = new Set(lead.evidence.map((item) => item.kind).filter(Boolean));
    if (uniqueEvidenceKinds.size > 1) {
        const diversityScore = (uniqueEvidenceKinds.size - 1) * 0.1;
        score += diversityScore;
        signals.push(`${uniqueEvidenceKinds.size} evidence types`);
    }

    if (lead.contact.linkedin_url || lead.company.linkedin_url) {
        score += 0.15;
        signals.push('LinkedIn URL present');
    } else {
        signals.push('No LinkedIn URL');
    }

    if (lead.contact.email && lead.compliance.legal_basis === 'website_published_email') {
        score += 0.2;
        signals.push('Public email basis');
    } else {
        signals.push('No public email basis');
    }

    if (lead.company.website) {
        score += 0.1;
        signals.push('Website captured');
    } else {
        signals.push('No website captured');
    }

    const normalized = Math.max(0, Math.min(1, Number(score.toFixed(2))));
    const level: SourceConfidenceLevel = normalized >= 0.75 ? 'high' : normalized >= 0.4 ? 'medium' : 'low';
    return { score: normalized, level, signals };
}

export function evaluateDraftQuality(draft: string, lead: ColdLeadRecord): DraftEvaluationResult {
    const flags = new Set<DraftFlag>();
    const draftText = String(draft || '');
    const normalizedDraft = normalizeText(draftText);
    const dossierText = normalizeText([
        lead.company.name,
        lead.company.country,
        lead.company.canton_or_bezirk,
        lead.company.postal_code,
        lead.company.city,
        lead.company.uid_or_fn,
        lead.company.legal_form,
        lead.company.date_of_entry,
        lead.company.industry,
        lead.company.website,
        lead.company.linkedin_url,
        lead.contact.name,
        lead.contact.title,
        lead.contact.email || '',
        lead.contact.linkedin_url,
        ...lead.evidence.flatMap((item) => [item.kind, item.label, item.detail, item.url || ''])
    ].join(' '));

    const companyOrContactMentioned = [
        lead.company.name,
        companyNameWithoutLegalSuffix(lead.company.name),
        lead.contact.name,
        lead.contact.name?.split(/\s+/)[0] || ''
    ].some((candidate) => includesNormalized(normalizedDraft, candidate));
    if (!companyOrContactMentioned) flags.add('generic_language');

    if (/\b(i['’]?ve been following|i['’]?ve been watching|huge fan|love your work|i['’]?ve admired)\b/i.test(draftText) && !lead.contact.linkedin_url) {
        flags.add('fake_familiarity');
    }

    if (/\b(game-changer|revolutionize|disrupting|cutting-edge|seamlessly|unlock your potential|skyrocket)\b/i.test(draftText)
        || /\btake your [a-z0-9 -]+ to the next level\b/i.test(draftText)) {
        flags.add('ai_spam_tone');
    }

    if (/\b(guaranteed|100%|proven results|transform your business|double your revenue)\b/i.test(draftText)) {
        flags.add('inflated_promise');
    }

    const diagnosisMatch = draftText.match(/\b(struggling with|pain point|i know you(?:'|’)?re facing|challenge you(?:'|’)?re dealing with)\s+([^.!?\n]+)/i);
    if (diagnosisMatch) {
        const topic = normalizeText(diagnosisMatch[2] || '');
        const topicTokens = topic.split(' ').filter((token) => token.length > 3);
        if (!topicTokens.length || !topicTokens.some((token) => dossierText.includes(token))) {
            flags.add('diagnosis_heavy');
        }
    }

    const unsupportedTerms = specificClaimTerms(draftText)
        .filter((term) => !dossierText.includes(normalizeText(term)));
    if (unsupportedTerms.length > 0) flags.add('unrelated_claim');

    const criticalFlags: DraftFlag[] = ['generic_language', 'fake_familiarity', 'ai_spam_tone'];
    const hasCriticalFlag = criticalFlags.some((flag) => flags.has(flag));
    const nonCriticalCount = Array.from(flags).filter((flag) => !criticalFlags.includes(flag)).length;
    return {
        passed: !hasCriticalFlag && nonCriticalCount < 2,
        flags: Array.from(flags)
    };
}

function normalizeText(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function includesNormalized(haystack: string, needle: string) {
    const normalizedNeedle = normalizeText(needle);
    return Boolean(normalizedNeedle && haystack.includes(normalizedNeedle));
}

function companyNameWithoutLegalSuffix(name: string) {
    return name
        .replace(/\b(AG|GmbH|Sarl|SARL|SA|Ltd\.?|Limited|Inc\.?)\b\.?/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function specificClaimTerms(draft: string) {
    const terms = new Set<string>();
    const patterns = [
        /\b(AI|CRM|ERP|Shopify|Salesforce|HubSpot|React|Kubernetes|AWS|Google Ads|retargeting)\b/gi,
        /\b(ROI|conversion|pipeline|revenue|traffic)\b/gi,
        /\b\d+(?:\.\d+)?%\b/g
    ];
    for (const pattern of patterns) {
        for (const match of draft.matchAll(pattern)) {
            terms.add(match[0]);
        }
    }
    return Array.from(terms);
}

export class ColdAcquisitionService {
    private db: Database.Database;
    private now: () => Date;

    constructor(db: Database.Database, options: { now?: () => Date } = {}) {
        this.db = db;
        this.now = options.now || (() => new Date());
        this.ensureSchema();
    }

    async createLead(input: ColdLeadInput): Promise<ColdLeadRecord> {
        const timestamp = this.nowIso();
        const company = this.normalizeCompany(input.company);
        const contact = this.normalizeContact(input.contact);
        const evidence = (input.evidence || []).map((item) => ({
            ...item,
            captured_at: item.captured_at || timestamp
        }));
        const scoringSignals = this.deriveScoringSignals(company, input.scoringSignals || {});
        const scoring = this.calculateScores(company, contact, evidence, scoringSignals);
        const dedupe = this.buildDedupe(company, contact);
        const compliance = this.evaluateCompliance(company, contact, input.compliance);
        const channel = this.resolveChannel(company, contact, compliance);
        const outreach_drafts = await this.generateDrafts(company, contact, evidence, channel, compliance, computeSourceConfidence({
            company,
            contact,
            evidence,
            compliance
        }).level);
        const profile = this.buildOutreachProfile(company, contact, evidence, (outreach_drafts as DraftsWithCompiledProfile).__compiledProfile);
        const draft_specificity = this.validateDraftSpecificity(outreach_drafts, company, contact, evidence, profile, channel);
        const status = this.initialStatus(scoring, dedupe, draft_specificity, channel);
        const crm_stage = this.initialCrmStage(status, scoring, channel, compliance);
        const priority_flag = scoring.total_score >= 90;
        const notes = this.decorateNotes(input.notes || '', priority_flag, compliance, dedupe);

        const record: ColdLeadRecord = {
            id: this.createId(),
            company,
            contact,
            scoring,
            scoringSignals,
            evidence,
            compliance,
            channel,
            status,
            priority_flag,
            outreach_drafts,
            draft_versions: this.initialDraftVersions(outreach_drafts, timestamp),
            draft_specificity,
            dedupe,
            notes,
            webhook_lead_id: null,
            webhook_status: null,
            webhook_response: null,
            reply_text: null,
            crm_stage,
            owner_user_id: null,
            last_touch_at: null,
            next_follow_up_at: null,
            fanny_notes: '',
            source_batch: null,
            created_at: timestamp,
            updated_at: timestamp
        };

        this.insertRecord(record);
        return record;
    }

    async ingestZefixBulk(records: ZefixBulkRecord[]): Promise<IngestResult> {
        const result: IngestResult = { created: 0, skipped: 0, errors: [], lead_ids: [] };
        const acceptedRecords: Array<{
            record: ZefixBulkRecord;
            sourceUrlIndex: number;
            websiteIndex: number;
        }> = [];
        const urls: Array<string | null | undefined> = [];

        for (const record of records || []) {
            const legalForm = String(record.legal_form || '').toLowerCase();
            const companyName = String(record.name || '');
            const active = (!record.status || String(record.status).toUpperCase() === 'ACTIVE')
                && !/\bin liquidation\b|en liquidation|in liquidazione/i.test(companyName);
            const acceptedLegalForm = /(^|\b)(ag|gmbh)(\b|$)|aktiengesellschaft|soci[eé]t[eé] anonyme|societ[aà] anonima|gesellschaft mit beschr[aä]nkter haftung/i.test(legalForm);
            if (!active || !acceptedLegalForm) {
                result.skipped += 1;
                continue;
            }

            acceptedRecords.push({
                record,
                sourceUrlIndex: urls.length,
                websiteIndex: urls.length + 1
            });
            urls.push(record.source_url, record.website);
        }

        const urlLiveStatuses = this.checkUrlsLiveSync(urls);

        for (const entry of acceptedRecords) {
            const record = entry.record;
            const sourceUrlLive = urlLiveStatuses[entry.sourceUrlIndex];
            const websiteLive = urlLiveStatuses[entry.websiteIndex];
            const website = websiteLive ? record.website : undefined;
            const sourceUrl = sourceUrlLive ? record.source_url : 'unavailable';

            try {
                const lead = await this.createLead({
                    company: {
                        name: record.name,
                        country: 'CH',
                        canton_or_bezirk: record.canton || '',
                        postal_code: record.postal_code || '',
                        city: record.city || '',
                        uid_or_fn: record.uid || '',
                        legal_form: record.legal_form || '',
                        date_of_entry: record.date_of_entry || '',
                        employee_count: record.employee_count || null,
                        industry: record.industry || this.inferIndustry(record.purpose || ''),
                        website,
                        linkedin_url: record.linkedin_url || ''
                    },
                    contact: {
                        name: record.contact_name || '',
                        title: record.contact_title || '',
                        email: record.contact_email || null,
                        linkedin_url: record.contact_linkedin_url || ''
                    },
                    scoringSignals: {
                        websiteHasEnglish: websiteLive ? this.hasEnglishUrl(record.website) : false,
                        linkedinCompanyEnglish: Boolean(record.linkedin_url),
                        decisionMakerEnglish: Boolean(record.contact_name || record.contact_linkedin_url),
                        dotComTld: websiteLive ? this.domainFromUrl(record.website)?.endsWith('.com') || false : false,
                        highFitIndustry: this.highFitIndustry(record.industry || record.purpose || '')
                    },
                    evidence: [
                        {
                            kind: 'zefix_bulk',
                            label: 'Zefix open-data record',
                            detail: record.purpose || `${record.name} — registered ${record.legal_form || 'company'}${record.date_of_entry ? ', since ' + record.date_of_entry.slice(0, 4) : ''}.`,
                            url: sourceUrlLive ? record.source_url : undefined
                        }
                    ],
                    compliance: {
                        source: 'zefix',
                        source_url: sourceUrl,
                        source_timestamp: this.nowIso(),
                        legal_basis: 'public_register'
                    },
                    notes: 'Imported from Zefix-style open-data bulk.'
                });
                result.created += 1;
                result.lead_ids.push(lead.id);
            } catch (error: any) {
                result.errors.push({ name: record.name, reason: error?.message || 'ZEFFIX_INGEST_ERROR' });
            }
        }

        return result;
    }

    async ingestAustriaDirectory(records: AustriaDirectoryRecord[]): Promise<IngestResult> {
        const result: IngestResult = { created: 0, skipped: 0, errors: [], lead_ids: [] };
        const acceptedRecords: Array<{
            record: AustriaDirectoryRecord;
            sourceUrlIndex: number;
            websiteIndex: number;
            district: string;
        }> = [];
        const urls: Array<string | null | undefined> = [];

        for (const record of records || []) {
            const district = record.postal_code || record.bezirk || '';
            if (!['1220', '1160'].includes(district)) {
                result.skipped += 1;
                continue;
            }

            acceptedRecords.push({
                record,
                sourceUrlIndex: urls.length,
                websiteIndex: urls.length + 1,
                district
            });
            urls.push(record.source_url, record.website);
        }

        const urlLiveStatuses = this.checkUrlsLiveSync(urls);

        for (const entry of acceptedRecords) {
            const record = entry.record;
            const sourceUrlLive = urlLiveStatuses[entry.sourceUrlIndex];
            const websiteLive = urlLiveStatuses[entry.websiteIndex];
            const website = websiteLive ? record.website : undefined;
            const sourceUrl = sourceUrlLive ? record.source_url : 'unavailable';

            try {
                const lead = await this.createLead({
                    company: {
                        name: record.name,
                        country: 'AT',
                        canton_or_bezirk: record.bezirk || record.postal_code || '',
                        postal_code: record.postal_code || record.bezirk || '',
                        city: record.city || 'Wien',
                        uid_or_fn: record.fn || '',
                        legal_form: record.legal_form || '',
                        date_of_entry: record.date_of_entry || '',
                        employee_count: record.employee_count || null,
                        industry: record.industry || '',
                        website,
                        linkedin_url: record.linkedin_url || ''
                    },
                    contact: {
                        name: record.contact_name || '',
                        title: record.contact_title || '',
                        email: record.contact_email || null,
                        linkedin_url: record.contact_linkedin_url || ''
                    },
                    scoringSignals: {
                        websiteHasEnglish: websiteLive ? this.hasEnglishUrl(record.website) : false,
                        linkedinCompanyEnglish: Boolean(record.linkedin_url),
                        decisionMakerEnglish: Boolean(record.contact_name || record.contact_linkedin_url),
                        dotComTld: websiteLive ? this.domainFromUrl(record.website)?.endsWith('.com') || false : false,
                        highFitIndustry: this.highFitIndustry(record.industry || record.evidence_detail || '')
                    },
                    evidence: [
                        {
                            kind: `${record.source}_directory`,
                            label: `${record.source.toUpperCase()} directory record`,
                            detail: record.evidence_detail || `${record.name} — WKO directory listing.`,
                            url: sourceUrlLive ? record.source_url : undefined
                        }
                    ],
                    compliance: {
                        source: record.source,
                        source_url: sourceUrl,
                        source_timestamp: this.nowIso(),
                        legal_basis: record.published_b2b_email ? 'website_published_email' : 'linkedin_platform'
                    },
                    notes: `Imported from ${record.source.toUpperCase()}-style directory source.`
                });
                result.created += 1;
                result.lead_ids.push(lead.id);
            } catch (error: any) {
                result.errors.push({ name: record.name, reason: error?.message || 'AT_DIRECTORY_INGEST_ERROR' });
            }
        }

        return result;
    }

    listLeads(filters: { status?: ColdLeadStatus; country?: ColdLeadCountry; q?: string } = {}): ColdLeadRecord[] {
        const rows = this.db.prepare('SELECT * FROM cold_acquisition_leads ORDER BY updated_at DESC').all() as ColdLeadRow[];
        const q = (filters.q || '').trim().toLowerCase();

        return rows
            .map((row) => this.rowToRecord(row))
            .filter((lead) => !filters.status || lead.status === filters.status)
            .filter((lead) => !filters.country || lead.company.country === filters.country)
            .filter((lead) => {
                if (!q) return true;
                return [
                    lead.company.name,
                    lead.company.city,
                    lead.company.industry,
                    lead.contact.name,
                    lead.contact.title,
                    lead.notes
                ].join(' ').toLowerCase().includes(q);
            });
    }

    getLead(id: string): ColdLeadRecord | null {
        const row = this.db.prepare('SELECT * FROM cold_acquisition_leads WHERE id = ?').get(id) as ColdLeadRow | undefined;
        return row ? this.rowToRecord(row) : null;
    }

    updateLead(
        id: string,
        patch: Partial<Pick<
            ColdLeadRecord,
            | 'status'
            | 'notes'
            | 'outreach_drafts'
            | 'channel'
            | 'reply_text'
            | 'crm_stage'
            | 'owner_user_id'
            | 'last_touch_at'
            | 'next_follow_up_at'
            | 'fanny_notes'
        >> & {
            draft_specificity?: ColdLeadDraftSpecificity;
        }
    ): ColdLeadRecord {
        const current = this.requireLead(id);
        const status = patch.status || current.status;
        const next: ColdLeadRecord = {
            ...current,
            status,
            notes: patch.notes ?? current.notes,
            channel: patch.channel || current.channel,
            reply_text: patch.reply_text ?? current.reply_text,
            crm_stage: patch.crm_stage || this.crmStageForStatus(status, current.crm_stage),
            owner_user_id: patch.owner_user_id ?? current.owner_user_id,
            last_touch_at: patch.last_touch_at ?? current.last_touch_at,
            next_follow_up_at: patch.next_follow_up_at === undefined ? current.next_follow_up_at : patch.next_follow_up_at,
            fanny_notes: patch.fanny_notes ?? current.fanny_notes,
            outreach_drafts: patch.outreach_drafts || current.outreach_drafts,
            draft_versions: patch.outreach_drafts
                ? this.appendDraftVersions(current.draft_versions, current.outreach_drafts, patch.outreach_drafts, this.nowIso())
                : current.draft_versions,
            updated_at: this.nowIso()
        };
        next.draft_specificity = patch.draft_specificity
            || this.validateDraftSpecificity(next.outreach_drafts, next.company, next.contact, next.evidence, undefined, next.channel);
        if ((patch.status === 'sent' || patch.crm_stage === 'sent') && current.status !== 'sent') {
            this.assertCanMarkSent({ ...next, status: current.status, crm_stage: current.crm_stage });
        }
        this.replaceRecord(next);
        return next;
    }

    getSendBlockers(lead: ColdLeadRecord): string[] {
        const blockers: string[] = [];
        if (lead.crm_stage !== 'ready') blockers.push('stage_not_ready');
        if (lead.compliance.compliance_badge !== 'ok') blockers.push('compliance_not_cleared');
        if (lead.channel === 'blocked') blockers.push('channel_blocked');
        if (lead.dedupe.is_duplicate) blockers.push('duplicate_candidate');
        if (!lead.draft_specificity.valid || lead.draft_specificity.readiness !== 'ready_to_rework') blockers.push('draft_not_ready');
        if (!this.hasUsableDraftForChannel(lead)) blockers.push('draft_missing');
        return blockers;
    }

    markReady(id: string): ColdLeadRecord {
        const lead = this.requireLead(id);
        const errors = this.readinessErrors(lead);
        if (errors.length > 0) {
            const next = this.updateLead(id, {
                status: 'needs_review',
                notes: this.appendNote(lead.notes, `Readiness blocked: ${errors.join(', ')}`)
            });
            return next;
        }

        return this.updateLead(id, { status: 'ready' });
    }

    async pushReadyBatch(options: PushReadyBatchOptions = {}) {
        const limit = Math.min(Math.max(options.limit || 20, 1), 50);
        const ready = this.listLeads({ status: 'ready' })
            .filter((lead) => lead.scoring.total_score >= 60)
            .slice(0, limit);

        const results = [];
        for (const lead of ready) {
            if (options.dryRun) {
                results.push({
                    lead_id: lead.id,
                    company: lead.company.name,
                    status: 'dry_run',
                    payload: this.buildWebhookPayload(lead)
                });
                continue;
            }

            results.push(await this.pushLead(lead, options));
        }

        return {
            requested: limit,
            pushed: results.filter((result: any) => ['dry_run', 'queued', 'duplicate'].includes(result.status)).length,
            results
        };
    }

    recordReply(id: string, replyText: string): ColdLeadRecord {
        const lead = this.requireLead(id);
        const next: ColdLeadRecord = {
            ...lead,
            status: 'replied',
            reply_text: replyText,
            crm_stage: 'replied',
            last_touch_at: this.nowIso(),
            updated_at: this.nowIso()
        };
        this.replaceRecord(next);
        return next;
    }

    buildWebhookPayload(lead: ColdLeadRecord) {
        return {
            company: {
                name: lead.company.name,
                country: lead.company.country,
                canton_or_bezirk: lead.company.canton_or_bezirk,
                postal_code: lead.company.postal_code,
                city: lead.company.city,
                uid_or_fn: lead.company.uid_or_fn,
                legal_form: lead.company.legal_form,
                date_of_entry: lead.company.date_of_entry,
                employee_count: lead.company.employee_count,
                industry: lead.company.industry,
                website: lead.company.website,
                linkedin_url: lead.company.linkedin_url
            },
            contact: {
                name: lead.contact.name,
                title: lead.contact.title,
                email: lead.compliance.email_allowed ? lead.contact.email : null,
                linkedin_url: lead.contact.linkedin_url
            },
            scoring: lead.scoring,
            channel: lead.channel === 'blocked' ? 'linkedin' : lead.channel,
            priority: lead.priority_flag,
            outreach_drafts: lead.outreach_drafts,
            compliance: {
                source: lead.compliance.source,
                source_url: lead.compliance.source_url,
                source_timestamp: lead.compliance.source_timestamp,
                legal_basis: lead.compliance.legal_basis
            },
            notes: lead.notes
        };
    }

    getDashboard(): ColdAcquisitionDashboard {
        const leads = this.listLeads();
        const pipeline_counts = this.emptyPipelineCounts();
        let lastPushedAt: string | null = null;
        let lastStatus: string | null = null;

        for (const lead of leads) {
            pipeline_counts[lead.status] += 1;
            if (lead.webhook_status && (!lastPushedAt || lead.updated_at > lastPushedAt)) {
                lastPushedAt = lead.updated_at;
                lastStatus = lead.webhook_status;
            }
        }

        const pushedThisWeek = leads.filter((lead) => {
            return ['pushed', 'sent', 'replied'].includes(lead.status) && this.isCurrentWeek(lead.updated_at);
        }).length;

        const compliance_warnings = leads.flatMap((lead) => {
            const warnings = [];
            if (lead.compliance.compliance_badge !== 'ok') {
                warnings.push({
                    lead_id: lead.id,
                    company: lead.company.name,
                    message: lead.compliance.guardrail_notes.join(' ') || 'Compliance review required.'
                });
            }
            if (lead.dedupe.is_duplicate) {
                warnings.push({
                    lead_id: lead.id,
                    company: lead.company.name,
                    message: `Duplicate candidate matched on ${lead.dedupe.matched_on}.`
                });
            }
            return warnings;
        });

        return {
            total_leads: leads.length,
            weekly_quota: {
                target: WEEKLY_TARGET,
                pushed: pushedThisWeek,
                remaining: Math.max(0, WEEKLY_TARGET - pushedThisWeek)
            },
            market_split: {
                CH: leads.filter((lead) => lead.company.country === 'CH').length,
                AT: leads.filter((lead) => lead.company.country === 'AT').length
            },
            score_distribution: {
                priority: leads.filter((lead) => lead.scoring.total_score >= 90).length,
                qualified: leads.filter((lead) => lead.scoring.total_score >= 60 && lead.scoring.total_score < 90).length,
                nurture: leads.filter((lead) => lead.scoring.total_score > 0 && lead.scoring.total_score < 60).length,
                blocked: leads.filter((lead) => lead.channel === 'blocked' || lead.dedupe.is_duplicate).length
            },
            pipeline_counts,
            compliance_warnings,
            webhook_health: {
                configured: Boolean(process.env.C2MOVIEZ_LEAD_WEBHOOK_URL && process.env.C2MOVIEZ_LEAD_API_KEY),
                last_status: lastStatus,
                last_pushed_at: lastPushedAt
            }
        };
    }

    private calculateScores(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[],
        signals: ColdLeadScoringSignals
    ): ColdLeadScoring {
        const englishRaw =
            (signals.websiteHasEnglish ? 40 : 0)
            + (signals.linkedinCompanyEnglish ? 30 : 0)
            + (signals.decisionMakerEnglish ? 20 : 0)
            + (signals.dotComTld ? 10 : 0)
            + (signals.internationalSignal ? 15 : 0)
            + (signals.highFitIndustry ? 10 : 0);

        const english_score = Math.min(100, englishRaw);
        const size_score = this.sizeScore(company.employee_count || 0);
        const industry_fit_score = this.industryFitScore(company.industry);
        const recency_score = this.recencyScore(company.date_of_entry);
        const evidence_score = this.evidenceScore(evidence, company);
        const personalization_score = this.personalizationScore(company, contact);
        const rawTotal = Math.round(
            english_score * 0.3
            + size_score * 0.15
            + industry_fit_score * 0.2
            + recency_score * 0.1
            + evidence_score * 0.15
            + personalization_score * 0.1
        );
        const total_score = this.hasThinEvidence(evidence, company) ? Math.min(40, rawTotal) : rawTotal;

        return { english_score, size_score, industry_fit_score, recency_score, evidence_score, personalization_score, total_score };
    }

    private evaluateCompliance(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        compliance: ColdLeadComplianceInput
    ): ColdLeadComplianceRecord {
        const guardrail_notes: string[] = [];
        let email_allowed = false;
        let email_block_reason: string | null = null;
        let legal_review_required = false;

        if (!compliance.source_url || !compliance.source_timestamp) {
            guardrail_notes.push('Missing source URL or source timestamp.');
        }

        if (company.country === 'CH') {
            legal_review_required = true;
            guardrail_notes.push('CH outreach must remain individualized and include sender identity plus opt-out language.');
            email_allowed = Boolean(contact.email && ['public_register', 'website_published_email'].includes(compliance.legal_basis));
            if (contact.email && !email_allowed) email_block_reason = 'CH_EMAIL_REQUIRES_PUBLIC_BUSINESS_CONTEXT';
        }

        if (company.country === 'AT') {
            const inTargetDistrict = ['1220', '1160'].includes(company.postal_code) || ['1220', '1160'].includes(company.canton_or_bezirk);
            if (!inTargetDistrict) {
                guardrail_notes.push('Outside primary target area.');
            }
            email_allowed = Boolean(contact.email && compliance.legal_basis === 'website_published_email');
            if (contact.email && !email_allowed) {
                email_block_reason = 'AT_EMAIL_REQUIRES_WEBSITE_PUBLISHED_B2B_INQUIRY';
                guardrail_notes.push('AT email blocked unless documented as published B2B inquiry route under TKG 2021 §174.');
            }
        }

        const compliance_badge = guardrail_notes.some((note) => note.includes('blocked') || note.includes('outside'))
            ? 'blocked'
            : legal_review_required
                ? 'review'
                : 'ok';

        return {
            ...compliance,
            email_allowed,
            email_block_reason,
            legal_review_required,
            compliance_badge,
            guardrail_notes
        };
    }

    private resolveChannel(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        compliance: ColdLeadComplianceRecord
    ): ColdLeadChannel {
        if (company.country === 'AT' && !['1220', '1160'].includes(company.postal_code) && !['1220', '1160'].includes(company.canton_or_bezirk)) {
            return 'blocked';
        }

        const linkedin = Boolean(contact.linkedin_url || company.linkedin_url);
        const email = Boolean(contact.email && compliance.email_allowed);
        if (linkedin && email) return 'both';
        if (linkedin) return 'linkedin';
        if (email) return 'email';
        return 'blocked';
    }

    private async generateDrafts(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[],
        channel: ColdLeadChannel,
        compliance: ColdLeadComplianceRecord,
        confidence: 'high' | 'medium' | 'low'
    ): Promise<ColdLeadDrafts> {
        const compiled = await this.compileCompanyProfile(company, contact, evidence, confidence);
        const profile = this.buildOutreachProfile(company, contact, evidence, compiled);
        const companyName = company.name;
        const companyNameClean = this.companyNameForSubject(company.name);
        const firstName = this.resolveFirstName(contact);
        const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

        const subjectLine = profile.subject_line || companyNameClean;
        const coldBody = profile.cold_outreach_body || '';
        const liBody = profile.linkedin_body || '';

        const linkedin_intro = liBody
            ? `${greeting} ${liBody}`
            : '';

        const liQuestion = (liBody.match(/[^.!?]*\?$/) || [''])[0].trim();
        const linkedin_followup = liBody
            ? `${greeting} following up on ${companyNameClean} — ${liQuestion || 'still curious if this is worth a quick look.'}`
            : '';

        const email_cold = (compliance.email_allowed && ['email', 'both'].includes(channel) && coldBody)
            ? [
                `Subject: ${subjectLine}`,
                '',
                greeting,
                '',
                coldBody,
                '',
                `Best,`,
                `Fanny`,
                `c2moviez`,
            ].join('\n')
            : null;

        const emailQuestion = (coldBody.match(/[^.!?]*\?$/) || [''])[0].trim();
        const email_followup = email_cold
            ? [
                `Subject: Re: ${subjectLine}`,
                '',
                greeting,
                '',
                `Following up on ${companyName}. ${emailQuestion || 'Still worth a look — happy to ship the example if so.'}`,
                '',
                `Best,`,
                `Fanny`
            ].join('\n')
            : null;

        const drafts = { linkedin_intro, linkedin_followup, email_cold, email_followup };
        Object.defineProperty(drafts, '__compiledProfile', {
            value: compiled,
            enumerable: false,
            configurable: false
        });
        return drafts;
    }

    private async compileCompanyProfile(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[],
        confidence: 'high' | 'medium' | 'low'
    ): Promise<CompiledCompanyProfile> {
        const base = this.buildCompanyProfileFallback(company, contact, evidence);
        const fallback: CompiledCompanyProfile = {
            ...base,
            evidence_confidence: confidence,
            subject_line: '',
            cold_outreach_body: '',
            linkedin_body: ''
        };

        if (!deepseekClient) {
            return fallback;
        }

        const evidenceLines = evidence
            .filter((entry) => entry.detail?.trim().length > 10)
            .slice(0, 4)
            .map((entry) => `- ${entry.label}: ${entry.detail.trim().slice(0, 120)}`)
            .join('\n');
        const userMessage = [
            `Company: ${company.name}`,
            `Industry: ${company.industry || 'unknown'}`,
            `Website: ${company.website || 'unknown'}`,
            `Market: ${company.country === 'AT' ? 'Austria' : 'Switzerland'} (${company.city || 'unknown city'})`,
            `Evidence (most important first):`,
            evidenceLines || '- No specific evidence available',
            '',
            `c2moviez offers: short first-impression video angles for B2B companies — explainer videos, testimonial vignettes, behind-the-scenes, case-study reels. The goal is to help the target company convert more inbound by improving their visible communication surface.`,
            '',
            `Generate the outreach profile. Return ONLY valid JSON, no markdown fences, no commentary:`,
            '',
            `{`,
            `  "what_we_noticed": "<analytical, 3rd person, max 100 chars — what you observed about the company for Dossier display>",`,
            `  "why_it_might_matter": "<analytical, max 100 chars — the hidden cost or gap, for Dossier display>",`,
            `  "c2moviez_relevance": "<analytical, max 120 chars — what specific c2moviez angle could help, for Dossier display>",`,
            `  "safe_opening_angle": "<the specific surface, max 50 chars, e.g. 'your services page'>",`,
            `  "subject_line": "<4-7 words, specific to the observation, NO 'quick thought on', NO 'about' — e.g. 'your DBA-to-DBA copy' or '847 words, zero visuals'>",`,
            `  "cold_outreach_body": "<EXACTLY 3 sentences. ≤60 words total. S1: specificity anchor (concrete observation from evidence). S2: gap reframe with consequence. S3: direct question ending with '?'. Second-person POV. Earned-authority voice. NO first-person familiarity openers, no tiny-thought framing, no may-be-worth language, no perhaps/hope-this/I'd-love-to-chat phrasing. Follow the doctrine PATTERN LIBRARY examples in the system message.>",`,
            `  "linkedin_body": "<2-3 sentences, ≤55 words. Same doctrine. Slightly more conversational. End with direct question.>",`,
            `  "claims_to_avoid": ["<phrase 1 not in evidence>", "<phrase 2>"]`,
            `}`
        ].join('\n');

        const createMessages = (extraNote = '') => ([
            { role: 'system' as const, content: DOCTRINE_HEADER },
            { role: 'user' as const, content: `${userMessage}${extraNote}` }
        ]);

        const parseProfile = (parsed: Record<string, unknown>) => {
            const coldBody = typeof parsed.cold_outreach_body === 'string' ? parsed.cold_outreach_body.trim() : '';
            const linkedinBody = typeof parsed.linkedin_body === 'string' ? parsed.linkedin_body.trim() : '';
            const subjectLine = typeof parsed.subject_line === 'string' ? parsed.subject_line.trim() : '';
            return {
                company_name: company.name,
                contact_name: contact.name || '',
                contact_role: contact.title || '',
                market: company.city || (company.country === 'AT' ? 'Austria' : 'Switzerland'),
                website: company.website || '',
                primary_source_url: evidence.find((entry) => entry.url)?.url || company.website || '',
                best_surface: base.best_surface,
                what_we_noticed: String(parsed.what_we_noticed || fallback.what_we_noticed).slice(0, 120),
                why_it_might_matter: String(parsed.why_it_might_matter || fallback.why_it_might_matter).slice(0, 120),
                c2moviez_relevance: String(parsed.c2moviez_relevance || fallback.c2moviez_relevance).slice(0, 130),
                safe_opening_angle: String(parsed.safe_opening_angle || base.safe_opening_angle).slice(0, 60),
                subject_line: subjectLine.slice(0, 80),
                cold_outreach_body: coldBody,
                linkedin_body: linkedinBody,
                claims_to_avoid: Array.isArray(parsed.claims_to_avoid) ? parsed.claims_to_avoid.slice(0, 3) : fallback.claims_to_avoid,
                evidence_confidence: confidence
            };
        };

        const fetchProfile = async (extraNote = '') => {
            const response = await deepseekClient.chat.completions.create({
                model: 'deepseek-chat',
                messages: createMessages(extraNote),
                max_tokens: 700,
                temperature: 0.4,
                response_format: { type: 'json_object' }
            });

            const raw = response.choices[0]?.message?.content?.trim();
            if (!raw) throw new Error('empty response');
            return JSON.parse(raw) as Record<string, unknown>;
        };

        try {
            let parsed = await fetchProfile();
            let coldValidation = this.validateDoctrineCompliance(String(parsed.cold_outreach_body || ''));
            let linkedinValidation = this.validateDoctrineCompliance(String(parsed.linkedin_body || ''));

            if (!coldValidation.passed || !linkedinValidation.passed) {
                const reason = !coldValidation.passed ? coldValidation.reason : linkedinValidation.reason;
                console.error('Doctrine validation failed', {
                    company: company.name,
                    cold_reason: coldValidation.reason,
                    linkedin_reason: linkedinValidation.reason,
                    reason
                });
                try {
                    parsed = await fetchProfile(`\n\nYour previous attempt FAILED: ${reason}. Regenerate strictly following the doctrine.`);
                    coldValidation = this.validateDoctrineCompliance(String(parsed.cold_outreach_body || ''));
                    linkedinValidation = this.validateDoctrineCompliance(String(parsed.linkedin_body || ''));
                } catch (error) {
                    console.error('Doctrine retry failed', {
                        company: company.name,
                        reason,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            const profile = parseProfile(parsed);
            if (!coldValidation.passed) profile.cold_outreach_body = '';
            if (!linkedinValidation.passed) profile.linkedin_body = '';
            return profile;
        } catch {
            return fallback;
        }
    }

    private validateDoctrineCompliance(body: string): { passed: boolean; reason: string } {
        if (!body || body.trim().length === 0) return { passed: false, reason: 'empty body' };

        const forbidden = [
            /I came across/i,
            /I was looking at/i,
            /Tiny thought/i,
            /Quick idea/i,
            /Just wondering/i,
            /may be worth/i,
            /might help/i,
            /\bperhaps\b/i,
            /I'd love to chat/i,
            /let me know if interested/i,
            /hope this/i,
            /no pressure/i,
        ];

        for (const pattern of forbidden) {
            if (pattern.test(body)) {
                return { passed: false, reason: `forbidden phrase: ${pattern.source}` };
            }
        }

        const wordCount = body.trim().split(/\s+/).length;
        if (wordCount > 70) return { passed: false, reason: `too long: ${wordCount} words` };
        if (wordCount < 8) return { passed: false, reason: `too short: ${wordCount} words` };

        if (!/\?\s*$/.test(body.trim())) return { passed: false, reason: 'must end with a question mark' };

        return { passed: true, reason: '' };
    }

    private buildDraftsFromProfile(
        profile: ColdLeadOutreachProfile,
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        channel: ColdLeadChannel,
        compliance: ColdLeadComplianceRecord
    ): ColdLeadDrafts {
        const companyName = company.name;
        const companyNameClean = this.companyNameForSubject(company.name);
        const firstName = this.resolveFirstName(contact);
        const greeting = firstName ? `Hi ${firstName},` : 'Hi,';

        const subjectLine = profile.subject_line || companyNameClean;
        const coldBody = profile.cold_outreach_body || '';
        const liBody = profile.linkedin_body || '';

        const linkedin_intro = liBody
            ? `${greeting} ${liBody}`
            : '';

        const liQuestion = (liBody.match(/[^.!?]*\?$/) || [''])[0].trim();
        const linkedin_followup = liBody
            ? `${greeting} following up on ${companyNameClean} — ${liQuestion || 'still curious if this is worth a quick look.'}`
            : '';

        const email_cold = (compliance.email_allowed && ['email', 'both'].includes(channel) && coldBody)
            ? [
                `Subject: ${subjectLine}`,
                '',
                greeting,
                '',
                coldBody,
                '',
                `Best,`,
                `Fanny`,
                `c2moviez`,
            ].join('\n')
            : null;

        const emailQuestion = (coldBody.match(/[^.!?]*\?$/) || [''])[0].trim();
        const email_followup = email_cold
            ? [
                `Subject: Re: ${subjectLine}`,
                '',
                greeting,
                '',
                `Following up on ${companyName}. ${emailQuestion || 'Still worth a look — happy to ship the example if so.'}`,
                '',
                `Best,`,
                `Fanny`
            ].join('\n')
            : null;

        return { linkedin_intro, linkedin_followup, email_cold, email_followup };
    }

    async regenerateDraftsForLead(lead: ColdLeadRecord): Promise<{ outreach_drafts: ColdLeadDrafts; draft_specificity: ColdLeadDraftSpecificity }> {
        const confidence = computeSourceConfidence({
            company: lead.company,
            contact: lead.contact,
            evidence: lead.evidence,
            compliance: lead.compliance
        }).level;
        const outreach_drafts = await this.generateDrafts(lead.company, lead.contact, lead.evidence, lead.channel, lead.compliance, confidence);
        const compiled = (outreach_drafts as DraftsWithCompiledProfile).__compiledProfile;
        const profile = this.buildOutreachProfile(lead.company, lead.contact, lead.evidence, compiled);
        const draft_specificity = this.validateDraftSpecificity(outreach_drafts, lead.company, lead.contact, lead.evidence, profile, lead.channel);
        return { outreach_drafts, draft_specificity };
    }

    private buildOutreachProfile(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[],
        compiled?: CompiledCompanyProfile
    ): ColdLeadOutreachProfile {
        const base = compiled || this.buildCompanyProfileFallback(company, contact, evidence);
        const source_urls = this.outreachSourceUrls(company, contact, evidence);
        return {
            ...base,
            observed_signal: base.what_we_noticed,
            why_it_might_matter: base.why_it_might_matter,
            opening_angle: base.c2moviez_relevance,
            source_urls,
            do_not_claim: base.claims_to_avoid.length > 0
                ? base.claims_to_avoid
                : [
                    'Do not claim revenue, conversion, demand, or pipeline lift.',
                    'Do not say the company is struggling, failing, leaking attention, or doing something wrong.',
                    'Do not claim our work will fix, clarify, or improve the prospect issue.',
                    'Do not mention ads, retargeting, production stacks, or campaigns unless the source evidence shows that exact topic.'
                ],
            confidence: base.evidence_confidence
        };
    }

    private buildCompanyProfileFallback(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[]
    ): CompiledCompanyProfile {
        const bestSurface = (() => {
            if (evidence.some((item) => item.kind === 'website_about' || item.kind === 'website_about_page')) return 'your website';
            if (evidence.some((item) => item.kind === 'website_tech_signal')) return 'your product page';
            if (evidence.some((item) => item.kind === 'website_news')) return 'your recent activity';
            if (evidence.some((item) => item.kind === 'zefix_purpose' || item.kind === 'wko_directory')) return 'your public listing';
            return 'your company page';
        })();

        const bestEvidence = evidence.find((item) =>
            ['website_about', 'website_about_page', 'zefix_purpose'].includes(item.kind) && item.detail?.trim()
        ) || evidence.find((item) => item.detail?.trim().length > 30) || evidence.find((item) => item.detail?.trim());
        const cleanedDetail = bestEvidence?.detail?.trim()
            ? this.prospectFacingEvidence(this.stripSourceArtifacts(bestEvidence.detail)).slice(0, 120)
            : '';
        const whatWeNoticed = cleanedDetail || `${company.name} is a ${company.industry || 'business'} company`;
        const whyItMightMatter = this.pickWhyItMightMatter(bestSurface, whatWeNoticed);
        const c2moviezRelevance = this.pickVideoAngle(bestSurface, whatWeNoticed);

        return {
            company_name: company.name,
            contact_name: contact.name || '',
            contact_role: contact.title || '',
            market: company.city || (company.country === 'AT' ? 'Austria' : 'Switzerland'),
            website: company.website || '',
            primary_source_url: bestEvidence?.url || company.website || '',
            best_surface: bestSurface,
            what_we_noticed: whatWeNoticed,
            why_it_might_matter: whyItMightMatter,
            c2moviez_relevance: c2moviezRelevance,
            safe_opening_angle: bestSurface,
            subject_line: '',
            cold_outreach_body: '',
            linkedin_body: '',
            claims_to_avoid: [
                'Do not claim revenue, conversion, demand, or pipeline lift.',
                'Do not say the company is struggling, failing, leaking attention, or doing something wrong.',
                'Do not claim our work will fix, clarify, or improve the prospect issue.',
                'Do not mention ads, retargeting, production stacks, or campaigns unless the source evidence shows that exact topic.'
            ],
            evidence_confidence: this.outreachConfidence(evidence, company, this.outreachSourceUrls(company, contact, evidence))
        };
    }

    private pickWhyItMightMatter(surface: string, whatWeNoticed: string) {
        if (/website|page|listing|home/i.test(surface)) {
            return `A first-time visitor may use ${surface} to decide whether ${whatWeNoticed} is clear enough.`;
        }
        if (/product/i.test(surface)) {
            return `A first-time visitor may use ${surface} to decide whether ${whatWeNoticed} is easy to understand.`;
        }
        if (/recent activity/i.test(surface)) {
            return `A first-time visitor may use ${surface} to decide whether ${whatWeNoticed} looks current and credible.`;
        }
        return `A first-time visitor may use ${surface} to decide whether ${whatWeNoticed} makes sense quickly.`;
    }

    private pickVideoAngle(surface: string, whatWeNoticed: string) {
        if (/website|page|listing|home/i.test(surface)) {
            return `a short explainer angle that translates ${whatWeNoticed} for a first-time visitor`;
        }
        if (/product/i.test(surface)) {
            return `a short explainer angle that translates ${whatWeNoticed} for technical readers`;
        }
        if (/recent activity/i.test(surface)) {
            return `a short first-impression angle that ties ${whatWeNoticed} to the company story`;
        }
        return `a short first-impression angle that helps translate ${whatWeNoticed}`;
    }

    private ensureCompanyMention(companyName: string, observation: string) {
        const normalizedObservation = observation.toLowerCase();
        const normalizedCompany = companyName.toLowerCase();
        if (normalizedObservation.includes(normalizedCompany)) return observation;
        return `${companyName}; ${observation}`;
    }

    private bestEvidence(evidence: ColdLeadEvidence[], company: Required<ColdLeadCompany>) {
        const observed = this.buildEvidenceObservation(evidence, company);
        return observed || `${company.name} has a visible public presence`;
    }

    private buildEvidenceObservation(evidence: ColdLeadEvidence[], company: Required<ColdLeadCompany>) {
        const priorityKinds: ColdLeadEvidence['kind'][] = [
            'website_about',
            'website_about_page',
            'zefix_purpose',
            'website_tech_signal',
            'website_news'
        ];
        for (const kind of priorityKinds) {
            const match = evidence.find((item) => item.kind === kind && item.detail?.trim());
            if (match?.detail?.trim()) {
                const cleaned = this.prospectFacingEvidence(this.stripSourceArtifacts(match.detail)).replace(/\s+/g, ' ').trim();
                if (cleaned) return cleaned.slice(0, 160);
            }
        }

        const otherEvidence = evidence.find((item) => item.detail?.trim().length > 30);
        if (otherEvidence?.detail?.trim()) {
            const cleaned = this.prospectFacingEvidence(this.stripSourceArtifacts(otherEvidence.detail)).replace(/\s+/g, ' ').trim();
            if (cleaned) return cleaned.slice(0, 160);
        }

        const anyEvidence = evidence.find((item) => item.detail?.trim());
        if (anyEvidence?.detail?.trim()) {
            const cleaned = this.prospectFacingEvidence(this.stripSourceArtifacts(anyEvidence.detail)).replace(/\s+/g, ' ').trim();
            if (cleaned) return cleaned.slice(0, 160);
        }

        return '';
    }

    private resolveFirstName(contact: ColdLeadContact) {
        const name = contact.name?.trim();
        if (!name) return '';
        return name.split(/\s+/)[0] || '';
    }

    private companyNameForSubject(name: string) {
        return name
            .replace(/\b(AG|GmbH|Sarl|SARL|SA|Ltd\.?|Limited|Inc\.?)\b\.?/g, '')
            .replace(/\s+/g, ' ')
            .trim() || name;
    }

    private outreachSourceUrls(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[]
    ) {
        return Array.from(new Set([
            ...evidence.map((item) => item.url || ''),
            company.website,
            company.linkedin_url,
            contact.linkedin_url
        ].filter(Boolean)));
    }

    private outreachConfidence(evidence: ColdLeadEvidence[], company: Required<ColdLeadCompany>, sourceUrls: string[]): 'low' | 'medium' | 'high' {
        if (this.hasThinEvidence(evidence, company)) return 'low';
        if (evidence.length >= 2 && sourceUrls.length > 0) return 'high';
        if (sourceUrls.length > 0) return 'medium';
        return 'low';
    }

    private hasThinEvidence(evidence: ColdLeadEvidence[], company: Required<ColdLeadCompany>) {
        if (evidence.length === 0) return true;
        const proof = this.bestEvidence(evidence, company).toLowerCase();
        const words = proof.split(/\s+/).filter((word) => /[a-z0-9]/i.test(word) && word.length > 2);
        return words.length < 6 || /\b(company website exists|website exists|website is present|available evidence is still too thin|has a website|is listed|listed in|public business presence)\b/i.test(proof);
    }

    private hasDraftClaimRisk(combinedDraft: string) {
        return [
            /likely friction/i,
            /potential solution/i,
            /why it matters/i,
            /c2moviez could/i,
            /Fanny can/i,
            /B2B teams with clear growth signals/i,
            /share a 5-min overview/i,
            /booking option|booking link/i,
            /acquisition stack|demand-generation stack|trust-building stack/i,
            /paid traffic|retargeting|Google Ads/i
        ].some((pattern) => pattern.test(combinedDraft));
    }

    private hasSourceLeakage(combinedDraft: string) {
        return [
            /\bWKO\b/i,
            /\bZefix\b/i,
            /\bFirmenABC\b/i,
            /\bopen-data record\b/i,
            /\bsoftware-trade search\b/i,
            /\bcompany register profile\b/i,
            /\bpublic\s+(?:WKO|company|business|directory|register)\s+profile\b/i,
            /\bSource\s+\d+\b/i,
            /\bAcquisition CRM\b/i,
            /\bworkbench\b/i
        ].some((pattern) => pattern.test(combinedDraft));
    }

    private hasOverlongDraft(drafts: ColdLeadDrafts) {
        const linkedinChars = drafts.linkedin_intro.trim().length;
        const emailWords = drafts.email_cold ? this.emailBodyWordCount(drafts.email_cold) : 0;
        return linkedinChars > 450 || emailWords > 110;
    }

    private emailBodyWordCount(draft: string) {
        return draft
            .replace(/^Subject:.*$/im, '')
            .replace(/Best,[\s\S]*$/i, '')
            .trim()
            .split(/\s+/)
            .filter(Boolean).length;
    }

    private resolveDraftReadiness(missing: string[], warnings: string[], evaluation: DraftEvaluationResult): ColdLeadDraftReadiness {
        if (warnings.includes('thin_evidence') || missing.includes('evidence_detail')) return 'needs_research';
        if (!evaluation.passed) return 'draft_review';
        if (warnings.includes('claim_risk') || warnings.includes('source_leakage') || warnings.includes('overlong_draft') || warnings.includes('duplicate_observation')) return 'needs_rework';
        if (missing.length > 0) return 'needs_rework';
        return 'ready_to_rework';
    }

    private validateDraftSpecificity(
        drafts: ColdLeadDrafts,
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[],
        profile?: ColdLeadOutreachProfile,
        channel?: ColdLeadChannel
    ): ColdLeadDraftSpecificity {
        const combined = Object.values(drafts).filter(Boolean).join('\n').toLowerCase();
        const observedProfile = profile || this.buildOutreachProfile(company, contact, evidence);
        const observation = observedProfile.observed_signal || this.buildEvidenceObservation(evidence, company);
        const proof_chips = evidence
            .filter((item) => {
                if (!item.detail) return false;
                const raw = this.prospectFacingEvidence(item.detail).toLowerCase().slice(0, 32);
                const observed = observation.toLowerCase().slice(0, 32);
                return combined.includes(raw) || combined.includes(observed);
            })
            .map((item) => item.label);

        const missing: string[] = [];
        if (!combined.includes(company.name.toLowerCase())) missing.push('company_name');
        if (contact.name && !combined.includes(contact.name.split(/\s+/)[0].toLowerCase())) missing.push('contact_reference');
        if (proof_chips.length === 0) missing.push('evidence_detail');

        const warnings: string[] = [];
        if (this.hasThinEvidence(evidence, company)) warnings.push('thin_evidence');
        if (this.hasDraftClaimRisk(combined)) warnings.push('claim_risk');
        if (this.hasSourceLeakage(combined)) warnings.push('source_leakage');
        if (this.hasOverlongDraft(drafts)) warnings.push('overlong_draft');
        if (this.hasDuplicateObservation(observedProfile.observed_signal, company.name)) warnings.push('duplicate_observation');
        const doctrineComplianceFailed = ['email', 'both'].includes(channel || '') && !drafts.email_cold?.trim();
        if (doctrineComplianceFailed) warnings.push('doctrine_compliance_failed');

        const evaluation = this.evaluateDrafts(drafts, company, contact, evidence);
        let readiness = this.resolveDraftReadiness(missing, warnings, evaluation);
        if (doctrineComplianceFailed && readiness === 'ready_to_rework') readiness = 'draft_review';

        return {
            valid: missing.length === 0 && readiness === 'ready_to_rework' && evaluation.passed,
            proof_chips,
            missing,
            warnings,
            readiness,
            profile: observedProfile,
            evaluation_flags: evaluation.flags
        };
    }

    private evaluateDrafts(
        drafts: ColdLeadDrafts,
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[]
    ): DraftEvaluationResult {
        const flags = new Set<DraftFlag>();
        for (const draft of Object.values(drafts)) {
            if (!draft?.trim()) continue;
            const result = evaluateDraftQuality(draft, {
                company,
                contact,
                evidence
            } as ColdLeadRecord);
            result.flags.forEach((flag) => flags.add(flag));
        }
        const criticalFlags: DraftFlag[] = ['generic_language', 'fake_familiarity', 'ai_spam_tone'];
        const hasCriticalFlag = criticalFlags.some((flag) => flags.has(flag));
        const nonCriticalCount = Array.from(flags).filter((flag) => !criticalFlags.includes(flag)).length;
        return {
            passed: !hasCriticalFlag && nonCriticalCount < 2,
            flags: Array.from(flags)
        };
    }

    private initialDraftVersions(drafts: ColdLeadDrafts, createdAt: string): ColdLeadDraftVersion[] {
        return (Object.entries(drafts) as Array<[keyof ColdLeadDrafts, string | null]>)
            .filter(([, text]) => Boolean(text?.trim()))
            .map(([draft_type, text]) => ({
                id: `draft_version_${createdAt}_${draft_type}`,
                draft_type,
                text: text as string,
                source: 'generated',
                created_at: createdAt
            }));
    }

    private appendDraftVersions(
        currentVersions: ColdLeadDraftVersion[],
        previousDrafts: ColdLeadDrafts,
        nextDrafts: ColdLeadDrafts,
        createdAt: string
    ): ColdLeadDraftVersion[] {
        const versions = [...currentVersions];
        for (const [draft_type, text] of Object.entries(nextDrafts) as Array<[keyof ColdLeadDrafts, string | null]>) {
            if (!text?.trim() || text === previousDrafts[draft_type]) continue;
            versions.push({
                id: `draft_version_${createdAt}_${draft_type}_${versions.length}`,
                draft_type,
                text,
                source: 'fanny_edit',
                created_at: createdAt
            });
        }
        return versions;
    }

    private hasDuplicateObservation(observedSignal: string, companyName: string) {
        const normalized = this.normalizeComparableText(observedSignal);
        if (!normalized) return false;
        const rows = this.db.prepare('SELECT company_json, draft_specificity_json, dedupe_json FROM cold_acquisition_leads').all() as Array<{ company_json: string; draft_specificity_json: string; dedupe_json: string }>;
        return rows.some((row) => {
            try {
                const company = JSON.parse(row.company_json);
                const dedupe = JSON.parse(row.dedupe_json);
                if (dedupe?.is_duplicate) return false;
                if (this.sameCompanyName(company.name || '', companyName)) return false;
                const specificity = JSON.parse(row.draft_specificity_json);
                return this.normalizeComparableText(specificity?.profile?.observed_signal || '') === normalized;
            } catch {
                return false;
            }
        });
    }

    private normalizeComparableText(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    private buildWebhookUpdatePayload(lead: ColdLeadRecord, replyText: string) {
        return {
            status: 'replied',
            reply_text: replyText,
            lead_id: lead.webhook_lead_id
        };
    }

    private async pushLead(lead: ColdLeadRecord, options: PushReadyBatchOptions) {
        const webhookUrl = options.webhookUrl || process.env.C2MOVIEZ_LEAD_WEBHOOK_URL;
        const apiKey = options.apiKey || process.env.C2MOVIEZ_LEAD_API_KEY;
        if (!webhookUrl || !apiKey) {
            return {
                lead_id: lead.id,
                company: lead.company.name,
                status: 'missing_webhook_config'
            };
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(this.buildWebhookPayload(lead))
        });
        const responseText = await response.text();
        let responseJson: any = {};
        try {
            responseJson = responseText ? JSON.parse(responseText) : {};
        } catch {
            responseJson = { raw: responseText };
        }

        if (response.status === 409) {
            const next: ColdLeadRecord = {
                ...lead,
                status: 'needs_review',
                crm_stage: 'needs_review',
                webhook_status: 'duplicate',
                webhook_response: responseJson,
                updated_at: this.nowIso()
            };
            this.replaceRecord(next);
            return { lead_id: lead.id, company: lead.company.name, status: 'duplicate', response: responseJson };
        }

        if (!response.ok) {
            return { lead_id: lead.id, company: lead.company.name, status: 'failed', response: responseJson, http_status: response.status };
        }

        const next: ColdLeadRecord = {
            ...lead,
            status: 'pushed',
            webhook_lead_id: responseJson.lead_id || null,
            webhook_status: responseJson.status || 'queued',
            webhook_response: responseJson,
            updated_at: this.nowIso()
        };
        this.replaceRecord(next);
        return { lead_id: lead.id, company: lead.company.name, status: next.webhook_status || 'queued', response: responseJson };
    }

    async patchReplyToWebhook(id: string, replyText: string, options: PushReadyBatchOptions = {}) {
        const lead = this.requireLead(id);
        const webhookUrl = options.webhookUrl || process.env.C2MOVIEZ_LEAD_WEBHOOK_URL;
        const apiKey = options.apiKey || process.env.C2MOVIEZ_LEAD_API_KEY;
        if (!webhookUrl || !apiKey || !lead.webhook_lead_id) {
            return this.recordReply(id, replyText);
        }

        await fetch(webhookUrl, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(this.buildWebhookUpdatePayload(lead, replyText))
        });

        return this.recordReply(id, replyText);
    }

    private readinessErrors(lead: ColdLeadRecord) {
        const errors = [];
        if (lead.scoring.total_score < 60) errors.push('score_below_60');
        if (lead.channel === 'blocked') errors.push('channel_blocked');
        if (lead.dedupe.is_duplicate) errors.push('duplicate_candidate');
        if (!lead.draft_specificity.valid) errors.push('draft_specificity_missing');
        if (!lead.compliance.source_url || !lead.compliance.source_timestamp) errors.push('source_audit_missing');
        if (lead.compliance.compliance_badge === 'blocked') errors.push('compliance_blocked');
        return errors;
    }

    private assertCanMarkSent(lead: ColdLeadRecord) {
        const blockers = this.getSendBlockers(lead);
        if (blockers.length > 0) {
            throw Object.assign(new Error('COMPLIANCE_SEND_BLOCKED'), { statusCode: 409, blockers });
        }
    }

    private hasUsableDraftForChannel(lead: ColdLeadRecord) {
        const hasLinkedIn = Boolean(lead.outreach_drafts.linkedin_intro?.trim());
        const hasEmail = Boolean(lead.outreach_drafts.email_cold?.trim());
        if (lead.channel === 'linkedin') return hasLinkedIn;
        if (lead.channel === 'email') return hasEmail;
        if (lead.channel === 'both') return hasLinkedIn || hasEmail;
        return false;
    }

    private initialStatus(
        scoring: ColdLeadScoring,
        dedupe: ColdLeadDedupe,
        draftSpecificity: ColdLeadDraftSpecificity,
        channel: ColdLeadChannel
    ): ColdLeadStatus {
        if (dedupe.is_duplicate || channel === 'blocked' || !draftSpecificity.valid) return 'needs_review';
        if (scoring.total_score >= 60) return 'scored';
        return 'enriched';
    }

    private initialCrmStage(
        status: ColdLeadStatus,
        scoring: ColdLeadScoring,
        channel: ColdLeadChannel,
        compliance: ColdLeadComplianceRecord
    ): ColdLeadCrmStage {
        if (channel === 'blocked' || compliance.compliance_badge === 'blocked') return 'blocked';
        if (status === 'needs_review') return 'needs_review';
        if (status === 'sent') return 'sent';
        if (status === 'replied') return 'replied';
        if (status === 'ready' || scoring.total_score >= 60) return 'ready';
        return 'new';
    }

    private crmStageForStatus(status: ColdLeadStatus, fallback: ColdLeadCrmStage): ColdLeadCrmStage {
        if (status === 'needs_review') return 'needs_review';
        if (status === 'sent') return 'sent';
        if (status === 'replied') return 'replied';
        if (status === 'ready' || status === 'pushed') return fallback === 'qualified' ? 'qualified' : 'ready';
        return fallback;
    }

    private normalizeCompany(company: ColdLeadCompany): Required<ColdLeadCompany> {
        return {
            name: company.name,
            country: company.country,
            canton_or_bezirk: company.canton_or_bezirk || '',
            postal_code: company.postal_code || '',
            city: company.city || '',
            uid_or_fn: company.uid_or_fn || '',
            legal_form: company.legal_form || '',
            date_of_entry: company.date_of_entry || '',
            employee_count: Number(company.employee_count || 0),
            industry: company.industry || '',
            website: company.website || undefined,
            linkedin_url: company.linkedin_url || ''
        } as Required<ColdLeadCompany>;
    }

    private normalizeContact(contact?: ColdLeadContact): Required<ColdLeadContact> {
        return {
            name: contact?.name || '',
            title: contact?.title || '',
            email: contact?.email || null,
            linkedin_url: contact?.linkedin_url || ''
        };
    }

    private deriveScoringSignals(company: Required<ColdLeadCompany>, signals: ColdLeadScoringSignals): ColdLeadScoringSignals {
        const website = String(company.website || '').toLowerCase();
        const industry = company.industry.toLowerCase();
        return {
            websiteHasEnglish: signals.websiteHasEnglish ?? (website.includes('/en') || website.includes('lang=en')),
            linkedinCompanyEnglish: Boolean(signals.linkedinCompanyEnglish),
            decisionMakerEnglish: Boolean(signals.decisionMakerEnglish),
            dotComTld: signals.dotComTld ?? this.domainFromUrl(company.website)?.endsWith('.com') ?? false,
            internationalSignal: Boolean(signals.internationalSignal),
            highFitIndustry: signals.highFitIndustry ?? /tech|saas|biotech|fintech|ngo|hospitality|creative|marketing/.test(industry)
        };
    }

    private hasEnglishUrl(url: string | undefined) {
        const value = String(url || '').toLowerCase();
        return value.includes('/en') || value.includes('lang=en') || value.endsWith('.com');
    }

    private highFitIndustry(value: string) {
        return /tech|saas|biotech|fintech|ngo|hospitality|creative|marketing|software|robotics|international/i.test(value);
    }

    private inferIndustry(value: string) {
        const text = value.toLowerCase();
        if (text.includes('saas') || text.includes('software')) return 'SaaS';
        if (text.includes('hotel') || text.includes('hospitality')) return 'hospitality';
        if (text.includes('bio')) return 'biotech';
        if (text.includes('finance') || text.includes('payment')) return 'fintech';
        return 'services';
    }

    private buildDedupe(company: Required<ColdLeadCompany>, contact: Required<ColdLeadContact>): ColdLeadDedupe {
        const domain = this.domainFromUrl(company.website) || this.domainFromEmail(contact.email);
        const uid = company.uid_or_fn || null;
        const existing = this.db.prepare(`
            SELECT id, uid_or_fn, primary_domain
            FROM cold_acquisition_leads
            WHERE (? IS NOT NULL AND uid_or_fn = ?)
               OR (? IS NOT NULL AND primary_domain = ?)
            ORDER BY created_at ASC
            LIMIT 1
        `).get(uid, uid, domain, domain) as { id: string; uid_or_fn: string | null; primary_domain: string | null } | undefined;

        const activeCustomer = ACTIVE_CUSTOMER_NAMES.find((name) => this.sameCompanyName(name, company.name));
        const matched_on = existing?.uid_or_fn && uid && existing.uid_or_fn === uid
            ? 'uid_or_fn'
            : existing?.primary_domain && domain && existing.primary_domain === domain
                ? 'domain'
                : 'none';

        return {
            key: uid || domain || `${company.country}:${this.slug(company.name)}`,
            primary_domain: domain,
            is_duplicate: Boolean(existing || activeCustomer),
            duplicate_of: existing?.id || (activeCustomer ? `active_customer:${activeCustomer}` : null),
            matched_on: activeCustomer ? 'domain' : matched_on
        };
    }

    private polishProspectObservation(detail: string, company: Required<ColdLeadCompany>) {
        let text = this.stripSourceArtifacts(detail)
            .replace(/^the\s+\/en\/([^/\s]+)\s+page\s+explains\s+/i, 'their $1 page describes ')
            .replace(/^the\s+english\s+([^.!?]+?)\s+(page|section)\s+(explains|targets|describes)\s+/i, 'their $1 $2 describes ')
            .replace(/^the\s+([^.!?]+?)\s+(page|section)\s+(explains|targets|describes)\s+/i, 'their $1 $2 describes ')
            .replace(new RegExp(`^${this.escapeRegExp(company.name)}\\s+`, 'i'), `${company.name} `);

        if (/^company website exists$/i.test(text) || /^website exists$/i.test(text)) {
            return 'their website is present, but the available evidence is still too thin';
        }

        text = this.rewriteDirectoryObservation(text, company);
        text = this.stripSourceArtifacts(text)
            .replace(/\s+/g, ' ')
            .replace(/\s+([,.;:])/g, '$1')
            .replace(/\(\s*\)/g, '')
            .replace(/\s+-\s*$/g, '')
            .replace(/^[,;:\s-]+/, '')
            .replace(/[.!?]+$/, '')
            .trim();

        if (!text) return `${company.name} has source-backed public company context`;
        return text;
    }

    private prospectFacingEvidence(detail: string) {
        return detail
            .replace(/\s+/g, ' ')
            .replace(/\s+with\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s+and\s+a\s+public\s+website\b/gi, '')
            .replace(/\s+with\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '')
            .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
            .replace(/\bEnglish-speaking\s+/gi, '')
            .replace(/\bEnglish-first\s+/gi, '')
            .replace(/\bEnglish-language\s+/gi, '')
            .replace(/\bEnglish\s+(product|services?|website|landing|company)\s+(page|pages|section|sections)\b/gi, 'public $1 $2')
            .replace(/\bin English\b/gi, 'clearly')
            .replace(/\band a public website\b/gi, '')
            .replace(/[.!?]+$/, '')
            .trim();
    }

    private stripSourceArtifacts(value: string) {
        return value
            .replace(/\bWKO\s+software-trade search\s+lists\s+/gi, '')
            .replace(/\bWKO\s+lists\s+/gi, '')
            .replace(/\bZefix\s+open-data\s+record\s+shows\s+/gi, '')
            .replace(/\bZefix\s+[^.!?;,:]{0,80}?\s+record\s+shows\s+/gi, '')
            .replace(/\bFirmenABC\s+[^.!?;,:]{0,80}?\s+(?:lists|shows)\s+/gi, '')
            .replace(/\b(?:Zefix|WKO|FirmenABC)\b/gi, '')
            .replace(/\b(?:open-data|public)\s+(?:record|profile|directory|register)\b/gi, '')
            .replace(/\bsoftware-trade search\b/gi, '')
            .replace(/\b(?:company|business)\s+register\s+profile\b/gi, '')
            .replace(/\bpublic\s+(?:company|business|directory)\s+profile\b/gi, '')
            .replace(/\bsource\s+\d+\b/gi, '')
            .replace(/\bPRISM Workbench\b/gi, '')
            .replace(/\bAcquisition CRM\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private rewriteDirectoryObservation(value: string, company: Required<ColdLeadCompany>) {
        const companyPattern = this.escapeRegExp(company.name);
        const atOrInAs = new RegExp(`^(${companyPattern})\\s+(?:in|at)\\s+(.+?)\\s+as\\s+[“"]?(.+?)[”"]?(?:\\s+with\\s+(.+))?$`, 'i');
        const atOrInWith = new RegExp(`^(${companyPattern})\\s+(?:in|at)\\s+(.+?)\\s+with\\s+(.+)$`, 'i');
        const plainAs = new RegExp(`^(${companyPattern})\\s+as\\s+[“"]?(.+?)[”"]?$`, 'i');

        const asMatch = value.match(atOrInAs);
        if (asMatch) {
            const place = this.cleanObservationClause(asMatch[2]);
            const position = this.cleanObservationClause(asMatch[3]);
            const extra = this.cleanObservationClause(asMatch[4] || '');
            return [
                `${company.name} is described as ${position}`,
                place ? `in ${place}` : '',
                extra ? `with ${extra}` : ''
            ].filter(Boolean).join(' ');
        }

        const withMatch = value.match(atOrInWith);
        if (withMatch) {
            const place = this.cleanObservationClause(withMatch[2]);
            const detail = this.cleanObservationClause(withMatch[3]);
            return `${company.name} is connected to ${detail}${place ? ` in ${place}` : ''}`;
        }

        const plainAsMatch = value.match(plainAs);
        if (plainAsMatch) {
            return `${company.name} is described as ${this.cleanObservationClause(plainAsMatch[2])}`;
        }

        return value;
    }

    private cleanObservationClause(value: string) {
        return this.stripSourceArtifacts(value || '')
            .replace(/\s+with\s*$/i, '')
            .replace(/\s+and\s*$/i, '')
            .replace(/\s+/g, ' ')
            .replace(/[.!?]+$/, '')
            .trim();
    }

    private sizeScore(employeeCount: number) {
        if (employeeCount >= 5 && employeeCount <= 50) return 100;
        if (employeeCount > 50 && employeeCount <= 500) return 80;
        if (employeeCount > 500) return 50;
        return 30;
    }

    private industryFitScore(industry: string) {
        const text = industry.toLowerCase();
        if (/tech|saas|creative|marketing|biotech|fintech|hospitality|ngo|software|robotics/.test(text)) return 100;
        if (/legal|law|compliance|regulated|insurance|bank/.test(text)) return 40;
        return 70;
    }

    private recencyScore(dateOfEntry: string) {
        if (!dateOfEntry) return 50;
        const entered = new Date(`${dateOfEntry}T00:00:00.000Z`);
        if (Number.isNaN(entered.getTime())) return 50;
        const days = Math.floor((this.now().getTime() - entered.getTime()) / 86_400_000);
        if (days < 90) return 100;
        if (days < 180) return 80;
        if (days < 365) return 60;
        if (days >= 365 * 5) return 70;
        return 50;
    }

    private evidenceScore(evidence: ColdLeadEvidence[], company: Required<ColdLeadCompany>) {
        if (this.hasThinEvidence(evidence, company)) return 20;
        const sourcedItems = evidence.filter((item) => this.validUrl(item.url));
        if (sourcedItems.length >= 2) return 100;
        if (sourcedItems.length === 1) return 75;
        return 35;
    }

    private personalizationScore(company: Required<ColdLeadCompany>, contact: Required<ColdLeadContact>) {
        let score = 0;
        if (company.website) score += 25;
        if (company.industry) score += 20;
        if (contact.name) score += 25;
        if (contact.title) score += 15;
        if (contact.linkedin_url || company.linkedin_url) score += 15;
        return Math.min(100, score);
    }

    private decorateNotes(notes: string, priority: boolean, compliance: ColdLeadComplianceRecord, dedupe: ColdLeadDedupe) {
        const parts = [];
        if (priority) parts.push('[PRIORITY]');
        if (compliance.legal_review_required) parts.push('[LEGAL REVIEW: CH individualized manual outreach]');
        if (dedupe.is_duplicate) parts.push(`[DUPLICATE CHECK: ${dedupe.duplicate_of}]`);
        if (notes) parts.push(notes);
        return parts.join(' ');
    }

    private appendNote(notes: string, note: string) {
        return [notes, note].filter(Boolean).join(' ');
    }

    private sameCompanyName(left: string, right: string) {
        return this.slug(left).replace(/ag|gmbh|sa|ltd/g, '') === this.slug(right).replace(/ag|gmbh|sa|ltd/g, '');
    }

    private slug(value: string) {
        return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
    }

    private async checkUrlLive(url: string | null | undefined): Promise<boolean> {
        return this.checkUrlsLiveSync([url])[0] || false;
    }

    private checkUrlsLiveSync(urls: Array<string | null | undefined>): boolean[] {
        const normalizedUrls = urls.map((value) => String(value || '').trim());
        if (normalizedUrls.length === 0) return [];
        if (normalizedUrls.every((value) => !value)) {
            return normalizedUrls.map(() => false);
        }

        const script = `
const { execFile } = require('node:child_process');
const urls = JSON.parse(process.argv[1] || '[]');
const check = (url) => new Promise((resolve) => {
  if (!url) {
    resolve(false);
    return;
  }
  execFile(
    'curl',
    [
      '--head',
      '--location',
      '--noproxy',
      '*',
      '--max-time',
      '5',
      '--user-agent',
      'PRISM-Workbench/1.0',
      '--silent',
      '--show-error',
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}',
      url
    ],
    { encoding: 'utf8' },
    (error, stdout) => {
      if (error && !stdout) {
        resolve(false);
        return;
      }
      const status = Number.parseInt(String(stdout || '').trim(), 10);
      resolve(!Number.isNaN(status) && status >= 200 && status < 400);
    }
  );
});
(async () => {
  try {
    const results = await Promise.all(urls.map(check));
    process.stdout.write(JSON.stringify(results));
  } catch {
    process.stdout.write(JSON.stringify(urls.map(() => false)));
  }
})().catch(() => process.stdout.write(JSON.stringify(urls.map(() => false))));
`;

        try {
            const stdout = execFileSync(process.execPath, ['-e', script, JSON.stringify(normalizedUrls)], {
                encoding: 'utf8',
                timeout: 8000
            });
            const parsed = JSON.parse(stdout.trim() || '[]');
            if (!Array.isArray(parsed) || parsed.length !== normalizedUrls.length) {
                return normalizedUrls.map(() => false);
            }
            return parsed.map((value) => Boolean(value));
        } catch {
            return normalizedUrls.map(() => false);
        }
    }

    private domainFromUrl(url: string | undefined | null) {
        if (!url) return null;
        try {
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            return parsed.hostname.replace(/^www\./, '').toLowerCase();
        } catch {
            return null;
        }
    }

    private validUrl(value: string | undefined | null) {
        if (!value) return false;
        try {
            const parsed = new URL(value.startsWith('http') ? value : `https://${value}`);
            return ['http:', 'https:'].includes(parsed.protocol);
        } catch {
            return false;
        }
    }

    private escapeRegExp(value: string) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private domainFromEmail(email: string | null | undefined) {
        const domain = email?.split('@')[1]?.trim().toLowerCase();
        return domain || null;
    }

    private nowIso() {
        return this.now().toISOString();
    }

    private createId() {
        return `lead_${this.now().getTime()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    private ensureSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS cold_acquisition_leads (
                id TEXT PRIMARY KEY,
                company_json TEXT NOT NULL,
                contact_json TEXT NOT NULL,
                scoring_json TEXT NOT NULL,
                scoring_signals_json TEXT NOT NULL,
                evidence_json TEXT NOT NULL,
                compliance_json TEXT NOT NULL,
                channel TEXT NOT NULL,
                status TEXT NOT NULL,
                priority_flag INTEGER NOT NULL DEFAULT 0,
                outreach_drafts_json TEXT NOT NULL,
                draft_versions_json TEXT NOT NULL DEFAULT '[]',
                draft_specificity_json TEXT NOT NULL,
                dedupe_json TEXT NOT NULL,
                notes TEXT,
                webhook_lead_id TEXT,
                webhook_status TEXT,
                webhook_response_json TEXT,
                reply_text TEXT,
                crm_stage TEXT NOT NULL DEFAULT 'new',
                owner_user_id TEXT,
                last_touch_at TEXT,
                next_follow_up_at TEXT,
                fanny_notes TEXT NOT NULL DEFAULT '',
                uid_or_fn TEXT,
                primary_domain TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_cold_acquisition_status ON cold_acquisition_leads(status);
            CREATE INDEX IF NOT EXISTS idx_cold_acquisition_crm_stage ON cold_acquisition_leads(crm_stage);
            CREATE INDEX IF NOT EXISTS idx_cold_acquisition_country ON cold_acquisition_leads(json_extract(company_json, '$.country'));
            CREATE INDEX IF NOT EXISTS idx_cold_acquisition_uid ON cold_acquisition_leads(uid_or_fn);
            CREATE INDEX IF NOT EXISTS idx_cold_acquisition_domain ON cold_acquisition_leads(primary_domain);
        `);
        this.ensureLeadColumn('crm_stage', "TEXT NOT NULL DEFAULT 'new'");
        this.ensureLeadColumn('owner_user_id', 'TEXT');
        this.ensureLeadColumn('last_touch_at', 'TEXT');
        this.ensureLeadColumn('next_follow_up_at', 'TEXT');
        this.ensureLeadColumn('fanny_notes', "TEXT NOT NULL DEFAULT ''");
        this.ensureLeadColumn('draft_versions_json', "TEXT NOT NULL DEFAULT '[]'");
    }

    private ensureLeadColumn(name: string, definition: string) {
        const columns = this.db.prepare('PRAGMA table_info(cold_acquisition_leads)').all() as Array<{ name: string }>;
        if (columns.some((column) => column.name === name)) return;
        this.db.exec(`ALTER TABLE cold_acquisition_leads ADD COLUMN ${name} ${definition}`);
    }

    private insertRecord(record: ColdLeadRecord) {
        this.db.prepare(`
            INSERT INTO cold_acquisition_leads (
                id, company_json, contact_json, scoring_json, scoring_signals_json, evidence_json,
                compliance_json, channel, status, priority_flag, outreach_drafts_json,
                draft_versions_json, draft_specificity_json, dedupe_json, notes, webhook_lead_id, webhook_status,
                webhook_response_json, reply_text, crm_stage, owner_user_id, last_touch_at,
                next_follow_up_at, fanny_notes, uid_or_fn, primary_domain, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(...this.recordValues(record));
    }

    private replaceRecord(record: ColdLeadRecord) {
        this.db.prepare(`
            UPDATE cold_acquisition_leads SET
                company_json = ?,
                contact_json = ?,
                scoring_json = ?,
                scoring_signals_json = ?,
                evidence_json = ?,
                compliance_json = ?,
                channel = ?,
                status = ?,
                priority_flag = ?,
                outreach_drafts_json = ?,
                draft_versions_json = ?,
                draft_specificity_json = ?,
                dedupe_json = ?,
                notes = ?,
                webhook_lead_id = ?,
                webhook_status = ?,
                webhook_response_json = ?,
                reply_text = ?,
                crm_stage = ?,
                owner_user_id = ?,
                last_touch_at = ?,
                next_follow_up_at = ?,
                fanny_notes = ?,
                uid_or_fn = ?,
                primary_domain = ?,
                updated_at = ?
            WHERE id = ?
        `).run(
            JSON.stringify(record.company),
            JSON.stringify(record.contact),
            JSON.stringify(record.scoring),
            JSON.stringify(record.scoringSignals),
            JSON.stringify(record.evidence),
            JSON.stringify(record.compliance),
            record.channel,
            record.status,
            record.priority_flag ? 1 : 0,
            JSON.stringify(record.outreach_drafts),
            JSON.stringify(record.draft_versions || []),
            JSON.stringify(record.draft_specificity),
            JSON.stringify(record.dedupe),
            record.notes,
            record.webhook_lead_id,
            record.webhook_status,
            record.webhook_response ? JSON.stringify(record.webhook_response) : null,
            record.reply_text,
            record.crm_stage,
            record.owner_user_id,
            record.last_touch_at,
            record.next_follow_up_at,
            record.fanny_notes,
            record.company.uid_or_fn || null,
            record.dedupe.primary_domain,
            record.updated_at,
            record.id
        );
    }

    private recordValues(record: ColdLeadRecord) {
        return [
            record.id,
            JSON.stringify(record.company),
            JSON.stringify(record.contact),
            JSON.stringify(record.scoring),
            JSON.stringify(record.scoringSignals),
            JSON.stringify(record.evidence),
            JSON.stringify(record.compliance),
            record.channel,
            record.status,
            record.priority_flag ? 1 : 0,
            JSON.stringify(record.outreach_drafts),
            JSON.stringify(record.draft_versions || []),
            JSON.stringify(record.draft_specificity),
            JSON.stringify(record.dedupe),
            record.notes,
            record.webhook_lead_id,
            record.webhook_status,
            record.webhook_response ? JSON.stringify(record.webhook_response) : null,
            record.reply_text,
            record.crm_stage,
            record.owner_user_id,
            record.last_touch_at,
            record.next_follow_up_at,
            record.fanny_notes,
            record.company.uid_or_fn || null,
            record.dedupe.primary_domain,
            record.created_at,
            record.updated_at
        ];
    }

    private rowToRecord(row: ColdLeadRow): ColdLeadRecord {
        const company = JSON.parse(row.company_json);
        const contact = JSON.parse(row.contact_json);
        const scoringSignals = JSON.parse(row.scoring_signals_json);
        const evidence = JSON.parse(row.evidence_json);
        const compliance = JSON.parse(row.compliance_json);
        const storedDrafts = JSON.parse(row.outreach_drafts_json);
        const draft_versions = row.draft_versions_json ? JSON.parse(row.draft_versions_json) : this.initialDraftVersions(storedDrafts, row.created_at);
        const outreach_drafts = this.normalizeGeneratedDrafts(storedDrafts, draft_versions, company, contact, evidence, row.channel, compliance);
        const draft_specificity = this.normalizeDraftSpecificity(JSON.parse(row.draft_specificity_json), outreach_drafts, company, contact, evidence, row.channel);
        const dedupe = JSON.parse(row.dedupe_json);
        const scoring = this.calculateScores(company, contact, evidence, scoringSignals);
        return {
            id: row.id,
            company,
            contact,
            scoring,
            scoringSignals,
            evidence,
            compliance,
            channel: row.channel,
            status: row.status,
            priority_flag: Boolean(row.priority_flag),
            outreach_drafts,
            draft_versions,
            draft_specificity,
            dedupe,
            notes: row.notes || '',
            webhook_lead_id: row.webhook_lead_id,
            webhook_status: row.webhook_status,
            webhook_response: row.webhook_response_json ? JSON.parse(row.webhook_response_json) : null,
            reply_text: row.reply_text,
            crm_stage: this.resolveStoredCrmStage(row.crm_stage, row.status, scoring, row.channel, compliance),
            owner_user_id: row.owner_user_id,
            last_touch_at: row.last_touch_at,
            next_follow_up_at: row.next_follow_up_at,
            fanny_notes: row.fanny_notes || '',
            source_batch: row.source_batch || null,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    private normalizeDraftSpecificity(
        stored: Partial<ColdLeadDraftSpecificity>,
        drafts: ColdLeadDrafts,
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[],
        channel: ColdLeadChannel
    ): ColdLeadDraftSpecificity {
        if (!stored?.warnings || !stored?.readiness || !stored?.profile) return this.validateDraftSpecificity(drafts, company, contact, evidence, undefined, channel);
        const current = this.validateDraftSpecificity(drafts, company, contact, evidence, undefined, channel);
        if (current.readiness !== stored.readiness || current.profile.observed_signal !== stored.profile.observed_signal) return current;
        return this.validateDraftSpecificity(drafts, company, contact, evidence, undefined, channel);
    }

    private normalizeGeneratedDrafts(
        drafts: ColdLeadDrafts,
        versions: ColdLeadDraftVersion[],
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[],
        channel: ColdLeadChannel,
        compliance: ColdLeadComplianceRecord
    ): ColdLeadDrafts {
        if (versions.some((version) => version.source === 'fanny_edit')) return drafts;
        const combined = Object.values(drafts).filter(Boolean).join('\n');
        const stale = this.hasDraftClaimRisk(combined)
            || this.hasSourceLeakage(combined)
            || /Open to me sending the short note/i.test(combined)
            || /Subject:\s*small observation/i.test(combined)
            || /c2moviez could/i.test(combined)
            || /Fanny workbench/i.test(combined)
            || /Subject:\s*quick thought on your (?:positioning|services page|workflow page|product page)/i.test(combined)
            || /Subject:\s*quick note on your (?:positioning|services page|workflow page|product page)/i.test(combined)
            || /quick follow-up on your (?:positioning|services page|workflow page|product page)/i.test(combined)
            || /Worth sending you a short example angle\?/i.test(combined)
            || /\bI\s+came\s+across\b.*\bwhile looking at\b/i.test(combined);
        return stale ? this.buildDraftsFromProfile(this.buildOutreachProfile(company, contact, evidence), company, contact, channel, compliance) : drafts;
    }

    private requireLead(id: string) {
        const lead = this.getLead(id);
        if (!lead) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        return lead;
    }

    private resolveStoredCrmStage(
        storedStage: ColdLeadCrmStage | null,
        status: ColdLeadStatus,
        scoring: ColdLeadScoring,
        channel: ColdLeadChannel,
        compliance: ColdLeadComplianceRecord
    ): ColdLeadCrmStage {
        const derived = this.initialCrmStage(status, scoring, channel, compliance);
        if (!storedStage) return derived;
        if (storedStage === 'new' && derived !== 'new') return derived;
        return storedStage;
    }

    private emptyPipelineCounts(): Record<ColdLeadStatus, number> {
        return {
            intake: 0,
            enriched: 0,
            scored: 0,
            needs_review: 0,
            ready: 0,
            pushed: 0,
            sent: 0,
            replied: 0
        };
    }

    private isCurrentWeek(isoDate: string) {
        const date = new Date(isoDate);
        const now = this.now();
        const day = (now.getUTCDay() + 6) % 7;
        const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
        return date >= monday;
    }
}
