import crypto from 'crypto';
import Database from 'better-sqlite3';
import {
    AustriaDirectoryRecord,
    ColdAcquisitionService,
    ColdLeadCrmStage,
    ColdLeadDrafts,
    ColdLeadRecord,
    ColdLeadStatus,
    computeSourceConfidence,
    SourceConfidence,
    ZefixBulkRecord
} from './coldAcquisitionService';

export const CRM_SESSION_COOKIE = 'acquisition_session';

export type ColdAcquisitionCrmRole = 'admin' | 'operator';

export interface ColdAcquisitionCrmUser {
    id: string;
    email: string;
    role: ColdAcquisitionCrmRole;
    created_at: string;
    updated_at: string;
}

export interface ColdAcquisitionActivity {
    id: string;
    lead_id: string;
    user_id: string | null;
    type: string;
    detail: string;
    metadata: unknown | null;
    created_at: string;
}

type UserRow = ColdAcquisitionCrmUser & {
    password_hash: string;
};

type SessionRow = {
    id: string;
    user_id: string;
    token_hash: string;
    expires_at: string;
    created_at: string;
    last_seen_at: string | null;
    revoked_at: string | null;
    email: string;
    role: ColdAcquisitionCrmRole;
    user_created_at: string;
    user_updated_at: string;
};

type ActivityRow = {
    id: string;
    lead_id: string;
    user_id: string | null;
    type: string;
    detail: string;
    metadata_json: string | null;
    created_at: string;
};

export interface CrmLeadPatch {
    status?: ColdLeadStatus;
    crm_stage?: ColdLeadCrmStage;
    fanny_notes?: string;
    next_follow_up_at?: string | null;
    outreach_drafts?: Partial<ColdLeadDrafts>;
    reply_text?: string | null;
    owner_user_id?: string | null;
}

export type TodayMissionDraftType = 'linkedin_intro' | 'email_cold';
export type TodayMissionDueState = 'none' | 'due_today' | 'overdue';
export type ReplyType = 'interested' | 'not_now' | 'opt_out' | 'other';

export interface SourcePipeline {
    confidence: SourceConfidence;
    batch_id: string | null;
    public_email_basis: boolean;
    wrong_lead_risk: boolean;
}

export interface CrmLead extends ColdLeadRecord {
    source_pipeline: SourcePipeline;
}

export interface TodayMissionLead extends CrmLead {
    send_blockers: string[];
    preferred_draft_type: TodayMissionDraftType;
    draft_excerpt: string;
    due_state: TodayMissionDueState;
    quality_label: string;
    quality_blockers: string[];
    source_confidence: 'low' | 'medium' | 'high';
    evidence_confidence: 'low' | 'medium' | 'high';
}

export interface TodayMission {
    generated_at: string;
    weekly: {
        target: number;
        pushed: number;
        remaining: number;
    };
    counts: {
        review_ready: number;
        sendable: number;
        follow_ups_due: number;
        needs_research: number;
        review_needed: number;
        blocked: number;
        overdue: number;
    };
    review_ready: TodayMissionLead[];
    sendable: TodayMissionLead[];
    follow_ups_due: TodayMissionLead[];
    needs_research: TodayMissionLead[];
}

export type AcquisitionSourceStatus = 'configured' | 'missing_credentials' | 'available_discovery_only' | 'requires_provider_access';

export interface AcquisitionSourceConfig {
    key: 'zefix' | 'firmafind' | 'wirtschaftscompass';
    label: string;
    market: 'CH' | 'AT';
    status: AcquisitionSourceStatus;
    api_base_url: string;
    api_docs_url: string;
    ingest_endpoint: string | null;
    required_env: string[];
    configured_env: string[];
    notes: string[];
}

export interface AcquisitionSourceConfigResponse {
    generated_at: string;
    sources: AcquisitionSourceConfig[];
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const CRM_VIEW_KEYS = ['ready', 'needs_review', 'email_eligible', 'linkedin_first', 'sent', 'replied', 'qualified', 'blocked'] as const;

export class ColdAcquisitionCrmService {
    private db: Database.Database;
    private leads: ColdAcquisitionService;
    private now: () => Date;

    constructor(db: Database.Database, options: { now?: () => Date } = {}) {
        this.db = db;
        this.leads = new ColdAcquisitionService(db, options);
        this.now = options.now || (() => new Date());
        this.ensureSchema();
        this.seedUsersFromEnv();
    }

