import crypto from 'crypto';
import Database from 'better-sqlite3';
import {
    AustriaDirectoryRecord,
    ColdAcquisitionService,
    ColdLeadCrmStage,
    ColdLeadDrafts,
    ColdLeadRecord,
    ColdLeadStatus,
    ZefixBulkRecord
} from './coldAcquisitionService';

export const CRM_SESSION_COOKIE = 'c2moviez_acquisition_session';

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

        this.logActivity(row, null, 'login', 'Signed in to acquisition CRM.', null);
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

    listLeads(filters: { view?: string; q?: string; sort?: string } = {}) {
        let leads = this.leads.listLeads({ q: filters.q });
        if (filters.view) leads = this.applyView(leads, filters.view);

        const sort = filters.sort || 'updated_desc';
        return leads.sort((a, b) => {
            if (sort === 'score_desc') return b.scoring.total_score - a.scoring.total_score;
            if (sort === 'date_asc') return String(a.updated_at).localeCompare(String(b.updated_at));
            if (sort === 'stage') return a.crm_stage.localeCompare(b.crm_stage) || b.scoring.total_score - a.scoring.total_score;
            return String(b.updated_at).localeCompare(String(a.updated_at));
        });
    }

    getLead(id: string) {
        const lead = this.leads.getLead(id);
        if (!lead) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        return {
            lead,
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
        return next;
    }

    copyDraft(user: ColdAcquisitionCrmUser, leadId: string, draftType: keyof ColdLeadDrafts) {
        const lead = this.leads.getLead(leadId);
        if (!lead) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        const text = lead.outreach_drafts[draftType];
        if (!text) throw Object.assign(new Error('DRAFT_NOT_AVAILABLE'), { statusCode: 400 });
        this.logActivity(user, lead.id, 'draft_copied', `Copied ${draftType} draft.`, { draft_type: draftType });
        return { draft_type: draftType, text };
    }

    addActivity(user: ColdAcquisitionCrmUser, leadId: string, type: string, detail: string, metadata: unknown = null) {
        if (!this.leads.getLead(leadId)) throw Object.assign(new Error('COLD_LEAD_NOT_FOUND'), { statusCode: 404 });
        return this.logActivity(user, leadId, type, detail, metadata);
    }

    async pushReadyBatch(options: { dryRun?: boolean; limit?: number }) {
        return this.leads.pushReadyBatch(options);
    }

    ingestZefixBulk(records: ZefixBulkRecord[]) {
        return this.leads.ingestZefixBulk(records);
    }

    ingestAustriaDirectory(records: AustriaDirectoryRecord[]) {
        return this.leads.ingestAustriaDirectory(records);
    }

    getWebhookConfig() {
        return {
            configured: Boolean(process.env.C2MOVIEZ_LEAD_WEBHOOK_URL && process.env.C2MOVIEZ_LEAD_API_KEY),
            endpoint: process.env.C2MOVIEZ_LEAD_WEBHOOK_URL ? 'configured' : 'missing',
            api_key: process.env.C2MOVIEZ_LEAD_API_KEY ? 'configured' : 'missing'
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
