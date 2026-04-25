import { API_ORIGINS, WS_ORIGINS, apiFetch } from './lib/runtime';
import { selectVoice, subscribeVoiceChange } from './lib/voiceSelector';
import { humanizeLabel, resolveRouteKey, routeLabel } from './lib/labels';
import { getOracleCommandState, subscribeOracleCommandState, submitOracleCommand, type OracleCommandState } from './lib/oracleCommandBridge';
/**
 * NUDIMMUD COMMAND CENTER
 * Operational Layer Integration: Plane.so & ExeoFlow
 * Stage: ALBEDO ENRICHMENT
 */
import './index.tsx';

const SYSTEM_HOST = window.location.hostname; // Dynamic Host Resolution
const WORKFLOW_SHORTCUTS = [
    {
        command: '/nexuslink',
        title: 'NexusLink',
        module: 'NEXUSLINK',
        detail: 'Open the public landing shell for the operator surface.'
    },
    {
        command: '/research',
        title: 'Research workspace',
        module: 'RESEARCH',
        detail: 'Open the 40-client research directory and continue client work.'
    },
    {
        command: '/setup',
        title: 'Operator setup',
        module: 'ORACLE',
        detail: 'Review workflow posture, trust gate, and runtime choice before a major task. Validate source trust, skill scope, and whether the work needs strategy, audit, or direct execution.'
    },
    {
        command: '/polish',
        title: 'Polish loop',
        module: 'NEXUSLINK',
        detail: 'Refine hierarchy, typography, motion, spacing, and affordances. Use this after the system works so the shell feels deliberate instead of default.'
    },
    {
        command: '/audit',
        title: 'Risk audit',
        module: 'DIRECTIVE',
        detail: 'Inspect regressions, permissions, weak assumptions, hidden state coupling, and operator confusion. Treat review as adversarial, not ceremonial.'
    },
    {
        command: '/critique',
        title: 'Direct feedback',
        module: 'ORACLE',
        detail: 'Surface disagreement, low confidence, missing constraints, and brittle decisions. Prefer honest friction over agreeable drift.'
    },
    {
        command: '/status',
        title: 'System status',
        module: 'ORACLE',
        detail: 'Inspect heartbeat health, oracle runtime, current risk band, and operator readiness. Use this when the system feels uncertain or overloaded.'
    },
    {
        command: '/result',
        title: 'Latest result',
        module: 'ORACLE',
        detail: 'Open the latest oracle result with its current telemetry summary.'
    },
    {
        command: '/cancel',
        title: 'Cancel transients',
        module: '',
        detail: 'Close transient overlays, stop speech, and clear temporary operator chrome without touching core state.'
    },
    {
        command: '/forge',
        title: 'Neural Forge',
        module: 'ORACLE',
        detail: 'Open the neural reasoning and image synthesis engine. Access mission-critical reasoning, Conclave deliberation, and creative synthesis capabilities.'
    }
] as const;

function canonicalizeOracleRoute(module: string) {
    const normalized = String(module || '').trim().toUpperCase();
    if (normalized === 'ENKI' || normalized === 'NEURAL_FORGE' || normalized === 'FORGE') {
        return 'ORACLE';
    }
    return module;
}

function readLastOracleResponse() {
    const live = (window as any).__nudimmudLastOracle;
    if (live) return live;
    try {
        const raw = window.sessionStorage.getItem('nudimmud.lastOracle');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function persistLastOracleResponse(response: any) {
    (window as any).__nudimmudLastOracle = response;
    try {
        window.sessionStorage.setItem('nudimmud.lastOracle', JSON.stringify(response));
    } catch {}
}

function setSignalText(id: string, value: string, color?: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    if (color) (el as HTMLElement).style.color = color;
}

function signalColorForRisk(risk: string) {
    if (risk === 'HIGH') return 'var(--red-fusion)';
    if (risk === 'MEDIUM') return 'var(--gold-solar)';
    return 'var(--cyan-glow)';
}

function signalColorForConfidence(band: string) {
    if (band === 'LOW') return 'var(--red-fusion)';
    if (band === 'MEDIUM' || band === 'GUARDED') return 'var(--gold-solar)';
    return 'var(--cyan-glow)';
}

function signalColorForHeartbeat(heartbeat: string) {
    if (heartbeat === 'DEGRADED' || heartbeat === 'FAILED') return 'var(--red-fusion)';
    if (heartbeat === 'DELAYED' || heartbeat === 'WATCH' || heartbeat === 'STRAINED') return 'var(--gold-solar)';
    return 'var(--cyan-glow)';
}

function deriveOracleTelemetry(response: any = {}) {
    const telemetry = response?.telemetry || {};
    const risk = String(telemetry.risk || response?.decision?.risk || response?.risk || 'medium').toUpperCase();
    const runtime = String(telemetry.runtime || response?.runtime || response?.decision?.preferredRuntime || 'local').toUpperCase();
    const heartbeat = String(
        telemetry.heartbeat
        || (response?.status === 'FORGE_DEGRADED'
            ? 'DEGRADED'
            : response?.status === 'CONCLAVE_TIMEOUT'
                ? 'DELAYED'
                : 'NOMINAL')
    ).toUpperCase();
    const escalated = Boolean(telemetry.escalated ?? response?.escalated);
    const disagreement = Boolean(telemetry.disagreement) || escalated || risk === 'HIGH' || response?.status === 'FORGE_DEGRADED';
    const confidenceBand = String(
        telemetry.confidenceBand
        || (response?.status === 'FORGE_DEGRADED'
            ? 'LOW'
            : escalated
                ? 'GUARDED'
                : risk === 'HIGH'
                    ? 'LOW'
                    : risk === 'MEDIUM'
                        ? 'MEDIUM'
                        : 'HIGH')
    ).toUpperCase();

    return {
        risk,
        runtime,
        heartbeat,
        escalated,
        disagreement,
        confidenceBand,
        loopCount: Number(telemetry.loopCount || response?.loopCount || 1)
    };
}

function applyOracleTelemetry(response: any = {}) {
    const telemetry = deriveOracleTelemetry(response);
    const confidenceColor = signalColorForConfidence(telemetry.confidenceBand);
    const riskColor = signalColorForRisk(telemetry.risk);
    const heartbeatColor = signalColorForHeartbeat(telemetry.heartbeat);
    const disagreementText = telemetry.disagreement ? 'PRESENT' : 'CLEAR';
    const disagreementColor = telemetry.disagreement ? 'var(--gold-solar)' : 'var(--cyan-glow)';

    setSignalText('oracle-confidence', telemetry.confidenceBand, confidenceColor);
    setSignalText('oracle-risk', telemetry.risk, riskColor);
    setSignalText('oracle-runtime', telemetry.runtime, signalColorForHeartbeat(telemetry.runtime === 'DEGRADED' ? 'DEGRADED' : 'NOMINAL'));
    setSignalText('oracle-disagreement', disagreementText, disagreementColor);
    setSignalText('footer-confidence', telemetry.confidenceBand, confidenceColor);
    setSignalText('footer-disagreement', disagreementText, disagreementColor);
    setSignalText('footer-heartbeat', telemetry.heartbeat, heartbeatColor);
    setSignalText('shell-heartbeat', telemetry.heartbeat, heartbeatColor);
    setSignalText('shell-risk', telemetry.risk, riskColor);
}

function applyLiveSystemSignals(payload: any = {}) {
    const load = payload?.cognitiveLoad;
    if (!load) return;

    const avg = Math.round((
        Number(load.neuralDensity || 0)
        + Number(load.swarmSync || 0)
        + Number(load.ingestionPressure || 0)
        + Number(load.logicThroughput || 0)
    ) / 4);

    const heartbeat = avg > 85 ? 'STRAINED' : avg > 60 ? 'WATCH' : 'NOMINAL';
    const risk = avg > 85 ? 'HIGH' : avg > 60 ? 'MEDIUM' : 'LOW';

    setSignalText('shell-heartbeat', heartbeat, signalColorForHeartbeat(heartbeat));
    setSignalText('footer-heartbeat', heartbeat, signalColorForHeartbeat(heartbeat));
    setSignalText('shell-risk', risk, signalColorForRisk(risk));
}

function buildOracleStatusMessage(response: any) {
    const telemetry = deriveOracleTelemetry(response);
    const message = response?.final_summary || response?.content || response?.error || 'Directive accepted.';
    const tags = [
        humanizeLabel(telemetry.runtime),
        `Confidence ${humanizeLabel(telemetry.confidenceBand)}`,
        `Risk ${humanizeLabel(telemetry.risk)}`
    ];
    if (telemetry.disagreement) tags.push('Disagreement');
    if (telemetry.escalated) tags.push('Escalated');
    if (response?.status && response.status !== 'CONCLAVE_SUCCESS') tags.unshift(humanizeLabel(response.status));
    return `${message} // ${tags.join(' // ')}`;
}

function buildOracleSpokenMessage(response: any) {
    const telemetry = deriveOracleTelemetry(response);
    if (response?.status === 'CONCLAVE_TIMEOUT') {
        return 'The conclave timed out. Please try your directive again.';
    }
    if (response?.status === 'CONCLAVE_ERROR') {
        return 'The neural bridge encountered an error. Please try again.';
    }
    if (response?.status === 'FORGE_DEGRADED') {
        return response?.final_summary || 'The forge is degraded. Treat this answer as provisional.';
    }
    if (telemetry.disagreement || telemetry.confidenceBand === 'LOW' || telemetry.confidenceBand === 'GUARDED') {
        return `${response?.final_summary || response?.content || 'Directive accepted.'} Confidence is ${telemetry.confidenceBand.toLowerCase()} and risk is ${telemetry.risk.toLowerCase()}.`;
    }
    return response?.final_summary || response?.content || 'Directive accepted.';
}

function isOracleCommandActive(state: OracleCommandState) {
    return state.phase === 'submitted'
        || state.phase === 'deliberating'
        || state.phase === 'stale';
}

function shouldShowMissionSynthesis(response: any) {
    return response?.status === 'CONCLAVE_SUCCESS' && response?.ui?.overlay === 'mission_synthesis';
}

function renderEmptyStatePanel(title: string, body: string, accent = 'var(--cyan-glow)') {
    return `
        <div class="neural-glass" style="padding:32px; border-left:3px solid ${accent}; background:rgba(118,185,0,0.03); min-height:220px; display:flex; align-items:center; justify-content:center;">
            <div style="max-width:42ch; text-align:center;">
                <div class="text-mono" style="font-size:0.65rem; color:${accent}; letter-spacing:0.18em; margin-bottom:14px;">${title}</div>
                <div style="font-size:1rem; line-height:1.7; color:var(--silver-albedo); opacity:0.85;">${body}</div>
            </div>
        </div>`;
}


// ─── BACKGROUND CONSTELLATION ─────────────────────────────────────────────────
class NexusConstellation {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    nodes: any[] = [];
    offset = { x: 0, y: 0 };
    scale = 1;
    dragging = false;
    last = { x: 0, y: 0 };

    constructor(canvasId: string) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.offset = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        
        let dragStartX = 0;
        let dragStartY = 0;

        this.canvas.addEventListener('mousedown', e => { 
            this.dragging = true; 
            this.last = { x: e.clientX, y: e.clientY }; 
            dragStartX = e.clientX;
            dragStartY = e.clientY;
        });

        window.addEventListener('mousemove', e => {
            if (!this.dragging) return;
            this.offset.x += e.clientX - this.last.x;
            this.offset.y += e.clientY - this.last.y;
            this.last = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', e => { 
            this.dragging = false; 
            const dx = Math.abs(e.clientX - dragStartX);
            const dy = Math.abs(e.clientY - dragStartY);
            
            // If it was a click (not a drag), try to open a node
            if (dx < 5 && dy < 5) {
                this.handleNodeClick(e.clientX, e.clientY);
            }
        });

        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            this.scale *= e.deltaY < 0 ? 1.05 : 0.95;
            this.scale = Math.min(Math.max(0.1, this.scale), 5);
        }, { passive: false });
        
        this.seedNodes();
        this.loadKnowledge();
        this.draw();
    }

    handleNodeClick(clientX: number, clientY: number) {
        // Adjust for canvas offset and scale
        const x = (clientX - this.offset.x) / this.scale;
        const y = (clientY - this.offset.y) / this.scale;

        // Find clicked node
        for (const node of this.nodes) {
            const dx = node.x - x;
            const dy = node.y - y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // generous hit area
            if (dist < Math.max(node.size * 2, 8 / this.scale)) {
                if (!node.isHub && node.id) {
                    (window as any).nudimmudEngine?.openNote(node.id);
                } else if (node.isHub) {
                    // Navigate to respective module based on hub
                    if (node.title === 'C2 CORE') (window as any).nudimmudEngine?.go('LOGOS');
                    else if (node.title === 'VAULT GATE') (window as any).nudimmudEngine?.go('PHYSIS');
                    else if (node.title === 'SWARM NET') (window as any).nudimmudEngine?.go('INDRA');
                    else if (node.title === 'NEURAL FORGE') (window as any).nudimmudEngine?.go('ORACLE');
                }
                break;
            }
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    seedNodes() {
        const hubs = [
            { id: 'hub-c2', title: 'C2 CORE', x: -250, y: -50, size: 10, isHub: true, color: '#FFB800' },
            { id: 'hub-vault', title: 'VAULT GATE', x: 250, y: -100, size: 10, isHub: true, color: '#00F2FF' },
            { id: 'hub-swarm', title: 'SWARM NET', x: 0, y: 250, size: 10, isHub: true, color: '#9B59FF' },
            { id: 'hub-enki', title: 'NEURAL FORGE', x: -300, y: 200, size: 12, isHub: true, color: '#FF4D00' },
        ];
        hubs.forEach(h => this.nodes.push({ ...h, vx: 0, vy: 0, links: [] }));
    }

    async loadKnowledge() {
        try {
            const data = await apiFetch(`http://${SYSTEM_HOST}:3004/api/knowledge`).then(r => r.json());
            const hubIds = ['hub-c2', 'hub-vault', 'hub-swarm'];
            data.slice(0, 100).forEach((n: any, i: number) => {
                const angle = (i / 100) * Math.PI * 2;
                const r = 250 + Math.random() * 300;
                this.nodes.push({
                    id: n.path, title: n.title, domain: n.domain,
                    x: Math.cos(angle) * r, y: Math.sin(angle) * r,
                    vx: 0, vy: 0, size: 2, isHub: false, color: '#00F2FF',
                    links: [hubIds[i % 3]]
                });
            });
        } catch {}
    }

    draw() {
        this.ctx.fillStyle = 'rgba(2,2,4,0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.save();
        this.ctx.translate(this.offset.x, this.offset.y);
        this.ctx.scale(this.scale, this.scale);

        this.nodes.forEach(node => {
            node.links?.forEach((lid: string) => {
                const target = this.nodes.find(n => n.id === lid);
                if (target) {
                    this.ctx.strokeStyle = 'rgba(0,242,255,0.05)';
                    this.ctx.lineWidth = 0.5 / this.scale;
                    this.ctx.beginPath();
                    this.ctx.moveTo(node.x, node.y);
                    this.ctx.lineTo(target.x, target.y);
                    this.ctx.stroke();
                }
            });
        });

        this.nodes.forEach(node => {
            this.ctx.fillStyle = node.color;
            if (node.isHub) {
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = node.color;
            }
            this.ctx.beginPath();
            this.ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;

            if (node.isHub || this.scale > 1.2) {
                this.ctx.fillStyle = node.isHub ? node.color : 'rgba(255,255,255,0.4)';
                this.ctx.font = `${node.isHub ? 12 : 6}px JetBrains Mono`;
                this.ctx.fillText(humanizeLabel(node.title), node.x + node.size + 5, node.y + 4);
            }
        });

        this.ctx.restore();
        requestAnimationFrame(() => this.draw());
    }
}

// ─── OMNIBAR (GLOBAL COMMAND & NAVIGATION) ────────────────────────────────────
class Omnibar {
    overlay: HTMLElement;
    input: HTMLInputElement;
    results: HTMLElement;

    constructor() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'omnibar-overlay neural-glass';
        this.overlay.style.cssText = 'position:fixed; top:20%; left:50%; transform:translateX(-50%); width:600px; background:rgba(10,13,26,0.95); z-index:9999; display:none; flex-direction:column; border-color:rgba(118,185,0,0.15); box-shadow:0 0 50px rgba(118,185,0,0.08); border-radius:8px;';
        
        this.overlay.innerHTML = `
            <div style="padding:20px; border-bottom:1px solid rgba(118,185,0,0.08);">
                <input type="text" id="omnibar-input" placeholder="SEARCH ENTITIES, TICKETS, AGENTS, COMMANDS..." style="width:100%; background:transparent; border:none; outline:none; color:white; font-family:var(--font-mono); font-size:1rem; letter-spacing:0.05em;">
            </div>
            <div id="omnibar-results" style="max-height:400px; overflow-y:auto; padding:10px 0;"></div>
        `;
        document.body.appendChild(this.overlay);

        this.input = document.getElementById('omnibar-input') as HTMLInputElement;
        this.results = document.getElementById('omnibar-results') as HTMLElement;

        window.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.toggle();
            }
            if (e.key === 'Escape' && this.overlay.style.display === 'flex') {
                this.hide();
            }
        });

        this.input.addEventListener('input', () => this.search(this.input.value));
    }

    toggle() {
        if (this.overlay.style.display === 'flex') this.hide();
        else this.show();
    }

    show() {
        this.overlay.style.display = 'flex';
        this.input.value = '';
        this.results.innerHTML = '<div style="padding:15px 25px; opacity:0.3; font-family:var(--font-mono); font-size:0.7rem;">TYPE TO CROSS-REFERENCE NEURAL NET...</div>';
        setTimeout(() => this.input.focus(), 50);
    }

    hide() {
        this.overlay.style.display = 'none';
    }

    async search(q: string) {
        if (!q.trim()) {
            this.results.innerHTML = '';
            return;
        }
        
        let html = '';
        
        try {
            const matchedShortcuts = WORKFLOW_SHORTCUTS.filter((shortcut) =>
                shortcut.command.includes(q.toLowerCase())
                || shortcut.title.toLowerCase().includes(q.toLowerCase())
                || shortcut.detail.toLowerCase().includes(q.toLowerCase())
            );

            if (matchedShortcuts.length > 0) {
                html += '<div style="padding:5px 25px; font-family:var(--font-mono); font-size:0.6rem; color:var(--gold-solar); opacity:0.8;">Workflows</div>';
                matchedShortcuts.forEach((shortcut) => {
                    html += `<div style="padding:12px 25px; cursor:pointer; display:flex; justify-content:space-between; gap:16px; border-bottom:1px solid rgba(118,185,0,0.03); transition:background 0.2s;" onmouseover="this.style.background='rgba(118,185,0,0.04)'" onmouseout="this.style.background=''" onclick="window.nudimmudEngine.cmdInput.value='${shortcut.command}'; window.nudimmudEngine.cmdInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); window.omnibar.hide();">
                        <span style="font-size:0.78rem; line-height:1.4;">${humanizeLabel(shortcut.title)}</span>
                        <span class="text-mono" style="font-size:0.6rem; opacity:0.65;">${shortcut.command}</span>
                    </div>`;
                });
            }

            const engine = (window as any).nudimmudEngine;
            const tickets = engine ? await engine.fetchCached(`http://${SYSTEM_HOST}:3004/api/tickets`, 60000) : [];
            const matchedTickets = tickets.filter((t:any) => t.title.toLowerCase().includes(q.toLowerCase()) || t.external_id.toLowerCase().includes(q.toLowerCase())).slice(0, 5);
            
            if (matchedTickets.length > 0) {
                html += '<div style="padding:5px 25px; font-family:var(--font-mono); font-size:0.6rem; color:var(--cyan-glow); opacity:0.7;">Tickets</div>';
                matchedTickets.forEach((t:any) => {
                    const clientBadge = t.client ? `<span style="font-size:0.5rem; color:var(--gold-solar); margin-left:8px; border:1px solid var(--gold-solar)44; padding:1px 4px; border-radius:2px;">${t.client}</span>` : '';
                    html += `<div style="padding:12px 25px; cursor:pointer; display:flex; justify-content:space-between; border-bottom:1px solid rgba(118,185,0,0.03); transition:background 0.2s;" onmouseover="this.style.background='rgba(118,185,0,0.05)'" onmouseout="this.style.background=''" onclick="window.nudimmudEngine.go('TICKETS'); window.omnibar.hide();">
                        <span style="font-size:0.8rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%;">${t.title}${clientBadge}</span>
                        <span class="text-mono" style="font-size:0.6rem; opacity:0.5; color:${t.priority === 'URGENT' ? 'var(--red-fusion)' : 'inherit'}">${t.external_id}</span>
                    </div>`;
                });
            }

            const agents = engine ? await engine.fetchCached(`http://${SYSTEM_HOST}:3004/api/agents`, 60000) : [];
            const matchedAgents = agents.filter((a:any) => a.name.toLowerCase().includes(q.toLowerCase()) || a.domain.toLowerCase().includes(q.toLowerCase())).slice(0, 3);
            if (matchedAgents.length > 0) {
                html += '<div style="padding:5px 25px; font-family:var(--font-mono); font-size:0.6rem; color:var(--gold-solar); opacity:0.7; margin-top:10px;">Agents</div>';
                matchedAgents.forEach((a:any) => {
                    html += `<div style="padding:12px 25px; cursor:pointer; display:flex; justify-content:space-between; border-bottom:1px solid rgba(118,185,0,0.03); transition:background 0.2s;" onmouseover="this.style.background='rgba(118,185,0,0.05)'" onmouseout="this.style.background=''" onclick="window.nudimmudEngine.go('INDRA'); window.omnibar.hide();">
                        <span style="font-size:0.8rem;">${a.name}</span>
                        <span class="text-mono" style="font-size:0.6rem; opacity:0.5;">${a.status}</span>
                    </div>`;
                });
            }
            
            const modules = ['NEXUSLINK', 'RESEARCH', 'CHRONOS', 'INDRA', 'LOGOS', 'PHYSIS', 'TICKETS', 'DIRECTIVE'];
            const matchedMods = modules.filter(m => m.toLowerCase().includes(q.toLowerCase()));
            if (matchedMods.length > 0) {
                html += '<div style="padding:5px 25px; font-family:var(--font-mono); font-size:0.6rem; color:white; opacity:0.7; margin-top:10px;">System navigation</div>';
                matchedMods.forEach(m => {
                    html += `<div style="padding:12px 25px; cursor:pointer; font-family:var(--font-mono); font-size:0.8rem; transition:background 0.2s;" onmouseover="this.style.background='rgba(118,185,0,0.04)'" onmouseout="this.style.background=''" onclick="window.nudimmudEngine.go('${m}'); window.nudimmudEngine.showHUD('${m}'); window.omnibar.hide();">
                        Open ${routeLabel(m)}
                    </div>`;
                });
            }

        } catch (e) {}

        this.results.innerHTML = html || `<div style="padding:15px 25px; opacity:0.3; font-family:var(--font-mono); font-size:0.7rem;">NO MATCHES DETECTED.</div>`;
    }
}

