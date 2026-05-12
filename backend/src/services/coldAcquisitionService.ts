import Database from 'better-sqlite3';

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
    kind: string;
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
    total_score: number;
}

export interface ColdLeadComplianceRecord extends ColdLeadComplianceInput {
    email_allowed: boolean;
    email_block_reason: string | null;
    legal_review_required: boolean;
    compliance_badge: 'ok' | 'review' | 'blocked';
    guardrail_notes: string[];
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

export interface ColdLeadDraftSpecificity {
    valid: boolean;
    proof_chips: string[];
    missing: string[];
}

interface ColdLeadPainDiagnosis {
    subject: string;
    observation: string;
    pain: string;
    impact: string;
    solution: string;
    cta: string;
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
    created_at: string;
    updated_at: string;
}

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
    created_at: string;
    updated_at: string;
};

const DEFAULT_BOOKING_LINK = process.env.C2MOVIEZ_BOOKING_LINK || 'the c2moviez booking link';
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

export class ColdAcquisitionService {
    private db: Database.Database;
    private now: () => Date;

    constructor(db: Database.Database, options: { now?: () => Date } = {}) {
        this.db = db;
        this.now = options.now || (() => new Date());
        this.ensureSchema();
    }

    createLead(input: ColdLeadInput): ColdLeadRecord {
        const timestamp = this.nowIso();
        const company = this.normalizeCompany(input.company);
        const contact = this.normalizeContact(input.contact);
        const evidence = (input.evidence || []).map((item) => ({
            ...item,
            captured_at: item.captured_at || timestamp
        }));
        const scoringSignals = this.deriveScoringSignals(company, input.scoringSignals || {});
        const scoring = this.calculateScores(company, scoringSignals);
        const dedupe = this.buildDedupe(company, contact);
        const compliance = this.evaluateCompliance(company, contact, input.compliance);
        const channel = this.resolveChannel(company, contact, compliance);
        const outreach_drafts = this.generateDrafts(company, contact, evidence, channel, compliance);
        const draft_specificity = this.validateDraftSpecificity(outreach_drafts, company, contact, evidence);
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
            created_at: timestamp,
            updated_at: timestamp
        };

