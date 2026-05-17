import express, { Router } from 'express';
import { localOnlyMiddleware } from '../middleware/auth';
import { SystemConfig } from '../config/SystemConfig';
import { DesignAssistantBridgeService } from '../services/designAssistantBridgeService';

function sendError(res: any, error: any): void {
    const message = error?.message || 'DESIGN_ASSISTANT_ERROR';
    const notFound = /not found/i.test(message);
    const badRequest = /required|unsupported|data URL/i.test(message);
    res.status(notFound ? 404 : badRequest ? 400 : 500).json({ error: message });
}

export function initDesignAssistantRoutes(router: Router, service: DesignAssistantBridgeService): void {
    router.use('/design-assistant/files', localOnlyMiddleware, express.static(SystemConfig.resolve('backend/data/design-assistant')));

    const designAssistant = Router();
    designAssistant.use(localOnlyMiddleware);

    designAssistant.get('/health', (_req, res) => {
        res.json({
            ok: true,
            activeTab: service.getActiveTab(),
            latestSelection: service.getLatestSelection(),
            pendingRequestCount: service.listPendingRequests().length
        });
    });

    designAssistant.get('/active-tab', (_req, res) => {
        res.json({ activeTab: service.getActiveTab() });
    });

    designAssistant.get('/latest-selection', (_req, res) => {
        res.json({ selection: service.getLatestSelection() });
    });

    designAssistant.post('/captures', (req, res) => {
        try {
            const capture = service.saveCapture(req.body || {});
            res.status(201).json({ capture });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.post('/selections', (req, res) => {
        try {
            const selection = service.saveSelection(req.body || {});
            res.status(201).json({ selection });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.post('/requests', (req, res) => {
        try {
            const request = service.createDesignRequest(req.body || {});
            res.status(201).json({ request });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.get('/requests/pending', (req, res) => {
        try {
            const limit = Number(req.query.limit || 20);
            res.json({ requests: service.listPendingRequests(Number.isFinite(limit) ? limit : 20) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.post('/requests/claim-next', (req, res) => {
        try {
            const request = service.claimNextRequest(String(req.body?.claimedBy || 'codex'));
            if (!request) {
                res.status(204).end();
                return;
            }
            res.json({ request, packet: service.getRequestPacket(request.id) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.get('/requests/:id', (req, res) => {
        try {
            const request = service.getRequest(String(req.params.id || ''));
            if (!request) {
                res.status(404).json({ error: 'request not found' });
                return;
            }
            res.json({ request, packet: service.getRequestPacket(request.id) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.post('/requests/:id/applied', (req, res) => {
        try {
            const request = service.markApplied(String(req.params.id || ''), String(req.body?.notes || ''));
            res.json({ request });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.post('/responses', (req, res) => {
        try {
            const response = service.postResponse(req.body || {});
            res.status(201).json({ response, request: service.getRequest(response.requestId) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.get('/requests/:id/responses', (req, res) => {
        try {
            res.json({ responses: service.listResponses(String(req.params.id || '')) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.get('/history/search', (req, res) => {
        try {
            const query = typeof req.query.q === 'string' ? req.query.q : '';
            const limit = Number(req.query.limit || 20);
            res.json(service.searchHistory(query, Number.isFinite(limit) ? limit : 20));
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.get('/mcp/resources', (_req, res) => {
        try {
            res.json({ resources: service.listMcpResources() });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.get('/mcp/resources/read', (req, res) => {
        try {
            const uri = typeof req.query.uri === 'string' ? req.query.uri : '';
            res.json({ resource: service.readMcpResource(uri) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designAssistant.get('/mcp/tools', (_req, res) => {
        res.json({
            tools: [
                'design_assistant.claim_next_request',
                'design_assistant.get_request',
                'design_assistant.post_response',
                'design_assistant.mark_applied',
                'design_assistant.search_history'
            ]
        });
    });

    router.use('/design-assistant', designAssistant);
}
