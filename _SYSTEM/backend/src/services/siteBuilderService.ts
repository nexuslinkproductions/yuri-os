import crypto from 'crypto';
import Database from 'better-sqlite3';
import { SystemConfig } from '../config/SystemConfig';
import { memoryGovernor } from './memoryGovernorService';

export type BuilderRoute = '/' | '/work' | '/services' | '/about' | '/contact';
export type BuilderMode = 'structure' | 'organize' | 'design' | 'edit';
export type BuilderNodeKind = 'page' | 'section' | 'component' | 'text' | 'action' | 'media';
export type BuilderOperation = 'rewrite' | 'restyle' | 'reorder' | 'replace' | 'variant';
export type EditIntentStatus = 'draft' | 'packet_ready' | 'archived';

export interface BuilderNode {
    id: string;
    route: BuilderRoute;
    label: string;
    kind: BuilderNodeKind;
    selector: string;
    sourceFile: string;
    sourceSymbol?: string;
    allowedOperations: BuilderOperation[];
}

export interface BuilderPage {
    route: BuilderRoute;
    label: string;
    sourceFile: string;
    nodes: BuilderNode[];
}

export interface SiteBuilderSession {
    id: string;
    pageRoute: BuilderRoute;
    mode: BuilderMode;
    title: string;
    createdAt: string;
    updatedAt: string;
}

export interface SiteBuilderAnnotation {
    id: number;
    sessionId: string;
    nodeId: string;
    route: BuilderRoute;
    note: string;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface SiteBuilderIntent {
    id: number;
    sessionId: string;
    nodeId: string;
    route: BuilderRoute;
    mode: BuilderMode;
    operation: BuilderOperation;
    prompt: string;
    designSourceIds: string[];
    status: EditIntentStatus;
    createdAt: string;
    updatedAt: string;
}

export interface SiteBuilderPatchPacket {
    id: number;
    intentId: number;
    sessionId: string;
    nodeId: string;
    route: BuilderRoute;
    packet: Record<string, unknown>;
    markdown: string;
    createdAt: string;
}

export interface SiteBuilderSessionDetail extends SiteBuilderSession {
    annotations: SiteBuilderAnnotation[];
    intents: SiteBuilderIntent[];
    packets: SiteBuilderPatchPacket[];
}

export interface SiteBuilderServiceOptions {
    dbPath?: string;
    memoryWriter?: (content: string, tags: string[], metadata: Record<string, unknown>) => number | null;
}

const DEFAULT_DB_PATH = '_SYSTEM/OS_KERNEL/memory.db';

const PAGE_REGISTRY: BuilderPage[] = [
    {
        route: '/',
        label: 'Home',
        sourceFile: 'src/pages/HomePage.tsx',
        nodes: [
            node('/', 'home.hero', 'Hero', 'section', 'src/pages/HomePage.tsx', 'Hero', ['rewrite', 'restyle', 'variant']),
            node('/', 'home.process', 'Process', 'section', 'src/pages/HomePage.tsx', 'HomePage', ['rewrite', 'restyle', 'reorder']),
            node('/', 'home.testimonial', 'Testimonial', 'section', 'src/pages/HomePage.tsx', 'HomePage', ['rewrite', 'restyle']),
            node('/', 'home.cta', 'CTA Banner', 'component', 'src/components/CTABanner.tsx', 'CTABanner', ['rewrite', 'restyle', 'variant'])
        ]
    },
    {
        route: '/work',
        label: 'Work',
        sourceFile: 'src/pages/WorkPage.tsx',
        nodes: [
            node('/work', 'work.hero', 'Hero', 'section', 'src/pages/WorkPage.tsx', 'WorkPage', ['rewrite', 'restyle']),
            node('/work', 'work.gallery', 'Work Gallery', 'component', 'src/components/WorkGallery.tsx', 'WorkGallery', ['reorder', 'restyle', 'replace']),
            node('/work', 'work.logic', 'Portfolio Logic', 'section', 'src/pages/WorkPage.tsx', 'WorkPage', ['rewrite', 'restyle']),
            node('/work', 'work.cta', 'CTA Banner', 'component', 'src/components/CTABanner.tsx', 'CTABanner', ['rewrite', 'restyle', 'variant'])
        ]
    },
    {
        route: '/services',
        label: 'Services',
        sourceFile: 'src/pages/ServicesPage.tsx',
        nodes: [
            node('/services', 'services.hero', 'Hero', 'section', 'src/pages/ServicesPage.tsx', 'ServicesPage', ['rewrite', 'restyle']),
            node('/services', 'services.list', 'Service List', 'component', 'src/pages/ServicesPage.tsx', 'ServiceRow', ['rewrite', 'reorder', 'restyle']),
            node('/services', 'services.synthesis', 'Synthesis', 'section', 'src/pages/ServicesPage.tsx', 'ServicesPage', ['rewrite', 'restyle']),
            node('/services', 'services.cta', 'CTA Link', 'action', 'src/pages/ServicesPage.tsx', 'ServicesPage', ['rewrite', 'variant'])
        ]
    },
    {
        route: '/about',
        label: 'About',
        sourceFile: 'src/pages/AboutPage.tsx',
        nodes: [
            node('/about', 'about.hero', 'Hero', 'section', 'src/pages/AboutPage.tsx', 'AboutPage', ['rewrite', 'restyle']),
            node('/about', 'about.narrative', 'Narrative', 'section', 'src/pages/AboutPage.tsx', 'AboutPage', ['rewrite', 'restyle', 'reorder']),
            node('/about', 'about.career', 'Career Arc', 'section', 'src/pages/AboutPage.tsx', 'AboutPage', ['rewrite', 'restyle', 'reorder']),
            node('/about', 'about.philosophy', 'Philosophy', 'section', 'src/pages/AboutPage.tsx', 'AboutPage', ['rewrite', 'restyle'])
        ]
    },
    {
        route: '/contact',
        label: 'Contact',
        sourceFile: 'src/pages/ContactPage.tsx',
        nodes: [
            node('/contact', 'contact.hero', 'Hero', 'section', 'src/pages/ContactPage.tsx', 'ContactPage', ['rewrite', 'restyle']),
            node('/contact', 'contact.form', 'Brief Builder', 'component', 'src/pages/ContactPage.tsx', 'ContactPage', ['rewrite', 'restyle', 'variant']),
            node('/contact', 'contact.review', 'Review Panel', 'section', 'src/pages/ContactPage.tsx', 'ContactPage', ['rewrite', 'restyle']),
            node('/contact', 'contact.contact-card', 'Contact Card', 'component', 'src/pages/ContactPage.tsx', 'ContactPage', ['rewrite', 'restyle'])
        ]
    }
];

function node(
    route: BuilderRoute,
    id: string,
    label: string,
    kind: BuilderNodeKind,
    sourceFile: string,
    sourceSymbol: string,
    allowedOperations: BuilderOperation[]
): BuilderNode {
    return {
        id,
        route,
        label,
        kind,
        selector: `[data-builder-id="${id}"]`,
        sourceFile,
        sourceSymbol,
        allowedOperations
    };
}

export class SiteBuilderService {
    private readonly db: Database.Database;
    private readonly memoryWriter: (content: string, tags: string[], metadata: Record<string, unknown>) => number | null;