        this.insertRecord(record);
        return record;
    }

    ingestZefixBulk(records: ZefixBulkRecord[]): IngestResult {
        const result: IngestResult = { created: 0, skipped: 0, errors: [], lead_ids: [] };

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

            try {
                const lead = this.createLead({
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
                        website: record.website || '',
                        linkedin_url: record.linkedin_url || ''
                    },
                    contact: {
                        name: record.contact_name || '',
                        title: record.contact_title || '',
                        email: record.contact_email || null,
                        linkedin_url: record.contact_linkedin_url || ''
                    },
                    scoringSignals: {
                        websiteHasEnglish: this.hasEnglishUrl(record.website),
                        linkedinCompanyEnglish: Boolean(record.linkedin_url),
                        decisionMakerEnglish: Boolean(record.contact_name || record.contact_linkedin_url),
                        dotComTld: this.domainFromUrl(record.website)?.endsWith('.com') || false,
                        highFitIndustry: this.highFitIndustry(record.industry || record.purpose || '')
                    },
                    evidence: [
                        {
                            kind: 'zefix_bulk',
                            label: 'Zefix open-data record',
                            detail: record.purpose || `${record.name} is an active ${record.legal_form || 'Swiss company'} in ${record.canton || 'Switzerland'}.`,
                            url: record.source_url
                        }
                    ],
                    compliance: {
                        source: 'zefix',
                        source_url: record.source_url,
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

    ingestAustriaDirectory(records: AustriaDirectoryRecord[]): IngestResult {
        const result: IngestResult = { created: 0, skipped: 0, errors: [], lead_ids: [] };

        for (const record of records || []) {
            const district = record.postal_code || record.bezirk || '';
            if (!['1220', '1160'].includes(district)) {
                result.skipped += 1;
                continue;
            }

            try {
                const lead = this.createLead({
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
                        website: record.website || '',
                        linkedin_url: record.linkedin_url || ''
                    },
                    contact: {
                        name: record.contact_name || '',
                        title: record.contact_title || '',
                        email: record.contact_email || null,
                        linkedin_url: record.contact_linkedin_url || ''
                    },
                    scoringSignals: {
                        websiteHasEnglish: this.hasEnglishUrl(record.website),
                        linkedinCompanyEnglish: Boolean(record.linkedin_url),
                        decisionMakerEnglish: Boolean(record.contact_name || record.contact_linkedin_url),
                        dotComTld: this.domainFromUrl(record.website)?.endsWith('.com') || false,
                        highFitIndustry: this.highFitIndustry(record.industry || record.evidence_detail || '')
                    },
                    evidence: [
                        {
                            kind: `${record.source}_directory`,
                            label: `${record.source.toUpperCase()} directory record`,
                            detail: record.evidence_detail || `${record.name} is listed in Vienna ${district}.`,
                            url: record.source_url
                        }
                    ],
                    compliance: {
                        source: record.source,
                        source_url: record.source_url,
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
        >>
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
            next_follow_up_at: patch.next_follow_up_at ?? current.next_follow_up_at,
            fanny_notes: patch.fanny_notes ?? current.fanny_notes,
            outreach_drafts: patch.outreach_drafts || current.outreach_drafts,
            updated_at: this.nowIso()
        };
        next.draft_specificity = this.validateDraftSpecificity(next.outreach_drafts, next.company, next.contact, next.evidence);
        this.replaceRecord(next);
        return next;
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

    private calculateScores(company: Required<ColdLeadCompany>, signals: ColdLeadScoringSignals): ColdLeadScoring {
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
        const total_score = Math.round(
            english_score * 0.4
            + size_score * 0.2
            + industry_fit_score * 0.2
            + recency_score * 0.2
        );

        return { english_score, size_score, industry_fit_score, recency_score, total_score };
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
                guardrail_notes.push('AT lead is outside Vienna 1220/1160 target scope.');
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

    private generateDrafts(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[],
        channel: ColdLeadChannel,
        compliance: ColdLeadComplianceRecord
    ): ColdLeadDrafts {
        const proof = this.bestEvidence(evidence, company);
        const diagnosis = this.diagnosePainPoint(company, contact, proof);
        const firstName = contact.name ? contact.name.split(/\s+/)[0] : '';
        const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
        const followupGreeting = firstName ? `Hi ${firstName},` : 'Hi,';
        const quickFollowup = firstName ? `Quick follow-up, ${firstName}:` : 'Quick follow-up:';
        const booking = DEFAULT_BOOKING_LINK;

        const linkedin_intro = [
            `${greeting} ${diagnosis.observation}`,
            `The likely friction I see is this: ${diagnosis.pain}`,
            `A practical fix: ${diagnosis.solution}`,
            `If this is relevant, I can ${diagnosis.cta} and send a short booking option via ${booking}.`
        ].join(' ');

        const linkedin_followup = [
            `${quickFollowup} I saved ${company.name} because ${proof}.`,
            `The useful angle is not "more content"; it is reducing this bottleneck: ${diagnosis.impact}`,
            `Open to seeing the 5-min c2moviez overview for that acquisition path?`
        ].join(' ');

        const email_cold = compliance.email_allowed && ['email', 'both'].includes(channel)
            ? [
                `Subject: ${diagnosis.subject}`,
                '',
                greeting,
                '',
                `I came across ${company.name} while researching B2B teams with clear growth signals. ${diagnosis.observation}`,
                '',
                `Likely friction: ${diagnosis.pain}`,
                '',
                `Why it matters: ${diagnosis.impact}`,
                '',
                `Potential solution: ${diagnosis.solution}`,
                '',
                `If this is a live priority, I can ${diagnosis.cta} and suggest a short slot via ${booking}.`,
                '',
                `Best,`,
                `Fanny`,
                `c2moviez`,
                '',
                `You can opt out of further messages by replying "no thanks".`
            ].join('\n')
            : null;

        const email_followup = email_cold
            ? [
                `Subject: Re: ${diagnosis.subject}`,
                '',
                followupGreeting,
                '',
                `Circling back once on ${company.name}. The reason I reached out was not a generic production pitch; it was this signal: ${proof}.`,
                '',
                `The problem I would test first is whether ${diagnosis.impact.toLowerCase()}`,
                '',
                `If useful, I can ${diagnosis.cta} and send a booking link. If this is not relevant, I will close the loop here.`
            ].join('\n')
            : null;

        return { linkedin_intro, linkedin_followup, email_cold, email_followup };
    }

    private diagnosePainPoint(
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        proof: string
    ): ColdLeadPainDiagnosis {
        const context = `${company.name} ${company.industry} ${proof}`.toLowerCase();
        const audience = contact.title ? `${contact.title.toLowerCase()}s` : 'leadership teams';
        const cityOrMarket = company.city ? `${company.city} market` : company.country === 'CH' ? 'Swiss market' : 'Vienna market';

        if (/bio|pharma|clinical|medical|health|life science/.test(context)) {
            return {
                subject: `Making ${company.name}'s technical value easier to trust`,
                observation: `${company.name} shows a specialist health or biotech signal: ${proof}.`,
                pain: `complex biotech value can be clear to technical readers but still hard for non-specialist buyers, partners, or investors to trust quickly.`,
                impact: `the first touch may educate people on the science without giving them enough proof, clarity, and momentum to book the next conversation.`,
                solution: `c2moviez could package the core promise into a founder-led explainer, proof-led website section, LinkedIn thought-leadership clips, and search/social campaigns that all point to one clear conversion path.`,
                cta: `share a 5-min overview of that trust-building acquisition stack`
            };
        }

        if (/saas|software|cloud|data|analytics|robot|automation|technology|it\b|web-app|platform|digital/.test(context)) {
            return {
                subject: `Turning ${company.name}'s technical offer into qualified demand`,
                observation: `${company.name} shows a technical B2B signal: ${proof}.`,
                pain: `technical companies often explain what the product does before the buyer understands why it is urgent, credible, and worth a call.`,
                impact: `paid traffic, LinkedIn attention, and website visits can leak if demo proof, positioning, landing-page copy, and retargeting do not tell the same story.`,
                solution: `c2moviez could build an acquisition path around one sharp use case: a concise demo/explainer, outcome-led landing section, founder or product clips for LinkedIn, Google Ads intent capture, and retargeting assets with the same message.`,
                cta: `share a 5-min overview of that demand-generation stack`
            };
        }

        if (/marketing|communication|agency|creative|media|film|video|studio|content|social/.test(context)) {
            return {
                subject: `Sharper proof for ${company.name}'s next client conversations`,
                observation: `${company.name} shows a marketing or creative-services signal: ${proof}.`,
                pain: `service firms can look capable but still blend into a crowded vendor set when the proof, offer, and distribution are not packaged into a concrete business case.`,
                impact: `good referrals and profile visits may not convert because prospects cannot quickly see the before/after, the process, and the commercial outcome.`,
                solution: `c2moviez could turn one strongest offer into a visible proof system: short case-story video, founder-led positioning clips, landing-page rewrite, paid-social variants, and Google Ads aligned around the same niche pain.`,
                cta: `share a 5-min overview of that proof-led acquisition stack`
            };
        }

        if (/hotel|hospitality|restaurant|tourism|event|gastronomie|guest/.test(context)) {
            return {
                subject: `More direct qualified demand for ${company.name}`,
                observation: `${company.name} shows a hospitality or guest-facing signal: ${proof}.`,
                pain: `hospitality demand is highly visual, but content, booking pages, paid social, and Google intent often operate as separate pieces instead of one booking journey.`,
                impact: `international guests may like the experience but never get a crisp reason to choose, book, or enquire now.`,
                solution: `c2moviez could build a direct-demand package with high-trust video, short social cuts, Google Ads for intent, paid-social retargeting, and a landing page that turns the strongest experience into bookings or enquiries.`,
                cta: `share a 5-min overview of that direct-demand stack`
            };
        }

        if (/fintech|finance|payment|bank|insurance|regulated|legal|compliance/.test(context)) {
            return {
                subject: `Building trust before the first call with ${company.name}`,
                observation: `${company.name} shows a regulated or trust-heavy business signal: ${proof}.`,
                pain: `trust-heavy services need clarity before persuasion; prospects need to understand the risk reduction, proof, and next step before they engage.`,
                impact: `performance campaigns can underperform when the creative says "we are credible" but the page and proof do not make that credibility easy to verify.`,
                solution: `c2moviez could create a compliance-conscious trust path: executive explainer, proof-led landing section, educational LinkedIn assets, and search/social campaigns that make the safe next step obvious.`,
                cta: `share a 5-min overview of that trust-building stack`
            };
        }

        if (/ngo|foundation|international|un city|non-profit|association|organisation/.test(context)) {
            return {
                subject: `A clearer partner story for ${company.name}`,
                observation: `${company.name} shows an international or partner-facing signal: ${proof}.`,
                pain: `international service teams often have strong work but a story that is split across pages, decks, posts, and stakeholder conversations.`,
                impact: `partners may understand the mission yet miss the concrete reason to start a project, fund an initiative, or introduce the right person.`,
                solution: `c2moviez could turn the strongest partner story into a short overview film, proof-led web narrative, LinkedIn cuts, and campaign assets that make the next action concrete.`,
                cta: `share a 5-min overview of that partner-acquisition stack`
            };
        }

        return {
            subject: `A clearer acquisition path for ${company.name}`,
            observation: `${company.name} stood out in the ${cityOrMarket}: ${proof}.`,
            pain: `${audience} often have a credible offer, but prospects still need a faster way to understand the problem, trust the proof, and see the next step.`,
            impact: `attention from LinkedIn, search, referrals, and the website can stay fragmented instead of becoming qualified conversations.`,
            solution: `c2moviez could build a compact acquisition path: one sharp message, proof-led video, supporting social cuts, Google Ads intent capture, and a landing page that carries the same argument from first impression to booked call.`,
            cta: `share a 5-min overview of that acquisition stack`
        };
    }

    private validateDraftSpecificity(
        drafts: ColdLeadDrafts,
        company: Required<ColdLeadCompany>,
        contact: Required<ColdLeadContact>,
        evidence: ColdLeadEvidence[]
    ): ColdLeadDraftSpecificity {
        const combined = Object.values(drafts).filter(Boolean).join('\n').toLowerCase();
        const proof_chips = evidence
            .filter((item) => item.detail && combined.includes(item.detail.toLowerCase().slice(0, 32)))
            .map((item) => item.label);

        const missing = [];
        if (!combined.includes(company.name.toLowerCase())) missing.push('company_name');
        if (contact.name && !combined.includes(contact.name.split(/\s+/)[0].toLowerCase())) missing.push('contact_reference');
        if (proof_chips.length === 0) missing.push('evidence_detail');

        return {
            valid: missing.length === 0,
            proof_chips,
            missing
        };
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
            website: company.website || '',
            linkedin_url: company.linkedin_url || ''
        };
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
        const website = company.website.toLowerCase();
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

    private bestEvidence(evidence: ColdLeadEvidence[], company: Required<ColdLeadCompany>) {
        const best = evidence.find((item) => item.detail?.trim()) || evidence[0];
        if (best?.detail) return this.prospectFacingEvidence(best.detail);
        if (company.website) return `${company.website} shows a public business presence`;
        return `${company.industry || 'their market'} suggests a visible B2B growth motion`;
    }

    private prospectFacingEvidence(detail: string) {
        return detail
            .replace(/\s+/g, ' ')
            .replace(/\bEnglish-speaking\s+/gi, '')
            .replace(/\bEnglish-first\s+/gi, '')
            .replace(/\bEnglish-language\s+/gi, '')
            .replace(/\bEnglish\s+(product|services?|website|landing|company)\s+(page|pages|section|sections)\b/gi, 'public $1 $2')
            .replace(/\bin English\b/gi, 'clearly')
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

    private domainFromUrl(url: string | undefined | null) {
        if (!url) return null;
        try {
            const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
            return parsed.hostname.replace(/^www\./, '').toLowerCase();
        } catch {
            return null;
        }
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
                draft_specificity_json, dedupe_json, notes, webhook_lead_id, webhook_status,
                webhook_response_json, reply_text, crm_stage, owner_user_id, last_touch_at,
                next_follow_up_at, fanny_notes, uid_or_fn, primary_domain, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        const scoring = JSON.parse(row.scoring_json);
        const scoringSignals = JSON.parse(row.scoring_signals_json);
        const evidence = JSON.parse(row.evidence_json);
        const compliance = JSON.parse(row.compliance_json);
        const outreach_drafts = JSON.parse(row.outreach_drafts_json);
        const draft_specificity = JSON.parse(row.draft_specificity_json);
        const dedupe = JSON.parse(row.dedupe_json);
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
            created_at: row.created_at,
            updated_at: row.updated_at
        };
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
