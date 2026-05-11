import { Router } from 'express';
import Database from 'better-sqlite3';
import { 
    getAllAgents, getAllDeities, getAllProjects, getAllKnowledgeNodes, 
    getRecentEvents, searchKnowledge, updateAgentStatus,
    getAllEvents, getAllTickets, getIntegrations,
    getTemporalEvents, getStrategicBriefing, getAgentByName,
    getSwarmMetrics, getAgentActivity, getKnowledgeGraph,
    getProjectById, updateProjectStatus, updateActiveProjectsStatus
} from '../models/queries';
import { runVaultIngestion, getIngestionStats } from '../services/vaultIngestion';
import { syncOutlookIcs } from '../services/outlookIcs';
import { executeCommand, isAllowedCommandKey } from '../services/executor';
import { listVaultDirectory } from '../services/fileSystem';
import { getNoteDetail } from '../services/knowledgeService';
import { logTimeEntry, ensureTimeEntriesTable, getAllTimeEntries, getPendingTimeEntries } from '../services/exeoflow';
import { OracleService } from '../services/oracleService';
import { SmartRouter } from '../services/smartRouter';
import { obsidianRest } from '../services/obsidianRestService';
import { neuralForge } from '../services/neuralForgeService';
import { vectorSearch } from '../services/vectorSearchService';
import { neuralService } from '../services/neuralService';
import { workflowCatalogService } from '../services/workflowCatalogService';
import { mathCurveCatalogService } from '../services/mathCurveCatalogService';
import { projectAnalyzer } from '../services/projectAnalyzer';
import { authMiddleware, getRuntimeApiKey, localOnlyMiddleware } from '../middleware/auth';
import { kieImageService } from '../services/kieImageService';
import { kieFileUploadService } from '../services/kieFileUploadService';
import { spawn } from 'child_process';
import { SystemConfig } from '../config/SystemConfig';
import {
    ensurePersonalityTable,
    logPersonalityEntry,
    rateLastEntry,
    getPersonalityProfile,
    buildPersonalitySystemPrompt
} from '../services/personalityService';
import { browserAutomation } from '../services/browserAutomation';
import { ollamaProvider } from '../services/providers/ollamaProvider';
import {
    getSessionImprovementSummary,
    recordSessionReview,
    reviewLessonCandidate
} from '../services/sessionImprovementService';
import { SessionRuntimeService } from '../services/sessionRuntimeService';
import { DesignAssistantBridgeService } from '../services/designAssistantBridgeService';
import { initDesignAssistantRoutes } from './designAssistantRoutes';
import { HeadlessControlPlaneService } from '../services/headlessControlPlaneService';

type RouteHealthPayload = {
    healthy?: boolean;
    ready?: boolean;
    alive?: boolean;
    status?: string;
    [key: string]: unknown;
};

type ApiRouteOptions = {
    getStatusPayload?: () => Promise<unknown>;
    getHealth?: () => Promise<RouteHealthPayload>;
    getReadiness?: () => Promise<RouteHealthPayload>;
    getLiveness?: () => RouteHealthPayload;
    sessionRuntime?: SessionRuntimeService;
    designAssistantBridge?: DesignAssistantBridgeService;
};

const SENSITIVE_QUERY_KEYS = new Set(['apikey', 'api_key', 'key', 'token', 'auth', 'authorization']);

function redactRequestUrl(rawUrl: string): string {
    try {
        const parsed = new URL(rawUrl, 'http://nudimmud.local');
        for (const key of Array.from(parsed.searchParams.keys())) {
            if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
                parsed.searchParams.set(key, '[redacted]');
            }
        }
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return rawUrl.replace(/([?&](?:apiKey|api_key|key|token|auth|authorization)=)[^&]*/gi, '$1[redacted]');
    }
}

