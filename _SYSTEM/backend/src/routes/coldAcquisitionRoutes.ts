import { Router } from 'express';
import Database from 'better-sqlite3';
import { authMiddleware, localOnlyMiddleware } from '../middleware/auth';
import {
    ColdAcquisitionService,
    ColdLeadInput,
    ColdLeadStatus
} from '../services/coldAcquisitionService';

function sendError(res: any, error: any): void {
    const message = error?.message || 'COLD_ACQUISITION_ERROR';
    const statusCode = Number.isInteger(error?.statusCode)
        ? error.statusCode
        : /not found/i.test(message)
            ? 404
            : /required|invalid|blocked|missing/i.test(message)
                ? 400
                : 500;

    res.status(statusCode).json({ error: message, status: statusCode });
}

function parseLeadInput(body: any): ColdLeadInput {
    if (!body?.company?.name) throw Object.assign(new Error('company.name is required'), { statusCode: 400 });
    if (!['CH', 'AT'].includes(body?.company?.country)) throw Object.assign(new Error('company.country must be CH or AT'), { statusCode: 400 });
    if (!body?.compliance?.source_url) throw Object.assign(new Error('compliance.source_url is required'), { statusCode: 400 });
    if (!body?.compliance?.source_timestamp) throw Object.assign(new Error('compliance.source_timestamp is required'), { statusCode: 400 });
    if (!body?.compliance?.source) throw Object.assign(new Error('compliance.source is required'), { statusCode: 400 });
    if (!body?.compliance?.legal_basis) throw Object.assign(new Error('compliance.legal_basis is required'), { statusCode: 400 });
    return body as ColdLeadInput;
}

export function initColdAcquisitionRoutes(router: Router, db: Database.Database): void {
    const service = new ColdAcquisitionService(db);
    const cold = Router();

    cold.use(localOnlyMiddleware, authMiddleware);

    cold.get('/dashboard', (_req, res) => {
        try {
            res.json({ dashboard: service.getDashboard() });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    cold.get('/config', (_req, res) => {
        res.json({
            config: {
                weekly_target: 20,
                webhook_configured: Boolean(process.env.COLD_ACQ_LEAD_WEBHOOK_URL && process.env.COLD_ACQ_LEAD_API_KEY),
                markets: ['CH', 'AT'],
                austria_postal_scope: ['1220', '1160'],
                pipeline: ['intake', 'enriched', 'scored', 'needs_review', 'ready', 'pushed', 'sent', 'replied']
            }
        });
    });

    cold.get('/leads', (req, res) => {
        try {
            const status = typeof req.query.status === 'string' ? req.query.status as ColdLeadStatus : undefined;
            const country = typeof req.query.country === 'string' && ['CH', 'AT'].includes(req.query.country) ? req.query.country as any : undefined;
            const q = typeof req.query.q === 'string' ? req.query.q : undefined;
            res.json({ leads: service.listLeads({ status, country, q }) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    cold.get('/leads/:id', (req, res) => {
        try {
            const lead = service.getLead(String(req.params.id || ''));
            if (!lead) {
                res.status(404).json({ error: 'COLD_LEAD_NOT_FOUND' });
                return;
            }
            res.json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    cold.post('/leads', (req, res) => {
        try {
            const lead = service.createLead(parseLeadInput(req.body || {}));
            res.status(201).json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    cold.post('/ingest/zefix-bulk', (req, res) => {
        try {
            const records = Array.isArray(req.body?.records) ? req.body.records : [];
            const result = service.ingestZefixBulk(records);
            res.status(201).json({ result });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    cold.post('/ingest/austria-directory', (req, res) => {
        try {
            const records = Array.isArray(req.body?.records) ? req.body.records : [];
            const result = service.ingestAustriaDirectory(records);
            res.status(201).json({ result });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    cold.patch('/leads/:id', (req, res) => {
        try {
            const lead = service.updateLead(String(req.params.id || ''), req.body || {});
            res.json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    cold.post('/leads/:id/ready', (req, res) => {
        try {
            const lead = service.markReady(String(req.params.id || ''));
            res.json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    cold.post('/push', async (req, res) => {
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

    cold.patch('/leads/:id/reply', async (req, res) => {
        try {
            const replyText = String(req.body?.reply_text || req.body?.replyText || '').trim();
            if (!replyText) throw Object.assign(new Error('reply_text is required'), { statusCode: 400 });
            const lead = await service.patchReplyToWebhook(String(req.params.id || ''), replyText);
            res.json({ lead });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    router.use('/cold-acquisition', cold);
}
