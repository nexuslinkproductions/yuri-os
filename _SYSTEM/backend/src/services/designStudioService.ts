import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { SystemConfig } from '../config/SystemConfig';
import { memoryGovernor } from './memoryGovernorService';

export type DesignProjectStatus = 'active' | 'archived';
export type DesignArtifactType = 'website' | 'image' | 'document' | 'deck';
export type DesignSelectionKind = 'region' | 'element' | 'page' | 'frame';
export type DesignIntentMode = 'structure' | 'organize' | 'design' | 'edit' | 'research';
export type DesignOperation = 'rewrite' | 'restyle' | 'reorder' | 'replace' | 'variant' | 'critique' | 'research';
export type DesignIntentStatus = 'draft' | 'packet_ready' | 'applied' | 'archived';

export interface DesignStudioProject {
    id: string;
    name: string;
    description: string;
    targetRoot: string;
    status: DesignProjectStatus;
    createdAt: string;
    updatedAt: string;
}

export interface DesignStudioArtifact {
    id: string;
    projectId: string;
    type: DesignArtifactType;
    name: string;
    uri: string;
    storagePath: string | null;
    mimeType: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}

export interface DesignStudioCapture {
    id: string;
    projectId: string;
    artifactId: string;
    label: string;
    previewUri: string;
    storagePath: string | null;
    metadata: Record<string, unknown>;
    createdAt: string;
}

export interface DesignStudioSelection {
    id: string;
    projectId: string;
    artifactId: string;
    captureId: string | null;
    label: string;
    kind: DesignSelectionKind;
    locator: Record<string, unknown>;
    note: string;
    createdAt: string;
}

export interface DesignStudioReferenceSet {
    id: string;
    projectId: string;
    sourceIds: string[];
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export interface DesignStudioIntent {
    id: string;
    projectId: string;
    selectionId: string;
    mode: DesignIntentMode;
    operation: DesignOperation;
    prompt: string;
    constraints: string[];
    acceptanceChecks: string[];
    designSourceIds: string[];
    status: DesignIntentStatus;
    createdAt: string;
    updatedAt: string;
}

export interface DesignStudioPacket {
    id: string;
    projectId: string;
    intentId: string;
    packet: Record<string, unknown>;
    markdown: string;
    createdAt: string;
}

export interface DesignStudioRun {
    id: string;
    projectId: string;
    packetId: string;
    status: 'queued' | 'applied' | 'rejected';
    notes: string;
    createdAt: string;
    updatedAt: string;
}

export interface DesignStudioProjectDetail extends DesignStudioProject {
    artifacts: DesignStudioArtifact[];
    captures: DesignStudioCapture[];
    selections: DesignStudioSelection[];
    referenceSets: DesignStudioReferenceSet[];
    intents: DesignStudioIntent[];
    packets: DesignStudioPacket[];
    runs: DesignStudioRun[];
}

export interface DesignStudioServiceOptions {
    dbPath?: string;
    artifactRoot?: string;
    memoryWriter?: (content: string, tags: string[], metadata: Record<string, unknown>) => number | null;
}

type ProjectRow = {
    id: string;
    name: string;
    description: string | null;
    target_root: string | null;
    status: DesignProjectStatus;
    created_at: string;
    updated_at: string;
};

type ArtifactRow = {
    id: string;
    project_id: string;
    type: DesignArtifactType;
    name: string;
    uri: string;
    storage_path: string | null;
    mime_type: string | null;
    metadata_json: string;
    created_at: string;
    updated_at: string;
};

type CaptureRow = {
    id: string;
    project_id: string;
    artifact_id: string;
    label: string;
    preview_uri: string;
    storage_path: string | null;
    metadata_json: string;
    created_at: string;
};

type SelectionRow = {
    id: string;
    project_id: string;
    artifact_id: string;
    capture_id: string | null;
    label: string;
    kind: DesignSelectionKind;
    locator_json: string;
    note: string | null;
    created_at: string;
};

type ReferenceSetRow = {
    id: string;
    project_id: string;
    source_ids_json: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
};

type IntentRow = {
    id: string;
    project_id: string;
    selection_id: string;
    mode: DesignIntentMode;
    operation: DesignOperation;
    prompt: string;
    constraints_json: string;
    acceptance_checks_json: string;
    design_source_ids_json: string;
    status: DesignIntentStatus;
    created_at: string;
    updated_at: string;
};

type PacketRow = {
    id: string;
    project_id: string;
    intent_id: string;
    packet_json: string;
    packet_markdown: string;
    created_at: string;
};

type RunRow = {
    id: string;
    project_id: string;
    packet_id: string;
    status: 'queued' | 'applied' | 'rejected';
    notes: string | null;
    created_at: string;
    updated_at: string;
};

const DEFAULT_DB_PATH = '_SYSTEM/OS_KERNEL/memory.db';
/** Canonical via SystemConfig.SYSTEM.DATA (ephemeral under YURI_TEST_MODE). */
const DEFAULT_ARTIFACT_ROOT = `${SystemConfig.SYSTEM.DATA}/design-studio`;
const VALID_ARTIFACT_TYPES = new Set(['website', 'image', 'document', 'deck']);
const VALID_SELECTION_KINDS = new Set(['region', 'element', 'page', 'frame']);
const VALID_MODES = new Set(['structure', 'organize', 'design', 'edit', 'research']);
const VALID_OPERATIONS = new Set(['rewrite', 'restyle', 'reorder', 'replace', 'variant', 'critique', 'research']);

export class DesignStudioService {
    private readonly db: Database.Database;
    private readonly artifactRoot: string;
    private readonly memoryWriter: (content: string, tags: string[], metadata: Record<string, unknown>) => number | null;

