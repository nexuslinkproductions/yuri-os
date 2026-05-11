import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Crosshair, Film, Frame, Layers3, Palette, Radio, RefreshCw, Send, Sparkles, SquareDashedMousePointer, Wifi, WifiOff } from 'lucide-react';
import type { AssistantMode, BridgeCapture, BridgeRequest, BridgeSelection, CaptureResponse, SelectionSnapshot } from '../shared/types';
import { BridgeClient, type BridgeHistory, type BridgeRequestDetails } from './bridgeClient';
import './sidepanel.css';

type WorkerResponse<T> = { ok: true } & T | { ok: false; error: string };
type AssetId = string;
type StylePresetId = 'hero-pack' | 'cinematic' | 'architectural' | 'motion' | 'cosmic' | 'custom';

type ReferenceAsset = {
    id: AssetId;
    label: string;
    file: string;
    note: string;
};

type StylePreset = {
    id: StylePresetId;
    label: string;
    icon: React.ComponentType<{ size?: number }>;
    note: string;
    assetIds: AssetId[];
};

const REFERENCE_ASSETS: ReferenceAsset[] = [
    { id: '1-sci-fi-abstract.jpg', label: 'Sci-fi Abstract', file: 'src/assets/references/1-sci-fi-abstract.jpg', note: 'Atmospheric hero bed' },
    { id: '2-data-viz-architecture.jpg', label: 'Data Viz Architecture', file: 'src/assets/references/2-data-viz-architecture.jpg', note: 'Grid and structure' },
    { id: '3-motion-origami.jpg', label: 'Motion Origami', file: 'src/assets/references/3-motion-origami.jpg', note: 'Folded motion language' },
    { id: '5-sacred-geometry.jpg', label: 'Sacred Geometry', file: 'src/assets/references/5-sacred-geometry.jpg', note: 'Motif and divider system' },
    { id: '10-digital-art.jpg', label: 'Digital Art', file: 'src/assets/references/10-digital-art.jpg', note: 'Glitch and micro-interactions' },
    { id: '4-mystical-astronomy.png', label: 'Mystical Astronomy', file: 'src/assets/references/4-mystical-astronomy.png', note: 'Celestial grain and depth' },
    { id: '6-abstract-universe.jpg', label: 'Abstract Universe', file: 'src/assets/references/6-abstract-universe.jpg', note: 'Palette and glow reference' },
    { id: '8-geometric-pattern.jpg', label: 'Geometric Pattern', file: 'src/assets/references/8-geometric-pattern.jpg', note: 'Section rhythm and breaks' },
    { id: '9-abstract-shape.jpg', label: 'Abstract Shape', file: 'src/assets/references/9-abstract-shape.jpg', note: 'Organic overlay form' }
];

const STYLE_PRESETS: StylePreset[] = [
    {
        id: 'hero-pack',
        label: 'Hero Pack',
        icon: Sparkles,
        note: 'Five strongest references for this opening screen.',
        assetIds: ['1-sci-fi-abstract.jpg', '2-data-viz-architecture.jpg', '3-motion-origami.jpg', '5-sacred-geometry.jpg', '10-digital-art.jpg']
    },
    {
        id: 'cinematic',
        label: 'Cinematic',
        icon: Film,
        note: 'Depth, motion, and filmic atmosphere.',
        assetIds: ['1-sci-fi-abstract.jpg', '3-motion-origami.jpg', '10-digital-art.jpg']
    },
    {
        id: 'architectural',
        label: 'Architectural',
        icon: Layers3,
        note: 'Grid, system, and structural framing.',
        assetIds: ['2-data-viz-architecture.jpg', '5-sacred-geometry.jpg', '8-geometric-pattern.jpg']
    },
    {
        id: 'motion',
        label: 'Motion',
        icon: Frame,
        note: 'Section movement and transition cues.',
        assetIds: ['3-motion-origami.jpg', '4-mystical-astronomy.png', '10-digital-art.jpg']
    },
    {
        id: 'cosmic',
        label: 'Cosmic',
        icon: Palette,
        note: 'Ambient glow and broader color language.',
        assetIds: ['4-mystical-astronomy.png', '6-abstract-universe.jpg', '9-abstract-shape.jpg']
    }
];

const CUSTOM_STYLE_PRESET: StylePreset = {
    id: 'custom',
    label: 'Custom Mix',
    icon: Sparkles,
    note: 'Manually curated reference stack.',
    assetIds: []
};