// ─── NEURAL GRAPH (3D BACKGROUND) ───────────────────────────────────────────
class NeuralGraph {
    scene: any;
    camera: any;
    renderer: any;
    nodes: any[] = [];
    links: any[] = [];
    container: HTMLElement;

    constructor() {
        this.container = document.getElementById('three-bg')!;
        if (!(window as any).THREE) return;
        this.init();
    }

    init() {
        const THREE = (window as any).THREE;
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        // Create Neural Nodes
        const geometry = new THREE.SphereGeometry(0.5, 8, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0x00f2ff, transparent: true, opacity: 0.6 });
        
        for (let i = 0; i < 50; i++) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set((Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100, (Math.random() - 0.5) * 100);
            mesh.userData = { velocity: new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05) };
            this.scene.add(mesh);
            this.nodes.push(mesh);
        }

        this.camera.position.z = 50;
        this.animate();

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.nodes.forEach(n => {
            n.position.add(n.userData.velocity);
            if (Math.abs(n.position.x) > 50) n.userData.velocity.x *= -1;
            if (Math.abs(n.position.y) > 50) n.userData.velocity.y *= -1;
            if (Math.abs(n.position.z) > 50) n.userData.velocity.z *= -1;
        });
        this.renderer.render(this.scene, this.camera);
    }
}

// ─── HOVER TOOLTIP SYSTEM ────────────────────────────────────────────────────
class HoverTooltip {
    el: HTMLElement;
    constructor() {
        this.el = document.getElementById('hover-tooltip')!;
        this.bind();
    }

    bind() {
        document.addEventListener('mouseover', (e: any) => {
            const target = e.target.closest('[data-tooltip]');
            if (target) {
                this.el.innerHTML = target.getAttribute('data-tooltip');
                this.el.classList.add('active');
                this.updatePos(e);
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.el.classList.contains('active')) this.updatePos(e);
        });

        document.addEventListener('mouseout', (e: any) => {
            if (e.target.closest('[data-tooltip]')) this.el.classList.remove('active');
        });
    }

    updatePos(e: MouseEvent) {
        this.el.style.left = `${e.clientX + 15}px`;
        this.el.style.top = `${e.clientY + 15}px`;
    }
}

// ─── MISSION SIDEBAR (EXEOFLOW INTEGRATION) ────────────────────────────────────
class MissionSidebar {
    overlay: HTMLElement;
    titleEl: HTMLElement;
    metaEl: HTMLElement;
    notesInput: HTMLTextAreaElement;
    timeInput: HTMLInputElement;
    submitBtn: HTMLElement;
    statusEl: HTMLElement;
    currentTicket: any = null;

    constructor() {
        this.overlay = document.getElementById('mission-sidebar') as HTMLElement;
        this.titleEl = document.getElementById('mission-sidebar-title') as HTMLElement;
        this.metaEl = document.getElementById('mission-sidebar-meta') as HTMLElement;
        this.notesInput = document.getElementById('mission-sidebar-notes') as HTMLTextAreaElement;
        this.timeInput = document.getElementById('mission-sidebar-time') as HTMLInputElement;
        this.submitBtn = document.getElementById('mission-sidebar-submit') as HTMLElement;
        this.statusEl = document.getElementById('mission-sidebar-status') as HTMLElement;
        const reinstateBtn = document.getElementById('mission-sidebar-reinstate') as HTMLElement;

        document.getElementById('mission-sidebar-close')?.addEventListener('click', () => this.close());
        
        this.submitBtn.addEventListener('click', () => this.transmit());
        reinstateBtn.addEventListener('click', () => this.reinstate());
    }

    open(ticket: any) {
        if (this.currentTicket?.id === ticket.id && this.overlay.style.transform === 'translateX(0px)') {
            this.close(); // de-select if clicking the same one
            return;
        }

        const teamColors: any = {
            'CTI (Claudio)': 'var(--color-claudio)',
            'Claudio': 'var(--color-claudio)',
            'Fanny': 'var(--color-fanny)',
            'Cati': 'var(--color-cati)',
            'Marcel': 'var(--color-marcel)'
        };
        const color = teamColors[ticket.assigned_to] || 'var(--cyan-glow)';

        this.currentTicket = ticket;
        this.titleEl.textContent = ticket.title;
        this.titleEl.style.color = color;
        this.metaEl.innerHTML = `ID: ${ticket.external_id} // CLIENT: <span style="color:var(--gold-solar)">${ticket.client || 'N/A'}</span> // PRIORITY: ${ticket.priority}`;
        this.notesInput.value = '';
        this.timeInput.value = '';
        this.statusEl.style.opacity = '0';
        this.submitBtn.textContent = 'Transmit to ExeoFlow';
        this.submitBtn.style.background = 'rgba(118,185,0,0.08)';
        this.submitBtn.style.color = 'var(--cyan-glow)';
        
        const reinstateBtn = document.getElementById('mission-sidebar-reinstate') as HTMLElement;
        reinstateBtn.style.display = 'block';

        this.overlay.style.transform = 'translateX(0px)';
        document.body.classList.add('panel-open');
    }

    async reinstate() {
        if (!this.currentTicket) return;
        const btn = document.getElementById('mission-sidebar-reinstate')!;
        const originalText = btn.textContent;
        const originalBg = btn.style.background;
        
        btn.textContent = 'Reinstating...';
        btn.style.opacity = '0.7';
        
        try {
            await apiFetch(`http://${SYSTEM_HOST}:3004/api/tickets/${this.currentTicket.external_id}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'IN_PROGRESS' })
            });
            btn.textContent = 'Reinstated successfully';
            btn.style.background = 'rgba(118,185,0,0.15)';
            btn.style.color = 'rgba(0,255,100,0.8)';
            btn.style.borderColor = 'rgba(0,255,100,0.5)';
            
            setTimeout(() => {
                this.close();
                (window as any).nudimmudEngine.go('DIRECTIVE');
            }, 1200);
        } catch (e) {
            btn.textContent = 'Reinstate failed';
            btn.style.background = 'rgba(255,0,0,0.1)';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = originalBg;
                btn.style.opacity = '1';
            }, 2500);
        }
    }

    close() {
        this.overlay.style.transform = 'translateX(100%)';
        this.currentTicket = null;
        document.body.classList.remove('panel-open');
    }

    async transmit() {
        if (!this.currentTicket) return;
        this.submitBtn.textContent = 'Transmitting...';
        this.submitBtn.style.opacity = '0.5';

        try {
            await apiFetch(`http://${SYSTEM_HOST}:3004/api/exeoflow/time`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_id: this.currentTicket.external_id,
                    notes: this.notesInput.value,
                    time: this.timeInput.value
                })
            });
            this.submitBtn.textContent = 'Transmission successful';
            this.submitBtn.style.background = 'rgba(118,185,0,0.15)';
            this.submitBtn.style.color = 'rgba(0,255,100,0.8)';
            this.submitBtn.style.opacity = '1';
            
            this.statusEl.textContent = 'Time metrics synced with ExeoFlow database.';
            this.statusEl.style.color = 'rgba(0,255,100,0.8)';
            this.statusEl.style.opacity = '1';

            setTimeout(() => this.close(), 2500);
        } catch (e) {
            this.submitBtn.textContent = 'Transmission failed';
            this.submitBtn.style.background = 'rgba(255,0,0,0.15)';
            this.submitBtn.style.color = 'red';
            this.submitBtn.style.opacity = '1';
        }
    }
}

// ─── CONFIG ────────────────────────────────────────────────────────────────────
// SYSTEM_HOST moved to top for hoisting safety

// ─── MAIN ENGINE ───────────────────────────────────────────────────────────────
interface ObsidianState {
    status: string;
    activeFile: string | null;
}

interface NudimmudEvent {
    source: string;
    message: string;
}

class NudimmudEngine {
    stage: HTMLElement;
    cmdInput: HTMLInputElement;
    currentPath = '';
    currentTicketView = 'LIST';
    searchTimeout: any = null;
    cache: { [key: string]: { data: any, timestamp: number } } = {};
    obsidianState = { status: 'OFFLINE', activeFile: null as string | null };
    models: any[] = [];
    selectedModel: string = 'qwen-liberated';
    useCouncil: boolean = true;
    private subscribers: ((data: any) => void)[] = [];
    private speechRecognition: any = null;
    private isSpeechActive: boolean = false;
    private wakeWordRecognition: any = null;
    private activeUtterance: SpeechSynthesisUtterance | null = null;
    private holoCtx: CanvasRenderingContext2D | null = null;
    private holoAnim: number | null = null;
    private syncInterval: any = null;
    private oracleBridgeUnsubscribe: (() => void) | null = null;
    private voicedOracleRequestId: string | null = null;
    private _wsRetryDelay = 5000;