    constructor(dbOrPath?: Database.Database | string, options: DesignStudioServiceOptions = {}) {
        if (typeof dbOrPath === 'string') {
            this.db = new Database(SystemConfig.resolve(dbOrPath));
        } else if (dbOrPath) {
            this.db = dbOrPath;
        } else {
            this.db = new Database(SystemConfig.resolve(options.dbPath || DEFAULT_DB_PATH));
        }

        this.artifactRoot = SystemConfig.resolve(options.artifactRoot || DEFAULT_ARTIFACT_ROOT);
        fs.mkdirSync(this.artifactRoot, { recursive: true });
        this.db.pragma('foreign_keys = ON');
        this.memoryWriter = options.memoryWriter || ((content, tags, metadata) => memoryGovernor.governWrite({
            content,
            memoryType: 'design_studio',
            sourceAgent: 'ENKI',
            sourceKind: 'design_studio',
            tags,
            importance: 2,
            metadata
        }));
        this.ensureSchema();
    }

    listProjects(): DesignStudioProject[] {
        return (this.db.prepare(`
            SELECT * FROM design_studio_projects ORDER BY updated_at DESC, created_at DESC
        `).all() as ProjectRow[]).map(mapProject);
    }

    createProject(input: { name?: string; description?: string; targetRoot?: string } = {}): DesignStudioProject {
        const name = cleanString(input.name, 'Untitled Design Project');
        const id = idFor('dsp');
        const row = this.db.prepare(`
            INSERT INTO design_studio_projects (id, name, description, target_root, status)
            VALUES (?, ?, ?, ?, 'active')
            RETURNING *
        `).get(id, name, input.description || '', input.targetRoot || '') as ProjectRow;

        this.ensureProjectDir(id);
        this.writeMemory(`Design Studio project created: ${name}`, ['design_studio'], { projectId: id, targetRoot: input.targetRoot || '' });
        return mapProject(row);
    }

    getProject(projectId: string): DesignStudioProjectDetail | null {
        const project = this.getProjectRow(projectId);
        if (!project) return null;
        return {
            ...mapProject(project),
            artifacts: this.listArtifacts(projectId),
            captures: this.listCaptures(projectId),
            selections: this.listSelections(projectId),
            referenceSets: this.listReferenceSets(projectId),
            intents: this.listIntents(projectId),
            packets: this.listPackets(projectId),
            runs: this.listRuns(projectId)
        };
    }