    constructor(dbOrPath?: Database.Database | string, options: SiteBuilderServiceOptions = {}) {
        if (typeof dbOrPath === 'string') {
            this.db = new Database(SystemConfig.resolve(dbOrPath));
        } else if (dbOrPath) {
            this.db = dbOrPath;
        } else {
            this.db = new Database(SystemConfig.resolve(options.dbPath || DEFAULT_DB_PATH));
        }

        this.db.pragma('foreign_keys = ON');
        this.memoryWriter = options.memoryWriter || ((content, tags, metadata) => memoryGovernor.governWrite({
            content,
            memoryType: 'site_builder',
            sourceAgent: 'ENKI',
            sourceKind: 'site_builder',
            tags,
            importance: 2,
            metadata
        }));
        this.ensureSchema();
    }

    listPages(): BuilderPage[] {
        return PAGE_REGISTRY.map((page) => ({
            ...page,
            nodes: page.nodes.map((item) => ({ ...item, allowedOperations: [...item.allowedOperations] }))
        }));
    }

    createSession(input: { sessionId?: string; pageRoute?: BuilderRoute; mode?: BuilderMode; title?: string } = {}): SiteBuilderSession {
        if (input.sessionId) {
            const existing = this.getSessionRow(input.sessionId);
            if (existing) return existing;
        }

        const route = this.assertRoute(input.pageRoute || '/');
        const mode = this.assertMode(input.mode || 'structure');
        const id = input.sessionId || `site-builder-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
        const title = input.title || `Builder ${route}`;

        const row = this.db.prepare(`
            INSERT INTO site_builder_sessions (id, page_route, mode, title)
            VALUES (?, ?, ?, ?)
            RETURNING *
        `).get(id, route, mode, title) as SessionRow;

        this.writeMemory(`Site Builder session created for ${route} in ${mode} mode.`, ['site_builder'], {
            sessionId: id,
            route,
            mode
        });

        return mapSession(row);
    }

    getSession(sessionId: string): SiteBuilderSessionDetail | null {
        const session = this.getSessionRow(sessionId);
        if (!session) return null;
        return {
            ...session,
            annotations: this.listAnnotations(sessionId),
            intents: this.listIntents(sessionId),
            packets: this.listPackets(sessionId)
        };
    }

    saveAnnotation(input: {
        sessionId: string;
        nodeId: string;
        route: BuilderRoute;
        note: string;
        metadata?: Record<string, unknown>;
    }): SiteBuilderAnnotation {
        this.assertSession(input.sessionId);
        const nodeDef = this.assertNode(input.route, input.nodeId);
        const note = input.note.trim();
        if (!note) throw new Error('annotation note is required');

        const row = this.db.prepare(`
            INSERT INTO site_builder_annotations (session_id, node_id, route, note, metadata_json)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            input.sessionId,
            nodeDef.id,
            nodeDef.route,
            note,
            JSON.stringify(input.metadata || {})
        ) as AnnotationRow;