    constructor() {
        this.stage = document.getElementById('module-content')!;
        this.cmdInput = document.getElementById('global-command-input') as HTMLInputElement;
        
        // ── BRING_TO_LIFE: HEARTBEAT ──
        if (!document.querySelector('.metatrons-cube')) {
            const cube = document.createElement('div');
            cube.className = 'metatrons-cube';
            document.body.appendChild(cube);
        }

        if (!document.querySelector('.scanline')) {
            const scanline = document.createElement('div');
            scanline.className = 'scanline';
            document.body.appendChild(scanline);
        }

        new NexusConstellation('qi-flow-canvas');
        new NeuralGraph();
        new HoverTooltip();
        (window as any).omnibar = new Omnibar(); // Instantiate Omnibar
        (window as any).missionSidebar = new MissionSidebar(); // Instantiate MissionSidebar
        this.clock();
        setInterval(() => this.clock(), 1000);
        this.bindNav();
        this.connectWS();
        this.initWakeWord();
        this.initVoice();
        this.bindLayout();
        this.fetchModels();

        const deepLinkModule = new URLSearchParams(window.location.search).get('module')?.toUpperCase();
        this.go(deepLinkModule || 'NEXUSLINK');
    }

    async fetchModels() {
        try {
            const res = await apiFetch('/api/neural/models');
            this.models = await res.json();
            const recommendedModel = this.models.find((model: any) => model.recommended)?.id;
            if (recommendedModel) {
                this.selectedModel = recommendedModel;
            }
            console.log(`⬡ NEURAL_BRIDGE :: ${this.models.length}_MODELS_SYNCED`);
            
            // Update Oracle dropdown if it's already mounted
            const select = document.getElementById('oracle-model-select') as HTMLSelectElement;
            if (select) {
                const currentVal = select.value;
                select.innerHTML = `
                    <option value="council" ${this.useCouncil ? 'selected' : ''}>[ Aeonic council ]</option>
                    ${this.models.map(m => `<option value="${m.id}" ${this.selectedModel === m.id ? 'selected' : ''}>${humanizeLabel(m.name)}</option>`).join('')}
                `;
                select.value = currentVal;
            }
        } catch (e) {
            console.warn("⬡ Neural bridge :: model sync offline");
        }
    }

    async recalibrateRegistry() {
        console.log('⬡ Initiating registry recalibration...');
        try {
            await apiFetch(`http://${SYSTEM_HOST}:3004/api/neural/recalibrate`, { method: 'POST' });
            this.showContext('SYSTEM_OVERVIEW', { 
                title: 'Registry Recalibrated', 
                content: 'The neural event log has been purged. System coherence is now optimal.' 
            });
            this.neuralPulse(440, 'sine', 0.1);
        } catch (e) {
            console.error('⬡ Recalibration failed');
        }
    }

    subscribe(fn: (data: any) => void) {
        this.subscribers.push(fn);
        return () => {
            this.subscribers = this.subscribers.filter(s => s !== fn);
        };
    }

    private notify(data: any) {
        this.subscribers.forEach(fn => fn(data));
    }

    bindLayout() {
        // Clicking away from context panel closes it
        document.getElementById('module-content')?.addEventListener('click', (e: any) => {
            if (!e.target.closest('.neural-glass') && !e.target.closest('button')) {
                this.hideContext();
            }
        });
    }

    selectedVoice: SpeechSynthesisVoice | null = null;

    initVoice() {
        const setVoice = () => {
            this.selectedVoice = selectVoice();
            if (this.selectedVoice) console.log("⬡ Oracle voice engaged ::", this.selectedVoice.name);
        };
        subscribeVoiceChange(setVoice);
        setVoice();
    }

    speak(text: string) {
        if (!text) return;
        
        this.activeUtterance = new SpeechSynthesisUtterance(text);
        
        // 2. Voice tuning
        if (this.selectedVoice) this.activeUtterance.voice = this.selectedVoice;
        this.activeUtterance.rate = 0.85;  
        this.activeUtterance.pitch = 1.0; 
        this.activeUtterance.volume = 1.0;

        this.activeUtterance.onstart = () => {
            console.log("⬡ Neural transmission start");
            const statusText = document.getElementById('oracle-status-text');
            if (statusText) statusText.innerText = 'Transmitting neural intel...';
            this.startHoloPulsar();
        };

        this.activeUtterance.onend = () => {
            console.log("⬡ Neural transmission complete");
            this.isSpeechActive = false;
            const statusText = document.getElementById('oracle-status-text');
            if (statusText) statusText.innerText = 'Awaiting voice command...';
            this.stopHoloPulsar();
            this.activeUtterance = null;
        };

        this.activeUtterance.onerror = (e) => {
            console.error("⬡ Neural transmission error", e);
            this.isSpeechActive = false;
            this.stopHoloPulsar();
        };

        // 3. PRE-FLIGHT AUDIO PULSE (Verification)
        this.neuralPulse(660, 'sine', 0.05);

        // 4. EXECUTE
        window.speechSynthesis.speak(this.activeUtterance);
    }

    private startHoloPulsar() {
        const canvas = document.getElementById('oracle-hologram-canvas') as HTMLCanvasElement;
        if (!canvas) return;
        this.holoCtx = canvas.getContext('2d');
        if (!this.holoCtx) return;

        let frame = 0;
        const render = () => {
            if (!this.holoCtx) return;
            const w = canvas.width;
            const h = canvas.height;
            this.holoCtx.clearRect(0, 0, w, h);

            // Cortana Rings
            for (let i = 0; i < 3; i++) {
                const radius = (frame * 2 + i * 40) % 150;
                const opacity = 1 - (radius / 150);
                this.holoCtx.beginPath();
                this.holoCtx.arc(w/2, h/2, radius, 0, Math.PI * 2);
                this.holoCtx.strokeStyle = `rgba(0, 242, 255, ${opacity * 0.5})`;
                this.holoCtx.lineWidth = 2;
                this.holoCtx.stroke();
            }

            // Central Core
            const corePulse = Math.sin(frame * 0.1) * 5 + 30;
            const grad = this.holoCtx.createRadialGradient(w/2, h/2, 0, w/2, h/2, corePulse);
            grad.addColorStop(0, 'rgba(0, 242, 255, 0.8)');
            grad.addColorStop(1, 'transparent');
            this.holoCtx.fillStyle = grad;
            this.holoCtx.beginPath();
            this.holoCtx.arc(w/2, h/2, corePulse, 0, Math.PI * 2);
            this.holoCtx.fill();

            frame++;
            this.holoAnim = requestAnimationFrame(render);
        };
        render();
    }

    private stopHoloPulsar() {
        if (this.holoAnim) cancelAnimationFrame(this.holoAnim);
        if (this.holoCtx) {
            const canvas = this.holoCtx.canvas;
            this.holoCtx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    /**
     * Generate a subtle neural pulse sound (Auditory Feedback)
     */
    neuralPulse(freq: number = 440, type: OscillatorType = 'sine', duration: number = 0.1) {
        try {
            const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + duration);
        } catch (e) {}
    }

    initWakeWord() {
        if (!('webkitSpeechRecognition' in window)) return;
        const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
        this.wakeWordRecognition = new SpeechRecognition();
        this.wakeWordRecognition.continuous = true;
        this.wakeWordRecognition.interimResults = false;
        this.wakeWordRecognition.lang = 'en-US';

        this.wakeWordRecognition.onresult = (event: any) => {
            // If manual STT is active, ignore wake words to prevent double-processing
            if (this.isSpeechActive) return;

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    const text = event.results[i][0].transcript.toLowerCase();
                    console.log("WAKE_WORD_DAEMON:", text);
                    if (text.includes('oracle') || text.includes('enki')) {
                        if (text.includes('briefing')) {
                            this.runStrategicBriefing();
                        } else {
                            console.log("⬡ WAKE_WORD_DETECTED :: INITIATING_DIRECT_COMMAND_SYNC");
                            this.triggerVoiceCommand();
                        }
                    }
                }
            }
        };

        this.wakeWordRecognition.onend = () => {
            // Restart unless we are in manual mode
            if (!this.isSpeechActive) {
                try { this.wakeWordRecognition.start(); } catch (e) {}
            }
        };

        // Expose global so React Oracle can re-enable wake word after STT completes
        (window as any).__resumeWakeWord = () => {
            this.isSpeechActive = false;
            try { this.wakeWordRecognition?.start(); } catch (e) {}
        };

