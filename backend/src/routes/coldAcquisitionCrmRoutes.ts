import fs from 'fs';
import path from 'path';
import express, { NextFunction, Request, Response, Router } from 'express';
import Database from 'better-sqlite3';
import {
    ColdAcquisitionCrmService,
    ColdAcquisitionCrmUser,
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

    api.get('/admin/webhook-config', requireAuth, requireAdmin, (_req, res) => {
        res.json({ config: service.getWebhookConfig() });
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

    api.post('/admin/ingest/zefix-bulk', requireAuth, requireAdmin, (req, res) => {
        try {
            const records = Array.isArray(req.body?.records) ? req.body.records : [];
            res.status(201).json({ result: service.ingestZefixBulk(records) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/admin/ingest/austria-directory', requireAuth, requireAdmin, (req, res) => {
        try {
            const records = Array.isArray(req.body?.records) ? req.body.records : [];
            res.status(201).json({ result: service.ingestAustriaDirectory(records) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    api.post('/admin/source-reload', requireAuth, requireAdmin, (_req, res) => {
        res.json({ ok: true, status: 'source_reload_not_configured' });
    });

    app.use('/acquisition/api', api);

    const builtDir = path.resolve(__dirname, '../../public/acquisition');
    const sourceDir = path.resolve(__dirname, '../../../acquisition');
    const assetDir = fs.existsSync(path.join(builtDir, 'assets')) ? path.join(builtDir, 'assets') : path.join(sourceDir, 'assets');
    const builtIndex = path.join(builtDir, 'index.html');
    const sourceIndex = path.join(sourceDir, 'index.html');

    app.use('/acquisition/assets', express.static(assetDir, { index: false }));
    app.get(/^\/acquisition(?:\/.*)?$/, (req, res, next) => {
        if (req.path.startsWith('/acquisition/api')) {
            next();
            return;
        }
        const indexPath = fs.existsSync(builtIndex) ? builtIndex : sourceIndex;
        if (!fs.existsSync(indexPath)) {
            res.status(404).send('acquisition bundle missing');
            return;
        }
        res.sendFile(indexPath);
    });
}
