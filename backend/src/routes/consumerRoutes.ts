import { Router } from 'express';
import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';

const ipHits = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRate(ip: string, max: number): boolean {
    const now = Date.now();
    const hits = (ipHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (hits.length >= max) {
        ipHits.set(ip, hits);
        return false;
    }
    hits.push(now);
    ipHits.set(ip, hits);
    return true;
}

const VALID_PROJECT_TYPES = new Set(['Video', 'Motion', 'Social', 'Web', 'IT', 'Ads']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function initConsumerRoutes(router: Router, db: Database.Database) {
    db.exec(`CREATE TABLE IF NOT EXISTS consumer_contact_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ip TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        project_type TEXT,
        message TEXT NOT NULL
    )`);

    const insertContact = db.prepare(
        `INSERT INTO consumer_contact_submissions (ip, name, email, project_type, message) VALUES (?, ?, ?, ?, ?)`
    );

    router.post('/consumer/contact', (req: Request, res: Response) => {
        try {
            const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown');
            if (!checkRate(ip, 5)) {
                return res.status(429).json({ error: 'Too many requests. Please try again later.' });
            }
            const body = req.body || {};
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            const projectType = typeof body.projectType === 'string' ? body.projectType.trim() : '';
            const message = typeof body.message === 'string' ? body.message.trim() : '';

            if (name.length < 1 || name.length > 200) return res.status(400).json({ error: 'Invalid name' });
            if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email' });
            if (projectType && !VALID_PROJECT_TYPES.has(projectType)) return res.status(400).json({ error: 'Invalid project type' });
            if (message.length < 1 || message.length > 5000) return res.status(400).json({ error: 'Invalid message' });

            insertContact.run(ip, name, email, projectType || null, message);
            return res.status(201).json({ ok: true, message: 'Submission received. We will be in touch within 24 hours.' });
        } catch (err: any) {
            console.error('[consumer/contact] error:', err);
            return res.status(500).json({ error: 'internal_error' });
        }
    });

    router.get('/consumer/status', (_req: Request, res: Response) => {
        res.json({ ok: true, location: 'Vienna, Austria', timestamp: new Date().toISOString() });
    });

    router.get('/consumer/chat', (_req: Request, res: Response) => {
        res.status(501).json({ error: 'Live chat coming soon. Use /api/consumer/contact for now.' });
    });
}