    login(email: string, password: string) {
        const normalizedEmail = email.trim().toLowerCase();
        const row = this.db.prepare('SELECT * FROM cold_acquisition_crm_users WHERE email = ?').get(normalizedEmail) as UserRow | undefined;
        if (!row || !this.verifyPassword(password, row.password_hash)) {
            throw Object.assign(new Error('INVALID_CRM_LOGIN'), { statusCode: 401 });
        }

        const token = crypto.randomBytes(32).toString('base64url');
        const expiresAt = new Date(this.now().getTime() + SESSION_TTL_MS).toISOString();
        const sessionId = this.createId('crm_session');
        this.db.prepare(`
            INSERT INTO cold_acquisition_crm_sessions (
                id, user_id, token_hash, expires_at, created_at, last_seen_at, revoked_at
            ) VALUES (?, ?, ?, ?, ?, ?, NULL)
        `).run(sessionId, row.id, this.hashToken(token), expiresAt, this.nowIso(), this.nowIso());

        this.logActivity(row, null, 'login', 'Signed in to PRISM Workbench.', null);
        return {
            user: this.publicUser(row),
            token,
            expires_at: expiresAt
        };
    }

    logoutFromCookie(cookieHeader: string | undefined) {
        const token = this.readCookie(cookieHeader, CRM_SESSION_COOKIE);
        if (!token) return false;
        const result = this.db.prepare(`
            UPDATE cold_acquisition_crm_sessions
            SET revoked_at = ?
            WHERE token_hash = ? AND revoked_at IS NULL
        `).run(this.nowIso(), this.hashToken(token));
        return result.changes > 0;
    }

    getUserFromCookie(cookieHeader: string | undefined): ColdAcquisitionCrmUser | null {
        const token = this.readCookie(cookieHeader, CRM_SESSION_COOKIE);
        if (!token) return null;
        const row = this.db.prepare(`
            SELECT
                sessions.*,
                users.email,
                users.role,
                users.created_at AS user_created_at,
                users.updated_at AS user_updated_at
            FROM cold_acquisition_crm_sessions sessions
            JOIN cold_acquisition_crm_users users ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
              AND sessions.revoked_at IS NULL
              AND sessions.expires_at > ?
        `).get(this.hashToken(token), this.nowIso()) as SessionRow | undefined;

        if (!row) return null;
        this.db.prepare('UPDATE cold_acquisition_crm_sessions SET last_seen_at = ? WHERE id = ?').run(this.nowIso(), row.id);
        return {
            id: row.user_id,
            email: row.email,
            role: row.role,
            created_at: row.user_created_at,
            updated_at: row.user_updated_at
        };
    }

    getDashboard() {
        const dashboard = this.leads.getDashboard();
        const leads = this.leads.listLeads();
        const view_counts = Object.fromEntries(
            CRM_VIEW_KEYS.map((view) => [view, this.applyView(leads, view).length])
        );
        return { ...dashboard, view_counts };
    }

    getTodayMission(): TodayMission {
        const generated_at = this.nowIso();
        const dashboard = this.leads.getDashboard();
        const leads = this.leads.listLeads();

        const review_ready = leads
            .filter((lead) => this.leads.getSendBlockers(lead).length === 0)
            .sort((a, b) => this.reviewReadySort(b) - this.reviewReadySort(a) || String(b.updated_at).localeCompare(String(a.updated_at)))
            .map((lead) => this.toTodayMissionLead(lead));
        const sendable = review_ready;
        const reviewReadyIds = new Set(review_ready.map((lead) => lead.id));

        const follow_ups_due = leads
            .filter((lead) => !reviewReadyIds.has(lead.id))
            .filter((lead) => !this.isBlockedMissionLead(lead))
            .filter((lead) => this.dueState(lead) !== 'none')
            .sort((a, b) => this.followUpSortTime(a.next_follow_up_at) - this.followUpSortTime(b.next_follow_up_at))
            .map((lead) => this.toTodayMissionLead(lead));
        const occupiedIds = new Set([...review_ready.map((lead) => lead.id), ...follow_ups_due.map((lead) => lead.id)]);

        const needs_research = leads
            .filter((lead) => !occupiedIds.has(lead.id))
            .filter((lead) => !this.isBlockedMissionLead(lead))
            .filter((lead) => this.isResearchMissionLead(lead))
            .sort((a, b) => b.scoring.total_score - a.scoring.total_score || String(b.updated_at).localeCompare(String(a.updated_at)))
            .map((lead) => this.toTodayMissionLead(lead));

        return {
            generated_at,
            weekly: dashboard.weekly_quota,
            counts: {
                review_ready: review_ready.length,
                sendable: review_ready.length,
                follow_ups_due: follow_ups_due.length,
                needs_research: leads.filter((lead) => lead.draft_specificity.readiness === 'needs_research').length,
                review_needed: leads.filter((lead) => lead.compliance.compliance_badge === 'review').length,
                blocked: leads.filter((lead) => this.isBlockedMissionLead(lead)).length,
                overdue: leads.filter((lead) => !this.isBlockedMissionLead(lead) && this.dueState(lead) === 'overdue').length
            },
            review_ready,
            sendable,
            follow_ups_due,
            needs_research
        };
    }