        try { this.wakeWordRecognition.start(); } catch (e) {}
    }

    /**
     * Strategic Briefing Protocol
     * Consumes live telemetry and Obsidian state to provide a situational overview.
     */
    async runStrategicBriefing() {
        this.go('ORACLE');
        this.speak("Initializing strategic briefing. Synchronizing with local vault and neural forge.");

        try {
            // Fetch fresh status directly for the briefing
            const status = await apiFetch(`http://${SYSTEM_HOST}:3004/api/status`).then(r => r.json());
            
            const obsidian = status.obsidian;
            const contextMsg = (obsidian && (obsidian.status === 'ONLINE' || obsidian.status === 'CONNECTED'))
                ? `You are currently analyzing ${obsidian.activeFile?.split('/').pop() || 'a mission-critical node'} in Obsidian.`
                : "The vault connection is currently stabilizing.";

            const briefing = `
                Command Center is online. Current stage: RUBEDO.
                ${contextMsg}
                Knowledge base density is at ${status.knowledgeStats?.total || 0} nodes. 
                Systemic entropy is currently balanced. 
                I am standing by for your next directive.
            `;

            setTimeout(() => this.speak(briefing), 2000);
        } catch (e) {
            console.error('⬡ BRIEFING_ERROR ::', e);
            this.speak("Telemetry link jitter detected. Re-establishing neural connection.");
        }
    }

    triggerVoiceCommand() {
        this.isSpeechActive = true;

        const tryClick = () => {
            const btn = document.getElementById('oracle-mic-toggle');
            if (btn) { btn.click(); return true; }
            return false;
        };

        // If already on Oracle, try immediately
        if (this.stage.dataset.module === 'ORACLE' && tryClick()) return;

        if (this.stage.dataset.module !== 'ORACLE') this.go('ORACLE');

        // Wait for oracle:ready event dispatched by OraclePage on mount
        let fallback: ReturnType<typeof setTimeout> | null = null;
        const onReady = () => {
            if (fallback !== null) clearTimeout(fallback);
            window.removeEventListener('oracle:ready', onReady);
            if (!tryClick()) this.isSpeechActive = false;
        };
        window.addEventListener('oracle:ready', onReady, { once: true });
        fallback = setTimeout(() => {
            window.removeEventListener('oracle:ready', onReady);
            if (!tryClick()) this.isSpeechActive = false;
        }, 2000);
    }



    async fetchCached(url: string, ttl: number = 30000) {
        const normalizedUrl = normalizeCacheKey(url);

        if (this.cache[normalizedUrl] && (Date.now() - this.cache[normalizedUrl].timestamp < ttl)) {
            return this.cache[normalizedUrl].data;
        }

        const data = await apiFetch(normalizedUrl).then(r => r.json());
        this.cache[normalizedUrl] = { data, timestamp: Date.now() };
        return data;
    }


    clock() {
        const el = document.getElementById('clock');
        if (el) el.textContent = new Date().toLocaleTimeString();
    }

    connectWS() {
        try {
            const connectAt = (index: number) => {
                const origin = WS_ORIGINS[index] || WS_ORIGINS[0];
                let connectedOnce = false;
                const ws = new WebSocket(origin);

                ws.onopen = () => {
                    connectedOnce = true;
                    this._wsRetryDelay = 5000;
                    console.log(`⬡ NEURAL_LINK_ESTABLISHED :: ${origin}`);
                };

                ws.onmessage = e => {
                    try {
                        const d = JSON.parse(e.data);
                        applyLiveSystemSignals(d);
                        if (d.cognitiveLoad) {
                            const l = d.cognitiveLoad;
                            ['logic', 'sync', 'ingest'].forEach(k => {
                                const bar = document.getElementById(`bar-${k}`);
                                const text = document.getElementById(`bar-${k}-text`);
                                const val = k === 'logic' ? l.logicThroughput : (k === 'sync' ? l.swarmSync : l.ingestionPressure);
                                if (bar) bar.style.width = `${val}%`;
                                if (text) text.textContent = `${Math.round(val)}%`;
                            });
                            const pct = document.getElementById('load-percentage');
                            if (pct) {
                                const avg = Math.round((l.neuralDensity + l.swarmSync + l.ingestionPressure + l.logicThroughput) / 4);
                                pct.textContent = `${avg}%`;
                                pct.style.color = avg > 80 ? 'var(--red-fusion)' : (avg > 50 ? 'var(--gold-solar)' : 'var(--cyan-glow)');
                            }
                        }
                        if (d.obsidian) {
                            this.obsidianState = d.obsidian;
                            const fileEl = document.getElementById('oracle-active-file');
                            const statusEl = document.getElementById('oracle-vault-link-text');
                            const vaultStatusTop = document.getElementById('oracle-vault-status');

                            if (fileEl) fileEl.innerText = `"${d.obsidian.activeFile?.split('/').pop() || 'No active file'}"`;
                            if (statusEl) {
                                statusEl.innerText = d.obsidian.status;
                                statusEl.style.color = d.obsidian.status === 'ONLINE' ? 'var(--cyan-glow)' : 'var(--red-fusion)';
                            }
                            if (vaultStatusTop) {
                                vaultStatusTop.innerText = `Vault link: ${d.obsidian.status}`;
                                vaultStatusTop.style.color = d.obsidian.status === 'ONLINE' ? 'var(--cyan-glow)' : 'var(--red-fusion)';
                            }
                        }
                        if (d.knowledgeStats) {
                            const countEl = document.getElementById('oracle-knowledge-count');
                            const barEl = document.getElementById('oracle-knowledge-bar');
                            const footerCount = document.getElementById('footer-node-count');

                            if (countEl) countEl.innerText = d.knowledgeStats.total;
                            if (barEl) barEl.style.width = `${Math.min(100, (d.knowledgeStats.total / 1000) * 100)}%`;
                            if (footerCount) footerCount.textContent = d.knowledgeStats.total;
                        }

                        if (d.events && d.events.length > 0) {
                            const logStream = document.getElementById('system-log-stream');
                            if (logStream) {
                                logStream.innerHTML = d.events.map((ev: any) => `
                                <div style="margin-bottom:8px; border-left: 2px solid ${ev.severity === 'CRITICAL' ? 'red' : (ev.severity === 'WARN' ? 'orange' : 'var(--cyan-dim)')}; padding-left: 6px;">
                                    <div style="display:flex; justify-content:space-between; opacity:0.6;">
                                        <span style="font-size:0.5rem; letter-spacing:0.1em;">${new Date(ev.created_at).toLocaleTimeString()}</span>
                                        <span style="font-size:0.5rem;">[${ev.source}]</span>
                                    </div>
                                    <div style="color:var(--silver-albedo); font-size:0.65rem; margin-top:2px;">${ev.message}</div>
                                </div>
                            `).join('');
                            }
                        }
                        
                        this.notify(d);
                    } catch (e) {
                        console.error('⬡ NEURAL_PARSE_ERROR', e);
                    }
                };

                ws.onclose = () => {
                    if (!connectedOnce && index + 1 < WS_ORIGINS.length) {
                        console.warn(`⬡ NEURAL_LINK_FALLBACK :: ${WS_ORIGINS[index + 1]}`);
                        setTimeout(() => connectAt(index + 1), 500);
                        return;
                    }

                    const delay = this._wsRetryDelay;
                    this._wsRetryDelay = Math.min(this._wsRetryDelay * 2, 60_000);
                    console.warn(`⬡ NEURAL_LINK_DROPPED :: RECONNECTING_IN_${delay}MS`);
                    setTimeout(() => this.connectWS(), delay);
                };

                ws.onerror = (e) => {
                    console.error(`⬡ NEURAL_LINK_ERROR :: ${origin}`, e);
                    ws.close();
                };
            };

            connectAt(0);
        } catch (err) {
            const delay = this._wsRetryDelay;
            this._wsRetryDelay = Math.min(this._wsRetryDelay * 2, 60_000);
            setTimeout(() => this.connectWS(), delay);
        }
    }

    bindNav() {
        document.querySelectorAll('.nav-node').forEach(n => {
            n.addEventListener('click', () => {
                document.querySelectorAll('.nav-node').forEach(x => x.classList.remove('active'));
                n.classList.add('active');
                this.go(n.getAttribute('data-module')!);
            });
        });

        this.cmdInput.addEventListener('keydown', async e => {
            if (e.key === 'Enter') {
                const v = this.cmdInput.value.trim();
                this.cmdInput.value = '';
                if (!v) return;
                const lowered = v.toLowerCase();
                
                if (lowered === '/ls') { this.go('PHYSIS'); return; }

                const shortcut = WORKFLOW_SHORTCUTS.find((entry) => entry.command === lowered);
                if (shortcut) {
                    if (shortcut.command === '/cancel') {
                        this.hideContext();
                        document.getElementById('hud-overlay')?.remove();
                        const sidebar = document.getElementById('mission-sidebar');
                        if (sidebar) sidebar.style.transform = 'translateX(100%)';
                        if ((window as any).omnibar) (window as any).omnibar.hide();
                        window.speechSynthesis.cancel();
                        return;
                    }

                    if (shortcut.command === '/result') {
                        const lastResponse = readLastOracleResponse();
                        const summary = lastResponse
                            ? buildOracleStatusMessage(lastResponse)
                            : 'No oracle result is cached yet. Run a directive first, then reopen this panel.';
                        if (lastResponse) applyOracleTelemetry(lastResponse);
                        this.go(shortcut.module);
                        this.showContext('SYSTEM_OVERVIEW', {
                            title: shortcut.title,
                            content: summary
                        });
                        return;
                    }

                    if (shortcut.module) this.go(shortcut.module);
                    this.showContext('SYSTEM_OVERVIEW', {
                        title: shortcut.title,
                        content: shortcut.detail
                    });
                    return;
                }
                
                if (lowered.startsWith('/exec ')) {
                    const cmd = v.replace('/exec ', '');
                    this.stage.innerHTML = `<div style="padding:100px;text-align:center;font-family:var(--font-mono);color:var(--gold-solar);letter-spacing:0.3em;">EXECUTING: ${cmd}...</div>`;
                    try {
                        const res = await apiFetch(`http://${SYSTEM_HOST}:3004/api/execute`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ commandKey: cmd })
                        }).then(r => r.json());

                        
                        this.stage.innerHTML = `<div class="panel">
                            <div class="panel-header" style="margin-bottom:15px;"><h3 style="color:var(--cyan-glow);">Execution result // ${cmd}</h3></div>
                            <pre style="font-family:var(--font-mono);font-size:0.75rem;color:rgba(255,255,255,0.7);white-space:pre-wrap;background:rgba(0,0,0,0.5);padding:15px;border:1px solid rgba(0,242,255,0.2);border-radius:3px;overflow-x:auto;">${res.stdout || res.stderr || res.error || 'No output returned.'}</pre>
                        </div>`;
                    } catch (err) {
                        this.stage.innerHTML = `<div class="panel"><h3 style="color:red;">Execution failed</h3><p>${err}</p></div>`;
                    }
                    return;
                }

                this.go('RESEARCH', v);
            }
        });
    }

    async go(module: string, query?: string) {
        const requestedModule = canonicalizeOracleRoute(module);
        module = resolveRouteKey(requestedModule);
        this.cleanup(); // PREVENT_MEMORY_LEAK_AND_STALLS

        const displayModule = routeLabel(requestedModule);
        this.stage.innerHTML = `<div style="padding:100px;text-align:center;opacity:0.3;font-family:var(--font-mono);letter-spacing:0.35em;">Loading ${displayModule}...</div>`;
        this.hideContext(); // Auto-close context when switching tabs
        
        // Ensure sidebars are closed
        const sidebar = document.getElementById('mission-sidebar');
        if (sidebar) sidebar.style.transform = 'translateX(100%)';

        try {
            document.querySelectorAll('.nav-node').forEach(n => {
                if (n.getAttribute('data-module') === module) n.classList.add('active');
                else n.classList.remove('active');
            });

            switch (module) {
                case 'NEXUSLINK':
                    this.stage.innerHTML = '<div id="react-nexuslink-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('NEXUSLINK', 'react-nexuslink-root', { surfaceLabel: 'NexusLink' });
                    break;
                case 'RESEARCH':
                    this.stage.innerHTML = '<div id="react-research-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('RESEARCH', 'react-research-root', { surfaceLabel: 'Research', initialPath: '01_PROJECTS' });
                    break;
                case 'CHRONOS':
                    this.stage.innerHTML = '<div id="react-chronos-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('CHRONOS', 'react-chronos-root');
                    break;
                case 'INDRA':
                    this.stage.innerHTML = '<div id="react-indra-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('INDRA', 'react-indra-root');
                    break;
                case 'ABZU':
                    this.stage.innerHTML = '<div id="react-search-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('SEARCH', 'react-search-root');
                    break;
                case 'LOGOS':
                    this.stage.innerHTML = '<div id="react-logos-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('LOGOS', 'react-logos-root');
                    break;
                case 'CATALOG':
                    this.stage.innerHTML = '<div id="react-catalog-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('CATALOG', 'react-catalog-root');
                    break;
                case 'ORACLE':
                    this.stage.innerHTML = '<div id="react-oracle-root" style="width:100%; height:100%; display:flex; flex-direction:column;"></div>';
                    (window as any).mountModule('ORACLE', 'react-oracle-root');
                    break;
                case 'PHYSIS':
                    this.stage.innerHTML = '<div id="react-physis-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('PHYSIS', 'react-physis-root');
                    break;
                case 'TICKETS': 
                    this.stage.innerHTML = '<div id="react-tickets-root" style="width:100%; height:100%;"></div>';
                    (window as any).mountModule('TICKETS', 'react-tickets-root'); 
                    break;
                case 'VAULT_DEBUGGER':
                    if (!this.stage.innerHTML || this.stage.innerHTML.length < 20) {
                        this.stage.innerHTML = '<div id="react-oracle-root" style="width:100%; height:100%; display:flex; flex-direction:column;"></div>';
                        (window as any).mountModule('ORACLE', 'react-oracle-root');
                    }
                    this.showHUD('VAULT_DEBUGGER');
                    break;
                case 'DIRECTIVE': 
                    this.stage.innerHTML = await this.directiveHTML(); this.bindDirective(); 
                    break;
            }
        } catch (err) {
            console.error('⬡ NAVIGATION_ERROR ::', err);
            this.stage.innerHTML = `<div class="panel"><h3>OFFLINE</h3><p style="opacity:0.5;font-size:0.7rem;">${err}</p></div>`;
        }
    }

    private cleanup() {
        if (this.oracleBridgeUnsubscribe) {
            this.oracleBridgeUnsubscribe();
            this.oracleBridgeUnsubscribe = null;
        }

        // Stop active speech
        window.speechSynthesis.cancel();
        
        // Remove transient HUDs
        const hud = document.getElementById('hud-overlay');
        if (hud) hud.remove();
        const khud = document.getElementById('knowledge-hud-overlay');
        if (khud) khud.remove();
        const rhud = document.getElementById('holographic-result-overlay');
        if (rhud) rhud.remove();

        // Stop animations
        if (this.holoAnim) cancelAnimationFrame(this.holoAnim);
    }

    // ─── LANDING ───────────────────────────────────────────────────────────────
    async landingHTML() {
        // Initial fetch
        const metrics = await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/swarm/metrics`).catch(() => ({ swarm_sync: 98, neural_entropy: 12 }));
        
        return `
            <div class="tactical-hud landing-surface" style="height:100%; display:flex; flex-direction:column; gap:24px;">
                <div class="scanline-mini"></div>
                
                <header style="display:flex; justify-content:space-between; align-items:flex-end; gap:24px; flex-wrap:wrap;">
                    <div style="max-width:min(780px,100%);">
                        <div class="text-mono" style="font-size:0.58rem; color:var(--gold-solar); letter-spacing:0.3em; margin-bottom:12px;">NexusLink // command surface</div>
                        <h1 class="gradient-text" style="font-size:clamp(2.8rem, 7vw, 4.4rem); font-weight:900; margin:0; letter-spacing:-0.05em; line-height:0.92;">NexusLink <span style="color:var(--silver-albedo);">Control</span></h1>
                        <p style="margin:14px 0 0; max-width:54ch; font-size:0.95rem; line-height:1.7; color:var(--text-dim);">Pick a route, inspect the swarm, and move straight into the modules that matter.</p>
                    </div>
                    <div class="text-mono" style="text-align:right; max-width:260px;">
                        <div style="font-size:1.05rem; color:var(--cyan-glow); font-weight:bold;">System state: greenline</div>
                        <div style="font-size:0.6rem; opacity:0.4; margin-top:5px;">Neural sync <span id="header-sync-value">99.8</span>% // uptime 42d 12h</div>
                    </div>
                </header>

                <div style="display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:15px;">
                    <div class="neural-glass" style="padding:15px; border-left:2px solid var(--cyan-glow); background:rgba(0,242,255,0.02);">
                        <div class="text-mono" style="font-size:0.5rem; opacity:0.4; margin-bottom:6px; letter-spacing:0.1em;">Swarm sync</div>
                        <div id="swarm-sync-level" style="font-size:0.9rem; font-weight:800; color:var(--cyan-glow);">${(metrics.swarm_sync || 98.2).toFixed(2)}%</div>
                    </div>
                    <div class="neural-glass" style="padding:15px; border-left:2px solid var(--gold-solar); background:rgba(255,184,0,0.02);">
                        <div class="text-mono" style="font-size:0.5rem; opacity:0.4; margin-bottom:6px; letter-spacing:0.1em;">Neural entropy</div>
                        <div id="neural-entropy-level" style="font-size:0.9rem; font-weight:800; color:var(--gold-solar);">${(metrics.neural_entropy || 11.4).toFixed(4)}</div>
                    </div>
                    <div class="neural-glass" style="padding:15px; border-left:2px solid var(--red-fusion); background:rgba(255,50,50,0.02);">
                        <div class="text-mono" style="font-size:0.5rem; opacity:0.4; margin-bottom:6px; letter-spacing:0.1em;">Latency buffer</div>
                        <div style="font-size:0.9rem; font-weight:800; color:var(--red-fusion);">14ms</div>
                    </div>
                    <div class="neural-glass" style="padding:15px; border-left:2px solid var(--silver-albedo); background:rgba(255,255,255,0.02);">
                        <div class="text-mono" style="font-size:0.5rem; opacity:0.4; margin-bottom:6px; letter-spacing:0.1em;">Core uptime</div>
                        <div id="core-uptime-value" style="font-size:0.9rem; font-weight:800; color:var(--silver-albedo);">02:44:11</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: minmax(0,1.05fr) minmax(0,0.95fr) minmax(0,0.95fr); gap:24px; flex:1;">
                    <div class="neural-glass card-hover-effect" style="padding:30px; display:flex; flex-direction:column; background:rgba(0,0,0,0.45);">
                        <h3 class="text-mono" style="font-size:0.75rem; color:var(--gold-solar); letter-spacing:0.15em; margin-bottom:25px; border-bottom:1px solid rgba(118,185,0,0.15); padding-bottom:10px;">Strategic actions</h3>
                        
                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; flex:1;">
                            <div class="neural-glass" style="padding:15px; border:1px solid rgba(118,185,0,0.12); background:rgba(118,185,0,0.03); cursor:pointer;" onclick="window.nudimmudEngine.go('ORACLE')">
                                <div class="text-mono" style="font-size:0.55rem; color:var(--gold-solar); margin-bottom:8px;">Neural forge</div>
                                <div style="font-size:0.8rem; font-weight:700;">Enki lab sync</div>
                                <div class="text-mono" style="font-size:0.5rem; opacity:0.3; margin-top:8px;">Models loaded: 12</div>
                            </div>
                            <div class="neural-glass" style="padding:15px; border:1px solid rgba(118,185,0,0.12); background:rgba(118,185,0,0.03); cursor:pointer;" onclick="window.nudimmudEngine.go('LOGOS')">
                                <div class="text-mono" style="font-size:0.55rem; color:var(--cyan-glow); margin-bottom:8px;">Project core</div>
                                <div style="font-size:0.8rem; font-weight:700;">Logos stream</div>
                                <div class="text-mono" style="font-size:0.5rem; opacity:0.3; margin-top:8px;">Active nodes: 42</div>
                            </div>
                            <div class="neural-glass" style="padding:15px; border:1px solid rgba(118,185,0,0.12); background:rgba(118,185,0,0.03); cursor:pointer;" onclick="window.nudimmudEngine.go('ORACLE')">
                                <div class="text-mono" style="font-size:0.55rem; color:var(--silver-albedo); margin-bottom:8px;">Guidance</div>
                                <div style="font-size:0.8rem; font-weight:700;">Summon advisor</div>
                                <div class="text-mono" style="font-size:0.5rem; opacity:0.3; margin-top:8px;">Ready for briefing</div>
                            </div>
                            <div class="neural-glass" style="padding:15px; border:1px solid rgba(118,185,0,0.12); background:rgba(118,185,0,0.03); cursor:pointer;" onclick="window.nudimmudEngine.go('PHYSIS')">
                                <div class="text-mono" style="font-size:0.55rem; color:var(--red-fusion); margin-bottom:8px;">System health</div>
                                <div style="font-size:0.8rem; font-weight:700;">Physis radar</div>
                                <div class="text-mono" style="font-size:0.5rem; opacity:0.3; margin-top:8px;">IO pressure: low</div>
                            </div>
                        </div>

                        <div style="margin-top:25px; padding:15px; background:rgba(118,185,0,0.03); border:1px solid rgba(118,185,0,0.12);">
                            <div class="text-mono" style="font-size:0.55rem; opacity:0.4; margin-bottom:8px;">Quick command</div>
                            <div style="display:flex; gap:10px;">
                                <input type="text" placeholder="Enter a directive..." style="flex:1; background:transparent; border:none; border-bottom:1px solid rgba(118,185,0,0.2); color:white; font-family:var(--font-mono); font-size:0.65rem; outline:none;">
                                <button class="text-mono" style="background:var(--gold-solar); color:black; border:none; padding:4px 10px; font-size:0.55rem; cursor:pointer; font-weight:bold;">Run</button>
                            </div>
                        </div>
                    </div>

                    <div class="neural-glass card-hover-effect" style="padding:30px; display:flex; flex-direction:column; background:rgba(0,0,0,0.45);">
                        <h3 class="text-mono" style="font-size:0.75rem; color:var(--cyan-glow); letter-spacing:0.15em; margin-bottom:25px; border-bottom:1px solid rgba(118,185,0,0.15); padding-bottom:10px;">Live swarm stream</h3>
                        <div id="landing-event-stream" style="flex:1; overflow:hidden;">
                            ${(await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/events`).catch(() => [])).slice(0, 8).map((e:any) => `
                                <div class="telemetry-row" style="margin-bottom:15px; opacity:0.7;">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                        <span class="text-mono" style="font-size:0.55rem; color:var(--cyan-glow);">${humanizeLabel(e.category || 'Event')}</span>
                                        <span class="text-mono" style="font-size:0.55rem; opacity:0.3;">${e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : '--:--'}</span>
                                    </div>
                                    <div style="font-size:0.75rem; opacity:0.9;">${e.content || 'System heartbeat nominal.'}</div>
                                </div>
                            `).join('') || '<div style="opacity:0.3; font-size:0.7rem; text-align:center; padding-top:50px;">No event data streams active.</div>'}
                        </div>
                        <button class="text-mono" style="width:100%; margin-top:20px; padding:12px; background:rgba(118,185,0,0.05); border:1px solid rgba(118,185,0,0.2); color:var(--gold-solar); cursor:pointer; font-size:0.65rem;" onclick="window.nudimmudEngine.go('INDRA')">Open swarm radar</button>
                    </div>

                    <div class="neural-glass card-hover-effect" style="padding:30px; display:flex; flex-direction:column;">
                        <h3 class="text-mono" style="font-size:0.75rem; color:var(--gold-solar); letter-spacing:0.15em; margin-bottom:25px; border-bottom:1px solid rgba(118,185,0,0.15); padding-bottom:10px;">Priority nodes</h3>
                        <div style="flex:1;">
                            ${(await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/tickets`).catch(() => [])).filter((t:any) => t.priority === 'URGENT').slice(0, 4).map((t:any) => `
                                <div class="neural-glass" style="padding:15px; margin-bottom:12px; background:rgba(118,185,0,0.03); border-left:3px solid var(--red-fusion); cursor:pointer;" onclick="window.nudimmudEngine.go('DIRECTIVE')">
                                    <div class="text-mono" style="font-size:0.55rem; color:var(--red-fusion); margin-bottom:5px;">High priority</div>
                                    <div style="font-size:0.8rem; font-weight:600;">${t.title}</div>
                                    <div class="text-mono" style="font-size:0.5rem; opacity:0.3; margin-top:5px;">Target ref: ${t.external_id}</div>
                                </div>
                            `).join('') || '<div style="opacity:0.3; font-size:0.7rem; text-align:center; padding-top:50px;">No critical nodes remain.</div>'}
                        </div>
                        <div style="margin-top:20px; padding:20px; background:rgba(118,185,0,0.03); border:1px solid rgba(118,185,0,0.12);">
                            <div class="text-mono" style="font-size:0.55rem; opacity:0.4; margin-bottom:10px;">Next oracle briefing</div>
                            <div style="font-size:0.85rem; font-weight:bold; color:var(--gold-solar);">ExeoFlow API bridge integration</div>
                            <div class="text-mono" style="font-size:0.55rem; opacity:0.3; margin-top:5px;">Estimated completion: T-minus 4h</div>
                        </div>
                    </div>
                </div>

                <div style="display:flex; gap:16px; flex-wrap:wrap; padding-top:8px;">
                    <button class="text-mono" style="flex:1; min-width:220px; padding:20px; background:rgba(118,185,0,0.05); border:1px solid rgba(118,185,0,0.2); color:var(--cyan-glow); cursor:pointer; font-size:0.78rem; letter-spacing:0.14em;" data-tooltip="Open the client research workspace" onclick="window.nudimmudEngine.go('RESEARCH')">Open research</button>
                    <button class="text-mono" style="flex:1; min-width:220px; padding:20px; background:rgba(118,185,0,0.05); border:1px solid rgba(118,185,0,0.25); color:var(--gold-solar); cursor:pointer; font-size:0.78rem; letter-spacing:0.14em;" data-tooltip="Summon the oracle briefing" onclick="window.nudimmudEngine.go('ORACLE')">Open oracle</button>
                    <button class="text-mono" style="flex:1; min-width:220px; padding:20px; background:rgba(255,255,255,0.03); border:1px solid rgba(118,185,0,0.12); color:white; cursor:pointer; font-size:0.78rem; letter-spacing:0.14em;" data-tooltip="Manage strategic projects" onclick="window.nudimmudEngine.go('LOGOS')">Open projects</button>
                </div>
            </div>
        `;
    }

    // ─── CHRONOS ────────────────────────────────────────────────────────────────
    async chronosHTML() {
        const events = await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/calendar`).catch(() => []);
        const rows = events.map((e: any) => `
            <div style="display:flex;align-items:center;gap:20px;padding:16px;border-bottom:1px solid rgba(118,185,0,0.08);transition:background 0.2s;cursor:pointer;" onmouseover="this.style.background='rgba(118,185,0,0.04)'" onmouseout="this.style.background=''" onclick="window.nudimmudEngine.go('RESEARCH', '${e.title}')">
                <div style="min-width:70px;color:var(--cyan-glow);font-family:var(--font-mono);font-size:0.85rem;letter-spacing:0.05em;">${e.start_time.split('T')[1]?.slice(0,5) ?? '--:--'}</div>
                <div style="flex:1;">
                    <div style="font-size:0.95rem;font-weight:600;letter-spacing:0.02em;">${e.title}</div>
                    <div style="font-family:var(--font-mono);font-size:0.6rem;opacity:0.5;margin-top:4px;letter-spacing:0.1em;">${humanizeLabel(e.event_type)}</div>
                </div>
                <div style="font-family:var(--font-mono);font-size:0.55rem;color:var(--gold-solar);border:1px solid rgba(118,185,0,0.25);padding:4px 10px;border-radius:2px;background:rgba(118,185,0,0.05);">Active phase</div>
            </div>`).join('');
        return `
            <header style="margin-bottom:40px;">
                <h1 class="text-mono glow-text" style="color:var(--cyan-glow); letter-spacing:0.2em; font-size:1.8rem; margin-bottom:8px;">Chronos // temporal stream</h1>
                <p class="text-mono" style="font-size:0.7rem; opacity:0.4;">Event horizon monitoring // cross-ref enabled</p>
            </header>
            <div class="neural-glass" style="padding:10px 20px;">${rows || renderEmptyStatePanel('No events yet', 'Calendar data is unavailable or empty.')}</div>`;
    }

    // ─── INDRA (SWARM_INTELLIGENCE) ─────────────────────────────────────────────
    async indraHTML() {
        const agents = await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/agents`).catch(() => []);
        const statusColor: any = { ACTIVE: 'var(--cyan-glow)', SYNCING: 'var(--gold-solar)', IDLE: 'var(--text-dim)' };
        const iconTypes = ['alpha', 'beta', 'gamma', 'delta'];

        const cards = agents.map((a: any, i: number) => {
            const type = iconTypes[i % iconTypes.length];
            return `
            <div class="neural-glass" style="padding:24px; border-left: 3px solid ${statusColor[a.status]}; cursor:pointer; display:flex; gap:20px; align-items:center;" onclick="window.nudimmudEngine.openAgentDetail('${a.name}')">
                <div class="agent-icon type-${type}" style="flex-shrink:0;"></div>
                <div style="flex:1; overflow:hidden;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:1.1rem; font-weight:900; letter-spacing:-0.02em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;">${a.name}</span>
                        <span class="text-mono" style="font-size:0.5rem; color:${statusColor[a.status]}; background:rgba(255,255,255,0.05); padding:2px 6px; border:1px solid ${statusColor[a.status]}33;">${humanizeLabel(a.status)}</span>
                    </div>
                    <div class="text-mono" style="font-size:0.6rem; opacity:0.4; margin-bottom:10px; letter-spacing:0.1em;">Domain: ${humanizeLabel(a.domain || 'Unknown')}</div>
                    <div class="text-mono" style="font-size:0.6rem; color:var(--cyan-glow); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; background:rgba(0,0,0,0.3); padding:6px 10px; border-radius:3px; border:1px solid rgba(255,255,255,0.05);">
                        <span style="opacity:0.4;">$</span> ${a.command || humanizeLabel('IDLE_WAITING')}
                    </div>
                </div>
            </div>`;
        }).join('');

        return `
            <header style="margin-bottom:50px;">
                <h1 class="text-mono glow-text" style="color:var(--cyan-glow); letter-spacing:0.2em; font-size:1.8rem; margin-bottom:8px;">Indra // swarm intelligence</h1>
                <p class="text-mono" style="font-size:0.75rem; opacity:0.4; border-left:2px solid var(--cyan-glow); padding-left:15px;">Multi-layer agent orchestration engine // sync status: optimal</p>
            </header>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap:24px;">${cards || renderEmptyStatePanel('No agents online', 'The swarm is idle or the agent API is unavailable.', 'var(--gold-solar)')}</div>`;
    }

    // ─── ABZU ───────────────────────────────────────────────────────────────────
    abzuHTML() {
        return `
            <div class="tactical-hud" style="height:100%; display:flex; flex-direction:column; gap:30px;">
                <header style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div class="text-mono" style="font-size:0.6rem; color:var(--cyan-glow); letter-spacing:0.2em; margin-bottom:10px;">Abzu // neural akashic index</div>
                        <h1 class="gradient-text" style="font-size:2.8rem; font-weight:900; margin:0; letter-spacing:-0.03em;">Knowledge retrieval</h1>
                    </div>
                    <div style="display:flex; gap:15px;">
                        <button class="text-mono action-btn" style="padding:10px 20px; font-size:0.65rem; background:rgba(0,242,255,0.05); border:1px solid var(--cyan-glow); color:var(--cyan-glow); cursor:pointer;" onclick="window.nudimmudEngine.refreshIndex('vault', this)">Refresh vault</button>
                        <button class="text-mono action-btn" style="padding:10px 20px; font-size:0.65rem; background:rgba(255,184,0,0.05); border:1px solid var(--gold-solar); color:var(--gold-solar); cursor:pointer;" onclick="window.nudimmudEngine.refreshIndex('plane', this)">Resync plane</button>
                    </div>
                </header>

                <div class="neural-glass" style="padding:40px; background:rgba(0,0,0,0.4); border:1px solid rgba(255,255,255,0.05); border-radius:20px;">
                    <div style="position:relative; margin-bottom:40px;">
                        <input id="abzu-input" type="text" placeholder="Type a query for neural matching..." 
                               style="width:100%; background:rgba(0,0,0,0.6); border:1px solid rgba(0,242,255,0.25); color:white; font-family:var(--font-mono); font-size:1.4rem; padding:25px 35px; outline:none; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.3); transition:all 0.3s; border-left:4px solid var(--cyan-glow);"
                               onfocus="this.style.borderColor='var(--cyan-glow)'; this.style.boxShadow='0 0 30px rgba(0,242,255,0.1)'"
                               onblur="this.style.borderColor='rgba(0,242,255,0.25)'; this.style.boxShadow='none'">
                        <div class="text-mono" style="position:absolute; right:25px; top:50%; transform:translateY(-50%); opacity:0.3; font-size:0.7rem; letter-spacing:0.2em;">[ Standby for input ]</div>
                    </div>

                    <div id="abzu-results" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap:20px; min-height:400px; padding-top:20px; border-top:1px solid rgba(255,255,255,0.05);">
                        <div style="grid-column:1/-1; padding:100px; text-align:center; opacity:0.2; font-family:var(--font-mono); letter-spacing:0.2em;">Awaiting neural signal...</div>
                    </div>
                </div>
            </div>`;
    }

    async refreshIndex(type: string, button?: HTMLElement) {
        const url = type === 'vault' ? `http://${SYSTEM_HOST}:3004/api/vault/ingest` : `http://${SYSTEM_HOST}:3004/api/plane/sync`;
        const btn = button;
        if (!btn) return;
        const originalText = btn.textContent;
        btn.textContent = 'Refreshing...';
        btn.style.opacity = '0.5';
        
        try {
            await apiFetch(url, { method: 'POST' });
            btn.textContent = 'Complete';
            btn.style.borderColor = 'rgba(0,255,100,0.5)';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.opacity = '1';
                btn.style.borderColor = '';
                this.go('RESEARCH');
            }, 2000);
        } catch (e) {
            btn.textContent = 'Failed';
            setTimeout(() => btn.textContent = originalText, 2000);
        }
    }

    bindAbzu(query?: string) {
        const input = document.getElementById('abzu-input') as HTMLInputElement;
        if (query) { input.value = query; this.performSearch(query); }
        input.addEventListener('input', () => this.performSearch(input.value));
    }

    async performSearch(q: string) {
        if (!q) return;

        // HUD Trigger for Recommended Topics
        const topics = ['NEXUSLINK', 'RESEARCH', 'CHRONOS', 'LOGOS', 'INDRA', 'PHYSIS', 'ABZU', 'REINSTATE', 'VAULT DEBUGGER'];
        const matched = topics.find(t => q.toUpperCase().includes(t));
        if (matched && q.length > 3) {
            this.showHUD(matched);
        }

        if (this.searchTimeout) clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            const results = await apiFetch(`http://${SYSTEM_HOST}:3004/api/knowledge/search?q=${encodeURIComponent(q)}`).then(r => r.json());
            this.renderResults(results);
        }, 300);
    }

    renderResults(res: any[]) {
        const container = document.getElementById('abzu-results');
        if (container) {
            container.innerHTML = res.map((n: any) => {
                const isAgent = n.node_type === 'AGENT';
                const borderCol = isAgent ? 'var(--gold-solar)' : 'var(--cyan-dim)';
                
                return `
                <div class="neural-glass knowledge-card" data-path="${n.source_path}" data-type="${n.node_type}" data-name="${n.title}" style="cursor:pointer; margin-bottom:12px; padding:20px; transition:all 0.2s; border-left:2px solid ${borderCol}; background:rgba(118,185,0,0.02);" onmouseover="this.style.borderColor='${isAgent ? 'var(--gold-solar)' : 'var(--cyan-glow)'}'; this.style.background='rgba(118,185,0,0.05)'" onmouseout="this.style.borderColor='${borderCol}'; this.style.background='rgba(118,185,0,0.02)'">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                        <div style="font-size:0.9rem; font-weight:bold; color:var(--silver-albedo);">${n.title || 'Untitled node'}</div>
                        <span class="text-mono" style="font-size:0.55rem; opacity:0.4; background:rgba(255,255,255,0.05); padding:2px 6px; border:1px solid ${borderCol}33;">${humanizeLabel(n.node_type || 'Knowledge')}</span>
                    </div>
                    <div class="text-mono" style="font-size:0.6rem; opacity:0.5; color:${isAgent ? 'var(--gold-solar)' : 'var(--cyan-glow)'};">Domain: ${humanizeLabel(n.domain || 'Neural network')}</div>
                    ${n.tags ? `<div style="display:flex; gap:6px; margin-top:10px;">${n.tags.split(',').map((t:string) => `<span style="font-size:0.5rem; color:var(--gold-solar); opacity:0.7;">#${t.trim()}</span>`).join('')}</div>` : ''}
                    
                    ${isAgent ? `
                        <div style="margin-top:15px; display:flex; gap:10px;">
                            <button class="text-mono" style="flex:1; padding:6px; font-size:0.55rem; background:rgba(118,185,0,0.08); border:1px solid var(--gold-solar); color:var(--gold-solar); cursor:pointer;" onclick="event.stopPropagation(); window.nudimmudEngine.openAgentDetail('${n.title}')">View profile</button>
                            <button class="text-mono" style="flex:1; padding:6px; font-size:0.55rem; background:rgba(118,185,0,0.08); border:1px solid var(--cyan-glow); color:var(--cyan-glow); cursor:pointer;" onclick="event.stopPropagation(); window.nudimmudEngine.go('INDRA')">View swarm</button>
                        </div>
                    ` : `
                        <div style="margin-top:15px; display:flex; gap:10px;">
                            <button class="text-mono" style="flex:1; padding:6px; font-size:0.55rem; background:rgba(118,185,0,0.08); border:1px solid var(--cyan-glow); color:var(--cyan-glow); cursor:pointer;" onclick="event.stopPropagation(); window.nudimmudEngine.showKnowledgeHUD('${n.source_path}')">Read data</button>
                            <button class="text-mono" style="flex:1; padding:6px; font-size:0.55rem; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:white; opacity:0.6; cursor:pointer;" onclick="event.stopPropagation(); window.nudimmudEngine.openNote('${n.source_path}')">Open external</button>
                        </div>
                    `}
                </div>`;
            }).join('');
            
            document.querySelectorAll('.knowledge-card').forEach(c => {
                c.addEventListener('click', () => {
                    const type = c.getAttribute('data-type');
                    const path = c.getAttribute('data-path');
                    const name = c.getAttribute('data-name');
                    if (type === 'AGENT') {
                        this.openAgentDetail(name!);
                    } else {
                        this.openNote(path!);
                    }
                });
            });
        }
    }

    async showHUD(topic: string) {
        let hud = document.getElementById('hud-overlay');
        if (!hud) {
            hud = document.createElement('div');
            hud.className = 'neural-glass';
            hud.id = 'hud-overlay';
            hud.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); width:700px; max-height:85vh; padding:50px; background:rgba(5,7,15,0.99); border:1px solid rgba(0,242,255,0.2); z-index:10000; box-shadow:0 0 120px rgba(0,0,0,0.9); overflow-y:auto; border-radius:12px;';
            document.body.appendChild(hud);
        }
        
        const guides: any = {
            'NEXUSLINK': { title: 'NexusLink landing module', body: 'Open the public face: hero, services, launch order, and reference shelf.' },
            'CHRONOS': { title: 'Temporal analytics guide', body: 'Monitor the flow of time and mission duration. Ensure ExeoFlow sync is active for high-fidelity tracking.' },
            'LOGOS': { title: 'Strategic orchestration guide', body: 'Manage high-level project nodes. Use the Bento dashboard to visualize completion indices and workstream health.' },
            'INDRA': { title: 'Swarm monitor guide', body: 'Real-time agent telemetry. Monitor logic throughput and neural sync rings for each active specialist.' },
            'RESEARCH': { title: 'Vienna client research panel', body: 'Open the 40-target dashboard and work the actual client list, notes, and pitch state.' },
            'REINSTATE': { title: 'Mission recovery protocol', body: 'Accidentally archived a node? Open the archive in DIRECTIVE, select the ticket, and restore the mission.' },
            'VAULT_DEBUGGER': { title: 'Vault Debugger system parameters', body: 'Exploring active sync status, backend connectivity, and local obsidian REST API health.' }
        };

        const g = guides[topic.toUpperCase()] || { title: 'HUD overlay active', body: `Now exploring ${topic.replace(/_/g, ' ')} system parameters.` };
        const isDebugger = topic.toUpperCase() === 'VAULT_DEBUGGER';

        hud.innerHTML = `
            <div class="text-mono" style="font-size:0.6rem; color:var(--gold-solar); letter-spacing:0.2em; margin-bottom:20px;">HUD system interrupt // active guide</div>
            <h1 class="gradient-text" style="font-size:2.2rem; font-weight:800; margin-bottom:20px;">${g.title}</h1>
            <p style="font-size:1rem; line-height:1.6; opacity:0.8; margin-bottom:30px; color:var(--silver-albedo);">${g.body}</p>
            <div id="hud-react-mount" style="margin-bottom:40px; min-height:100px;"></div>
            <button id="hud-dismiss-btn" class="text-mono" style="width:100%; padding:18px; background:rgba(0,242,255,0.05); border:1px solid rgba(0,242,255,0.3); color:#00F2FF; cursor:pointer; font-size:0.8rem; letter-spacing:0.2em; font-weight:700; border-radius:6px; transition: all 0.3s ease;">Dismiss HUD</button>
        `;

        const dismissBtn = hud.querySelector('#hud-dismiss-btn');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                const overlay = document.getElementById('hud-overlay');
                if (overlay) overlay.remove();
                if (this.stage.dataset.module === 'ORACLE' || !this.stage.innerHTML || this.stage.innerHTML.length < 50) {
                    this.go('ORACLE');
                }
            });
        }
        
        if (isDebugger) {
            // Wait for next tick to ensure DOM is ready
            setTimeout(async () => {
                const { mountModule } = (window as any);
                if (mountModule) mountModule('VAULT_DEBUGGER', 'hud-react-mount');
            }, 0);
        }
    }

    async showKnowledgeHUD(filePath: string) {
        try {
            const data = await apiFetch(`http://${SYSTEM_HOST}:3004/api/knowledge/detail?path=${encodeURIComponent(filePath)}`).then(r => r.json());
            
            const overlay = document.createElement('div');
            overlay.id = 'knowledge-hud-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0,0,0,0.88); backdrop-filter: blur(20px);
                display: flex; align-items: center; justify-content: center;
                z-index: 20000; animation: fadeIn 0.4s ease-out;
            `;

            overlay.innerHTML = `
                <div class="neural-glass reading-panel" style="width: 85%; max-width: 1000px; padding: 60px; border: 1px solid var(--cyan-glow); position: relative; overflow: hidden; background: rgba(5,10,20,0.96); border-radius: 24px; box-shadow: 0 0 80px rgba(0,242,255,0.15);">
                    <div class="scanline" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, transparent, rgba(0,242,255,0.03), transparent); animation: scan_h 6s linear infinite; pointer-events: none;"></div>
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 1px solid rgba(0,242,255,0.2); padding-bottom: 25px;">
                        <div style="flex: 1;">
                            <div class="text-mono" style="font-size: 0.65rem; color: var(--cyan-glow); letter-spacing: 0.2em; margin-bottom: 12px; font-weight: 800;">Abzu // knowledge deep read // data stream</div>

                            <h1 style="margin: 0; font-size: 2.4rem; font-weight: 900; color: white; letter-spacing: -0.02em; line-height: 1.1;">${data.title}</h1>
                            <div class="text-mono" style="font-size: 0.6rem; opacity: 0.5; margin-top: 10px; color: var(--silver-albedo);">SOURCE: ${data.path}</div>
                        </div>
                        <div style="text-align: right; margin-left: 40px;">
                            <div class="text-mono" style="font-size: 0.6rem; color: var(--gold-solar); margin-bottom: 8px;">TAGS</div>
                            <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; max-width: 200px;">
                                ${(data.tags || []).map((t:string) => `<span class="text-mono" style="font-size: 0.5rem; background: rgba(118,185,0,0.1); border: 1px solid rgba(118,185,0,0.3); color: var(--gold-solar); padding: 2px 6px; border-radius: 4px;">#${t}</span>`).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="text-mono reading-content" style="font-size: 1.1rem; line-height: 1.9; color: rgba(255,255,255,0.9); white-space: pre-wrap; max-height: 55vh; overflow-y: auto; padding-right: 30px; scrollbar-width: thin; font-family: var(--font-mono);">${data.content}</div>

                    <div style="margin-top: 50px; display: flex; gap: 20px; justify-content: space-between; align-items: center; border-top: 1px solid rgba(0,242,255,0.1); paddingTop: 30px;">
                        <div style="display: flex; gap: 20px;">
                            <div class="text-mono" style="font-size: 0.55rem; opacity: 0.4;">
                                BACKLINKS: ${data.backlinks?.length || 0}
                            </div>
                        </div>
                        <div style="display: flex; gap: 15px;">
                            <button id="reading-open-obsidian" class="text-mono action-btn" style="padding: 14px 30px; background: rgba(0,242,255,0.1); border: 1px solid var(--cyan-glow); color: var(--cyan-glow); cursor: pointer; font-size: 0.85rem; font-weight: 900; border-radius: 8px; transition: all 0.3s;">Open in Obsidian</button>
                            <button id="reading-close-hud" class="text-mono action-btn" style="padding: 14px 30px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: white; cursor: pointer; font-size: 0.85rem; font-weight: 900; border-radius: 8px; transition: all 0.3s;">Dismiss reader</button>
                        </div>
                    </div>
                    
                    <div style="position: absolute; bottom: 20px; left: 20px; width: 40px; height: 40px; border-bottom: 4px solid var(--cyan-glow); border-left: 4px solid var(--cyan-glow); opacity: 0.4;"></div>
                    <div style="position: absolute; top: 20px; right: 20px; width: 40px; height: 40px; border-top: 4px solid var(--cyan-glow); border-right: 4px solid var(--cyan-glow); opacity: 0.4;"></div>
                </div>
                
                <style>
                    .reading-panel {
                        animation: readingPanelIn 0.6s cubic-bezier(0.23, 1, 0.32, 1);
                    }
                    @keyframes readingPanelIn { 
                        from { transform: scale(0.95) translateY(40px); opacity: 0; filter: blur(10px); } 
                        to { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); } 
                    }
                    .reading-content::-webkit-scrollbar { width: 4px; }
                    .reading-content::-webkit-scrollbar-thumb { background: var(--cyan-glow); border-radius: 10px; }
                    #reading-open-obsidian:hover { background: var(--cyan-glow) !important; color: black !important; box-shadow: 0 0 30px var(--cyan-glow); }
                    #reading-close-hud:hover { background: rgba(255,255,255,0.15) !important; }
                </style>
            `;

            document.body.appendChild(overlay);

            const openBtn = overlay.querySelector('#reading-open-obsidian');
            if (openBtn) {
                (openBtn as HTMLElement).onclick = () => {
                    this.openNote(filePath);
                };
            }

            const closeBtn = overlay.querySelector('#reading-close-hud');
            if (closeBtn) {
                (closeBtn as HTMLElement).onclick = () => {
                    overlay.style.opacity = '0';
                    overlay.style.transition = 'opacity 0.4s ease';
                    setTimeout(() => overlay.remove(), 400);
                };
            }
        } catch (e) {
            console.error('⬡ ABZU_READ_FAULT', e);
        }
    }

    // ─── CONTEXT PANEL (SINGLETON) ──────────────────────────────────────────────
    showContext(type: 'AGENT' | 'NOTE' | 'SYSTEM_OVERVIEW' | 'RAW', data: any) {
        document.body.classList.add('panel-open');
        const panel = document.getElementById('context-panel')!;
        panel.classList.add('active');

        let html = '';
        if (type === 'SYSTEM_OVERVIEW') {
            html = `<div style="padding:20px;">
                <h1 class="gradient-text" style="font-size:2rem; margin-bottom:20px;">${data.title}</h1>
                <div class="text-mono" style="font-size:0.85rem; line-height:1.7;">${data.content}</div>
            </div>`;
        } else if (type === 'RAW') {
            html = data;
        }

        panel.innerHTML = `
            <div style="padding:10px; display:flex; justify-content:flex-end;">
                <button onclick="window.nudimmudEngine.hideContext()" style="background:transparent; border:1px solid rgba(118,185,0,0.15); color:white; cursor:pointer; padding:6px 12px; font-family:var(--font-mono); font-size:0.7rem;">Close</button>
            </div>
            ${html}
        `;
    }

    hideContext() {
        document.body.classList.remove('panel-open');
        document.getElementById('context-panel')?.classList.remove('active');
    }

    async openNote(filePath: string) {
        if (!filePath) return;
        
        // Normalize legacy absolute vault roots into repo-relative note paths.
        const cleanPath = filePath
            .replace(/^\/Volumes\/[^/]+\/NUDIMMUD\//, '')
            .replace(/^\/Users\/[^/]+\/NUDIMMUD\//, '')
            .replace(/^[A-Za-z]:\//, '');
        
        // Use Obsidian REST API if possible for real-time focus
        try {
            await apiFetch(`http://${SYSTEM_HOST}:3004/api/obsidian/open`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: cleanPath })
            });
        } catch (e) {
            console.warn("⬡ OBSIDIAN_SYNC_OFFLINE :: falling back to side panel");
        }

        const note = await apiFetch(`http://${SYSTEM_HOST}:3004/api/knowledge/detail?path=${encodeURIComponent(cleanPath)}`).then(r => r.json());
        
        const html = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                <div class="text-mono" style="font-size:0.65rem; color:var(--cyan-glow); letter-spacing:0.2em;">Knowledge vault // node detail</div>
                <button onclick="window.nudimmudEngine.hideContext()" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:white; cursor:pointer; padding:6px 12px; font-family:var(--font-mono); font-size:0.7rem;">Close</button>
            </div>
            
            <h1 class="gradient-text" style="font-size:1.8rem; margin-bottom:10px; font-weight:700;">${note.title && note.title !== 'Untitled' ? note.title : cleanPath.split('/').pop()?.replace('.md', '') || 'Untitled node'}</h1>
            <div class="text-mono" style="font-size:0.6rem; opacity:0.4; margin-bottom:30px;">PATH: ${note.path}</div>

            <div style="font-family:var(--font-mono); font-size:0.85rem; line-height:1.7; opacity:0.9; white-space:pre-wrap; border-top:1px solid rgba(255,255,255,0.05); padding-top:30px;">${note.content || 'No content found.'}</div>
        `;
        this.showContext('RAW', html);
    }

    async openAgentDetail(name: string) {
        const agent = await apiFetch(`http://${SYSTEM_HOST}:3004/api/agents/detail?name=${encodeURIComponent(name)}`).then(r => r.json());
        const statusColor: any = { ACTIVE: 'var(--cyan-glow)', SYNCING: 'var(--gold-solar)', IDLE: 'var(--text-dim)' };

        const renderSparkline = (points: number[], color: string) => {
            const max = Math.max(...points) || 1;
            const path = points.map((p, i) => `${(i / (points.length - 1)) * 100},${100 - (p / max) * 100}`).join(' L ');
            return `<svg width="100%" height="30" viewBox="0 0 100 100" preserveAspectRatio="none" style="overflow:visible; filter:drop-shadow(0 0 5px ${color}55); opacity:0.6;">
                <path d="M ${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" />
            </svg>`;
        };

        const html = `
            <div style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0.02; pointer-events:none; z-index:0;">
                <svg width="100%" height="100%">
                    <pattern id="circuit" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
                        <path d="M 10 10 L 90 10 L 90 90 L 10 90 Z" fill="none" stroke="white" stroke-width="0.5" />
                        <circle cx="10" cy="10" r="2" fill="white" />
                        <circle cx="90" cy="90" r="2" fill="white" />
                    </pattern>
                    <rect width="100%" height="100%" fill="url(#circuit)" />
                </svg>
            </div>

            <div style="position:relative; z-index:1;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:30px;">
                    <div class="text-mono" style="font-size:0.6rem; color:var(--gold-solar); letter-spacing:0.2em; opacity:0.8;">Cortex interface // ${humanizeLabel(agent.name)} v4.2</div>
                    <button onclick="window.nudimmudEngine.hideContext()" style="background:transparent; border:1px solid rgba(118,185,0,0.15); color:white; cursor:pointer; padding:6px 14px; font-family:var(--font-mono); font-size:0.65rem; letter-spacing:0.1em;">Disconnect</button>
                </div>
                
                <div style="display:flex; align-items:flex-start; gap:24px; margin-bottom:40px;">
                    <div style="position:relative; flex-shrink:0;">
                        <svg width="110" height="110" viewBox="0 0 100 100" style="position:absolute; top:-15px; left:-15px; transform:rotate(-90deg); filter:drop-shadow(0 0 10px var(--gold-solar)66);">
                            <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1" />
                            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--gold-solar)" stroke-width="3" stroke-dasharray="283" stroke-dashoffset="${283 - (283 * 0.92)}" style="transition: stroke-dashoffset 2s cubic-bezier(0.4, 0, 0.2, 1);" />
                        </svg>
                        <div style="width:80px; height:80px; background:rgba(118,185,0,0.05); border:1px solid var(--gold-solar); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--gold-solar); font-weight:900; font-size:2.4rem; position:relative; z-index:2; text-shadow:0 0 20px var(--gold-solar)44;">${agent.name[0]}</div>
                    </div>
                    <div style="flex:1;">
                        <h1 class="gradient-text" style="font-size:2.8rem; margin:0 0 4px 0; font-weight:900; letter-spacing:-0.04em; line-height:1;">${agent.name}</h1>
                        <div class="text-mono" style="font-size:0.65rem; color:${statusColor[agent.status]}; opacity:0.9; letter-spacing:0.2em; margin-top:8px;">${humanizeLabel(agent.status)} // cognitive layer: ${humanizeLabel(agent.layer)}</div>
                        <div style="display:flex; gap:20px; margin-top:15px; border-top:1px solid rgba(255,255,255,0.05); padding-top:12px;">
                            <div class="text-mono" style="font-size:0.55rem; opacity:0.4;">UPTIME: 4d 12h 03m</div>
                            <div class="text-mono" style="font-size:0.55rem; opacity:0.4;">MEMORY: 1.2GB/4GB</div>
                        </div>
                    </div>
                </div>

                <!-- DYNAMIC MISSION TIMELINE -->
                <div class="neural-glass" style="background:rgba(0,0,0,0.4); padding:24px; border:1px solid rgba(255,255,255,0.05); margin-bottom:30px;">
                    <h3 class="text-mono" style="font-size:0.7rem; color:var(--gold-solar); margin-bottom:20px; letter-spacing:0.1em; display:flex; justify-content:space-between;">
                        <span>Active mission stream</span>
                        <span style="opacity:0.4;">Sync ok</span>
                    </h3>
                    <div style="position:relative; padding-left:20px; border-left:2px solid rgba(255,255,255,0.03);">
                        <div style="position:relative; margin-bottom:18px;">
                            <div style="position:absolute; left:-26px; top:4px; width:10px; height:10px; border-radius:3px; background:var(--cyan-glow); box-shadow:0 0 15px var(--cyan-glow);"></div>
                            <div class="text-mono" style="font-size:0.65rem; color:var(--cyan-glow);">01: Scan T7 filesystem [complete]</div>
                        </div>
                        <div style="position:relative; margin-bottom:18px;">
                            <div style="position:absolute; left:-26px; top:4px; width:10px; height:10px; border-radius:3px; background:var(--gold-solar); box-shadow:0 0 15px var(--gold-solar); animation: pulse 1s infinite;"></div>
                            <div class="text-mono" style="font-size:0.65rem; color:var(--gold-solar);">02: Vector embedding generation [active]</div>
                            <div style="height:3px; background:rgba(255,255,255,0.05); margin-top:10px; width:100%; border-radius:2px; overflow:hidden;">
                                <div style="height:100%; width:78%; background:var(--gold-solar); box-shadow:0 0 15px var(--gold-solar);"></div>
                            </div>
                        </div>
                        <div style="position:relative; opacity:0.2;">
                            <div style="position:absolute; left:-26px; top:4px; width:10px; height:10px; border-radius:50%; background:rgba(255,255,255,0.2);"></div>
                            <div class="text-mono" style="font-size:0.65rem;">03: Directive mapping synergy [standby]</div>
                        </div>
                    </div>
                </div>

                <!-- MEMORY VAULT EXPLORER -->
                <h3 class="text-mono" style="font-size:0.7rem; color:var(--cyan-glow); margin-bottom:20px; letter-spacing:0.1em;">Memory vault fragments</h3>
                <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-bottom:30px;">
                    ${['CONTEXT_A', 'NODE_99', 'LOGS_v2', 'SYSTEM_H', 'M_DRIVE', 'SYNC_L'].map(m => `
                        <div class="neural-glass" style="padding:15px 10px; background:rgba(118,185,0,0.02); border:1px solid rgba(118,185,0,0.08); text-align:center; transition:all 0.2s; cursor:pointer;" onmouseover="this.style.borderColor='var(--cyan-glow)'; this.style.background='rgba(118,185,0,0.05)'" onmouseout="this.style.borderColor=''; this.style.background='rgba(118,185,0,0.02)'">
                            <div class="text-mono" style="font-size:0.55rem; color:var(--cyan-glow); margin-bottom:4px;">${humanizeLabel(m)}</div>
                            <div style="width:20px; height:2px; background:var(--cyan-glow); margin:0 auto; opacity:0.3;"></div>
                        </div>
                    `).join('')}
                </div>

                <!-- NEURAL DIRECT-LINK (COMMAND TERMINAL) -->
                <div class="neural-glass" style="background:rgba(0,0,0,0.6); padding:20px; border:1px solid rgba(118,185,0,0.15); margin-top:40px;">
                    <div class="text-mono" style="font-size:0.6rem; color:var(--gold-solar); margin-bottom:15px; opacity:0.6; display:flex; align-items:center; gap:8px;">
                        <span style="width:6px; height:6px; background:var(--gold-solar); border-radius:50%; animation: pulse 1.5s infinite;"></span> Neural direct link
                    </div>
                    <div style="display:flex; gap:12px;">
                        <span class="text-mono" style="color:var(--gold-solar); font-size:0.8rem;">></span>
                        <input type="text" placeholder="Enter a directive override..." style="flex:1; background:transparent; border:none; color:var(--silver-albedo); font-family:var(--font-mono); font-size:0.75rem; outline:none;" onkeydown="if(e.key==='Enter'){alert('Directive injected: '+this.value); this.value=''}">
                    </div>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-top:30px;">
                    <button class="text-mono" style="padding:16px; background:rgba(118,185,0,0.08); border:1px solid var(--cyan-glow); color:var(--cyan-glow); cursor:pointer; font-size:0.7rem; letter-spacing:0.1em;" onclick="alert('Neural calibration initiated')">Calibrate neural weights</button>
                    <button class="text-mono" style="padding:16px; background:rgba(118,185,0,0.08); border:1px solid var(--gold-solar); color:var(--gold-solar); cursor:pointer; font-size:0.7rem; letter-spacing:0.1em;" onclick="alert('Memory vault dump complete')">Sync memory vault</button>
                </div>
            </div>
        `;
        this.showContext('RAW', html);
    }


    showHolographicResult(response: any) {
        if (!shouldShowMissionSynthesis(response)) {
            return;
        }
        const overlay = document.createElement('div');
        overlay.id = 'holographic-result-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.92); backdrop-filter: blur(25px);
            display: flex; align-items: center; justify-content: center;
            z-index: 20000; animation: fadeIn_h 0.6s ease-out;
        `;

        const content = response?.final_summary || response?.content || 'Directive processed.';
        const telemetry = deriveOracleTelemetry(response);
        const syncLevel = 94 + Math.random() * 5;
        
        overlay.innerHTML = `
            <div class="neural-glass holographic-panel" style="width: 90%; max-width: 1100px; padding: 60px; border: 1px solid var(--gold-solar); position: relative; overflow: hidden; background: rgba(5,10,20,0.98); border-radius: 30px; box-shadow: 0 0 100px rgba(118, 185, 0, 0.2);">
                <div class="scanline" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, transparent, rgba(118,185,0,0.04), transparent); animation: scan_h 8s linear infinite; pointer-events: none;"></div>
                
                <div style="display: grid; grid-template-columns: 1fr 350px; gap: 40px;">
                    <!-- Content left -->
                    <div style="display:flex; flex-direction:column;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 1px solid rgba(118,185,0,0.2); padding-bottom: 25px;">
                            <div>
                        <div class="text-mono" style="font-size: 0.7rem; color: var(--gold-solar); letter-spacing: 0.5em; margin-bottom: 12px; font-weight: 800;">Neural synthesis matrix // Rubedo system</div>
                                <h1 style="margin: 0; font-size: 2.2rem; font-weight: 900; color: white; letter-spacing: -0.03em; line-height: 1.1;">Mission Synthesis</h1>
                            </div>
                        </div>

                        <div class="text-mono result-content" style="font-size: 1.15rem; line-height: 1.9; color: rgba(255,255,255,0.95); white-space: pre-wrap; max-height: 50vh; overflow-y: auto; padding-right: 30px; scrollbar-width: thin; font-family: var(--font-mono);">
                            ${content}
                        </div>
                    </div>

                    <!-- Visual input right (multi-sensory assistance) -->
                    <div style="border-left: 1px solid rgba(255,255,255,0.05); padding-left: 40px; display: flex; flex-direction: column; gap: 35px;">
                        <!-- Sync gauge -->
                        <div>
                            <div class="text-mono" style="font-size: 0.6rem; opacity: 0.5; margin-bottom: 15px; letter-spacing: 0.2em;">Neural sync coherence</div>
                            <div style="height: 10px; background: rgba(255,255,255,0.05); border-radius: 5px; overflow: hidden; position: relative;">
                                <div style="width: ${syncLevel}%; height: 100%; background: linear-gradient(90deg, var(--cyan-glow), var(--gold-solar)); box-shadow: 0 0 15px var(--cyan-glow); animation: growWidth_h 1.5s ease-out;"></div>
                            </div>
                            <div class="text-mono" style="font-size: 1rem; font-weight: 900; color: var(--gold-solar); margin-top: 10px; text-align: right;">${syncLevel.toFixed(2)}%</div>
                        </div>

                        <!-- Deliberation density chart -->
                        <div>
                            <div class="text-mono" style="font-size: 0.6rem; opacity: 0.5; margin-bottom: 20px; letter-spacing: 0.2em;">Agent deliberation weights</div>
                            <div style="display: flex; align-items: flex-end; gap: 15px; height: 120px;">
                                ${['ENLIL', 'NABU', 'ENKI', 'INANNA'].map(agent => `
                                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                                        <div style="width: 100%; height: ${30 + Math.random() * 70}%; background: rgba(0, 242, 255, 0.15); border: 1px solid var(--cyan-glow); border-radius: 4px; animation: growHeight_h ${1 + Math.random()}s ease-out;"></div>
                                        <div class="text-mono" style="font-size: 0.45rem; opacity: 0.4;">${agent}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- Entropy visualizer -->
                        <div style="flex: 1; border: 1px solid rgba(118, 185, 0, 0.1); border-radius: 12px; background: rgba(0,0,0,0.3); display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative;">
                            <canvas id="entropy-viz-canvas" width="250" height="150" style="opacity: 0.6;"></canvas>
                            <div class="text-mono" style="position: absolute; bottom: 15px; font-size: 0.5rem; opacity: 0.3; letter-spacing: 0.3em;">Entropy flow steady</div>
                        </div>

                        <div style="margin-top: auto;">
                            <button class="text-mono holographic-close-btn" style="width: 100%; padding: 18px; background: rgba(118,185,0,0.08); border: 1px solid var(--gold-solar); color: var(--gold-solar); cursor: pointer; font-size: 1rem; font-weight: 900; border-radius: 10px; transition: all 0.3s; letter-spacing: 0.2em;">Close mission matrix</button>
                        </div>
                    </div>
                </div>
                
                <div style="position: absolute; bottom: 25px; left: 25px; width: 50px; height: 50px; border-bottom: 5px solid var(--gold-solar); border-left: 5px solid var(--gold-solar); opacity: 0.4;"></div>
                <div style="position: absolute; top: 25px; right: 25px; width: 50px; height: 50px; border-top: 5px solid var(--gold-solar); border-right: 5px solid var(--gold-solar); opacity: 0.4;"></div>
            </div>
            
            <style>
                @keyframes fadeIn_h { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scan_h { from { transform: translateY(-100%); } to { transform: translateY(100%); } }
                @keyframes growWidth_h { from { width: 0; } }
                @keyframes growHeight_h { from { height: 0; } }
                .holographic-panel {
                    box-shadow: 0 0 120px rgba(118, 185, 0, 0.15), inset 0 0 50px rgba(118, 185, 0, 0.03);
                    animation: panelSlide_h 0.7s cubic-bezier(0.23, 1, 0.32, 1);
                }
                @keyframes panelSlide_h { 
                    from { transform: scale(0.92) translateY(50px); opacity: 0; filter: blur(10px); } 
                    to { transform: scale(1) translateY(0); opacity: 1; filter: blur(0); } 
                }
                .holographic-close-btn:hover { 
                    background: var(--gold-solar) !important; 
                    color: black !important; 
                    box-shadow: 0 0 40px var(--gold-solar);
                    transform: translateY(-2px);
                }
                .result-content::-webkit-scrollbar { width: 4px; }
                .result-content::-webkit-scrollbar-thumb { background: var(--gold-solar); border-radius: 10px; }
            </style>
        `;

        document.body.appendChild(overlay);

        // Start Entropy Animation
        const canvas = overlay.querySelector('#entropy-viz-canvas') as HTMLCanvasElement;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                let frame = 0;
                const draw = () => {
                    if (!document.getElementById('holographic-result-overlay')) return;
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.strokeStyle = 'rgba(118, 185, 0, 0.4)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    for (let i = 0; i < canvas.width; i++) {
                        const y = canvas.height / 2 + Math.sin(i * 0.05 + frame * 0.1) * 20 * Math.sin(frame * 0.02);
                        if (i === 0) ctx.moveTo(i, y);
                        else ctx.lineTo(i, y);
                    }
                    ctx.stroke();
                    frame++;
                    requestAnimationFrame(draw);
                };
                draw();
            }
        }

        const closeBtn = overlay.querySelector('.holographic-close-btn');
        if (closeBtn) {
            (closeBtn as HTMLElement).onclick = () => {
                overlay.style.opacity = '0';
                overlay.style.transition = 'opacity 0.4s ease';
                setTimeout(() => overlay.remove(), 400);
            };
        }
    }



    // ─── LOGOS ──────────────────────────────────────────────────────────────────
    async logosHTML() {
        const projects = await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/projects`).catch(() => []);
        const tickets = await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/tickets`).catch(() => []);

        const cards = projects.map((p: any) => {
            const progress = p.progress || 0;
            const statusCol = progress > 80 ? 'var(--cyan-glow)' : (progress > 30 ? 'var(--gold-solar)' : 'rgba(255,255,255,0.2)');
            
            return `
            <div class="neural-glass" style="padding:30px; border-top: 2px solid ${statusCol}; cursor:pointer; position:relative; overflow:hidden;" onclick="window.nudimmudEngine.openNote('${p.path || ''}')">
                <div style="position:absolute; top:-10px; right:-10px; font-size:4rem; opacity:0.03; font-weight:900; pointer-events:none;">${p.name[0]}</div>
                
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
                    <div>
                        <div class="text-mono" style="font-size:0.6rem; color:${statusCol}; letter-spacing:0.1em; margin-bottom:5px;">Project node // ${humanizeLabel(p.status)}</div>
                        <h2 style="font-size:1.4rem; margin:0; font-weight:700;">${p.name}</h2>
                    </div>
                    <div class="text-mono" style="font-size:1.1rem; font-weight:bold; color:${statusCol};">${progress}%</div>
                </div>

                <p class="text-mono" style="font-size:0.75rem; opacity:0.6; line-height:1.6; margin-bottom:25px; height:45px; overflow:hidden;">${p.description || 'No directive description provided.'}</p>

                <div class="telemetry-bar-bg" style="height:4px; margin-bottom:20px;">
                    <div class="telemetry-bar-fill" style="width:${progress}%; background:${statusCol}; box-shadow:0 0 10px ${statusCol}44;"></div>
                </div>

                <div style="display:flex; gap:15px; border-top:1px solid rgba(255,255,255,0.05); padding-top:20px;">
                    <div class="text-mono" style="font-size:0.55rem;">
                        <div style="opacity:0.3;">Deadline</div>
                        <div style="color:var(--silver-albedo);">${p.deadline || 'Open timeline'}</div>
                    </div>
                    <div class="text-mono" style="font-size:0.55rem;">
                        <div style="opacity:0.3;">Resource nodes</div>
                        <div style="color:var(--cyan-glow);">${p.resource_count || 0} ITEMS</div>
                    </div>
                </div>
            </div>`;
        }).join('');

        return `
            <header style="margin-bottom:50px; display:flex; justify-content:space-between; align-items:flex-end;">
                <div>
                    <h1 class="text-mono glow-text" style="color:var(--cyan-glow); letter-spacing:0.2em; font-size:2.2rem; margin-bottom:12px;">Logos // Project matrix</h1>
                    <p class="text-mono" style="font-size:0.75rem; opacity:0.5; border-left:2px solid var(--cyan-glow); padding-left:15px;">Strategic project orchestration layer // real-time flow</p>
                </div>
                <div class="text-mono" style="font-size:0.65rem; opacity:0.4; text-align:right;">
                    Active streams: ${projects.length}<br>
                    Plane nodes: ${tickets.length}
                </div>
            </header>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap:30px;">${cards || renderEmptyStatePanel('No projects yet', 'Project records are empty or the backend is offline.', 'var(--gold-solar)')}</div>
        `;
    }



    // ─── PHYSIS ─────────────────────────────────────────────────────────────────
    async physisHTML() {
        const files = await apiFetch(`http://${SYSTEM_HOST}:3004/api/files/ls?path=${encodeURIComponent(this.currentPath)}`).then(r => r.json()).catch(() => []);
        const parts = this.currentPath.split('/').filter(p => p);

        // Breadcrumb
        let crumbs = `<span class="breadcrumb-item" data-path="">⬡ ROOT</span>`;
        let tp = '';
        parts.forEach(p => {
            tp += (tp ? '/' : '') + p;
            crumbs += `<span style="opacity:0.2;margin:0 6px;">/</span><span class="breadcrumb-item" data-path="${tp}">${p}</span>`;
        });

        const folderSVG = `<svg viewBox="0 0 24 24" width="36" height="36" style="display:block;margin:0 auto;fill:var(--cyan-glow);filter:drop-shadow(0 0 6px rgba(0,242,255,0.5));">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
        </svg>`;

        const fileSVG = `<svg viewBox="0 0 24 24" width="36" height="36" style="display:block;margin:0 auto;fill:rgba(255,255,255,0.35);">
            <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
        </svg>`;

        const cards = files.map((f: any) => `
            <div class="file-node" data-path="${f.path}" data-is-dir="${f.isDirectory}">
                <div style="margin-bottom:12px;">${f.isDirectory ? folderSVG : fileSVG}</div>
                <div class="vault-name">${f.name}</div>
                <div class="vault-meta">${f.isDirectory ? 'Layer' : humanizeLabel(f.name.split('.').pop()?.toUpperCase() ?? 'File')}</div>
            </div>`).join('');

        return `
            <div class="breadcrumb-bar" style="margin-bottom:24px;">${crumbs}</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;">
                ${cards || renderEmptyStatePanel('No files found', 'This folder has no visible notes or folders.', 'var(--gold-solar)')}
            </div>`;
    }

    bindPhysis() {
        document.querySelectorAll('.file-node').forEach(n => n.addEventListener('click', () => {
            const path = n.getAttribute('data-path')!;
            if (n.getAttribute('data-is-dir') === 'true') { this.currentPath = path; this.go('PHYSIS'); }
            else if (path.endsWith('.md')) this.openNote(path);
        }));
        document.querySelectorAll('.breadcrumb-item').forEach(b => b.addEventListener('click', () => { this.currentPath = b.getAttribute('data-path')!; this.go('PHYSIS'); }));
    }

    // ─── DIRECTIVE (ACTION MANUAL) ─────────────────────────────────────────────
    async directiveHTML() {
        const tickets = await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/tickets`).catch(() => []);
        
        // Filter out completed, sort by priority
        const active = tickets.filter((t: any) => t.status !== 'DONE' && t.status !== 'COMPLETED');
        const completed = tickets.filter((t: any) => t.status === 'DONE' || t.status === 'COMPLETED');

        const urgent = active.filter((t: any) => t.priority === 'URGENT');
        const high = active.filter((t: any) => t.priority === 'HIGH');

        // Group completed by date
        const archivesByDate = completed.reduce((acc: any, t: any) => {
            const dateStr = new Date(t.updated_at || t.created_at || Date.now()).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            if (!acc[dateStr]) acc[dateStr] = [];
            acc[dateStr].push(t);
            return acc;
        }, {});

        // Formulate actionable sequences
        const formatTask = (t: any, index: number, isCritical: boolean) => `
            <div class="neural-glass" style="padding: 24px; margin-bottom: 16px; border-left: 3px solid ${isCritical ? 'var(--red-fusion)' : 'var(--cyan-glow)'}; cursor:pointer;" onclick="window.nudimmudEngine.openNote('${t.path || ''}')" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <span class="text-mono" style="font-size:0.6rem; color: ${isCritical ? 'var(--red-fusion)' : 'var(--cyan-glow)'}; letter-spacing:0.1em;">Step ${String(index + 1).padStart(2, '0')} // ${t.external_id} // ${humanizeLabel(t.status)}</span>
                    <div style="display:flex; gap:8px;">
                        <button class="btn-update-ticket text-mono" data-id="${t.external_id}" data-status="DONE" onclick="event.stopPropagation();" style="background:rgba(0,255,100,0.05); border:1px solid rgba(0,255,100,0.3); color:rgba(0,255,100,0.8); padding:4px 10px; font-size:0.55rem; cursor:pointer;">Mark complete</button>
                    </div>
                </div>
                <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px; line-height:1.4;">${t.title}</div>
                <div class="text-mono" style="font-size:0.6rem; opacity:0.4;">Assigned: ${t.assigned_to || 'Unassigned'} // ${t.project_name || 'General'}</div>
            </div>`;

        return `
            <header style="display:flex; justify-content:space-between; align-items:center; margin-bottom:50px;">
                <div>
                    <h1 class="text-mono glow-text" style="color:var(--cyan-glow); letter-spacing:0.2em; font-size:1.8rem; margin-bottom:8px;">Directive // Execution pipeline</h1>
                    <p class="text-mono" style="font-size:0.7rem; opacity:0.4;">Actionable sequence generation // active queue</p>
                </div>
                <div class="text-mono" style="font-size:0.65rem; color:var(--silver-albedo); opacity:0.6; padding:8px 16px; border:1px solid rgba(255,255,255,0.1); border-radius:4px;">Sync streams: active</div>
            </header>
            
            <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap: 40px;">
                <!-- PRIMARY TARGETS -->
                <div>
                    <h4 style="font-family:var(--font-mono); font-size:0.7rem; color:var(--gold-solar); margin-bottom:20px; letter-spacing:0.15em; border-bottom: 1px solid rgba(118,185,0,0.2); padding-bottom:10px;">Critical directives</h4>
                    ${urgent.length > 0 ? urgent.map((t: any, i: number) => formatTask(t, i, true)).join('') : renderEmptyStatePanel('No critical targets', 'Nothing is urgent right now.', 'var(--gold-solar)')}
                    
                    <h4 style="font-family:var(--font-mono); font-size:0.7rem; color:var(--cyan-glow); margin-top:40px; margin-bottom:20px; letter-spacing:0.15em; border-bottom: 1px solid rgba(118,185,0,0.2); padding-bottom:10px;">Active queue</h4>
                    ${high.length > 0 ? high.map((t: any, i: number) => formatTask(t, i, false)).join('') : renderEmptyStatePanel('No queued directives', 'Active work is clear for now.') }
                </div>

                <!-- STRATEGIC GUIDANCE PANEL -->
                <div>
                    <div class="neural-glass" style="padding:30px; border-color:var(--gold-solar); background:rgba(118,185,0,0.03); cursor:pointer;" data-tooltip="View live system health and neural stability metrics" onclick="window.nudimmudEngine.showContext('SYSTEM_OVERVIEW', { title: 'System Intelligence', content: 'Operational efficiency is at 94%. Neural density is optimal. Swarm sync is holding steady at 99.8% stability.' })">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <h4 class="text-mono" style="font-size:0.75rem; color:var(--gold-solar); margin:0;">System intelligence</h4>
                            <div class="pulse-ring" style="width:10px; height:10px; background:var(--gold-solar); border-radius:50%;"></div>
                        </div>
                        <p style="font-size:0.9rem; line-height:1.7; opacity:0.9; margin-bottom:20px;">
                            Current analysis shows <strong style="color:var(--red-fusion);">${urgent.length} urgent nodes</strong> requiring immediate cognitive cycles. Your overall project velocity is <strong style="color:var(--cyan-glow);">+12%</strong> compared to the last temporal sync.
                        </p>
                        <div class="text-mono" style="font-size:0.6rem; opacity:0.4; text-align:right;">Click for deep analytics</div>
                    </div>

                    <div class="neural-glass" style="margin-top:30px; padding:30px; background:rgba(118,185,0,0.03);" data-tooltip="Historical record of successful missions">
                        <h4 class="text-mono" style="font-size:0.7rem; margin-bottom:20px; opacity:0.6;">Mission history</h4>
                        <div style="max-height:400px; overflow-y:auto; padding-right:15px;">
                        ${Object.keys(archivesByDate).length > 0 ? Object.keys(archivesByDate).map(date => `
                            <div style="margin-bottom:24px;">
                                <div class="text-mono" style="font-size:0.55rem; color:var(--cyan-dim); border-bottom:1px solid rgba(118,185,0,0.1); padding-bottom:8px; margin-bottom:12px;">${date}</div>
                                ${archivesByDate[date].map((t:any) => `
                                    <div class="archive-ticket" data-ticket='${JSON.stringify({id:t.id,title:t.title,external_id:t.external_id,priority:t.priority,updated_at:t.updated_at}).replace(/'/g,"&#39;").replace(/"/g,"&quot;")}' style="font-size:0.75rem; opacity:0.7; margin-bottom:10px; display:flex; align-items:flex-start; gap:12px; cursor:pointer; padding:8px; border-radius:4px; transition:all 0.2s;" onmouseover="this.style.background='rgba(0,255,100,0.05)';this.style.opacity='1'" onmouseout="this.style.background='';this.style.opacity='0.7'">
                                        <span style="color:rgba(0,255,100,0.8); flex-shrink:0;">✓</span>
                                        <span style="flex:1;">${t.title} <span class="text-mono" style="font-size:0.55rem; opacity:0.4; margin-left:8px;">${t.external_id}</span></span>
                                    </div>
                                `).join('')}
                            </div>
                        `).join('') : renderEmptyStatePanel('Awaiting first completion', 'Completed directives will appear here.', 'var(--gold-solar)')}
                        </div>
                    </div>
                </div>
            </div>`;
    }


    bindDirective() {
        document.querySelectorAll('.btn-update-ticket').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const el = e.target as HTMLElement;
                const id = el.getAttribute('data-id');
                const status = el.getAttribute('data-status');
                if (!id || !status) return;

                el.textContent = 'Updating...';
                el.style.opacity = '0.5';

                try {
                    await apiFetch(`http://${SYSTEM_HOST}:3004/api/tickets/${id}/status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status })
                    });
                    this.go('DIRECTIVE'); // Refresh layout
                } catch (err) {
                    el.textContent = 'Error';
                    el.style.background = 'red';
                }
            });
        });

        document.querySelectorAll('.archive-ticket').forEach(el => {
            el.addEventListener('click', (e) => {
                const target = e.currentTarget as HTMLElement;
                const raw = target.getAttribute('data-ticket');
                if (raw) {
                    // Decode HTML entities injected by template literal escaping
                    const decoded = raw.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                    (window as any).missionSidebar.open(JSON.parse(decoded));
                }
            });
        });
    }

    // ─── TICKETS ────────────────────────────────────────────────────────────────

    // ─── TICKETS (SWARM_TICKETS) ─────────────────────────────────────────────
    async ticketsHTML() {
        const tickets = await this.fetchCached(`http://${SYSTEM_HOST}:3004/api/tickets`).catch(() => []);
        const view = this.currentTicketView;

        const header = `
            <header style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:40px;">
                <div>
                    <h1 class="text-mono glow-text" style="color:var(--cyan-glow); letter-spacing:0.2em; font-size:1.8rem; margin-bottom:8px;">Tickets // Work queue</h1>
                    <p class="text-mono" style="font-size:0.7rem; opacity:0.4;">Multi-mode visualization // ${humanizeLabel(view)} active</p>
                </div>
                <div style="display:flex; gap:10px; background:rgba(255,255,255,0.03); padding:5px; border-radius:4px;">
                    ${['LIST', 'COLUMNS', 'PIPELINE'].map(m => `
                        <button class="text-mono" style="padding:8px 16px; font-size:0.6rem; background:${view === m ? 'var(--cyan-glow)' : 'transparent'}; color:${view === m ? '#0a0d1a' : 'white'}; border:none; cursor:pointer; font-weight:${view === m ? 'bold' : 'normal'}; transition:all 0.2s;" onclick="window.nudimmudEngine.switchTicketView('${m}')">${humanizeLabel(m)}</button>
                    `).join('')}
                </div>
            </header>
        `;

        let content = '';

        if (view === 'LIST') {
            content = tickets.length > 0 ? `<div class="panel" style="padding:0; background:transparent; border:none;">
                <div style="display:grid; grid-template-columns: 100px 1fr 100px 150px; padding:15px; border-bottom:1px solid rgba(118,185,0,0.08); opacity:0.4; font-size:0.65rem;" class="text-mono">
                    <span>ID</span><span>TITLE</span><span>PRIORITY</span><span>STATUS</span>
                </div>
                ${tickets.map((t: any) => `
                    <div style="display:grid; grid-template-columns: 100px 1fr 100px 150px; padding:20px 15px; border-bottom:1px solid rgba(118,185,0,0.03); cursor:pointer;" class="ticket-row" data-id="${t.external_id}" onmouseover="this.style.background='rgba(118,185,0,0.02)'" onmouseout="this.style.background=''">
                        <span class="text-mono" style="font-size:0.75rem; color:var(--cyan-glow);">${t.external_id}</span>
                        <span style="font-size:0.95rem; font-weight:500;">${t.title}</span>
                        <span class="text-mono" style="font-size:0.65rem; color:${t.priority === 'URGENT' ? 'var(--red-fusion)' : 'inherit'}">${humanizeLabel(t.priority)}</span>
                        <span class="text-mono" style="font-size:0.65rem; opacity:0.6;">${humanizeLabel(t.status)}</span>
                    </div>
                `).join('')}
            </div>` : renderEmptyStatePanel('No tickets yet', 'The work queue is empty or not available right now.', 'var(--gold-solar)');
        } else if (view === 'COLUMNS') {
            const columns = {
                'TODO': tickets.filter((t:any) => ['todo', 'backlog', 'unstarted'].includes(String(t.status).toLowerCase())),
                'ACTIVE': tickets.filter((t:any) => ['in_progress', 'started', 'doing'].includes(String(t.status).toLowerCase())),
                'DONE': tickets.filter((t:any) => ['done', 'completed', 'finished'].includes(String(t.status).toLowerCase())),
            };
            content = tickets.length > 0 ? `<div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:20px; min-height:600px;">
                ${Object.entries(columns).map(([name, items]) => `
                    <div class="neural-glass" style="display:flex; flex-direction:column; padding:20px; background:rgba(118,185,0,0.02);">
                        <h4 class="text-mono" style="font-size:0.7rem; color:var(--gold-solar); margin-bottom:20px; border-bottom:1px solid rgba(118,185,0,0.12); padding-bottom:10px;">${humanizeLabel(name)} (${items.length})</h4>
                        <div style="flex:1;">
                            ${items.map((t:any) => `
                                <div class="neural-glass ticket-row" data-id="${t.external_id}" style="padding:15px; margin-bottom:12px; background:rgba(118,185,0,0.03); cursor:pointer; border-left:2px solid ${t.priority === 'URGENT' ? 'var(--red-fusion)' : 'var(--cyan-glow)'};">
                            <div class="text-mono" style="font-size:0.55rem; opacity:0.4; margin-bottom:6px;">${t.external_id}</div>
                            <div style="font-size:0.85rem; font-weight:600; line-height:1.4;">${t.title}</div>
                        </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>` : renderEmptyStatePanel('No ticket columns to show', 'Tickets will appear here once work enters the queue.', 'var(--cyan-glow)');
        } else if (view === 'PIPELINE') {
            content = tickets.length > 0 ? `<div style="position:relative; padding:20px 0;">
                <div style="position:absolute; left:40px; top:0; bottom:0; width:2px; background:rgba(118,185,0,0.08);"></div>
                ${tickets.slice(0, 15).map((t:any, i:number) => `
                    <div style="position:relative; padding-left:80px; margin-bottom:30px; cursor:pointer;" class="ticket-row" data-id="${t.external_id}">
                        <div style="position:absolute; left:33px; top:0; width:16px; height:16px; border-radius:3px; background:${t.status === 'DONE' ? 'var(--cyan-glow)' : 'var(--gold-solar)'}; box-shadow:0 0 10px ${t.status === 'DONE' ? 'var(--cyan-glow)' : 'var(--gold-solar)'}; border:4px solid #0a0d1a;"></div>
                        <div class="neural-glass" style="padding:20px; border-color:${t.priority === 'URGENT' ? 'var(--red-fusion)' : 'rgba(118,185,0,0.08)'}; background:rgba(118,185,0,0.02);">
                        <div class="text-mono" style="font-size:0.55rem; opacity:0.4; margin-bottom:5px;">Step ${String(i + 1).padStart(2, '0')} // ${t.external_id}</div>
                            <div style="font-size:1.1rem; font-weight:600;">${t.title}</div>
                            <div class="text-mono" style="font-size:0.6rem; color:var(--cyan-glow); margin-top:8px;">${humanizeLabel(t.status)} // ${humanizeLabel(t.priority)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>` : renderEmptyStatePanel('No pipeline yet', 'Queued work will form a timeline here.', 'var(--gold-solar)');
        }

        return header + content;
    }

    switchTicketView(mode: string) {
        this.currentTicketView = mode;
        this.go('TICKETS');
    }

    bindTickets() {
        document.querySelectorAll('.ticket-row').forEach(row => {
            row.addEventListener('click', () => {
                const id = row.getAttribute('data-id');
                if (id) this.go('DIRECTIVE'); 
            });
        });
    }
}

window.addEventListener('DOMContentLoaded', () => {
    (window as any).nudimmudEngine = new NudimmudEngine();

    // Mount token status bar in footer
    const tokenBarEl = document.getElementById('react-token-status-bar');
    if (tokenBarEl) {
        Promise.all([
            import('./components/TokenStatusBar'),
            import('react-dom/client'),
            import('react')
        ]).then(([{ default: TokenStatusBar }, { createRoot }, React]) => {
            createRoot(tokenBarEl).render(React.createElement(TokenStatusBar));
        }).catch(() => {});
    }
});

function normalizeCacheKey(url: string) {
    const normalized = new URL(url, API_ORIGINS[0]);
    return `${normalized.pathname}${normalized.search}`;
}