export function initApiRoutes(db: Database.Database, options: ApiRouteOptions = {}) {
    const router = Router();
    ensureTimeEntriesTable(db); // ensure time_entries table exists
    neuralForge.setDb(db); // Provide DB access for vector search context injection

    router.use((req, res, next) => {
        console.log(`⬡ API_REQUEST :: ${req.method} ${redactRequestUrl(req.url)}`);
        next();
    });

    router.get('/ping-test', (req, res) => res.json({ status: 'API_ROUTER_ALIVE', timestamp: new Date().toISOString() }));

    // System Status
    router.get('/status', async (_, res) => {
        if (options.getStatusPayload) {
            res.json(await options.getStatusPayload());
            return;
        }

        res.json({ message: 'NUDIMMUD API ONLINE' });
    });

    router.get('/auth/bootstrap', localOnlyMiddleware, (_, res) => {
        res.json({ apiKey: getRuntimeApiKey() });
    });

    router.get('/health', async (_, res) => {
        if (!options.getHealth) {
            res.json({ healthy: true, status: 'healthy' });
            return;
        }

        const payload = await options.getHealth();
        res.status(payload.healthy === false ? 503 : 200).json(payload);
    });

    router.get('/health/live', (_, res) => {
        const payload = options.getLiveness ? options.getLiveness() : { alive: true, status: 'alive' };
        res.status(payload.alive === false ? 503 : 200).json(payload);
    });

    router.get('/health/ready', async (_, res) => {
        if (!options.getReadiness) {
            res.json({ ready: true, status: 'ready' });
            return;
        }

        const payload = await options.getReadiness();
        res.status(payload.ready === false ? 503 : 200).json(payload);
    });

    router.get('/health/auth', authMiddleware, (_, res) => {
        res.json({ status: 'AUTH_OK' });
    });

    const requireSessionRuntime = () => {
        if (!options.sessionRuntime) {
            throw Object.assign(new Error('SESSION_RUNTIME_UNAVAILABLE'), { statusCode: 503 });
        }
        return options.sessionRuntime;
    };

    const handleSessionRuntimeError = (res: any, error: any) => {
        const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
        res.status(statusCode).json({
            error: error?.message || 'SESSION_RUNTIME_ERROR',
            status: statusCode
        });
    };

    router.post('/sessions/start', localOnlyMiddleware, authMiddleware, (req, res) => {
        try {
            const session = requireSessionRuntime().startSession(req.body || {});
            res.status(201).json({ session });
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.post('/sessions/heartbeat', localOnlyMiddleware, authMiddleware, (req, res) => {
        try {
            const session = requireSessionRuntime().heartbeat(req.body || {});
            res.json({ session });
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.post('/sessions/stop', localOnlyMiddleware, authMiddleware, (req, res) => {
        try {
            const session = requireSessionRuntime().stopSession(req.body || {});
            res.json({ session });
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.get('/sessions/current', authMiddleware, (_, res) => {
        try {
            res.json({ session: requireSessionRuntime().getCurrentSession() });
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.get('/sessions/history', authMiddleware, (req, res) => {
        try {
            const limit = Number(req.query.limit || 20);
            res.json({ sessions: requireSessionRuntime().getHistory(limit) });
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.get('/sessions/backlog', authMiddleware, (req, res) => {
        try {
            res.json(requireSessionRuntime().getBacklog({
                sessionId: req.query.sessionId,
                limit: req.query.limit
            }));
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.post('/sessions/backlog', localOnlyMiddleware, authMiddleware, (req, res) => {
        try {
            const task = requireSessionRuntime().addBacklogTask(req.body || {});
            res.status(201).json({ task });
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.post('/sessions/backlog/claim-next', localOnlyMiddleware, authMiddleware, (req, res) => {
        try {
            res.json(requireSessionRuntime().claimNextBacklogTask(req.body || {}));
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.post('/sessions/backlog/:taskId/complete', localOnlyMiddleware, authMiddleware, (req, res) => {
        try {
            res.json(requireSessionRuntime().completeBacklogTask(String(req.params.taskId || ''), req.body || {}));
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    router.get('/control-plane/status', authMiddleware, (_, res) => {
        try {
            res.json(requireSessionRuntime().getControlPlaneStatus());
        } catch (error: any) {
            handleSessionRuntimeError(res, error);
        }
    });

    const headlessControlPlane = new HeadlessControlPlaneService(db);

    router.post('/control-plane/plan', localOnlyMiddleware, authMiddleware, (req, res) => {
        try {
            const plan = headlessControlPlane.plan({
                prompt: req.body?.prompt,
                mode: req.body?.mode,
                source: req.body?.source
            });
            res.status(201).json({ plan });
        } catch (error: any) {
            const statusCode = /prompt required/i.test(error?.message || '') ? 400 : 500;
            res.status(statusCode).json({ error: error?.message || 'HEADLESS_CONTROL_PLAN_FAILED' });
        }
    });

    try { ensurePersonalityTable(db); } catch (e) {
        console.warn('⬡ PERSONALITY_DB_WARN :: table init failed, running with default profile:', e);
    }

    // Personality endpoints
    router.get('/oracle/personality', (_, res) => {
        res.json(getPersonalityProfile(db));
    });

    router.get('/oracle/improvement', authMiddleware, (_, res) => {
        try {
            const summary = getSessionImprovementSummary(db, 10);
            res.json({
                ...summary,
                shouldReview: summary.pendingReviewSessions > 0 || summary.averageImprovementScore < 55
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/oracle/improvement/:sessionId/review', authMiddleware, (req, res) => {
        try {
            const sessionId = String(req.params.sessionId || '').trim();
            const { humanScore, notes } = req.body || {};
            if (!sessionId) {
                res.status(400).json({ error: 'sessionId required' });
                return;
            }
            const score = Number(humanScore);
            if (!Number.isFinite(score) || score < 1 || score > 5) {
                res.status(400).json({ error: 'humanScore must be between 1 and 5' });
                return;
            }
            const updated = recordSessionReview(db, sessionId, score, typeof notes === 'string' ? notes : undefined);
            if (!updated) {
                res.status(404).json({ error: 'session not found' });
                return;
            }
            res.json({ session: updated });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/oracle/improvement/lessons/:candidateId/review', authMiddleware, (req, res) => {
        try {
            const candidateId = Number(req.params.candidateId);
            const { action, revisedText, notes } = req.body || {};
            if (!Number.isInteger(candidateId) || candidateId <= 0) {
                res.status(400).json({ error: 'candidateId must be a positive integer' });
                return;
            }
            if (!['approve', 'reject', 'revise'].includes(action)) {
                res.status(400).json({ error: 'action must be approve, reject, or revise' });
                return;
            }
            if (action === 'revise' && (typeof revisedText !== 'string' || revisedText.trim().length < 8)) {
                res.status(400).json({ error: 'revisedText must be provided for revise actions' });
                return;
            }

            const updated = reviewLessonCandidate(
                db,
                candidateId,
                action,
                typeof revisedText === 'string' ? revisedText : undefined,
                typeof notes === 'string' ? notes : undefined
            );
            if (!updated) {
                res.status(404).json({ error: 'candidate not found' });
                return;
            }
            res.json({ candidate: updated, improvement: getSessionImprovementSummary(db, 10) });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/oracle/personality/rate', authMiddleware, (req, res) => {
        const { rating } = req.body;
        if (!['positive', 'neutral', 'negative'].includes(rating)) {
            return res.status(400).json({ error: 'Invalid rating' });
        }
        rateLastEntry(db, rating as any);
        res.json({ ok: true });
    });

    // Browser automation image gen (ChatGPT Images 2.0 / Gemini)
    router.post('/image-gen/browser', authMiddleware, async (req, res) => {
        const { prompt, modelId, provider } = req.body;
        if (!prompt) return res.status(400).json({ error: 'prompt required' });
        try {
            const result = await browserAutomation.generate({ prompt, modelId, provider });
            res.json(result);
        } catch (err: any) {
            res.status(500).json({ error: err.message || 'browser_automation_failed' });
        }
    });

    const oracle = new OracleService(db);
    router.post('/oracle/command', authMiddleware, async (req, res) => {
        const { command, ...options } = req.body;
        if (!command) return res.status(400).json({ error: 'Command required' });
        try {
            const result = await oracle.processCommand(command, options);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/neural/models', (req, res) => {
        res.json(neuralService.getModels());
    });

    router.get('/neural/status', async (req, res) => {
        try {
            const status = await neuralForge.ping();
            res.json({
                ...status,
                image: kieImageService.getStatus()
            });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.post('/neural/images/generate', authMiddleware, async (req, res) => {
        try {
            const {
                prompt,
                size,
                nVariants,
                isEnhance,
                filesUrl,
                maskUrl,
                sourceImageDataUrl,
                sourceImageName,
                sourceImageUploadPath,
                waitForCompletion,
                pollIntervalMs,
                timeoutMs
            } = req.body;

            let resolvedFilesUrl = Array.isArray(filesUrl) ? filesUrl.filter(Boolean) : [];
            let uploadedSourceImage: { fileName: string; filePath: string; fileUrl: string; downloadUrl: string } | null = null;

            if (typeof sourceImageDataUrl === 'string' && sourceImageDataUrl.trim()) {
                uploadedSourceImage = await kieFileUploadService.uploadBase64({
                    base64Data: sourceImageDataUrl,
                    fileName: typeof sourceImageName === 'string' ? sourceImageName : undefined,
                    uploadPath: typeof sourceImageUploadPath === 'string' && sourceImageUploadPath.trim()
                        ? sourceImageUploadPath.trim()
                        : 'images/user-uploads'
                });
                resolvedFilesUrl = [uploadedSourceImage.downloadUrl];
            }

            const result = await kieImageService.generate4oImage({
                prompt,
                size,
                nVariants,
                isEnhance,
                filesUrl: resolvedFilesUrl,
                maskUrl,
                waitForCompletion,
                pollIntervalMs,
                timeoutMs
            });

            res.json({
                ...result,
                sourceImage: uploadedSourceImage
            });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    // Static route MUST come before dynamic :taskId to avoid Express swallowing it
    router.get('/neural/images/models', (_, res) => {
        res.json({
            kie: [
                { id: 'gpt4o-image', label: 'GPT-4o Image', provider: 'kie' },
                { id: 'flux-pro', label: 'Flux Pro', provider: 'kie' },
                { id: 'flux-schnell', label: 'Flux Schnell', provider: 'kie' },
                { id: 'ideogram', label: 'Ideogram V2', provider: 'kie' },
                { id: 'recraft', label: 'Recraft V3', provider: 'kie' }
            ],
            remote: [
                { id: 'chatgpt-images-2', label: 'ChatGPT Images 2.0', provider: 'chatgpt-web' },
                { id: 'dalle3', label: 'DALL-E 3', provider: 'chatgpt-web' },
                { id: 'imagen3', label: 'Imagen 3', provider: 'gemini-web' },
                { id: 'veo2', label: 'Veo 2 (Video)', provider: 'gemini-web' }
            ]
        });
    });

    router.get('/neural/images/:taskId', authMiddleware, async (req, res) => {
        try {
            const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
            if (!taskId) {
                throw new Error('KIE_IMAGE_TASK_ID_REQUIRED');
            }
            const result = await kieImageService.getImageTask(taskId);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.post('/neural/chat', authMiddleware, async (req, res) => {
        try {
            const {
                modelId,
                messages,
                systemPrompt,
                intent,
                compressionMode,
                reasoningBudget,
                allowLocal,
                allowCloud,
                retrievalProfile,
                providerOptions
            } = req.body;

            const result = await neuralForge.chat(modelId, messages, systemPrompt, {
                intent,
                compressionMode,
                reasoningBudget,
                allowLocal,
                allowCloud,
                retrievalProfile,
                providerOptions
            });
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.get('/neural/verify-cloud', async (req, res) => {
        try {
            const result = await neuralForge.verifyCloudIntegration();
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    });

    router.get('/catalog', (_, res) => {
        res.json({
            workflows: workflowCatalogService.getWorkflows(),
            mathCurves: mathCurveCatalogService.getCurves()
        });
    });

    router.get('/catalog/search', (req, res) => {
        const q = (req.query.q as string || '').trim();
        res.json({
            query: q,
            workflows: workflowCatalogService.search(q),
            mathCurves: mathCurveCatalogService.search(q)
        });
    });

    router.get('/catalog/workflows', (_, res) => {
        res.json(workflowCatalogService.getWorkflows());
    });

    router.get('/catalog/workflows/:id', (req, res) => {
        const workflow = workflowCatalogService.getWorkflowById(req.params.id);
        if (!workflow) return res.status(404).json({ error: 'WORKFLOW_NOT_FOUND' });
        res.json(workflow);
    });

    router.get('/catalog/skills', (_, res) => {
        res.json(workflowCatalogService.getWorkflows());
    });

    router.get('/catalog/skills/:id', (req, res) => {
        const workflow = workflowCatalogService.getWorkflowById(req.params.id);
        if (!workflow) return res.status(404).json({ error: 'SKILL_NOT_FOUND' });
        res.json(workflow);
    });

    router.get('/catalog/math-curves', (_, res) => {
        res.json(mathCurveCatalogService.getCurves());
    });

    router.get('/catalog/math-curves/:id', (req, res) => {
        const curve = mathCurveCatalogService.getCurveById(req.params.id);
        if (!curve) return res.status(404).json({ error: 'MATH_CURVE_NOT_FOUND' });
        res.json(curve);
    });

    // Temporal & Strategic
    router.get('/briefing', (_, res) => res.json({ summary: getStrategicBriefing(db) }));
    router.get('/temporal-graph', (_, res) => res.json(getTemporalEvents(db)));
    router.post('/outlook/sync', authMiddleware, async (_, res) => {
        await syncOutlookIcs();
        res.json({ success: true });
    });
    router.post('/plane/sync', authMiddleware, async (_, res) => {
        const { syncPlaneTickets } = require('../services/planeSync');
        const result = await syncPlaneTickets();
        res.json(result);
    });

    // Entities
    router.get('/deities', (_, res) => res.json(getAllDeities(db)));
    router.get('/agents', (_, res) => res.json(getAllAgents(db)));
    router.get('/agents/detail', (req, res) => {
        const name = req.query.name as string;
        if (!name) return res.status(400).json({ error: 'name is required' });
        const agent = getAgentByName(db, name);
        if (!agent) return res.status(404).json({ error: 'AGENT_NOT_FOUND' });
        res.json(agent);
    });
    router.get('/projects', (_, res) => res.json(getAllProjects(db)));
    router.get('/events', (_, res) => res.json(getRecentEvents(db, 50)));
    router.get('/calendar', (_, res) => res.json(getAllEvents(db)));
    router.get('/tickets', (_, res) => res.json(getAllTickets(db)));

    router.post('/swarm/route', authMiddleware, (req, res) => {
        const { prompt, ...options } = req.body;
        if (!prompt) return res.status(400).json({ error: 'prompt is required' });
        const decision = SmartRouter.route(prompt, options);
        res.json(decision);
    });
    
     router.post('/projects/:id/analyze', authMiddleware, async (req, res) => {
         try {
             const { id } = req.params;
             const projectId = id as string;
             const project = getAllProjects(db).find(p => p.id === parseInt(projectId));
             if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });
             
             const insights = await projectAnalyzer.analyzeProject(project);
             res.json(insights);
         } catch (error) {
             res.status(500).json({ error: (error as Error).message });
         }
     });

    router.post('/projects/:id/status', authMiddleware, (req, res) => {
        const { id } = req.params;
        const { status } = req.body;
        const nextStatus = Array.isArray(status) ? status[0] : status;
        if (!nextStatus) return res.status(400).json({ error: 'status is required' });

        const projectId = parseInt(Array.isArray(id) ? id[0] : id, 10);
        if (Number.isNaN(projectId)) {
            return res.status(400).json({ error: 'id is required' });
        }

        const project = getProjectById(db, projectId);
        if (!project) return res.status(404).json({ error: 'PROJECT_NOT_FOUND' });

        updateProjectStatus(db, projectId, nextStatus);
        res.json({ success: true });
    });

    router.post('/projects/active/status', authMiddleware, (req, res) => {
        const { status } = req.body;
        const nextStatus = Array.isArray(status) ? status[0] : status;
        if (!nextStatus) return res.status(400).json({ error: 'status is required' });

        const updated = updateActiveProjectsStatus(db, nextStatus);
        res.json({ success: true, updated });
    });
    
    router.post('/tickets/:external_id/status', authMiddleware, (req, res) => {
        const { external_id } = req.params;
        const { status } = req.body;
        if (!status) return res.status(400).json({ error: 'status is required' });
        const { updateTicketStatus } = require('../models/queries');
        updateTicketStatus(db, external_id, status);
        res.json({ success: true });
    });

    router.get('/integrations', authMiddleware, (_, res) => res.json(getIntegrations(db)));

    // File System
    router.get('/files/ls', authMiddleware, (req, res) => {
        const dirPath = req.query.path as string || '';
        try {
            res.json(listVaultDirectory(dirPath));
        } catch (e) {
            res.status(403).json({ error: 'ACCESS_DENIED' });
        }
    });

    // Knowledge
    router.get('/knowledge', (_, res) => res.json(getKnowledgeGraph(db)));
    
    router.post('/knowledge/refresh', authMiddleware, async (_, res) => {
        try {
            const result = await runVaultIngestion(db, 'route:knowledge_refresh');
            res.json({ status: 'SUCCESS', message: 'Vault ingestion triggered.', result });
        } catch (e: any) {
            res.status(500).json({ status: 'ERROR', message: e.message });
        }
    });

    router.get('/knowledge/search', (req, res) => {
        const q = req.query.q as string;
        if (!q) return res.status(400).json({ error: 'Query param q is required' });
        res.json(searchKnowledge(db, q));
    });

    router.get('/knowledge/detail', authMiddleware, (req, res) => {
        const filePath = req.query.path as string;
        if (!filePath) return res.status(400).json({ error: 'path is required' });
        try {
            res.json(getNoteDetail(filePath));
        } catch (e) {
            res.status(404).json({ error: 'NOTE_NOT_FOUND' });
        }
    });

    // Hybrid semantic + FTS5 keyword search
    router.get('/search/hybrid', async (req, res) => {
        const q = req.query.q as string;
        if (!q) return res.status(400).json({ error: 'Query param q is required' });
        try {
            const limit = parseInt(String(req.query.limit || '5'), 10);
            const semanticWeight = parseFloat(String(req.query.semanticWeight || '0.7'));
            const profile = req.query.profile as string | undefined;
            const result = await vectorSearch.searchHybrid(db, q, { limit, semanticWeight, profile: profile as any });
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

     // Control
     router.post('/agents/:name/status', authMiddleware, (req, res) => {
         const { name } = req.params;
         const { status } = req.body;
         if (!status) return res.status(400).json({ error: 'status is required' });
         const agentName = name as string;
         updateAgentStatus(db, agentName.toUpperCase(), status);
         res.json({ success: true });
     });

    router.post('/vault/ingest', authMiddleware, async (_, res) => {
        try {
            const result = await runVaultIngestion(db, 'route:vault_ingest');
            res.json({ ...getIngestionStats(db), result });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    // Executor
    router.post('/execute', authMiddleware, async (req, res) => {
        const { commandKey } = req.body;
        if (typeof commandKey !== 'string' || !isAllowedCommandKey(commandKey)) {
            return res.status(400).json({ error: 'Invalid or unauthorized command key' });
        }

        try {
            const result = await executeCommand(db, commandKey);
            res.json({ success: true, ...result });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // Terminal shell execution — proxies to shell service (avoids pm2 posix_spawn EBADF)
    const SHELL_SERVICE = 'http://127.0.0.1:3098';
    const SHELL_KEY = process.env.SHELL_SERVICE_KEY || 'nudimmud-master-key-2026-04-23';
    router.post('/terminal/run', authMiddleware, (req, res) => {
        const { command } = req.body;
        if (typeof command !== 'string' || !command.trim()) {
            return res.status(400).json({ error: 'command required' });
        }
        const http = require('http');
        const body = JSON.stringify({ command });
        const proxyReq = http.request({
            hostname: '127.0.0.1', port: 3098, path: '/run', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'X-API-KEY': SHELL_KEY },
        }, (proxyRes: any) => {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            });
            proxyRes.pipe(res);
            proxyRes.on('end', () => res.end());
        });
        proxyReq.on('error', (e: Error) => {
            if (!res.headersSent) res.status(503).json({ error: `shell service unavailable: ${e.message}` });
        });
        proxyReq.write(body);
        proxyReq.end();
        res.on('close', () => proxyReq.destroy());
    });

    // ExeoFlow Time Tracking
    router.post('/exeoflow/time', authMiddleware, async (req, res) => {
        const { ticket_id, notes, time } = req.body;
        if (!ticket_id) return res.status(400).json({ error: 'ticket_id is required' });
        const result = await logTimeEntry(db, { ticket_id, notes: notes || '', time: time || 'unspecified' });
        res.json(result);
    });

    router.get('/exeoflow/entries', authMiddleware, (_, res) => res.json(getAllTimeEntries(db)));
    router.get('/exeoflow/pending', authMiddleware, (_, res) => res.json(getPendingTimeEntries(db)));
    
    // ── SWARM ORCHESTRATION ──
    const { SwarmOrchestrator } = require('../services/swarmOrchestrator');
    const swarm = new SwarmOrchestrator(db);

    router.post('/swarm/execute', authMiddleware, async (req, res) => {
        const { goal, context } = req.body;
        if (!goal) return res.status(400).json({ error: 'goal is required' });
        try {
            const result = await swarm.executeSwarmGoal(goal, context);
            res.json({ result });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/swarm/messages', (_, res) => {
        const messages = db.prepare(`
            SELECT m.*, s.name as sender, r.name as receiver
            FROM swarm_messages m
            JOIN agents s ON m.sender_agent_id = s.id
            JOIN agents r ON m.receiver_agent_id = r.id
            ORDER BY m.created_at DESC LIMIT 50
        `).all();
        res.json(messages);
    });

    router.get('/swarm/metrics', (_, res) => res.json(getSwarmMetrics(db)));
    
    router.get('/agents/:name/activity', (req, res) => {
        const { name } = req.params;
        res.json(getAgentActivity(db, name.toUpperCase()));
    });

    // ─── VAULT DIAGNOSTICS ────────────────────────────────────────────────────
    router.get('/obsidian/status', (_, res) => {
        try {
            const status = obsidianRest.getStatus?.() || { status: 'UNKNOWN', lastSync: null };
            res.json(status);
        } catch (err) {
            res.json({ status: 'OFFLINE', lastSync: null, error: String(err) });
        }
    });

    router.get('/obsidian/paths', async (_, res) => {
        try {
            const paths = await obsidianRest.listVaults?.() || [];
            res.json({ vaults: paths, count: paths.length });
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });

    router.post('/obsidian/reconnect', authMiddleware, async (_, res) => {
        try {
            const result = await obsidianRest.reconnect?.();
            const success = typeof result === 'object' && result !== null
                ? Boolean((result as { success?: boolean }).success)
                : Boolean(result);
            res.json({ success, status: 'RECONNECT_ATTEMPTED' });
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });

    router.post('/obsidian/restart-sync', authMiddleware, async (_, res) => {
        try {
            await obsidianRest.restartSync?.();
            res.json({ success: true, message: 'Sync service restarted' });
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });

    router.post('/obsidian/sync', authMiddleware, async (req, res) => {
        try {
            const { action } = req.body;
            if (action === 'test') {
                const result = await obsidianRest.testConnection?.() || { connected: false };
                res.json({ success: result.connected, test: true });
            } else {
                res.status(400).json({ error: 'Unknown action' });
            }
        } catch (err) {
            res.status(500).json({ error: String(err) });
        }
    });

    // Oracle SSE stream — pipes local LLM output as it arrives, no blocking wait
    router.get('/oracle/stream', async (req, res) => {
        const providedKey = String(req.query.apiKey || req.header('X-API-KEY') || '');
        if (!providedKey || providedKey !== getRuntimeApiKey()) {
            res.status(401).json({ error: 'UNAUTHORIZED' });
            return;
        }
        const command = String(req.query.command || '').trim();
        const modelId = String(req.query.model || 'qwen-liberated:latest');
        if (!command) { res.status(400).json({ error: 'command required' }); return; }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        const send = (event: string, data: unknown) => {
            res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        send('start', { model: modelId, command });

        try {
            const profile = getPersonalityProfile(db);
            const systemPrompt = buildPersonalitySystemPrompt(profile);
            const result = await ollamaProvider.streamChat({
                model: modelId,
                system: systemPrompt,
                messages: [{ role: 'user', content: command }],
                runtime: 'local',
                signal: (req as any).signal,
                operationType: 'oracle_stream',
                metadata: { route: '/oracle/stream' },
                onToken: (token) => send('token', { token })
            });
            send('done', { content: result.content, model: result.model || modelId });
        } catch (err: any) {
            const msg = err.message || '';
            const isOllamaDown = msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') || /Ollama HTTP [45]/.test(msg);
            send('error', {
                message: isOllamaDown ? 'OLLAMA_UNAVAILABLE' : (msg || 'STREAM_FAILED'),
                code: isOllamaDown ? 'OLLAMA_UNAVAILABLE' : 'STREAM_FAILED'
            });
        }
        res.end();
    });

    // Token telemetry — HUD polls this for session + weekly status bar
    router.get('/telemetry/tokens', (_, res) => {
        const fs = require('fs');
        const STATE_DIR = '/Users/marcelspatz/NUDIMMUD/.claude/state';
        try {
            const session = fs.existsSync(`${STATE_DIR}/token-session.json`)
                ? JSON.parse(fs.readFileSync(`${STATE_DIR}/token-session.json`, 'utf-8'))
                : null;
            const weekly = fs.existsSync(`${STATE_DIR}/token-weekly.json`)
                ? JSON.parse(fs.readFileSync(`${STATE_DIR}/token-weekly.json`, 'utf-8'))
                : null;
            res.json({ session, weekly });
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // Chrome Design Assistant bridge: browser captures, selections, and Codex work packets.
    initDesignAssistantRoutes(router, options.designAssistantBridge || new DesignAssistantBridgeService(db));

    const { initSiteBuilderRoutes } = require('./siteBuilderRoutes');
    initSiteBuilderRoutes(router);

    const { initDesignStudioRoutes } = require('./designStudioRoutes');
    initDesignStudioRoutes(router);

    // Notebook module (NotebookLM clone) — additive, no existing routes touched
    const { initNotebookRoutes } = require('./notebookRoutes');
    initNotebookRoutes(router, db);

    // Consumer site public endpoints — contact form, status, chat (placeholder)
    const { initConsumerRoutes } = require('./consumerRoutes');
    initConsumerRoutes(router, db);

    return router;
}