    addArtifact(input: {
        projectId: string;
        type: DesignArtifactType;
        name?: string;
        uri?: string;
        storagePath?: string | null;
        mimeType?: string | null;
        metadata?: Record<string, unknown>;
    }): DesignStudioArtifact {
        this.assertProject(input.projectId);
        const type = assertOne(input.type, VALID_ARTIFACT_TYPES, 'artifact type') as DesignArtifactType;
        const name = cleanString(input.name, `${type} artifact`);
        const uri = cleanString(input.uri, input.storagePath || name);
        const id = idFor('dsa');
        const row = this.db.prepare(`
            INSERT INTO design_studio_artifacts (
                id, project_id, type, name, uri, storage_path, mime_type, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            id,
            input.projectId,
            type,
            name,
            uri,
            input.storagePath || null,
            input.mimeType || null,
            JSON.stringify(input.metadata || {})
        ) as ArtifactRow;

        this.touchProject(input.projectId);
        this.writeMemory(`Design Studio artifact added: ${name} (${type})`, ['design_studio'], {
            projectId: input.projectId,
            artifactId: id,
            type,
            uri
        });
        return mapArtifact(row);
    }

    captureArtifact(artifactId: string, input: {
        label?: string;
        previewUri?: string;
        storagePath?: string | null;
        metadata?: Record<string, unknown>;
    } = {}): DesignStudioCapture {
        const artifact = this.assertArtifact(artifactId);
        const label = cleanString(input.label, `${artifact.name} capture`);
        const previewUri = cleanString(input.previewUri, artifact.uri);
        const id = idFor('dsc');
        const row = this.db.prepare(`
            INSERT INTO design_studio_captures (
                id, project_id, artifact_id, label, preview_uri, storage_path, metadata_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            id,
            artifact.projectId,
            artifact.id,
            label,
            previewUri,
            input.storagePath || null,
            JSON.stringify(input.metadata || {})
        ) as CaptureRow;

        this.touchProject(artifact.projectId);
        this.writeMemory(`Design Studio visual capture saved: ${label}`, ['design_studio', 'visual_intent'], {
            projectId: artifact.projectId,
            artifactId: artifact.id,
            captureId: id
        });
        return mapCapture(row);
    }

    saveSelection(input: {
        projectId: string;
        artifactId: string;
        captureId?: string | null;
        label?: string;
        kind: DesignSelectionKind;
        locator: Record<string, unknown>;
        note?: string;
    }): DesignStudioSelection {
        this.assertProject(input.projectId);
        const artifact = this.assertArtifact(input.artifactId);
        if (artifact.projectId !== input.projectId) throw new Error('artifact does not belong to project');
        if (input.captureId) this.assertCapture(input.captureId, input.projectId, input.artifactId);
        const kind = assertOne(input.kind, VALID_SELECTION_KINDS, 'selection kind') as DesignSelectionKind;
        const label = cleanString(input.label, `${kind} selection`);
        const locator = input.locator && typeof input.locator === 'object' ? input.locator : {};
        if (!Object.keys(locator).length) throw new Error('selection locator is required');
        const id = idFor('dss');
        const row = this.db.prepare(`
            INSERT INTO design_studio_selections (
                id, project_id, artifact_id, capture_id, label, kind, locator_json, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING *
        `).get(
            id,
            input.projectId,
            input.artifactId,
            input.captureId || null,
            label,
            kind,
            JSON.stringify(locator),
            input.note || ''
        ) as SelectionRow;

        this.touchProject(input.projectId);
        this.writeMemory(`Design Studio selection saved: ${label}`, ['design_studio', 'visual_intent'], {
            projectId: input.projectId,
            artifactId: input.artifactId,
            selectionId: id,
            kind
        });
        return mapSelection(row);
    }

    setReferenceSet(input: { projectId: string; sourceIds: string[]; notes?: string }): DesignStudioReferenceSet {
        this.assertProject(input.projectId);
        const sourceIds = uniqueStrings(input.sourceIds);
        if (sourceIds.length < 3) throw new Error('reference sets require at least 3 design sources');
        if (sourceIds.length > 7) throw new Error('reference sets allow at most 7 design sources');
        const id = idFor('dsr');
        const row = this.db.prepare(`
            INSERT INTO design_studio_reference_sets (id, project_id, source_ids_json, notes)
            VALUES (?, ?, ?, ?)
            RETURNING *
        `).get(id, input.projectId, JSON.stringify(sourceIds), input.notes || '') as ReferenceSetRow;

        this.touchProject(input.projectId);
        this.writeMemory(`Design Studio references selected: ${sourceIds.join(', ')}`, ['design_studio', 'design_radar'], {
            projectId: input.projectId,
            sourceIds
        });
        return mapReferenceSet(row);
    }

    saveIntent(input: {
        projectId: string;
        selectionId: string;
        mode: DesignIntentMode;
        operation: DesignOperation;
        prompt: string;
        constraints?: string[];
        acceptanceChecks?: string[];
        designSourceIds?: string[];
    }): DesignStudioIntent {
        this.assertProject(input.projectId);
        const selection = this.assertSelection(input.selectionId, input.projectId);
        const mode = assertOne(input.mode, VALID_MODES, 'intent mode') as DesignIntentMode;
        const operation = assertOne(input.operation, VALID_OPERATIONS, 'intent operation') as DesignOperation;
        const prompt = cleanString(input.prompt);
        if (!prompt) throw new Error('intent prompt is required');
        const designSourceIds = uniqueStrings(input.designSourceIds || []);
        if (mode === 'design' && designSourceIds.length < 3) throw new Error('design intents require at least 3 design sources');
        if (designSourceIds.length > 7) throw new Error('design intents allow at most 7 design sources');
        const constraints = uniqueStrings(input.constraints || []);
        const acceptanceChecks = uniqueStrings(input.acceptanceChecks || []);
        const id = idFor('dsi');
        const row = this.db.prepare(`
            INSERT INTO design_studio_intents (
                id, project_id, selection_id, mode, operation, prompt,
                constraints_json, acceptance_checks_json, design_source_ids_json, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
            RETURNING *
        `).get(
            id,
            input.projectId,
            selection.id,
            mode,
            operation,
            prompt,
            JSON.stringify(constraints),
            JSON.stringify(acceptanceChecks),
            JSON.stringify(designSourceIds)
        ) as IntentRow;

        this.touchProject(input.projectId);
        this.writeMemory(`Design Studio ${mode} intent saved: ${operation} - ${prompt}`, ['design_studio', 'visual_intent', 'design_radar'], {
            projectId: input.projectId,
            selectionId: selection.id,
            intentId: id,
            designSourceIds
        });
        return mapIntent(row);
    }

    generatePacket(intentId: string): DesignStudioPacket {
        const intent = this.assertIntent(intentId);
        const project = this.assertProject(intent.projectId);
        const selection = this.assertSelection(intent.selectionId, intent.projectId);
        const artifact = this.assertArtifact(selection.artifactId);
        const capture = selection.captureId ? this.assertCapture(selection.captureId, intent.projectId, selection.artifactId) : null;
        const packet = {
            schema: 'design-studio.codex-packet.v1',
            generatedAt: new Date().toISOString(),
            project,
            artifact,
            capture,
            selection,
            intent,
            evidence: {
                uri: capture?.previewUri || artifact.uri,
                storagePath: capture?.storagePath || artifact.storagePath,
                locator: selection.locator,
                note: selection.note
            },
            codexInstruction: [
                `Use this visual selection as the control input for project "${project.name}".`,
                `Operation: ${intent.operation}. Mode: ${intent.mode}.`,
                intent.prompt,
                'Do not mutate unrelated files. Report proposed source changes clearly before finalizing.'
            ].join('\n'),
            acceptanceChecks: intent.acceptanceChecks.length ? intent.acceptanceChecks : [
                'Visual intent is addressed in the selected artifact context.',
                'Design references are explicitly reflected in the implementation rationale.',
                'No browser-side source mutation occurs.',
                'Relevant build/test command is run or skipped with reason.'
            ]
        };
        const markdown = this.buildPacketMarkdown(packet, project, artifact, selection, intent);
        const id = idFor('dspk');
        const row = this.db.prepare(`
            INSERT INTO design_studio_packets (id, project_id, intent_id, packet_json, packet_markdown)
            VALUES (?, ?, ?, ?, ?)
            RETURNING *
        `).get(id, intent.projectId, intent.id, JSON.stringify(packet, null, 2), markdown) as PacketRow;

        this.db.prepare(`
            UPDATE design_studio_intents SET status='packet_ready', updated_at=datetime('now') WHERE id=?
        `).run(intent.id);
        this.touchProject(intent.projectId);
        this.writeMemory(`Codex design control packet generated for ${selection.label}: ${intent.prompt}`, [
            'design_studio',
            'visual_intent',
            'codex_control_packet'
        ], {
            projectId: intent.projectId,
            intentId: intent.id,
            packetId: id
        });
        return mapPacket(row);
    }

    getPacket(packetId: string): DesignStudioPacket | null {
        const row = this.db.prepare('SELECT * FROM design_studio_packets WHERE id=?').get(packetId) as PacketRow | undefined;
        return row ? mapPacket(row) : null;
    }

    listMcpResources(projectId?: string): Array<{ uri: string; name: string; mimeType: string; description: string }> {
        const projects = projectId ? [this.assertProject(projectId)] : this.listProjects();
        return projects.flatMap((project) => {
            const detail = this.getProject(project.id);
            if (!detail) return [];
            const base = `design-studio://${project.id}`;
            return [
                {
                    uri: `${base}/manifest`,
                    name: `${project.name} manifest`,
                    mimeType: 'application/json',
                    description: 'Project, artifact, selection, intent, and packet manifest.'
                },
                ...detail.artifacts.map((artifact) => ({
                    uri: `${base}/artifacts/${artifact.id}`,
                    name: artifact.name,
                    mimeType: 'application/json',
                    description: `${artifact.type} artifact control metadata.`
                })),
                ...detail.selections.map((selection) => ({
                    uri: `${base}/selections/${selection.id}`,
                    name: selection.label,
                    mimeType: 'application/json',
                    description: 'Visual selection metadata and locator.'
                })),
                ...detail.packets.map((packet) => ({
                    uri: `${base}/packets/${packet.id}`,
                    name: `Packet ${packet.id}`,
                    mimeType: 'text/markdown',
                    description: 'Codex-ready design control packet.'
                }))
            ];
        });
    }

    markPacketApplied(packetId: string, notes = ''): DesignStudioRun {
        const packet = this.getPacket(packetId);
        if (!packet) throw new Error('packet not found');
        const id = idFor('dsrun');
        const row = this.db.prepare(`
            INSERT INTO design_studio_runs (id, project_id, packet_id, status, notes)
            VALUES (?, ?, ?, 'applied', ?)
            RETURNING *
        `).get(id, packet.projectId, packet.id, notes) as RunRow;
        this.db.prepare(`UPDATE design_studio_intents SET status='applied', updated_at=datetime('now') WHERE id=?`).run(packet.intentId);
        this.touchProject(packet.projectId);
        return mapRun(row);
    }

    private listArtifacts(projectId: string): DesignStudioArtifact[] {
        return (this.db.prepare(`
            SELECT * FROM design_studio_artifacts WHERE project_id=? ORDER BY created_at ASC
        `).all(projectId) as ArtifactRow[]).map(mapArtifact);
    }

    private listCaptures(projectId: string): DesignStudioCapture[] {
        return (this.db.prepare(`
            SELECT * FROM design_studio_captures WHERE project_id=? ORDER BY created_at ASC
        `).all(projectId) as CaptureRow[]).map(mapCapture);
    }

    private listSelections(projectId: string): DesignStudioSelection[] {
        return (this.db.prepare(`
            SELECT * FROM design_studio_selections WHERE project_id=? ORDER BY created_at ASC
        `).all(projectId) as SelectionRow[]).map(mapSelection);
    }

    private listReferenceSets(projectId: string): DesignStudioReferenceSet[] {
        return (this.db.prepare(`
            SELECT * FROM design_studio_reference_sets WHERE project_id=? ORDER BY created_at ASC
        `).all(projectId) as ReferenceSetRow[]).map(mapReferenceSet);
    }

    private listIntents(projectId: string): DesignStudioIntent[] {
        return (this.db.prepare(`
            SELECT * FROM design_studio_intents WHERE project_id=? ORDER BY created_at ASC
        `).all(projectId) as IntentRow[]).map(mapIntent);
    }

    private listPackets(projectId: string): DesignStudioPacket[] {
        return (this.db.prepare(`
            SELECT * FROM design_studio_packets WHERE project_id=? ORDER BY created_at ASC
        `).all(projectId) as PacketRow[]).map(mapPacket);
    }

    private listRuns(projectId: string): DesignStudioRun[] {
        return (this.db.prepare(`
            SELECT * FROM design_studio_runs WHERE project_id=? ORDER BY created_at ASC
        `).all(projectId) as RunRow[]).map(mapRun);
    }

    private getProjectRow(projectId: string): ProjectRow | null {
        return this.db.prepare('SELECT * FROM design_studio_projects WHERE id=?').get(projectId) as ProjectRow | undefined || null;
    }

    private assertProject(projectId: string): DesignStudioProject {
        const row = this.getProjectRow(projectId);
        if (!row) throw new Error('project not found');
        return mapProject(row);
    }

    private assertArtifact(artifactId: string): DesignStudioArtifact {
        const row = this.db.prepare('SELECT * FROM design_studio_artifacts WHERE id=?').get(artifactId) as ArtifactRow | undefined;
        if (!row) throw new Error('artifact not found');
        return mapArtifact(row);
    }

    private assertCapture(captureId: string, projectId: string, artifactId: string): DesignStudioCapture {
        const row = this.db.prepare('SELECT * FROM design_studio_captures WHERE id=?').get(captureId) as CaptureRow | undefined;
        if (!row) throw new Error('capture not found');
        const capture = mapCapture(row);
        if (capture.projectId !== projectId || capture.artifactId !== artifactId) throw new Error('capture does not belong to selection artifact');
        return capture;
    }

    private assertSelection(selectionId: string, projectId: string): DesignStudioSelection {
        const row = this.db.prepare('SELECT * FROM design_studio_selections WHERE id=?').get(selectionId) as SelectionRow | undefined;
        if (!row) throw new Error('selection not found');
        const selection = mapSelection(row);
        if (selection.projectId !== projectId) throw new Error('selection does not belong to project');
        return selection;
    }

    private assertIntent(intentId: string): DesignStudioIntent {
        const row = this.db.prepare('SELECT * FROM design_studio_intents WHERE id=?').get(intentId) as IntentRow | undefined;
        if (!row) throw new Error('intent not found');
        return mapIntent(row);
    }

    private touchProject(projectId: string): void {
        this.db.prepare(`UPDATE design_studio_projects SET updated_at=datetime('now') WHERE id=?`).run(projectId);
    }

    private ensureProjectDir(projectId: string): string {
        const dir = path.join(this.artifactRoot, projectId);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    private writeMemory(content: string, tags: string[], metadata: Record<string, unknown>): void {
        try {
            this.memoryWriter(content, tags, metadata);
        } catch (error: any) {
            console.warn(`⬡ DESIGN_STUDIO_MEMORY_WARN :: ${error.message}`);
        }
    }

    private buildPacketMarkdown(
        packet: Record<string, unknown>,
        project: DesignStudioProject,
        artifact: DesignStudioArtifact,
        selection: DesignStudioSelection,
        intent: DesignStudioIntent
    ): string {
        return [
            `# Codex Design Control Packet ${intent.id}`,
            '',
            `Project: ${project.name}`,
            `Target root: ${project.targetRoot || 'not provided'}`,
            `Artifact: ${artifact.name} (${artifact.type})`,
            `Artifact URI: ${artifact.uri}`,
            `Selection: ${selection.label} (${selection.kind})`,
            '',
            '## Visual Evidence',
            `Locator: \`${JSON.stringify(selection.locator)}\``,
            selection.note ? `Note: ${selection.note}` : 'Note: none',
            '',
            '## Intent',
            `Mode: ${intent.mode}`,
            `Operation: ${intent.operation}`,
            intent.prompt,
            '',
            '## Design References',
            intent.designSourceIds.map((id) => `- ${id}`).join('\n') || '- none',
            '',
            '## Constraints',
            intent.constraints.map((item) => `- ${item}`).join('\n') || '- none',
            '',
            '## Codex Instruction',
            String(packet.codexInstruction),
            '',
            '## Acceptance Checks',
            ((packet.acceptanceChecks as string[]) || []).map((item) => `- ${item}`).join('\n')
        ].join('\n');
    }

    private ensureSchema(): void {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS design_studio_projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                target_root TEXT DEFAULT '',
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_studio_artifacts (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES design_studio_projects(id) ON DELETE CASCADE,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                uri TEXT NOT NULL,
                storage_path TEXT,
                mime_type TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_studio_captures (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES design_studio_projects(id) ON DELETE CASCADE,
                artifact_id TEXT NOT NULL REFERENCES design_studio_artifacts(id) ON DELETE CASCADE,
                label TEXT NOT NULL,
                preview_uri TEXT NOT NULL,
                storage_path TEXT,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_studio_selections (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES design_studio_projects(id) ON DELETE CASCADE,
                artifact_id TEXT NOT NULL REFERENCES design_studio_artifacts(id) ON DELETE CASCADE,
                capture_id TEXT REFERENCES design_studio_captures(id) ON DELETE SET NULL,
                label TEXT NOT NULL,
                kind TEXT NOT NULL,
                locator_json TEXT NOT NULL,
                note TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_studio_reference_sets (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES design_studio_projects(id) ON DELETE CASCADE,
                source_ids_json TEXT NOT NULL,
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_studio_intents (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES design_studio_projects(id) ON DELETE CASCADE,
                selection_id TEXT NOT NULL REFERENCES design_studio_selections(id) ON DELETE CASCADE,
                mode TEXT NOT NULL,
                operation TEXT NOT NULL,
                prompt TEXT NOT NULL,
                constraints_json TEXT NOT NULL DEFAULT '[]',
                acceptance_checks_json TEXT NOT NULL DEFAULT '[]',
                design_source_ids_json TEXT NOT NULL DEFAULT '[]',
                status TEXT NOT NULL DEFAULT 'draft',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_studio_packets (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES design_studio_projects(id) ON DELETE CASCADE,
                intent_id TEXT NOT NULL REFERENCES design_studio_intents(id) ON DELETE CASCADE,
                packet_json TEXT NOT NULL,
                packet_markdown TEXT NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS design_studio_runs (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES design_studio_projects(id) ON DELETE CASCADE,
                packet_id TEXT NOT NULL REFERENCES design_studio_packets(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'queued',
                notes TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_design_studio_artifacts_project ON design_studio_artifacts(project_id);
            CREATE INDEX IF NOT EXISTS idx_design_studio_captures_project ON design_studio_captures(project_id);
            CREATE INDEX IF NOT EXISTS idx_design_studio_selections_project ON design_studio_selections(project_id);
            CREATE INDEX IF NOT EXISTS idx_design_studio_intents_project ON design_studio_intents(project_id);
            CREATE INDEX IF NOT EXISTS idx_design_studio_packets_project ON design_studio_packets(project_id);
        `);
    }
}

function idFor(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function cleanString(value: unknown, fallback = ''): string {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function uniqueStrings(values: unknown[]): string[] {
    return [...new Set(values.map((value) => typeof value === 'string' ? value.trim() : '').filter(Boolean))];
}

function assertOne(value: unknown, valid: Set<string>, label: string): string {
    const text = cleanString(value);
    if (valid.has(text)) return text;
    throw new Error(`unsupported ${label}: ${text}`);
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
        return Array.isArray(parsed) ? uniqueStrings(parsed) : [];
    } catch {
        return [];
    }
}

function mapProject(row: ProjectRow): DesignStudioProject {
    return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        targetRoot: row.target_root || '',
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapArtifact(row: ArtifactRow): DesignStudioArtifact {
    return {
        id: row.id,
        projectId: row.project_id,
        type: row.type,
        name: row.name,
        uri: row.uri,
        storagePath: row.storage_path,
        mimeType: row.mime_type,
        metadata: parseJsonObject(row.metadata_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapCapture(row: CaptureRow): DesignStudioCapture {
    return {
        id: row.id,
        projectId: row.project_id,
        artifactId: row.artifact_id,
        label: row.label,
        previewUri: row.preview_uri,
        storagePath: row.storage_path,
        metadata: parseJsonObject(row.metadata_json),
        createdAt: row.created_at
    };
}

function mapSelection(row: SelectionRow): DesignStudioSelection {
    return {
        id: row.id,
        projectId: row.project_id,
        artifactId: row.artifact_id,
        captureId: row.capture_id,
        label: row.label,
        kind: row.kind,
        locator: parseJsonObject(row.locator_json),
        note: row.note || '',
        createdAt: row.created_at
    };
}

function mapReferenceSet(row: ReferenceSetRow): DesignStudioReferenceSet {
    return {
        id: row.id,
        projectId: row.project_id,
        sourceIds: parseJsonArray(row.source_ids_json),
        notes: row.notes || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapIntent(row: IntentRow): DesignStudioIntent {
    return {
        id: row.id,
        projectId: row.project_id,
        selectionId: row.selection_id,
        mode: row.mode,
        operation: row.operation,
        prompt: row.prompt,
        constraints: parseJsonArray(row.constraints_json),
        acceptanceChecks: parseJsonArray(row.acceptance_checks_json),
        designSourceIds: parseJsonArray(row.design_source_ids_json),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function mapPacket(row: PacketRow): DesignStudioPacket {
    return {
        id: row.id,
        projectId: row.project_id,
        intentId: row.intent_id,
        packet: parseJsonObject(row.packet_json),
        markdown: row.packet_markdown,
        createdAt: row.created_at
    };
}

function mapRun(row: RunRow): DesignStudioRun {
    return {
        id: row.id,
        projectId: row.project_id,
        packetId: row.packet_id,
        status: row.status,
        notes: row.notes || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}
