import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import express, { NextFunction, Request, Response, Router } from 'express';
import Database from 'better-sqlite3';
import {
    ColdAcquisitionCrmService,
    ColdAcquisitionCrmUser,
    ReplyType,
    CRM_SESSION_COOKIE
} from '../services/coldAcquisitionCrmService';
import { ColdLeadDrafts } from '../services/coldAcquisitionService';

type CrmRequest = Request & {
    crmUser?: ColdAcquisitionCrmUser;
};

function sendError(res: Response, error: any): void {
    const message = error?.message || 'COLD_ACQUISITION_CRM_ERROR';
    const statusCode = Number.isInteger(error?.statusCode)
        ? error.statusCode
        : /not found/i.test(message)
            ? 404
            : /login|unauthorized/i.test(message)
                ? 401
                : /forbidden/i.test(message)
                    ? 403
                    : /required|invalid|blocked|missing/i.test(message)
                        ? 400
                        : 500;

    res.status(statusCode).json({ error: message, status: statusCode });
}

function sessionCookieOptions(req: Request, expires?: Date) {
    const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        secure,
        path: '/acquisition',
        ...(expires ? { expires } : {})
    };
}

function allowedDraftType(value: string): value is keyof ColdLeadDrafts {
    return ['linkedin_intro', 'linkedin_followup', 'email_cold', 'email_followup'].includes(value);
}

function allowedReplyType(value: string): value is ReplyType {
    return ['interested', 'not_now', 'opt_out', 'other'].includes(value);
}

function requestOrigin(req: Request): string {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = req.get('host') || `127.0.0.1:${process.env.PORT || 3014}`;
    return `${proto}://${host}`;
}

function runRealFeedLoader(req: Request, options: { chLimit: number; atLimit: number; apply: boolean }): Promise<any> {
    const scriptPath = path.resolve(__dirname, '../../../Scripts/cold-acquisition-real-feed.mjs');
    const apiKey = process.env.API_KEY || '';
    if (!apiKey) throw Object.assign(new Error('API_KEY is required for live source intake'), { statusCode: 400 });
    if (!fs.existsSync(scriptPath)) throw Object.assign(new Error('live source intake script is missing'), { statusCode: 500 });

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
            scriptPath,
            `--api=${requestOrigin(req)}`,
            `--key=${apiKey}`,
            `--ch-limit=${options.chLimit}`,
            `--at-limit=${options.atLimit}`,
            `--apply=${options.apply ? 'true' : 'false'}`
        ], {
            cwd: path.resolve(__dirname, '../../..'),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += String(chunk);
            if (stdout.length > 2_000_000) stdout = stdout.slice(-2_000_000);
        });
        child.stderr.on('data', (chunk) => {
            stderr += String(chunk);
            if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(Object.assign(new Error(stderr || `live source intake failed with exit ${code}`), { statusCode: 502 }));
                return;
            }
            try {
                resolve(JSON.parse(stdout));
            } catch {
                reject(Object.assign(new Error('live source intake returned invalid JSON'), { statusCode: 502 }));
            }
        });
    });
}