    getNextLead(_userId: string): { lead_id: string; score: number } | null {
        const next = this.leads.listLeads()
            .filter((lead) => this.isNextLeadEligible(lead))
            .sort((a, b) => b.scoring.total_score - a.scoring.total_score || String(b.updated_at).localeCompare(String(a.updated_at)))[0];
        return next ? { lead_id: next.id, score: next.scoring.total_score } : null;
    }

    listLeads(filters: { view?: string; q?: string; sort?: string } = {}) {
        let leads = this.leads.listLeads({ q: filters.q });
        if (filters.view) leads = this.applyView(leads, filters.view);

        const sort = filters.sort || 'updated_desc';
        return leads.sort((a, b) => {
            if (sort === 'score_desc') return b.scoring.total_score - a.scoring.total_score;
            if (sort === 'date_asc') return String(a.updated_at).localeCompare(String(b.updated_at));
            if (sort === 'stage') return a.crm_stage.localeCompare(b.crm_stage) || b.scoring.total_score - a.scoring.total_score;
            return String(b.updated_at).localeCompare(String(a.updated_at));
        }).map((lead) => this.toCrmLead(lead));
    }

    getLead(id: string) {
        const lead = this.leads.getLead(id);
        if (!lead) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        return {
            lead: this.toCrmLead(lead),
            activity: this.listActivity(id)
        };
    }

    updateLead(user: ColdAcquisitionCrmUser, id: string, patch: CrmLeadPatch) {
        const current = this.leads.getLead(id);
        if (!current) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });

        const nextDrafts = patch.outreach_drafts
            ? { ...current.outreach_drafts, ...patch.outreach_drafts }
            : current.outreach_drafts;
        const status = patch.status || current.status;
        const touched = status === 'sent' || status === 'replied' || Boolean(patch.reply_text);
        const next = this.leads.updateLead(id, {
            status,
            crm_stage: patch.crm_stage || this.stageFromStatus(status, current.crm_stage),
            fanny_notes: patch.fanny_notes ?? current.fanny_notes,
            next_follow_up_at: patch.next_follow_up_at === undefined ? current.next_follow_up_at : patch.next_follow_up_at,
            owner_user_id: patch.owner_user_id === undefined ? current.owner_user_id : patch.owner_user_id,
            outreach_drafts: nextDrafts,
            reply_text: patch.reply_text === undefined ? current.reply_text : patch.reply_text,
            last_touch_at: touched ? this.nowIso() : current.last_touch_at
        });

