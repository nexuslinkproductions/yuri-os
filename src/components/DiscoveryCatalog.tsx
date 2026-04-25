import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { apiFetch } from '../lib/runtime';
import { humanizeLabel } from '../lib/labels';

interface WorkflowCatalogEntry {
    id: string;
    title: string;
    summary: string;
    source: string;
    category: string;
    status: string;
    surfaces: Array<'codex' | 'claude' | 'both'>;
    tags: string[];
}

interface MathCurveCatalogEntry {
    id: string;
    title: string;
    family: string;
    summary: string;
    formula: string;
    status: string;
    tags: string[];
}

interface ModelEntry {
    id: string;
    name: string;
    provider: string;
    status: string;
    runtime?: string;
    recommended?: boolean;
}

const DiscoveryCatalog: React.FC = () => {
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState<'workflows' | 'curves' | 'models'>('workflows');
    const [workflows, setWorkflows] = useState<WorkflowCatalogEntry[]>([]);
    const [mathCurves, setMathCurves] = useState<MathCurveCatalogEntry[]>([]);
    const [models, setModels] = useState<ModelEntry[]>([]);

    useEffect(() => {
        const loadCatalog = async () => {
            try {
                setLoadError(null);
                const [catalogRes, modelsRes] = await Promise.all([
                    apiFetch('/api/catalog'),
                    apiFetch('/api/neural/models')
                ]);

                const catalog = await catalogRes.json();
                const modelData = await modelsRes.json();

                setWorkflows(Array.isArray(catalog?.workflows) ? catalog.workflows : []);
                setMathCurves(Array.isArray(catalog?.mathCurves) ? catalog.mathCurves : []);
                setModels(Array.isArray(modelData) ? modelData : []);
            } catch (error) {
                console.error('⬡ CATALOG_LOAD_FAILED', error);
                setLoadError('Catalog unavailable. The API did not return a valid response.');
            } finally {
                setLoading(false);
            }
        };

        loadCatalog();
    }, []);

    const filtered = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) {
            return { workflows, mathCurves, models };
        }

        return {
            workflows: workflows.filter((entry) => {
                const haystack = [entry.id, entry.title, entry.summary, entry.source, entry.category, entry.status, ...(entry.tags || [])].join(' ').toLowerCase();
                return haystack.includes(normalized);
            }),
            mathCurves: mathCurves.filter((entry) => {
                const haystack = [entry.id, entry.title, entry.family, entry.summary, entry.formula, entry.status, ...(entry.tags || [])].join(' ').toLowerCase();
                return haystack.includes(normalized);
            }),
            models: models.filter((entry) => {
                const haystack = [entry.id, entry.name, entry.provider, entry.status, entry.runtime || ''].join(' ').toLowerCase();
                return haystack.includes(normalized);
            })
        };
    }, [query, workflows, mathCurves, models]);

    const surfaceLabel = (surfaces: Array<'codex' | 'claude' | 'both'>) => surfaces.map((surface) => surface.toUpperCase()).join(' · ');

    return (
        <div style={{ height: '100%', overflowY: 'auto', padding: '36px 32px 48px', background: 'linear-gradient(180deg, rgba(8,10,16,0.96) 0%, rgba(3,5,10,1) 100%)' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px', marginBottom: '28px' }}>
                <div>
                    <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--cyan-glow)', letterSpacing: '0.45em', marginBottom: '10px' }}>Reference layer // read only</div>
                    <h1 style={{ margin: 0, fontSize: '2rem', letterSpacing: '-0.04em', fontWeight: 900 }}>Workflow and model catalog</h1>
                    <div className="text-mono" style={{ marginTop: '8px', fontSize: '0.65rem', opacity: 0.45 }}>
                        Shared references for workflows, models, and math curves. Debugging happens elsewhere.
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', minWidth: '360px' }}>
                    <div className="neural-glass" style={{ padding: '12px' }}>
                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35 }}>WORKFLOWS</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{workflows.length}</div>
                    </div>
                    <div className="neural-glass" style={{ padding: '12px' }}>
                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35 }}>CURVES</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{mathCurves.length}</div>
                    </div>
                    <div className="neural-glass" style={{ padding: '12px' }}>
                        <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35 }}>MODELS</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{models.length}</div>
                    </div>
                </div>
            </header>

            <div className="neural-glass" style={{ padding: '14px 16px', marginBottom: '22px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div className="text-mono" style={{ fontSize: '0.45rem', opacity: 0.35, letterSpacing: '0.2em' }}>SEARCH</div>
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search workflows, curves, models..."
                    style={{
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'white',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.76rem',
                        letterSpacing: '0.08em'
                    }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                    {(['workflows', 'curves', 'models'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setSelectedTab(tab)}
                            className="text-mono"
                            style={{
                                background: selectedTab === tab ? 'rgba(0,242,255,0.1)' : 'transparent',
                                border: `1px solid ${selectedTab === tab ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.08)'}`,
                                color: selectedTab === tab ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.55)',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                fontSize: '0.58rem',
                                cursor: 'pointer',
                                letterSpacing: '0.18em'
                            }}
                        >
                            {humanizeLabel(tab).toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="text-mono" style={{ opacity: 0.35, padding: '80px 0', textAlign: 'center' }}>Syncing catalogs...</div>
            ) : loadError ? (
                <div className="neural-glass" style={{ padding: '28px', borderLeft: '3px solid var(--red-fusion)' }}>
                    <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--red-fusion)', letterSpacing: '0.2em', marginBottom: '10px' }}>Load failed</div>
                    <div style={{ fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '16px' }}>{loadError}</div>
                    <button
                        type="button"
                        className="text-mono"
                        onClick={() => window.location.reload()}
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'white',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            letterSpacing: '0.14em'
                        }}
                    >
                        Retry load
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '18px' }}>
                    {selectedTab === 'workflows' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                            {filtered.workflows.map((entry) => (
                                <motion.div key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="neural-glass" style={{ padding: '16px', borderTop: '1px solid rgba(0,242,255,0.2)' }}>
                                    <div className="text-mono" style={{ fontSize: '0.45rem', color: 'var(--cyan-glow)', letterSpacing: '0.2em', marginBottom: '8px' }}>
                                        {humanizeLabel(entry.status).toUpperCase()} // {humanizeLabel(entry.category).toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '8px' }}>{entry.title}</div>
                                    <div style={{ fontSize: '0.66rem', lineHeight: 1.55, opacity: 0.7, marginBottom: '10px' }}>{entry.summary}</div>
                                    <div className="text-mono" style={{ fontSize: '0.46rem', opacity: 0.35, marginBottom: '6px' }}>{entry.source}</div>
                                    <div className="text-mono" style={{ fontSize: '0.46rem', color: 'var(--gold-solar)', opacity: 0.8 }}>{surfaceLabel(entry.surfaces)}</div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {selectedTab === 'curves' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px' }}>
                            {filtered.mathCurves.map((entry) => (
                                <motion.div key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="neural-glass" style={{ padding: '16px', borderTop: '1px solid rgba(255,184,0,0.18)' }}>
                                    <div className="text-mono" style={{ fontSize: '0.45rem', color: 'var(--gold-solar)', letterSpacing: '0.2em', marginBottom: '8px' }}>
                                        {humanizeLabel(entry.status).toUpperCase()} // {humanizeLabel(entry.family).toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '8px' }}>{entry.title}</div>
                                    <div style={{ fontSize: '0.66rem', lineHeight: 1.55, opacity: 0.7, marginBottom: '10px' }}>{entry.summary}</div>
                                    <div className="text-mono" style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.45)', marginBottom: '8px' }}>{entry.formula}</div>
                                    <div className="text-mono" style={{ fontSize: '0.46rem', opacity: 0.35 }}>{entry.id}</div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {selectedTab === 'models' && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
                            {filtered.models.map((entry) => (
                                <motion.div key={entry.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="neural-glass" style={{ padding: '16px', borderTop: `1px solid ${entry.recommended ? 'rgba(0,242,255,0.25)' : 'rgba(255,255,255,0.08)'}` }}>
                                    <div className="text-mono" style={{ fontSize: '0.45rem', color: entry.recommended ? 'var(--cyan-glow)' : 'rgba(255,255,255,0.35)', letterSpacing: '0.2em', marginBottom: '8px' }}>
                                        {humanizeLabel(entry.status).toUpperCase()} // {humanizeLabel(entry.runtime || 'Remote').toUpperCase()}
                                    </div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '8px' }}>{entry.name}</div>
                                    <div style={{ fontSize: '0.66rem', lineHeight: 1.55, opacity: 0.7, marginBottom: '10px' }}>{entry.provider}</div>
                                    <div className="text-mono" style={{ fontSize: '0.46rem', opacity: 0.35 }}>{entry.id}</div>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {filtered.workflows.length === 0 && filtered.mathCurves.length === 0 && filtered.models.length === 0 && (
                        <div className="text-mono" style={{ opacity: 0.35, padding: '48px 0', textAlign: 'center' }}>
                            No matches found.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DiscoveryCatalog;
