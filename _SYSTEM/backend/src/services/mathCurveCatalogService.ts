import fs from 'fs';
import path from 'path';

export interface MathCurveCatalogEntry {
    id: string;
    title: string;
    family: string;
    summary: string;
    source: string;
    formula: string;
    tags: string[];
    status: 'reference' | 'archived';
}

class MathCurveCatalogService {
    private catalogPath = this.resolveCatalogPath('math_curve_catalog.json');
    private entries: MathCurveCatalogEntry[] = [];

    constructor() {
        this.entries = this.load();
    }

    private load(): MathCurveCatalogEntry[] {
        try {
            const raw = fs.readFileSync(this.catalogPath, 'utf8');
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.error(`MATH_CURVE_CATALOG_LOAD_FAILED :: ${(error as Error).message}`);
            return [];
        }
    }

    public getCurves() {
        return [...this.entries];
    }

    public getCurveById(id: string) {
        return this.entries.find((entry) => entry.id === id);
    }

    public search(query: string) {
        const normalized = query.trim().toLowerCase();
        if (!normalized) return this.getCurves();

        return this.entries.filter((entry) => {
            const haystack = [
                entry.id,
                entry.title,
                entry.family,
                entry.summary,
                entry.source,
                entry.formula,
                entry.status,
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

export const mathCurveCatalogService = new MathCurveCatalogService();