        this.touchSession(input.sessionId);
        this.writeMemory(`Site Builder annotation on ${nodeDef.id}: ${note}`, ['site_builder', 'annotation'], {
            sessionId: input.sessionId,
            nodeId: nodeDef.id,
            route: nodeDef.route
        });

        return mapAnnotation(row);
    }

    saveIntent(input: {
        sessionId: string;
        nodeId: string;
        route: BuilderRoute;
        mode: BuilderMode;
        operation: BuilderOperation;
        prompt: string;
        designSourceIds: string[];
    }): SiteBuilderIntent {
        this.assertSession(input.sessionId);
        const nodeDef = this.assertNode(input.route, input.nodeId);
        const mode = this.assertMode(input.mode);
        const operation = this.assertOperation(nodeDef, input.operation);
        const prompt = input.prompt.trim();
        const designSourceIds = [...new Set((input.designSourceIds || []).map((id) => id.trim()).filter(Boolean))];
        if (!prompt) throw new Error('intent prompt is required');
        if (mode === 'design' && designSourceIds.length < 3) throw new Error('design intents require at least 3 design sources');

        const row = this.db.prepare(`
            INSERT INTO site_builder_edit_intents (
                session_id, node_id, route, mode, operation, prompt, design_source_ids, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
            RETURNING *
        `).get(
            input.sessionId,
            nodeDef.id,
            nodeDef.route,
            mode,
            operation,
            prompt,
            JSON.stringify(designSourceIds)
        ) as IntentRow;

        this.touchSession(input.sessionId);
        this.writeMemory(`Site Builder ${mode} intent on ${nodeDef.id}: ${operation} - ${prompt}`, ['site_builder', 'design_radar'], {
            sessionId: input.sessionId,
            nodeId: nodeDef.id,
            route: nodeDef.route,
            operation,
            designSourceIds
        });

        return mapIntent(row);
    }