const DEFAULT_ROOT = '/Users/marcelspatz/NUDIMMUD';
const DEFAULT_CONSTRAINTS = ['Extension cannot mutate source files', 'Codex owns implementation and verification'];
const ASSET_BASE_URL = 'http://localhost:4200/';

function isStylePresetId(value: string): value is Exclude<StylePresetId, 'custom'> {
    return STYLE_PRESETS.some((preset) => preset.id === value);
}

function App() {
    const [bridgeOrigin, setBridgeOrigin] = useState('http://127.0.0.1:3004');
    const bridge = useMemo(() => new BridgeClient(bridgeOrigin), [bridgeOrigin]);
    const [connected, setConnected] = useState(false);
    const [liveConnected, setLiveConnected] = useState(false);
    const [mode, setModeState] = useState<AssistantMode>('off');
    const [activeTab, setActiveTab] = useState<any>(null);
    const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
    const [capture, setCapture] = useState<CaptureResponse | null>(null);
    const [savedCapture, setSavedCapture] = useState<BridgeCapture | null>(null);
    const [savedSelection, setSavedSelection] = useState<BridgeSelection | null>(null);
    const [pending, setPending] = useState<BridgeRequest[]>([]);
    const [history, setHistory] = useState<BridgeHistory>({ requests: [], responses: [] });
    const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
    const [activeRequest, setActiveRequest] = useState<BridgeRequestDetails | null>(null);
    const [stylePresetId, setStylePresetId] = useState<StylePresetId>('hero-pack');
    const [selectedAssetIds, setSelectedAssetIds] = useState<AssetId[]>(STYLE_PRESETS[0].assetIds);
    const [instruction, setInstruction] = useState('');
    const [targetRoot, setTargetRoot] = useState(DEFAULT_ROOT);
    const [status, setStatus] = useState('Idle');
    const [hydrated, setHydrated] = useState(false);
    const activeRequestIdRef = useRef<string | null>(null);

    const currentPreset = useMemo(
        () => STYLE_PRESETS.find((preset) => preset.id === stylePresetId) || CUSTOM_STYLE_PRESET,
        [stylePresetId]
    );
    const selectedAssets = useMemo(
        () => selectedAssetIds
            .map((assetId) => REFERENCE_ASSETS.find((asset) => asset.id === assetId))
            .filter(Boolean) as ReferenceAsset[],
        [selectedAssetIds]
    );
    const recentRequests = history.requests.slice(0, 3);
    const assetPreviewUrl = useCallback((asset: ReferenceAsset) => `${ASSET_BASE_URL}${asset.file}`, []);

    useEffect(() => {
        activeRequestIdRef.current = activeRequestId;
    }, [activeRequestId]);

    useEffect(() => {
        let mounted = true;
        void (async () => {
            const stored = await chrome.storage.session?.get?.([
                'designAssistant:stylePresetId',
                'designAssistant:selectedAssetIds',
                'designAssistant:activeRequestId'
            ]).catch(() => null);
            if (!mounted || !stored) return;
            const storedPreset = stored['designAssistant:stylePresetId'];
            const storedAssets = stored['designAssistant:selectedAssetIds'];
            const storedRequest = stored['designAssistant:activeRequestId'];
            if (typeof storedPreset === 'string' && isStylePresetId(storedPreset)) {
                setStylePresetId(storedPreset);
            }
            if (Array.isArray(storedAssets) && storedAssets.every((value) => typeof value === 'string')) {
                const normalized = storedAssets.filter((value): value is AssetId => REFERENCE_ASSETS.some((asset) => asset.id === value));
                if (normalized.length > 0) setSelectedAssetIds(normalized);
            }
            if (typeof storedRequest === 'string' && storedRequest) {
                setActiveRequestId(storedRequest);
            }
            setHydrated(true);
        })();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!hydrated) return;
        void chrome.storage.session?.set?.({
            'designAssistant:stylePresetId': stylePresetId,
            'designAssistant:selectedAssetIds': selectedAssetIds,
            'designAssistant:activeRequestId': activeRequestId
        }).catch(() => {});
    }, [activeRequestId, hydrated, selectedAssetIds, stylePresetId]);

    const loadRequestDetails = useCallback(async (requestId: string | null) => {
        if (!requestId) {
            setActiveRequest(null);
            return;
        }
        try {
            const details = await bridge.getRequest(requestId);
            setActiveRequest(details);
        } catch {
            setActiveRequest(null);
        }
    }, [bridge]);

    const refresh = useCallback(async () => {
        const state = await sendToWorker<{ latestSelection: SelectionSnapshot | null; activeTab: any }>('cda:get-state');
        if (state.ok) {
            setSelection(state.latestSelection || null);
            setActiveTab(state.activeTab || null);
        }
        try {
            await bridge.health();
            setConnected(true);
            const [pendingRequests, historyData] = await Promise.all([
                bridge.pendingRequests(),
                bridge.searchHistory('', 8)
            ]);
            setPending(pendingRequests);
            setHistory(historyData);
            const nextActiveRequestId = activeRequestIdRef.current || historyData.requests[0]?.id || pendingRequests[0]?.id || null;
            if (nextActiveRequestId !== activeRequestIdRef.current) setActiveRequestId(nextActiveRequestId);
            await loadRequestDetails(nextActiveRequestId);
        } catch {
            setConnected(false);
            setLiveConnected(false);
        }
    }, [bridge, loadRequestDetails]);

    useEffect(() => {
        void refresh();
        const listener = (message: any) => {
            if (message?.type === 'cda:selection-updated') {
                setSelection(message.selection || null);
                setSavedSelection(null);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, [refresh]);

    useEffect(() => {
        const ws = new WebSocket(bridge.liveUrl());
        ws.onopen = () => setLiveConnected(true);
        ws.onclose = () => setLiveConnected(false);
        ws.onerror = () => setLiveConnected(false);
        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type?.startsWith('request.') || message.type?.startsWith('response.')) {
                    void refresh();
                }
            } catch {
                // Ignore non-JSON live frames.
            }
        };
        return () => ws.close();
    }, [bridge, refresh]);

    const selectPreset = useCallback((presetId: StylePresetId) => {
        const preset = STYLE_PRESETS.find((item) => item.id === presetId);
        if (!preset) return;
        setStylePresetId(preset.id);
        setSelectedAssetIds(preset.assetIds);
        setStatus(`${preset.label} preset selected`);
    }, []);

    const toggleAsset = useCallback((assetId: AssetId) => {
        setStylePresetId('custom');
        setSelectedAssetIds((current) => {
            const next = current.includes(assetId)
                ? current.filter((value) => value !== assetId)
                : [...current, assetId];
            return next.filter((value, index, list) => list.indexOf(value) === index);
        });
        setStatus('Asset selection updated');
    }, []);

    const setMode = async (nextMode: AssistantMode) => {
        const response = await sendToWorker<{ mode: AssistantMode }>('cda:set-mode', { mode: nextMode });
        if (!response.ok) {
            setStatus(response.error);
            return;
        }
        setModeState(nextMode);
        setStatus(nextMode === 'off' ? 'Selection disabled' : `${nextMode} mode active`);
    };

    const capturePage = async () => {
        const response = await sendToWorker<{ capture: CaptureResponse }>('cda:capture-visible-tab');
        if (!response.ok) {
            setStatus(response.error);
            return null;
        }
        setCapture(response.capture);
        const stored = await bridge.saveCapture(response.capture);
        setSavedCapture(stored);
        setStatus('Capture stored');
        return { raw: response.capture, stored };
    };

    const persistSelection = async (currentCapture: BridgeCapture | null, rawCapture: CaptureResponse | null) => {
        if (!selection) throw new Error('Select an element or region first');
        const crop = rawCapture ? await cropSelection(rawCapture.dataUrl, selection) : undefined;
        const stored = await bridge.saveSelection(selection, currentCapture?.id || null, crop);
        setSavedSelection(stored);
        setStatus('Selection stored');
        return stored;
    };

    const askCodex = async () => {
        try {
            if (!instruction.trim()) {
                setStatus('Instruction required');
                return;
            }
            const currentCapture = savedCapture ? { raw: capture, stored: savedCapture } : await capturePage();
            const currentSelection = savedSelection || await persistSelection(currentCapture?.stored || null, currentCapture?.raw || capture);
            const request = await bridge.createRequest({
                captureId: currentCapture?.stored?.id || savedCapture?.id || null,
                selectionId: currentSelection.id,
                instruction,
                constraints: DEFAULT_CONSTRAINTS,
                targetProjectRoot: targetRoot,
                designSourceIds: selectedAssetIds,
                payload: {
                    activeTab,
                    selection,
                    capture: currentCapture?.stored || savedCapture,
                    stylePresetId,
                    stylePresetLabel: currentPreset.label,
                    assetIds: selectedAssetIds,
                    assetLabels: selectedAssets.map((asset) => asset.label)
                }
            });
            setInstruction('');
            setActiveRequestId(request.id);
            await loadRequestDetails(request.id);
            const [nextPending, nextHistory] = await Promise.all([bridge.pendingRequests(), bridge.searchHistory('', 8)]);
            setPending(nextPending);
            setHistory(nextHistory);
            setStatus(`Queued ${request.id}`);
        } catch (error: any) {
            setStatus(error?.message || String(error));
        }
    };

    return (
        <div className="shell">
            <header className="topbar">
                <div>
                    <h1>Design Assistant</h1>
                    <p>{activeTab?.title || 'No active tab'}</p>
                </div>
                <button className="iconButton" onClick={refresh} title="Refresh">
                    <RefreshCw size={16} />
                </button>
            </header>

            <section className="connectionRow">
                <span className={connected ? 'state good' : 'state bad'}>
                    {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
                    {connected ? 'Bridge online' : 'Bridge offline'}
                </span>
                <span className={liveConnected ? 'state good' : 'state bad'}>
                    {liveConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
                    {liveConnected ? 'Live on' : 'Live off'}
                </span>
                <input value={bridgeOrigin} onChange={(event) => setBridgeOrigin(event.target.value)} aria-label="Bridge origin" />
            </section>

            <section className="toolbar">
                <button className={mode === 'inspect' ? 'active' : ''} onClick={() => setMode(mode === 'inspect' ? 'off' : 'inspect')}>
                    <SquareDashedMousePointer size={16} />
                    Inspect
                </button>
                <button className={mode === 'region' ? 'active' : ''} onClick={() => setMode(mode === 'region' ? 'off' : 'region')}>
                    <Frame size={16} />
                    Region
                </button>
                <button onClick={capturePage}>
                    <Crosshair size={16} />
                    Capture
                </button>
            </section>

            <section className="panel pickerPanel">
                <div className="panelHeader">
                    <span>Style / Assets</span>
                    <span>{currentPreset.label}</span>
                </div>
                <div className="pickerBody">
                    <div className="presetRow" role="list" aria-label="Style presets">
                        {STYLE_PRESETS.map((preset) => {
                            const Icon = preset.icon;
                            const selected = stylePresetId === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    className={selected ? 'presetChip active' : 'presetChip'}
                                    onClick={() => selectPreset(preset.id)}
                                    title={preset.note}
                                >
                                    <Icon size={14} />
                                    <span>{preset.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="assetGrid" aria-label="Reference assets">
                        {REFERENCE_ASSETS.map((asset) => {
                            const selected = selectedAssetIds.includes(asset.id);
                            return (
                                <button
                                    key={asset.id}
                                    className={selected ? 'assetCard selected' : 'assetCard'}
                                    onClick={() => toggleAsset(asset.id)}
                                >
                                    <img src={assetPreviewUrl(asset)} alt={asset.label} />
                                    <strong>{asset.label}</strong>
                                    <span>{asset.note}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="pickerFooter">
                    <span>{selectedAssets.length} assets selected</span>
                    <code>{selectedAssets.map((asset) => asset.label).join(' · ') || 'No assets selected'}</code>
                </div>
            </section>

            <section className="panel selectedPanel">
                <div className="panelHeader">
                    <span>Selection</span>
                    <span>{selection?.kind || 'none'}</span>
                </div>
                {selection ? (
                    <div className="selectionGrid">
                        <div>
                            <label>Label</label>
                            <strong>{selection.label}</strong>
                        </div>
                        <div>
                            <label>Bounds</label>
                            <strong>{Math.round(selection.bounds.width)} x {Math.round(selection.bounds.height)}</strong>
                        </div>
                        <div className="wide">
                            <label>Selector</label>
                            <code>{selection.selector || 'region'}</code>
                        </div>
                    </div>
                ) : (
                    <div className="empty">No selection</div>
                )}
            </section>

            {capture && (
                <section className="panel screenshotPanel">
                    <img src={capture.dataUrl} alt="Latest capture" />
                </section>
            )}

            <section className="panel requestPanel">
                <div className="panelHeader">
                    <span>Ask Codex</span>
                    <Radio size={14} />
                </div>
                <textarea
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    placeholder="Change the selected area..."
                    aria-label="Codex instruction"
                />
                <input value={targetRoot} onChange={(event) => setTargetRoot(event.target.value)} aria-label="Target project root" />
                <div className="requestSummary">
                    <span>{currentPreset.label}</span>
                    <span>{selectedAssets.length} assets</span>
                </div>
                <div className="requestAssets">
                    {selectedAssets.map((asset) => (
                        <button key={asset.id} type="button" className="assetPill" onClick={() => toggleAsset(asset.id)}>
                            {asset.label}
                        </button>
                    ))}
                </div>
                <button className="primary" onClick={askCodex}>
                    <Send size={16} />
                    Send
                </button>
            </section>

            <section className="panel responsePanel">
                <div className="panelHeader">
                    <span>Current Request</span>
                    <span>{activeRequest?.request.status || 'idle'}</span>
                </div>
                {activeRequest ? (
                    <div className="responseBody">
                        <div className="requestMeta">
                            <div>
                                <label>Request</label>
                                <strong>{activeRequest.request.id}</strong>
                            </div>
                            <div>
                                <label>Claimed</label>
                                <strong>{activeRequest.request.claimedBy || 'unclaimed'}</strong>
                            </div>
                            <div>
                                <label>Updated</label>
                                <strong>{activeRequest.request.updatedAt}</strong>
                            </div>
                        </div>
                        <div className="requestInstruction">
                            <label>Instruction</label>
                            <p>{activeRequest.request.instruction}</p>
                        </div>
                        <div className="responseStream">
                            {(activeRequest.packet?.responses || []).length > 0 ? (
                                activeRequest.packet?.responses.map((response) => (
                                    <article className="responseItem" key={response.id}>
                                        <div className="responseHeader">
                                            <strong>{response.status}</strong>
                                            <span>{response.source}</span>
                                        </div>
                                        <p>{response.message}</p>
                                    </article>
                                ))
                            ) : (
                                <div className="empty">Waiting for Codex response</div>
                            )}
                        </div>
                        {recentRequests.length > 0 && (
                            <div className="recentRow">
                                {recentRequests.map((request) => (
                                    <button
                                        key={request.id}
                                        type="button"
                                        className={activeRequestId === request.id ? 'recentChip active' : 'recentChip'}
                                        onClick={() => {
                                            setActiveRequestId(request.id);
                                            void loadRequestDetails(request.id);
                                        }}
                                    >
                                        <span>{request.status}</span>
                                        <strong>{request.id}</strong>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="empty">No request selected yet</div>
                )}
            </section>

            <section className="panel pendingPanel">
                <div className="panelHeader">
                    <span>Pending</span>
                    <span>{pending.length}</span>
                </div>
                <div className="pendingList">
                    {pending.map((item) => (
                        <button
                            type="button"
                            className={activeRequestId === item.id ? 'pendingItem active' : 'pendingItem'}
                            key={item.id}
                            onClick={() => {
                                setActiveRequestId(item.id);
                                void loadRequestDetails(item.id);
                            }}
                        >
                            <strong>{item.instruction}</strong>
                            <span>{item.status}</span>
                        </button>
                    ))}
                    {pending.length === 0 && <div className="empty">Queue clear</div>}
                </div>
            </section>

            <footer>{status}</footer>
        </div>
    );
}

function sendToWorker<T>(type: string, payload: Record<string, unknown> = {}): Promise<WorkerResponse<T>> {
    return chrome.runtime.sendMessage({ type, ...payload });
}

async function cropSelection(dataUrl: string, selection: SelectionSnapshot): Promise<string> {
    const image = await loadImage(dataUrl);
    const canvas = document.createElement('canvas');
    const scaleX = image.width / Math.max(1, selection.viewport.width);
    const scaleY = image.height / Math.max(1, selection.viewport.height);
    const sx = Math.max(0, Math.round(selection.bounds.x * scaleX));
    const sy = Math.max(0, Math.round(selection.bounds.y * scaleY));
    const sw = Math.max(1, Math.round(selection.bounds.width * scaleX));
    const sh = Math.max(1, Math.round(selection.bounds.height * scaleY));
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Unable to load capture image'));
        image.src = src;
    });
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