export function initColdAcquisitionCrmRoutes(app: express.Express, db: Database.Database): void {
    const service = new ColdAcquisitionCrmService(db);
    const api = Router();

    const requireAuth = (req: CrmRequest, res: Response, next: NextFunction) => {
        const user = service.getUserFromCookie(req.headers.cookie);
        if (!user) {
            res.status(401).json({ error: 'CRM_AUTH_REQUIRED', status: 401 });
            return;
        }
        req.crmUser = user;
        next();
    };

    const requireAdmin = (req: CrmRequest, res: Response, next: NextFunction) => {
        if (req.crmUser?.role !== 'admin') {
            res.status(403).json({ error: 'CRM_ADMIN_REQUIRED', status: 403 });
            return;
        }
        next();
    };

    api.post('/auth/login', (req, res) => {
        try {
            const email = String(req.body?.email || '');
            const password = String(req.body?.password || '');
            const result = service.login(email, password);
            res.cookie(CRM_SESSION_COOKIE, result.token, sessionCookieOptions(req, new Date(result.expires_at)));
            res.json({ user: result.user });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/auth/logout', (req, res) => {
        try {
            service.logoutFromCookie(req.headers.cookie);
            res.clearCookie(CRM_SESSION_COOKIE, sessionCookieOptions(req));
            res.json({ ok: true });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.get('/auth/me', requireAuth, (req: CrmRequest, res) => {
        res.json({ user: req.crmUser });
    });

    api.get('/dashboard', requireAuth, (_req, res) => {
        try {
            res.json({ dashboard: service.getDashboard() });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.get('/today-mission', requireAuth, (_req, res) => {
        try {
            res.json({ mission: service.getTodayMission() });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.get('/next-lead', requireAuth, (req: CrmRequest, res) => {
        try {
            const next = service.getNextLead((req.crmUser as ColdAcquisitionCrmUser).id);
            res.json(next || { lead_id: null });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.get('/leads', requireAuth, (req, res) => {
        try {
            const view = typeof req.query.view === 'string' ? req.query.view : undefined;
            const q = typeof req.query.q === 'string' ? req.query.q : undefined;
            const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;
            res.json({ leads: service.listLeads({ view, q, sort }) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.get('/leads/:id', requireAuth, (req, res) => {
        try {
            res.json(service.getLead(String(req.params.id || '')));
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.patch('/leads/:id', requireAuth, (req: CrmRequest, res) => {
        try {
            const lead = service.updateLead(req.crmUser as ColdAcquisitionCrmUser, String(req.params.id || ''), req.body || {});
            res.json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/leads/:id/activity', requireAuth, (req: CrmRequest, res) => {
        try {
            const type = String(req.body?.type || '').trim();
            const detail = String(req.body?.detail || '').trim();
            if (!type) throw Object.assign(new Error('activity.type is required'), { statusCode: 400 });
            if (!detail) throw Object.assign(new Error('activity.detail is required'), { statusCode: 400 });
            const activity = service.addActivity(req.crmUser as ColdAcquisitionCrmUser, String(req.params.id || ''), type, detail, req.body?.metadata ?? null);
            res.status(201).json({ activity });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/leads/:id/copy-draft', requireAuth, (req: CrmRequest, res) => {
        try {
            const draftType = String(req.body?.draft_type || '');
            if (!allowedDraftType(draftType)) throw Object.assign(new Error('draft_type is invalid'), { statusCode: 400 });
            res.json(service.copyDraft(req.crmUser as ColdAcquisitionCrmUser, String(req.params.id || ''), draftType));
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/leads/:id/mark-sent', requireAuth, (req: CrmRequest, res) => {
        try {
            const channel = String(req.body?.channel || '').trim();
            if (!channel) throw Object.assign(new Error('channel required'), { statusCode: 400 });
            const lead = service.markSent(req.crmUser as ColdAcquisitionCrmUser, String(req.params.id || ''), {
                channel,
                follow_up_date: req.body?.follow_up_date ?? req.body?.next_follow_up_at ?? null
            });
            res.json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/leads/:id/follow-up', requireAuth, (req: CrmRequest, res) => {
        try {
            if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'next_follow_up_at')) {
                throw Object.assign(new Error('next_follow_up_at is required'), { statusCode: 400 });
            }
            const lead = service.scheduleFollowUp(req.crmUser as ColdAcquisitionCrmUser, String(req.params.id || ''), req.body.next_follow_up_at ?? null);
            res.json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/leads/:id/reply', requireAuth, (req: CrmRequest, res) => {
        try {
            const replyType = String(req.body?.reply_type || '').trim();
            if (!allowedReplyType(replyType)) throw Object.assign(new Error('reply_type is required'), { statusCode: 400 });
            if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'note')) {
                throw Object.assign(new Error('note is required'), { statusCode: 400 });
            }
            const result = service.logReply(
                String(req.params.id || ''),
                (req.crmUser as ColdAcquisitionCrmUser).id,
                replyType,
                String(req.body?.note || '')
            );
            res.json(result);
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/leads/:id/regenerate-draft', requireAuth, async (req: CrmRequest, res) => {
        try {
            const lead = await service.regenerateDraft(String(req.params.id || ''), req.crmUser!.id);
            res.json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.get('/admin/webhook-config', requireAuth, requireAdmin, (_req, res) => {
        res.json({ config: service.getWebhookConfig() });
    });

    api.get('/admin/source-config', requireAuth, requireAdmin, (_req, res) => {
        res.json({ source_config: service.getSourceConfig() });
    });

    api.post('/admin/push', requireAuth, requireAdmin, async (req, res) => {
        try {
            const result = await service.pushReadyBatch({
                dryRun: Boolean(req.body?.dryRun),
                limit: Number(req.body?.limit || 20)
            });
            res.json({ result });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/admin/ingest/zefix-bulk', requireAuth, requireAdmin, async (req, res) => {
        try {
            const records = Array.isArray(req.body?.records) ? req.body.records : [];
            res.status(201).json({ result: await service.ingestZefixBulk(records) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/admin/ingest/austria-directory', requireAuth, requireAdmin, async (req, res) => {
        try {
            const records = Array.isArray(req.body?.records) ? req.body.records : [];
            res.status(201).json({ result: await service.ingestAustriaDirectory(records) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/admin/source-reload', requireAuth, requireAdmin, (_req, res) => {
        res.json({
            ok: true,
            status: 'source_api_links_ready',
            source_config: service.getSourceConfig()
        });
    });

    api.post('/admin/live-feed', requireAuth, requireAdmin, async (req, res) => {
        try {
            const chLimit = Math.max(0, Math.min(200, Number(req.body?.ch_limit ?? 40)));
            const atLimit = Math.max(0, Math.min(25, Number(req.body?.at_limit ?? 9)));
            const apply = req.body?.apply !== false;
            const result = await runRealFeedLoader(req, { chLimit, atLimit, apply });
            res.status(apply ? 201 : 200).json({ result });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    app.use('/acquisition/api', api);

    const builtDir = path.resolve(__dirname, '../../public/acquisition');
    const sourceDir = path.resolve(__dirname, '../../../acquisition');
    const assetDir = fs.existsSync(path.join(builtDir, 'assets')) ? path.join(builtDir, 'assets') : path.join(sourceDir, 'assets');
    const builtIndex = path.join(builtDir, 'index.html');
    const sourceIndex = path.join(sourceDir, 'index.html');
    const shellDir = fs.existsSync(builtIndex) ? builtDir : sourceDir;

    const sendAcquisitionShell: express.RequestHandler = (_req, res) => {
        const indexPath = fs.existsSync(builtIndex) ? builtIndex : sourceIndex;
        if (!fs.existsSync(indexPath)) {
            res.status(404).send('acquisition bundle missing');
            return;
        }
        res.type('html').send(fs.readFileSync(indexPath, 'utf8'));
    };

    const acquisitionShellRoutes = [
        '/acquisition',
        '/acquisition/',
        '/acquisition/login',
        '/acquisition/login/',
        '/acquisition/today',
        '/acquisition/today/',
        '/acquisition/admin/sources',
        '/acquisition/admin/sources/',
        '/acquisition/leads',
        '/acquisition/leads/'
    ];

    app.use('/acquisition/assets', express.static(assetDir, { index: false }));
    acquisitionShellRoutes.forEach((route) => app.get(route, sendAcquisitionShell));
    app.use('/acquisition/login', express.static(shellDir, { index: 'index.html' }));
    app.use('/acquisition', express.static(shellDir, { index: 'index.html' }));
    app.use('/acquisition', (req, res, next) => {
        if (req.originalUrl.startsWith('/acquisition/api') || req.originalUrl.startsWith('/acquisition/assets')) {
            next();
            return;
        }
        sendAcquisitionShell(req, res, next);
    });
}
