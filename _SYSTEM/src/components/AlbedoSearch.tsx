import React, { useState, useEffect } from 'react';
import { apiFetch } from '../lib/runtime';

interface KnowledgeNode {
    id: number;
    title: string;
    content: string;
    domain: string;
    tags: string;
}

const AlbedoSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<KnowledgeNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const handleSearch = async (q: string) => {
        if (!q) {
            setResults([]);
            return;
        }
        setLoading(true);
        try {
            setLoadError(null);
            const host = window.location.hostname;
            const res = await apiFetch(`http://${host}:3004/api/knowledge/search?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            setResults(data);
        } catch (err) {
            console.error('⬡ SEARCH_ERROR:', err);
            setLoadError('Search unavailable. The knowledge API did not return results.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timeout = setTimeout(() => handleSearch(query), 300);
        return () => clearTimeout(timeout);
    }, [query]);

    return (
        <div className="albedo-search-container" style={{ padding: '40px' }}>
            <div style={{ marginBottom: '30px' }}>
                <h1 style={{ color: 'var(--color-neon-cyan)', letterSpacing: '0.2em', fontSize: '1.5rem', marginBottom: '20px' }}>Akashic search // Protocol Albedo</h1>
                <input 
                    type="text"
                    placeholder="Query the cognitive core..."
                    value={query}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                    style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '20px',
                        color: 'white',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '1rem',
                        outline: 'none',
                        borderRadius: '4px'
                    }}
                    autoFocus
                />
            </div>

            {loading && <div className="text-mono" style={{ opacity: 0.5 }}>Traversing graph nodes...</div>}

            {loadError ? (
                <div className="panel" style={{ marginTop: '18px', borderLeft: '3px solid var(--red-fusion)', padding: '18px 20px' }}>
                    <div className="text-mono" style={{ fontSize: '0.58rem', color: 'var(--red-fusion)', letterSpacing: '0.2em', marginBottom: '8px' }}>Load failed</div>
                    <div style={{ lineHeight: 1.6, marginBottom: '12px' }}>{loadError}</div>
                    <button
                        type="button"
                        className="text-mono"
                        onClick={() => handleSearch(query)}
                        style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: 'white',
                            padding: '10px 14px',
                            cursor: 'pointer',
                            letterSpacing: '0.14em'
                        }}
                    >
                        Retry search
                    </button>
                </div>
            ) : null}

            <div className="results-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {results.map((node: KnowledgeNode) => (
                    <div key={node.id} className="panel albedo-glass" style={{ padding: '20px', transition: 'var(--transition-smooth)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ color: 'var(--color-neon-cyan)', fontSize: '0.7rem' }} className="text-mono">{node.domain}</span>
                            <span style={{ opacity: 0.3, fontSize: '0.6rem' }}>ID: {node.id}</span>
                        </div>
                        <h3 style={{ marginBottom: '10px', fontSize: '1.1rem' }}>{node.title}</h3>
                        <p style={{ fontSize: '0.8rem', opacity: 0.6, lineHeight: '1.6', marginBottom: '15px' }}>
                            {node.content.substring(0, 150)}...
                        </p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {(JSON.parse(node.tags || '[]') as string[]).map((tag: string) => (
                                <span key={tag} style={{ fontSize: '0.55rem', padding: '2px 6px', background: 'rgba(0,243,255,0.1)', color: 'var(--color-neon-cyan)', borderRadius: '2px' }} className="text-mono">
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {query && !loading && results.length === 0 && (
                <div style={{ textAlign: 'center', opacity: 0.3, marginTop: '100px' }} className="text-mono">No matches in the akashic record.</div>
            )}
        </div>
    );
};

export default AlbedoSearch;
