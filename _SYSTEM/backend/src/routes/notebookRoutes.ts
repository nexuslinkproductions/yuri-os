import { Router } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { authMiddleware, localOnlyMiddleware } from '../middleware/auth';
import { SystemConfig } from '../config/SystemConfig';
import { NotebookService } from '../services/notebookService';
import { NotebookIngestService } from '../services/notebookIngestService';
import { NotebookRagService } from '../services/notebookRagService';
import { NotebookDocGenService } from '../services/notebookDocGenService';
import { NotebookPdfExportService } from '../services/notebookPdfExportService';
import { NotebookObsidianSyncService } from '../services/notebookObsidianSyncService';
import { NotebookVizService } from '../services/notebookVizService';
import type { CompressionMode } from '../services/smartRouter';

const UPLOAD_DIR = SystemConfig.resolve('backend/data/notebook-uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9._-]/gi, '_')}`)
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }
});

function sseSetup(res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    return (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
}

function parseCompressionMode(value: unknown): CompressionMode {
    if (value === 'off' || value === 'safe' || value === 'aggressive') return value;
    return 'safe';
}

export function initNotebookRoutes(router: Router, db: Database.Database): void {
    const notebookSvc = new NotebookService(db);
    const ingestSvc = new NotebookIngestService(notebookSvc);
    const ragSvc = new NotebookRagService(notebookSvc);
    const docGenSvc = new NotebookDocGenService(notebookSvc);
    const pdfSvc = new NotebookPdfExportService();
    const obsidianSvc = new NotebookObsidianSyncService();
    const vizSvc = new NotebookVizService(notebookSvc);

    // ─── Notebooks CRUD ───────��────────────────────────────────────────────────

    router.post('/notebook/notebooks', authMiddleware, (req, res) => {
        try {
            const { title = 'Untitled Notebook', description, model_id } = req.body;
            const notebook = notebookSvc.createNotebook(title, description, model_id);
            res.json(notebook);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notebook/notebooks', authMiddleware, (_req, res) => {
        try {
            res.json(notebookSvc.listNotebooks());
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notebook/notebooks/:id', authMiddleware, (req, res) => {
        try {
            const id = Number(req.params.id);
            const detail = notebookSvc.getNotebookDetail(id);
            if (!detail) return res.status(404).json({ error: 'Notebook not found' });
            res.json(detail);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.patch('/notebook/notebooks/:id', authMiddleware, (req, res) => {
        try {
            const id = Number(req.params.id);
            notebookSvc.updateNotebook(id, req.body);
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.delete('/notebook/notebooks/:id', authMiddleware, (req, res) => {
        try {
            notebookSvc.deleteNotebook(Number(req.params.id));
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── Sources ──────────────────────────────────────────────────────────────

    router.post('/notebook/notebooks/:id/sources/upload', authMiddleware, upload.array('files', 20), async (req, res) => {
        const notebookId = Number(req.params.id);
        const files = req.files as Express.Multer.File[] | undefined;
        if (!files || files.length === 0) {
            return res.status(400).json({ error: 'No files provided' });
        }
        try {
            const results = await Promise.allSettled(
                files.map(f => ingestSvc.ingestFile(notebookId, f.path, f.mimetype, f.originalname))
            );
            const responses = results.map((r, i) => ({
                file: files[i].originalname,
                ...(r.status === 'fulfilled'
                    ? { sourceId: r.value.sourceId, chunkCount: r.value.chunkCount, wordCount: r.value.wordCount }
                    : { error: (r as PromiseRejectedResult).reason?.message })
            }));
            res.json(responses);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notebook/notebooks/:id/sources/url', authMiddleware, async (req, res) => {
        const notebookId = Number(req.params.id);
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'url is required' });
        try {
            const result = await ingestSvc.ingestUrl(notebookId, url);
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notebook/notebooks/:id/sources/obsidian', authMiddleware, async (req, res) => {
        const notebookId = Number(req.params.id);
        const { vault_path } = req.body;
        if (!vault_path) return res.status(400).json({ error: 'vault_path is required' });
        try {
            const result = await ingestSvc.ingestObsidianNote(notebookId, vault_path);
            res.json(result);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notebook/sources/:sourceId', authMiddleware, (req, res) => {
        try {
            const source = notebookSvc.getSource(Number(req.params.sourceId));
            if (!source) return res.status(404).json({ error: 'Source not found' });
            res.json(source);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notebook/sources/:sourceId/status', authMiddleware, (req, res) => {
        try {
            const source = notebookSvc.getSource(Number(req.params.sourceId));
            if (!source) return res.status(404).json({ error: 'Source not found' });
            res.json({ status: source.status, error: source.error_msg, wordCount: source.word_count });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.delete('/notebook/sources/:sourceId', authMiddleware, (req, res) => {
        try {
            const source = notebookSvc.getSource(Number(req.params.sourceId));
            if (source?.origin_path && fs.existsSync(source.origin_path)) {
                fs.unlinkSync(source.origin_path);
            }
            notebookSvc.deleteSource(Number(req.params.sourceId));
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── RAG Chat Stream ───────────────────────────────────────────────────────

    router.get('/notebook/notebooks/:id/stream', localOnlyMiddleware, async (req, res) => {
        const notebookId = Number(req.params.id);
        const query = String(req.query.command || '').trim();
        const modelId = String(req.query.model || 'qwen-liberated:latest');
        const compressionMode = parseCompressionMode(req.query.compressionMode || req.query.compression_mode);
        if (!query) return res.status(400).json({ error: 'command is required' });

        const send = sseSetup(res);
        send('start', { model: modelId, notebookId });

        // Persist the user message
        notebookSvc.saveMessage(notebookId, 'user', query);

        await ragSvc.streamAnswer({
            notebookId, query, modelId,
            compressionMode,
            onToken: (token) => send('token', { token }),
            onCitation: (citation) => send('citation', citation),
            onDone: (content) => {
                send('done', { content });
                res.end();
            },
            onError: (msg) => {
                send('error', { message: msg });
                res.end();
            },
            signal: (req as any).signal
        });
    });

    // ─── Document Generation (SSE) ────────────────────────────────────────────

    router.post('/notebook/notebooks/:id/generate', authMiddleware, async (req, res) => {
        const notebookId = Number(req.params.id);
        const { doc_type, model_id = 'qwen-liberated:latest' } = req.body;
        const compressionMode = parseCompressionMode(req.body.compressionMode || req.body.compression_mode);
        if (!doc_type) return res.status(400).json({ error: 'doc_type is required' });

        const send = sseSetup(res);
        send('start', { doc_type, notebookId });

        await docGenSvc.streamGenerate({
            notebookId, docType: doc_type, modelId: model_id,
            compressionMode,
            onToken: (token) => send('token', { token }),
            onDone: (docId) => {
                // Invalidate viz cache for this notebook
                vizSvc.invalidateCache(notebookId);
                send('done', { docId });
                res.end();
            },
            onError: (msg) => {
                send('error', { message: msg });
                res.end();
            },
            signal: (req as any).signal
        });
    });

    // ─── Documents ────────────────────────────────────────────────────────────

    router.get('/notebook/docs/:docId', authMiddleware, (req, res) => {
        try {
            const doc = notebookSvc.getDoc(Number(req.params.docId));
            if (!doc) return res.status(404).json({ error: 'Document not found' });
            res.json(doc);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notebook/docs/:docId/pdf', localOnlyMiddleware, async (req, res) => {
        try {
            const doc = notebookSvc.getDoc(Number(req.params.docId));
            if (!doc) return res.status(404).json({ error: 'Document not found' });

            // Return cached PDF if it exists
            if (doc.pdf_path && fs.existsSync(doc.pdf_path)) {
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${doc.doc_type}-${doc.id}.pdf"`);
                return fs.createReadStream(doc.pdf_path).pipe(res);
            }

            const pdfPath = await pdfSvc.exportDoc(doc);
            notebookSvc.updateDocPdfPath(doc.id, pdfPath);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${doc.doc_type}-${doc.id}.pdf"`);
            fs.createReadStream(pdfPath).pipe(res);
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/notebook/docs/:docId/obsidian-sync', authMiddleware, async (req, res) => {
        try {
            const doc = notebookSvc.getDoc(Number(req.params.docId));
            if (!doc) return res.status(404).json({ error: 'Document not found' });

            const vaultPath = await obsidianSvc.pushToVault(doc);
            notebookSvc.updateDocObsidianPath(doc.id, vaultPath);
            res.json({ ok: true, vault_path: vaultPath });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.delete('/notebook/docs/:docId', authMiddleware, (req, res) => {
        try {
            const doc = notebookSvc.getDoc(Number(req.params.docId));
            if (doc?.pdf_path && fs.existsSync(doc.pdf_path)) fs.unlinkSync(doc.pdf_path);
            notebookSvc.deleteDoc(Number(req.params.docId));
            res.json({ ok: true });
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── Chat History ─────────────────────────────────────────────────────────

    router.get('/notebook/notebooks/:id/messages', authMiddleware, (req, res) => {
        try {
            res.json(notebookSvc.listMessages(Number(req.params.id)));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── Visualizations ───────────────────────────────────────────────────────

    router.get('/notebook/notebooks/:id/viz/entities', authMiddleware, async (req, res) => {
        try {
            res.json(await vizSvc.getEntityFrequencies(Number(req.params.id)));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notebook/notebooks/:id/viz/temporal', authMiddleware, async (req, res) => {
        try {
            res.json(await vizSvc.getTemporalSeries(Number(req.params.id)));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notebook/notebooks/:id/viz/topics', authMiddleware, async (req, res) => {
        try {
            res.json(await vizSvc.getTopicGraph(Number(req.params.id)));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/notebook/notebooks/:id/viz/sentiment', authMiddleware, async (req, res) => {
        try {
            res.json(await vizSvc.getSentiment(Number(req.params.id)));
        } catch (e: any) {
            res.status(500).json({ error: e.message });
        }
    });

    console.log('⬡ NOTEBOOK_ROUTES_REGISTERED');
}