    createPatchPacket(intentId: number): SiteBuilderPatchPacket {
        const intent = this.getIntent(intentId);
        if (!intent) throw new Error('intent not found');
        const nodeDef = this.assertNode(intent.route, intent.nodeId);

        const packet = {
            schema: 'site-builder.patch-packet.v1',
            generatedAt: new Date().toISOString(),
            intent,
            target: nodeDef,
            codexInstruction: `Review and implement a ${intent.operation} change for ${nodeDef.id}. Do not mutate unrelated code.`,
            acceptanceChecks: [
                'Selected node still renders on its registered route.',
                'No unrelated public website visuals change.',
                'Run npm run build.',
                'Run npm --prefix backend run build if backend contract changes.'
            ]
        };
        const markdown = this.buildPacketMarkdown(packet, nodeDef, intent);

        const row = this.db.prepare(`
            INSERT INTO site_builder_patch_packets (intent_id, session_id, node_id, route, packet_json, packet_markdown)
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            intent.id,
            intent.sessionId,
            nodeDef.id,
            nodeDef.route,
            JSON.stringify(packet, null, 2),
            markdown
        ) as PacketRow;

        this.db.prepare(`
            UPDATE site_builder_edit_intents
            SET status='packet_ready', updated_at=datetime('now')
            WHERE id=?
        `).run(intent.id);
        this.touchSession(intent.sessionId);

        this.writeMemory(`Codex patch packet generated for ${nodeDef.id}: ${intent.prompt}`, ['site_builder', 'codex_patch_packet'], {
            sessionId: intent.sessionId,
            intentId: intent.id,
            packetId: row.id,
            nodeId: nodeDef.id
        });

        return mapPacket(row);
    }

    getPacket(packetId: number): SiteBuilderPatchPacket | null {
        const row = this.db.prepare('SELECT * FROM site_builder_patch_packets WHERE id=?')
            .get(packetId) as PacketRow | undefined;
        return row ? mapPacket(row) : null;
    }

    private getSessionRow(sessionId: string): SiteBuilderSession | null {
        const row = this.db.prepare('SELECT * FROM site_builder_sessions WHERE id=?')
            .get(sessionId) as SessionRow | undefined;
        return row ? mapSession(row) : null;
    }

    private getIntent(intentId: number): SiteBuilderIntent | null {
        const row = this.db.prepare('SELECT * FROM site_builder_edit_intents WHERE id=?')
            .get(intentId) as IntentRow | undefined;
        return row ? mapIntent(row) : null;
    }

    private listAnnotations(sessionId: string): SiteBuilderAnnotation[] {
        return (this.db.prepare(`
            SELECT * FROM site_builder_annotations WHERE session_id=? ORDER BY created_at ASC, id ASC
        `).all(sessionId) as AnnotationRow[]).map(mapAnnotation);
    }

    private listIntents(sessionId: string): SiteBuilderIntent[] {
        return (this.db.prepare(`
            SELECT * FROM site_builder_edit_intents WHERE session_id=? ORDER BY created_at ASC, id ASC
        `).all(sessionId) as IntentRow[]).map(mapIntent);
    }

    private listPackets(sessionId: string): SiteBuilderPatchPacket[] {
        return (this.db.prepare(`
            SELECT * FROM site_builder_patch_packets WHERE session_id=? ORDER BY created_at ASC, id ASC
        `).all(sessionId) as PacketRow[]).map(mapPacket);
    }

    private assertSession(sessionId: string): void {
        if (!this.getSessionRow(sessionId)) throw new Error('session not found');
    }

    private assertRoute(route: string): BuilderRoute {
        if (PAGE_REGISTRY.some((page) => page.route === route)) return route as BuilderRoute;
        throw new Error(`unsupported route: ${route}`);
    }

    private assertMode(mode: string): BuilderMode {
        if (['structure', 'organize', 'design', 'edit'].includes(mode)) return mode as BuilderMode;
        throw new Error(`unsupported mode: ${mode}`);
    }

    private assertNode(route: BuilderRoute, nodeId: string): BuilderNode {
        const resolvedRoute = this.assertRoute(route);
        const page = PAGE_REGISTRY.find((candidate) => candidate.route === resolvedRoute);
        const nodeDef = page?.nodes.find((candidate) => candidate.id === nodeId);
        if (!nodeDef) throw new Error(`unsupported node: ${nodeId}`);
        return nodeDef;
    }

    private assertOperation(nodeDef: BuilderNode, operation: string): BuilderOperation {
        if (nodeDef.allowedOperations.includes(operation as BuilderOperation)) return operation as BuilderOperation;
        throw new Error(`operation ${operation} is not allowed for ${nodeDef.id}`);
    }

    private touchSession(sessionId: string): void {
        this.db.prepare(`UPDATE site_builder_sessions SET updated_at=datetime('now') WHERE id=?`).run(sessionId);
    }

    private writeMemory(content: string, tags: string[], metadata: Record<string, unknown>): void {
        try {
            this.memoryWriter(content, tags, metadata);
        } catch (error: any) {
            console.warn(`⬡ SITE_BUILDER_MEMORY_WARN :: ${error.message}`);
        }
    }

    private buildPacketMarkdown(packet: Record<string, unknown>, nodeDef: BuilderNode, intent: SiteBuilderIntent): string {
        return [
            `# Site Builder Patch Packet ${intent.id}`,
            '',
            `Target node: ${nodeDef.id}`,
            `Route: ${nodeDef.route}`,
            `Source: ${nodeDef.sourceFile}${nodeDef.sourceSymbol ? ` (${nodeDef.sourceSymbol})` : ''}`,
            `Mode: ${intent.mode}`,
            `Operation: ${intent.operation}`,
            '',
            '## Prompt',
            intent.prompt,
            '',
            '## Design Sources',
            intent.designSourceIds.length ? intent.designSourceIds.map((id) => `- ${id}`).join('\n') : '- none selected',
            '',
            '## Codex Instruction',
            String(packet.codexInstruction),
            '',
            '## Acceptance Checks',
            ((packet.acceptanceChecks as string[]) || []).map((check) => `- ${check}`).join('\n')
        ].join('\n');
    }

