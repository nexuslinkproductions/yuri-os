import fs from 'fs';
import path from 'path';
import express, { Router } from 'express';
import multer from 'multer';
import { authMiddleware, localOnlyMiddleware } from '../middleware/auth';
import { SystemConfig } from '../config/SystemConfig';
import { DesignArtifactType, DesignStudioService } from '../services/designStudioService';

const UPLOAD_DIR = SystemConfig.resolve(`${SystemConfig.SYSTEM.DATA}/design-studio/uploads`);
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9._-]/gi, '_')}`)
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }
});

function sendError(res: any, error: any): void {
    const message = error?.message || 'DESIGN_STUDIO_ERROR';
    const notFound = /not found/i.test(message);
    const badRequest = /required|unsupported|at least|at most|does not belong/i.test(message);
    res.status(notFound ? 404 : badRequest ? 400 : 500).json({ error: message });
}

function inferArtifactType(file?: Express.Multer.File, explicit?: string): DesignArtifactType {
    if (explicit) return explicit as DesignArtifactType;
    const mime = file?.mimetype || '';
    const ext = path.extname(file?.originalname || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.includes('pdf') || mime.includes('word') || ['.pdf', '.docx', '.doc'].includes(ext)) return 'document';
    if (mime.includes('presentation') || ['.ppt', '.pptx', '.key'].includes(ext)) return 'deck';
    return 'website';
}

function parseMetadata(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value !== 'string') return {};
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

export function initDesignStudioRoutes(router: Router): void {
    const service = new DesignStudioService(undefined, {
        dbPath: process.env.YURI_MEMORY_DB_PATH || '_SYSTEM/OS_KERNEL/memory.db'
    });
    const designStudio = Router();

    router.use('/design-studio/files', localOnlyMiddleware, express.static(SystemConfig.resolve(`${SystemConfig.SYSTEM.DATA}/design-studio`)));
    designStudio.use(localOnlyMiddleware, authMiddleware);

    designStudio.get('/projects', (_req, res) => {
        try {
            res.json({ projects: service.listProjects() });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.post('/projects', (req, res) => {
        try {
            const project = service.createProject(req.body || {});
            res.status(201).json({ project });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.get('/projects/:id', (req, res) => {
        try {
            const project = service.getProject(String(req.params.id || ''));
            if (!project) {
                res.status(404).json({ error: 'project not found' });
                return;
            }
            res.json({ project });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.post('/artifacts', upload.single('file'), (req, res) => {
        try {
            const file = req.file as Express.Multer.File | undefined;
            const body = req.body || {};
            const storagePath = file ? path.relative(SystemConfig.ROOT, file.path) : body.storagePath;
            const uri = body.uri || (file ? `${req.protocol}://${req.get('host')}/api/design-studio/files/uploads/${path.basename(file.path)}` : storagePath || '');
            const artifact = service.addArtifact({
                projectId: body.projectId,
                type: inferArtifactType(file, body.type),
                name: body.name || file?.originalname,
                uri,
                storagePath,
                mimeType: file?.mimetype || body.mimeType,
                metadata: parseMetadata(body.metadata)
            });
            res.status(201).json({ artifact });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.post('/artifacts/:id/capture', (req, res) => {
        try {
            const capture = service.captureArtifact(String(req.params.id || ''), req.body || {});
            res.status(201).json({ capture });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.post('/selections', (req, res) => {
        try {
            const selection = service.saveSelection(req.body || {});
            res.status(201).json({ selection });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.post('/reference-sets', (req, res) => {
        try {
            const referenceSet = service.setReferenceSet(req.body || {});
            res.status(201).json({ referenceSet });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.post('/intents', (req, res) => {
        try {
            const intent = service.saveIntent(req.body || {});
            res.status(201).json({ intent });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.post('/intents/:id/packet', (req, res) => {
        try {
            const packet = service.generatePacket(String(req.params.id || ''));
            res.status(201).json({ packet });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.get('/packets/:id', (req, res) => {
        try {
            const packet = service.getPacket(String(req.params.id || ''));
            if (!packet) {
                res.status(404).json({ error: 'packet not found' });
                return;
            }
            res.json({ packet });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.get('/mcp/resources', (req, res) => {
        try {
            const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
            res.json({ resources: service.listMcpResources(projectId) });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    designStudio.get('/mcp/tools', (_req, res) => {
        res.json({
            tools: [
                'designStudio.createProject',
                'designStudio.addArtifact',
                'designStudio.captureArtifact',
                'designStudio.saveSelection',
                'designStudio.setReferences',
                'designStudio.saveIntent',
                'designStudio.generatePacket',
                'designStudio.markPacketApplied'
            ]
        });
    });

    designStudio.post('/mcp/tools/:toolName', (req, res) => {
        try {
            const toolName = String(req.params.toolName || '');
            if (toolName === 'designStudio.markPacketApplied') {
                const run = service.markPacketApplied(String(req.body?.packetId || ''), String(req.body?.notes || ''));
                res.status(201).json({ run });
                return;
            }
            res.status(400).json({ error: `unsupported MCP tool: ${toolName}` });
        } catch (error: any) {
            sendError(res, error);
        }
    });

    router.use('/design-studio', designStudio);
}
