import fs from 'fs';
import path from 'path';

export interface WorkflowCatalogEntry {
    id: string;
    title: string;
    summary: string;
    source: string;
    surfaces: Array<'codex' | 'claude' | 'both'>;
    category: 'research' | 'runtime' | 'design' | 'reference';
    status: 'planned' | 'ready' | 'reference';
    tags: string[];
}

class WorkflowCatalogService {
    private catalogPath = this.resolveCatalogPath('workflow_catalog.json');
    private entries: WorkflowCatalogEntry[] = [];

    constructor() {
        this.entries = this.load();
    }

    private load(): WorkflowCatalogEntry[] {
        try {
            const raw = fs.readFileSync(this.catalogPath, 'utf8');
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error(`WORKFLOW_CATALOG_LOAD_FAILED :: ${(error as Error).message}`);
            return [];
        }
    }

    public getWorkflows() {
        return [...this.entries];
    }

    public getWorkflowById(id: string) {
        return this.entries.find((entry) => entry.id === id);
    }

    public search(query: string) {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return this.getWorkflows();

        return this.entries.filter((entry) => {
            const haystack = [
                entry.id,
                entry.title,
                entry.summary,
                entry.source,
                entry.category,
                entry.status,
                ...entry.surfaces,
                ...entry.tags
            ].join(' ').toLowerCase();

            return haystack.includes(normalized);
        });
    }

    private resolveCatalogPath(fileName: string) {
        const candidates = [
            path.resolve(process.cwd(), 'data', fileName),
            path.resolve(__dirname, '../../data', fileName),
            path.resolve(__dirname, '../../../data', fileName)
        ];

        return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
    }
}

export const workflowCatalogService = new WorkflowCatalogService();