    private ensureSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS site_builder_sessions (
                id TEXT PRIMARY KEY,
                page_route TEXT NOT NULL,
                mode TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS site_builder_annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES site_builder_sessions(id) ON DELETE CASCADE,
                node_id TEXT NOT NULL,
                route TEXT NOT NULL,
                note TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS site_builder_edit_intents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL REFERENCES site_builder_sessions(id) ON DELETE CASCADE,
                node_id TEXT NOT NULL,
                route TEXT NOT NULL,
                mode TEXT NOT NULL,
                operation TEXT NOT NULL,
                prompt TEXT NOT NULL,
                design_source_ids TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'draft',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS site_builder_patch_packets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                intent_id INTEGER NOT NULL REFERENCES site_builder_edit_intents(id) ON DELETE CASCADE,
                session_id TEXT NOT NULL REFERENCES site_builder_sessions(id) ON DELETE CASCADE,
                node_id TEXT NOT NULL,
                route TEXT NOT NULL,
                packet_json TEXT NOT NULL,
                packet_markdown TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_site_builder_annotations_session ON site_builder_annotations(session_id);
            CREATE INDEX IF NOT EXISTS idx_site_builder_intents_session ON site_builder_edit_intents(session_id);
            CREATE INDEX IF NOT EXISTS idx_site_builder_packets_session ON site_builder_patch_packets(session_id);
            CREATE INDEX IF NOT EXISTS idx_site_builder_packets_intent ON site_builder_patch_packets(intent_id);
        `);
    }
}

type SessionRow = {
    id: string;
    page_route: BuilderRoute;
    mode: BuilderMode;
    title: string;
    created_at: string;
    updated_at: string;
};

type AnnotationRow = {
    id: number;
    session_id: string;
    node_id: string;
    route: BuilderRoute;
    note: string;
    metadata_json: string;
    created_at: string;
};

type IntentRow = {
    id: number;
    session_id: string;
    node_id: string;
    route: BuilderRoute;
    mode: BuilderMode;
    operation: BuilderOperation;
    prompt: string;
    design_source_ids: string;
    status: EditIntentStatus;
    created_at: string;
    updated_at: string;
};

type PacketRow = {
    id: number;
    intent_id: number;
    session_id: string;
    node_id: string;
    route: BuilderRoute;
    packet_json: string;
    packet_markdown: string;
    created_at: string;
};

function mapSession(row: SessionRow): SiteBuilderSession {
    return {
        id: row.id,
        pageRoute: row.page_route,
        mode: row.mode,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapAnnotation(row: AnnotationRow): SiteBuilderAnnotation {
    return {
        id: row.id,
        sessionId: row.session_id,
        nodeId: row.node_id,
        route: row.route,
        note: row.note,
        metadata: parseJsonObject(row.metadata_json),
        createdAt: row.created_at
    };
}

function mapIntent(row: IntentRow): SiteBuilderIntent {
    return {
        id: row.id,
        sessionId: row.session_id,
        nodeId: row.node_id,
        route: row.route,
        mode: row.mode,
        operation: row.operation,
        prompt: row.prompt,
        designSourceIds: parseJsonArray(row.design_source_ids),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapPacket(row: PacketRow): SiteBuilderPatchPacket {
    return {
        id: row.id,
        intentId: row.intent_id,
        sessionId: row.session_id,
        nodeId: row.node_id,
        route: row.route,
        packet: parseJsonObject(row.packet_json),
        markdown: row.packet_markdown,
        createdAt: row.created_at
    };
}

function parseJsonObject(value: string): Record<string, unknown> {
    try {
        const parsed = JSON.parse(value || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function parseJsonArray(value: string): string[] {
    try {
        const parsed = JSON.parse(value || '[]');
        return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch {
        return [];
    }
}
