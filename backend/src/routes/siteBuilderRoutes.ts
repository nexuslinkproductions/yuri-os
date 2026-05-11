import { Router } from 'express';
import { authMiddleware, localOnlyMiddleware } from '../middleware/auth';
import { SiteBuilderService } from '../services/siteBuilderService';

function toNumber(value: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('id must be a positive integer');
    return parsed;
}

function sendError(res: any, error: any): void {
    const message = error?.message || 'SITE_BUILDER_ERROR';
    const notFound = /not found/i.test(message);
    const badRequest = /required|unsupported|not allowed|positive integer|at least/i.test(message);
    res.status(notFound ? 404 : badRequest ? 400 : 500).json({ error: message });
}

export function initSiteBuilderRoutes(router: Router): void {
    const service = new SiteBuilderService(undefined, {
        dbPath: process.env.YURI_MEMORY_DB_PATH || '_SYSTEM/OS_KERNEL/memory.db'
    });
    const siteBuilder = Router();

    siteBuilder.use(localOnlyMiddleware, authMiddleware);

    siteBuilder.get('/pages', (_req, res) => {
        try {
            res.json({ pages: service.listPages() });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    siteBuilder.post('/sessions', (req, res) => {
        try {
            const session = service.createSession(req.body || {});
            res.status(201).json({ session });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    siteBuilder.get('/sessions/:id', (req, res) => {
        try {
            const session = service.getSession(String(req.params.id || ''));
            if (!session) {
                res.status(404).json({ error: 'session not found' });
                return;
            }
            res.json({ session });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    siteBuilder.post('/annotations', (req, res) => {
        try {
            const annotation = service.saveAnnotation(req.body || {});
            res.status(201).json({ annotation });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    siteBuilder.post('/intents', (req, res) => {
        try {
            const intent = service.saveIntent(req.body || {});
            res.status(201).json({ intent });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    siteBuilder.post('/intents/:id/packet', (req, res) => {
        try {
            const packet = service.createPatchPacket(toNumber(req.params.id));
            res.status(201).json({ packet });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    siteBuilder.get('/packets/:id', (req, res) => {
        try {
            const packet = service.getPacket(toNumber(req.params.id));
            if (!packet) {
                res.status(404).json({ error: 'packet not found' });
                return;
            }
            res.json({ packet });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    router.use('/site-builder', siteBuilder);
}
