import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../../lib/runtime';

interface ImageModel {
    id: string;
    label: string;
    provider: string;
}

interface Props {
    models: { kie: ImageModel[]; remote: ImageModel[] };
}

interface GeneratedResult {
    id: string;
    prompt: string;
    urls: string[];
    provider: string;
    model: string;
    timestamp: string;
}

const PROVIDER_LABELS: Record<string, string> = {
    'kie':         'KIE.ai',
    'chatgpt-web': 'ChatGPT Images 2.0',
    'gemini-web':  'Gemini'
};

const PROVIDER_COLOR: Record<string, string> = {
    'kie':         'var(--cyan-glow)',
    'chatgpt-web': 'var(--gold-solar)',
    'gemini-web':  '#4285f4'
};

export default function VisualSynthesisLane({ models }: Props) {
    const [prompt, setPrompt]           = useState('');
    const [selectedModel, setSelectedModel] = useState<ImageModel | null>(null);
    const [kieExpanded, setKieExpanded] = useState(true);
    const [remoteExpanded, setRemoteExpanded] = useState(false);
    const [results, setResults]         = useState<GeneratedResult[]>([]);
    const [generating, setGenerating]   = useState(false);
    const [error, setError]             = useState<string | null>(null);

    const kieModels    = models.kie?.length ? models.kie    : DEFAULT_KIE_MODELS;
    const remoteModels = models.remote?.length ? models.remote : DEFAULT_REMOTE_MODELS;

    const generate = useCallback(async () => {
        if (!prompt.trim() || !selectedModel) return;
        setGenerating(true);
        setError(null);
        try {
            if (selectedModel.provider === 'kie') {
                const res = await apiFetch('/api/neural/images/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt,
                        modelId: selectedModel.id,
                        waitForCompletion: true
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Generation failed');
                const urls: string[] = data.task?.resultUrls || data.resultUrls || [];
                setResults(prev => [{
                    id: Date.now().toString(),
                    prompt,
                    urls,
                    provider: 'kie',
                    model: selectedModel.label,
                    timestamp: new Date().toISOString()
                }, ...prev.slice(0, 19)]);
            } else {
                // Remote browser automation — trigger via backend
                const res = await apiFetch('/api/image-gen/browser', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prompt,
                        modelId: selectedModel.id,
                        provider: selectedModel.provider
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Browser automation failed');
                const urls: string[] = data.urls || data.resultUrls || [];
                setResults(prev => [{
                    id: Date.now().toString(),
                    prompt,
                    urls,
                    provider: selectedModel.provider,
                    model: selectedModel.label,
                    timestamp: new Date().toISOString()
                }, ...prev.slice(0, 19)]);
            }
        } catch (e: any) {
            setError(e.message || 'Unknown error');
        } finally {
            setGenerating(false);
        }
    }, [prompt, selectedModel]);

    const openInFinder = (_url: string) => {
        apiFetch('/api/execute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commandKey: 'OPEN_IMAGES_FOLDER' })
        }).catch(() => {});
    };

    return (
        <div style={{ padding: '4px 0', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--gold-solar)', textTransform: 'uppercase', marginBottom: 4 }}>
                Visual Synthesis Lane
            </div>

            {/* Prompt */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="Image prompt..."
                    rows={2}
                    style={{
                        flex: 1, background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(159,232,115,0.15)',
                        color: 'var(--silver-albedo)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 12, padding: '6px 10px', resize: 'none', outline: 'none',
                        borderRadius: 2
                    }}
                />
                <button
                    onClick={generate}
                    disabled={!selectedModel || !prompt.trim() || generating}
                    style={{
                        background: generating ? 'rgba(159,232,115,0.05)' : 'rgba(159,232,115,0.1)',
                        border: '1px solid rgba(159,232,115,0.3)',
                        color: 'var(--cyan-glow)',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 11, padding: '6px 14px', cursor: 'pointer',
                        borderRadius: 2, letterSpacing: '0.08em',
                        opacity: (!selectedModel || !prompt.trim()) ? 0.4 : 1
                    }}
                >
                    {generating ? '⟳' : 'Generate'}
                </button>
            </div>

            {/* Model picker — KIE (primary, expanded by default) */}
            <ModelDropdown
                title="KIE.ai Models"
                note="Primary — fastest"
                models={kieModels}
                expanded={kieExpanded}
                onToggle={() => setKieExpanded(p => !p)}
                selected={selectedModel}
                onSelect={setSelectedModel}
                color="var(--cyan-glow)"
            />

            {/* Model picker — Remote */}
            <ModelDropdown
                title="Remote Generation"
                note="Browser automation"
                models={remoteModels}
                expanded={remoteExpanded}
                onToggle={() => setRemoteExpanded(p => !p)}
                selected={selectedModel}
                onSelect={setSelectedModel}
                color="var(--gold-solar)"
            />

            {/* Error */}
            {error && (
                <div style={{ fontSize: 11, color: 'var(--red-fusion)', padding: '4px 8px', background: 'rgba(217,112,72,0.08)', borderLeft: '2px solid var(--red-fusion)' }}>
                    {error}
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div>
                    <div style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase' }}>Generated</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {results.map(r => (
                            <div key={r.id} style={{ border: '1px solid rgba(159,232,115,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ padding: '4px 8px', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 10, color: PROVIDER_COLOR[r.provider] || 'var(--text-dim)' }}>
                                        {PROVIDER_LABELS[r.provider] || r.provider} · {r.model}
                                    </span>
                                    <button onClick={() => openInFinder(r.urls[0])} style={{
                                        background: 'none', border: 'none', color: 'var(--text-dim)',
                                        cursor: 'pointer', fontSize: 10
                                    }}>Open in Finder</button>
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: '2px 8px', opacity: 0.6, fontStyle: 'italic' }}>{r.prompt.slice(0, 60)}{r.prompt.length > 60 ? '…' : ''}</div>
                                {r.urls.length > 0 ? (
                                    <div style={{ display: 'flex', gap: 4, padding: 6, flexWrap: 'wrap' }}>
                                        {r.urls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noreferrer">
                                                <img src={url} alt="Generated" style={{ width: 80, height: 80, objectFit: 'cover', border: '1px solid rgba(159,232,115,0.1)' }}/>
                                            </a>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 10, color: 'var(--text-dim)', padding: 8 }}>No preview — check GeneratedContent folder</div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ModelDropdown({
    title, note, models, expanded, onToggle, selected, onSelect, color
}: {
    title: string; note: string;
    models: ImageModel[];
    expanded: boolean; onToggle: () => void;
    selected: ImageModel | null;
    onSelect: (m: ImageModel) => void;
    color: string;
}) {
    return (
        <div style={{ border: `1px solid ${color}22`, borderRadius: 2 }}>
            <button onClick={onToggle} style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '6px 10px', color, fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                letterSpacing: '0.08em', textTransform: 'uppercase'
            }}>
                <span>{title} <span style={{ opacity: 0.5, fontSize: 9 }}>— {note}</span></span>
                <span style={{ opacity: 0.6 }}>{expanded ? '▲' : '▼'}</span>
            </button>
            <AnimatePresence>
                {expanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
                        style={{ overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px 8px' }}>
                            {models.map(m => (
                                <button key={m.id} onClick={() => onSelect(m)} style={{
                                    padding: '3px 10px', fontSize: 10, fontFamily: 'JetBrains Mono, monospace',
                                    background: selected?.id === m.id ? `${color}22` : 'none',
                                    border: `1px solid ${selected?.id === m.id ? color : `${color}33`}`,
                                    color: selected?.id === m.id ? color : 'var(--text-dim)',
                                    cursor: 'pointer', borderRadius: 2,
                                    transition: 'all 0.1s'
                                }}>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const DEFAULT_KIE_MODELS: ImageModel[] = [
    { id: 'gpt4o-image', label: 'GPT-4o Image', provider: 'kie' },
    { id: 'flux-pro',    label: 'Flux Pro',     provider: 'kie' },
    { id: 'flux-schnell',label: 'Flux Schnell', provider: 'kie' },
    { id: 'ideogram',    label: 'Ideogram V2',  provider: 'kie' },
    { id: 'recraft',     label: 'Recraft V3',   provider: 'kie' }
];

const DEFAULT_REMOTE_MODELS: ImageModel[] = [
    { id: 'chatgpt-images-2', label: 'ChatGPT Images 2.0', provider: 'chatgpt-web' },
    { id: 'dalle3',           label: 'DALL-E 3',           provider: 'chatgpt-web' },
    { id: 'imagen3',          label: 'Imagen 3',           provider: 'gemini-web'  },
    { id: 'veo2',             label: 'Veo 2 (Video)',      provider: 'gemini-web'  }
];