        this.logLeadUpdateActivity(user, current, next, patch);
        return this.toCrmLead(next);
    }

    copyDraft(user: ColdAcquisitionCrmUser, leadId: string, draftType: keyof ColdLeadDrafts) {
        const lead = this.leads.getLead(leadId);
        if (!lead) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        const blockers = this.leads.getSendBlockers(lead);
        if (blockers.length > 0) throw Object.assign(new Error('COMPLIANCE_SEND_BLOCKED'), { statusCode: 409, blockers });
        const text = lead.outreach_drafts[draftType];
        if (!text) throw Object.assign(new Error('DRAFT_NOT_AVAILABLE'), { statusCode: 400 });
        this.logActivity(user, lead.id, 'draft_copied', `Copied ${draftType} draft.`, { draft_type: draftType });
        const { subject, body } = this.splitDraft(text);
        return { draft_type: draftType, subject, body, text };
    }

    markSent(user: ColdAcquisitionCrmUser, id: string, body: { channel?: string; follow_up_date?: string | null; next_follow_up_at?: string | null }) {
        const current = this.leads.getLead(id);
        if (!current) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        const channel = String(body.channel || '').trim();
        if (!channel) throw Object.assign(new Error('channel required'), { statusCode: 400 });
        if (!['email', 'linkedin'].includes(channel)) throw Object.assign(new Error('channel must be email or linkedin'), { statusCode: 400 });
        const followUpDate = body.follow_up_date === undefined ? body.next_follow_up_at ?? null : body.follow_up_date;
        const blockers = this.leads.getSendBlockers(current);
        if (blockers.length > 0) throw Object.assign(new Error('COMPLIANCE_SEND_BLOCKED'), { statusCode: 409, blockers });
        const next = this.leads.updateLead(id, {
            status: 'sent',
            crm_stage: 'sent',
            channel: channel as any,
            last_touch_at: this.nowIso(),
            next_follow_up_at: followUpDate
        });
        this.logActivity(user, next.id, 'marked_sent', `Marked sent via ${channel}.`, { channel, follow_up_date: followUpDate });
        return this.toCrmLead(next);
    }

    scheduleFollowUp(user: ColdAcquisitionCrmUser, id: string, next_follow_up_at: string | null) {
        const next = this.updateLead(user, id, { next_follow_up_at });
        this.logActivity(user, id, 'follow_up_scheduled', next_follow_up_at ? `Follow-up set for ${next_follow_up_at}.` : 'Follow-up cleared.', { next_follow_up_at });
        return next;
    }

    recordReply(user: ColdAcquisitionCrmUser, id: string, replyText: string) {
        if (!replyText.trim()) throw Object.assign(new Error('reply_text is required'), { statusCode: 400 });
        return this.updateLead(user, id, { status: 'replied', crm_stage: 'replied', reply_text: replyText.trim() });
    }

    logReply(leadId: string, userId: string, replyType: ReplyType, note: string) {
        const current = this.leads.getLead(leadId);
        if (!current) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        const user = { id: userId };
        const cleanNote = String(note || '').trim();
        const detail = cleanNote ? `Reply logged: ${replyType}. ${cleanNote}` : `Reply logged: ${replyType}.`;

        if (replyType === 'opt_out') {
            const suppression = this.suppressionKeys(current);
            const next = this.leads.updateLead(leadId, {
                status: 'disqualified' as any,
                crm_stage: 'blocked',
                reply_text: cleanNote,
                last_touch_at: this.nowIso(),
                fanny_notes: this.appendCrmNote(current.fanny_notes, cleanNote || 'Opt-out recorded.')
            } as any);
            this.logActivity(user, leadId, 'reply_logged', detail, { reply_type: replyType, note: cleanNote });
            this.logActivity(user, leadId, 'suppression_recorded', 'Contact suppression recorded after opt-out reply.', suppression);
            return { suppressed: true, lead_id: leadId, lead: this.toCrmLead(next) };
        }

        const next = this.leads.updateLead(leadId, {
            status: 'replied',
            crm_stage: 'replied',
            reply_text: cleanNote,
            last_touch_at: this.nowIso()
        });
        this.logActivity(user, leadId, 'reply_logged', detail, { reply_type: replyType, note: cleanNote });
        return { suppressed: false, lead_id: leadId, lead: this.toCrmLead(next) };
    }

    addActivity(user: ColdAcquisitionCrmUser, leadId: string, type: string, detail: string, metadata: unknown = null) {
        if (!this.leads.getLead(leadId)) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        return this.logActivity(user, leadId, type, detail, metadata);
    }

    async pushReadyBatch(options: { dryRun?: boolean; limit?: number }) {
        return this.leads.pushReadyBatch(options);
    }

    async ingestZefixBulk(records: ZefixBulkRecord[]) {
        return this.leads.ingestZefixBulk(records);
    }

    async ingestAustriaDirectory(records: AustriaDirectoryRecord[]) {
        return this.leads.ingestAustriaDirectory(records);
    }

    async regenerateDraft(leadId: string, userId: string) {
        const current = this.leads.getLead(leadId);
        if (!current) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });

        const regenerated = await this.leads.regenerateDraftsForLead(current);
        const next = this.leads.updateLead(leadId, {
            outreach_drafts: regenerated.outreach_drafts,
            draft_specificity: regenerated.draft_specificity
        });
        this.logActivity({ id: userId }, leadId, 'draft_regenerated', 'Regenerated outreach drafts with compiled company profile.', null);
        return this.toCrmLead(next);
    }

    getSourceConfig(): AcquisitionSourceConfigResponse {
        const zefixRequired = ['ZEFIX_API_USERNAME', 'ZEFIX_API_PASSWORD'];
        const compassRequired = ['WIRTSCHAFTSCOMPASS_API_TOKEN'];
        return {
            generated_at: this.nowIso(),
            sources: [
                {
                    key: 'zefix',
                    label: 'Swiss Zefix PublicREST',
                    market: 'CH',
                    status: this.envConfigured(zefixRequired) ? 'configured' : 'missing_credentials',
                    api_base_url: process.env.ZEFIX_API_BASE || 'https://www.zefix.admin.ch/ZefixPublicREST',
                    api_docs_url: 'https://www.zefix.admin.ch/ZefixPublicREST/v3/api-docs',
                    ingest_endpoint: '/acquisition/api/admin/ingest/zefix-bulk',
                    required_env: zefixRequired,
                    configured_env: this.configuredEnv(zefixRequired),
                    notes: [
                        'Official Swiss central business name index API.',
                        'Company search is POST /api/v1/company/search.',
                        'Authenticated detail records can be transformed into PRISM Swiss register records.'
                    ]
                },
                {
                    key: 'firmafind',
                    label: 'FirmaFind Austrian company search',
                    market: 'AT',
                    status: process.env.FIRMAFIND_API_KEY ? 'configured' : 'available_discovery_only',
                    api_base_url: process.env.FIRMAFIND_API_BASE || 'https://firmafind.at/api',
                    api_docs_url: 'https://firmafind.at/',
                    ingest_endpoint: null,
                    required_env: ['FIRMAFIND_API_KEY'],
                    configured_env: this.configuredEnv(['FIRMAFIND_API_KEY']),
                    notes: [
                        'Public search endpoint is GET /companies/public?q=...',
                        'Public search is useful for Vienna discovery, but the free result shape is not enough for sendable outreach.',
                        'Use paid/API-key details or a verified website/email enrichment step before PRISM ingest.'
                    ]
                },
                {
                    key: 'wirtschaftscompass',
                    label: 'Wirtschafts-Compass API',
                    market: 'AT',
                    status: this.envConfigured(compassRequired) ? 'configured' : 'requires_provider_access',
                    api_base_url: process.env.WIRTSCHAFTSCOMPASS_API_BASE || 'https://api.wirtschaftscompass.at',
                    api_docs_url: 'https://api.wirtschaftscompass.at/de/dokumentation',
                    ingest_endpoint: '/acquisition/api/admin/ingest/austria-directory',
                    required_env: compassRequired,
                    configured_env: this.configuredEnv(compassRequired),
                    notes: [
                        'Richer Austrian company/provider API with search, reports, and register-backed details.',
                        'Requires Bearer token/provider access.',
                        'Best candidate for a full Vienna feed once credentials are available.'
                    ]
                }
            ]
        };
    }

    getWebhookConfig() {
        return {
            configured: Boolean(process.env.COLD_ACQ_LEAD_WEBHOOK_URL && process.env.COLD_ACQ_LEAD_API_KEY),
            endpoint: process.env.COLD_ACQ_LEAD_WEBHOOK_URL ? 'configured' : 'missing',
            api_key: process.env.COLD_ACQ_LEAD_API_KEY ? 'configured' : 'missing'
        };
    }

    private ensureSchema() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS cold_acquisition_crm_users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'operator')),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS cold_acquisition_crm_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_seen_at TEXT,
                revoked_at TEXT,
                FOREIGN KEY(user_id) REFERENCES cold_acquisition_crm_users(id)
            );

            CREATE TABLE IF NOT EXISTS cold_acquisition_activity (
                id TEXT PRIMARY KEY,
                lead_id TEXT,
                user_id TEXT,
                type TEXT NOT NULL,
                detail TEXT NOT NULL,
                metadata_json TEXT,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_cold_acq_crm_sessions_hash ON cold_acquisition_crm_sessions(token_hash);
            CREATE INDEX IF NOT EXISTS idx_cold_acq_crm_sessions_user ON cold_acquisition_crm_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_cold_acq_activity_lead ON cold_acquisition_activity(lead_id, created_at);
        `);
    }

    private seedUsersFromEnv() {
        this.seedUser(process.env.COLD_ACQ_ADMIN_EMAIL, process.env.COLD_ACQ_ADMIN_PASSWORD, 'admin');
        this.seedUser(process.env.COLD_ACQ_FANNY_EMAIL, process.env.COLD_ACQ_FANNY_PASSWORD, 'operator');
    }

    private seedUser(email: string | undefined, password: string | undefined, role: ColdAcquisitionCrmRole) {
        if (!email || !password) return;
        const normalizedEmail = email.trim().toLowerCase();
        const now = this.nowIso();
        const existing = this.db.prepare('SELECT id FROM cold_acquisition_crm_users WHERE email = ?').get(normalizedEmail) as { id: string } | undefined;
        if (existing) {
            this.db.prepare(`
                UPDATE cold_acquisition_crm_users
                SET password_hash = ?, role = ?, updated_at = ?
                WHERE id = ?
            `).run(this.hashPassword(password), role, now, existing.id);
            return;
        }
        this.db.prepare(`
            INSERT INTO cold_acquisition_crm_users (id, email, password_hash, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(this.createId('crm_user'), normalizedEmail, this.hashPassword(password), role, now, now);
    }

    private listActivity(leadId: string): ColdAcquisitionActivity[] {
        const rows = this.db.prepare(`
            SELECT *
            FROM cold_acquisition_activity
            WHERE lead_id = ?
            ORDER BY created_at DESC
        `).all(leadId) as ActivityRow[];
        return rows.map((row) => ({
            id: row.id,
            lead_id: row.lead_id,
            user_id: row.user_id,
            type: row.type,
            detail: row.detail,
            metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
            created_at: row.created_at
        }));
    }

    private logLeadUpdateActivity(
        user: ColdAcquisitionCrmUser,
        before: ColdLeadRecord,
        after: ColdLeadRecord,
        patch: CrmLeadPatch
    ) {
        if (patch.outreach_drafts) this.logActivity(user, after.id, 'draft_edit', 'Edited outreach draft.', { keys: Object.keys(patch.outreach_drafts) });
        if (patch.fanny_notes !== undefined || patch.next_follow_up_at !== undefined) this.logActivity(user, after.id, 'notes_updated', 'Updated notes or follow-up date.', null);
        if (before.status !== after.status || before.crm_stage !== after.crm_stage) {
            const type = after.status === 'sent'
                ? 'marked_sent'
                : after.status === 'replied'
                    ? 'reply_logged'
                    : after.crm_stage === 'qualified'
                        ? 'qualified'
                        : after.crm_stage === 'blocked'
                            ? 'blocked'
                            : 'stage_updated';
            this.logActivity(user, after.id, type, `Moved lead to ${after.crm_stage}.`, { status: after.status, crm_stage: after.crm_stage });
        }
        if (patch.reply_text) this.logActivity(user, after.id, 'reply_logged', 'Recorded prospect reply.', { reply_text: patch.reply_text });
        if (!patch.outreach_drafts && patch.fanny_notes === undefined && patch.next_follow_up_at === undefined && before.status === after.status && before.crm_stage === after.crm_stage && patch.reply_text === undefined) {
            this.logActivity(user, after.id, 'lead_updated', 'Updated lead.', null);
        }
    }

    private logActivity(
        user: Pick<ColdAcquisitionCrmUser, 'id'> | null,
        leadId: string | null,
        type: string,
        detail: string,
        metadata: unknown
    ): ColdAcquisitionActivity {
        const event: ColdAcquisitionActivity = {
            id: this.createId('crm_activity'),
            lead_id: leadId || '',
            user_id: user?.id || null,
            type,
            detail,
            metadata,
            created_at: this.nowIso()
        };
        this.db.prepare(`
            INSERT INTO cold_acquisition_activity (id, lead_id, user_id, type, detail, metadata_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            event.id,
            leadId,
            event.user_id,
            event.type,
            event.detail,
            metadata === undefined || metadata === null ? null : JSON.stringify(metadata),
            event.created_at
        );
        return event;
    }

    private applyView(leads: ColdLeadRecord[], view: string) {
        switch (view) {
            case 'ready':
                return leads.filter((lead) => lead.crm_stage === 'ready');
            case 'needs_review':
                return leads.filter((lead) => lead.crm_stage === 'needs_review' || lead.status === 'needs_review');
            case 'email_eligible':
                return leads.filter((lead) => lead.compliance.email_allowed && ['email', 'both'].includes(lead.channel));
            case 'linkedin_first':
                return leads.filter((lead) => ['linkedin', 'both'].includes(lead.channel));
            case 'sent':
                return leads.filter((lead) => lead.crm_stage === 'sent' || lead.status === 'sent');
            case 'replied':
                return leads.filter((lead) => lead.crm_stage === 'replied' || lead.status === 'replied');
            case 'qualified':
                return leads.filter((lead) => lead.crm_stage === 'qualified');
            case 'blocked':
                return leads.filter((lead) => lead.crm_stage === 'blocked' || lead.channel === 'blocked' || lead.compliance.compliance_badge === 'blocked');
            default:
                return leads;
        }
    }

    private stageFromStatus(status: ColdLeadStatus, fallback: ColdLeadCrmStage): ColdLeadCrmStage {
        if (status === 'sent') return 'sent';
        if (status === 'replied') return 'replied';
        if (status === 'needs_review') return 'needs_review';
        if (status === 'ready' || status === 'pushed' || status === 'scored') return fallback === 'qualified' ? 'qualified' : 'ready';
        return fallback;
    }

    private toTodayMissionLead(lead: ColdLeadRecord): TodayMissionLead {
        const preferred_draft_type = this.preferredDraftType(lead);
        const source_pipeline = this.sourcePipeline(lead);
        const quality_blockers = Array.from(new Set([
            ...this.leads.getSendBlockers(lead),
            ...lead.draft_specificity.missing,
            ...(lead.draft_specificity.warnings || [])
        ]));
        const evidence_confidence = lead.draft_specificity.profile?.confidence || 'low';
        return {
            ...lead,
            source_pipeline,
            send_blockers: this.leads.getSendBlockers(lead),
            preferred_draft_type,
            draft_excerpt: this.draftExcerpt(lead.outreach_drafts[preferred_draft_type] || ''),
            due_state: this.dueState(lead),
            quality_label: this.qualityLabel(lead),
            quality_blockers,
            source_confidence: source_pipeline.confidence.level,
            evidence_confidence
        };
    }

    private splitDraft(text: string) {
        const match = text.match(/^Subject:\s*(.+)$/im);
        const subject = match?.[1]?.trim();
        const body = text.replace(/^Subject:.*$(\r?\n)?/im, '').trim();
        return { subject, body };
    }

    private reviewReadySort(lead: ColdLeadRecord) {
        return lead.scoring.total_score
            + this.confidenceWeight(lead.draft_specificity.profile?.confidence || 'low')
            + this.confidenceWeight(computeSourceConfidence(lead).level);
    }

    private confidenceWeight(value: 'low' | 'medium' | 'high') {
        if (value === 'high') return 20;
        if (value === 'medium') return 10;
        return 0;
    }

    private qualityLabel(lead: ColdLeadRecord) {
        if (lead.draft_specificity.readiness === 'ready_to_rework') return 'Ready for review';
        if (lead.draft_specificity.readiness === 'draft_review') return 'Needs draft review';
        if (lead.draft_specificity.readiness === 'needs_research') return 'Needs research';
        if (lead.draft_specificity.readiness === 'needs_rework') return 'Needs draft rework';
        return 'Blocked';
    }

    private preferredDraftType(lead: ColdLeadRecord): TodayMissionDraftType {
        if (['linkedin', 'both'].includes(lead.channel) && lead.outreach_drafts.linkedin_intro?.trim()) return 'linkedin_intro';
        if (['email', 'both'].includes(lead.channel) && lead.outreach_drafts.email_cold?.trim()) return 'email_cold';
        return ['email'].includes(lead.channel) ? 'email_cold' : 'linkedin_intro';
    }

    private draftExcerpt(value: string) {
        const compact = value.replace(/\s+/g, ' ').trim();
        return compact.length > 140 ? `${compact.slice(0, 140)}...` : compact;
    }

    private isBlockedMissionLead(lead: ColdLeadRecord) {
        return lead.crm_stage === 'blocked'
            || lead.channel === 'blocked'
            || lead.compliance.compliance_badge === 'blocked'
            || lead.dedupe.is_duplicate;
    }

    private isResearchMissionLead(lead: ColdLeadRecord) {
        return lead.draft_specificity.readiness === 'needs_research'
            || lead.draft_specificity.missing.includes('evidence_detail')
            || (lead.draft_specificity.warnings || []).includes('thin_evidence');
    }

    private isNextLeadEligible(lead: ColdLeadRecord) {
        if (lead.status === 'sent' || lead.status === 'replied') return false;
        if (lead.crm_stage === 'sent' || lead.crm_stage === 'replied') return false;
        if (lead.company.country === 'CH' && (lead.status === 'needs_review' || lead.compliance.compliance_badge === 'review')) return false;
        if (this.isSuppressedLead(lead)) return false;
        return this.leads.getSendBlockers(lead).length === 0;
    }

    private isSuppressedLead(lead: ColdLeadRecord) {
        const text = [
            lead.notes,
            lead.fanny_notes,
            lead.reply_text || ''
        ].join(' ').toLowerCase();
        return /\b(opt[- ]?out|unsubscribe|do not contact|no thanks|suppressed)\b/.test(text);
    }

    private suppressionKeys(lead: ColdLeadRecord) {
        return {
            email: lead.contact.email || null,
            linkedin_url: lead.contact.linkedin_url || lead.company.linkedin_url || null,
            contact_company: [lead.contact.name, lead.company.name].filter(Boolean).join(' :: ') || null
        };
    }

    private appendCrmNote(current: string, note: string) {
        return [current, note].filter(Boolean).join('\n');
    }

    private toCrmLead(lead: ColdLeadRecord): CrmLead {
        return {
            ...lead,
            source_pipeline: this.sourcePipeline(lead)
        };
    }

    private sourcePipeline(lead: ColdLeadRecord): SourcePipeline {
        const confidence = computeSourceConfidence(lead);
        return {
            confidence,
            batch_id: lead.source_batch || null,
            public_email_basis: this.hasPublicEmailBasis(lead),
            wrong_lead_risk: confidence.score < 0.4 && this.isSendableOrNearSendable(lead)
        };
    }

    private hasPublicEmailBasis(lead: ColdLeadRecord) {
        return Boolean(lead.contact.email && lead.compliance.legal_basis === 'website_published_email');
    }

    private isSendableOrNearSendable(lead: ColdLeadRecord) {
        if (this.isBlockedMissionLead(lead) || this.isResearchMissionLead(lead)) return false;
        if (this.leads.getSendBlockers(lead).length === 0) return true;
        return lead.channel !== 'blocked'
            && !lead.dedupe.is_duplicate
            && lead.compliance.compliance_badge !== 'blocked'
            && (lead.crm_stage === 'ready' || lead.scoring.total_score >= 60);
    }

    private dueState(lead: ColdLeadRecord): TodayMissionDueState {
        const value = lead.next_follow_up_at;
        if (!value) return 'none';
        const datePart = this.followUpDatePart(value);
        if (!datePart) return 'none';
        const today = this.nowIso().slice(0, 10);
        if (datePart < today) return 'overdue';
        if (datePart > today) return 'none';
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'due_today';
        const timestamp = Date.parse(value);
        if (Number.isNaN(timestamp)) return 'none';
        return timestamp <= this.now().getTime() ? 'due_today' : 'none';
    }

    private followUpDatePart(value: string) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString().slice(0, 10);
    }

    private followUpSortTime(value: string | null) {
        if (!value) return Number.POSITIVE_INFINITY;
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return Date.parse(`${value}T00:00:00.000Z`);
        const timestamp = Date.parse(value);
        return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
    }

    private envConfigured(keys: string[]) {
        return keys.every((key) => Boolean(process.env[key]));
    }

    private configuredEnv(keys: string[]) {
        return keys.filter((key) => Boolean(process.env[key]));
    }

    private publicUser(row: UserRow): ColdAcquisitionCrmUser {
        return {
            id: row.id,
            email: row.email,
            role: row.role,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    private hashPassword(password: string) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 64).toString('hex');
        return `scrypt$${salt}$${hash}`;
    }

    private verifyPassword(password: string, stored: string) {
        const [scheme, salt, hash] = stored.split('$');
        if (scheme !== 'scrypt' || !salt || !hash) return false;
        const actual = Buffer.from(crypto.scryptSync(password, salt, 64).toString('hex'), 'hex');
        const expected = Buffer.from(hash, 'hex');
        return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
    }

    private hashToken(token: string) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    private readCookie(cookieHeader: string | undefined, name: string) {
        if (!cookieHeader) return null;
        const cookies = cookieHeader.split(';').map((part) => part.trim());
        const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
        if (!match) return null;
        return decodeURIComponent(match.slice(name.length + 1));
    }

    private createId(prefix: string) {
        return `${prefix}_${this.now().getTime()}_${crypto.randomBytes(6).toString('hex')}`;
    }

    private nowIso() {
        return this.now().toISOString();
    }
}
