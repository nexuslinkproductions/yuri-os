// Generates demos/data/circuitry-graph.js from YURI's REAL **die view** — the MERGE
// that shows the ENTIRE system: _SYSTEM/../yuri-die-graph.json (242 nodes = code organs
// + flow peripherals). Grouped by `layer` (10 layers, full coverage; sector is null on
// ~114 peripheral nodes so it can't group the whole system). Emitted as a window global
// so the demo loads it via <script> on file:// (no fetch/CORS).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', '02_RESOURCES', 'RESEARCH', 'yuri-die-graph.json');
const DATA_DIR = join(__dirname, '..', 'data');
const OUT = join(DATA_DIR, 'circuitry-graph.js');

// curated categorical palette for the 10 layers (intentional, high-contrast on dark)
const LAYER_COLOR = {
  'Energy & Math': '#ff7a3c',
  'Cognition & Persona': '#c084fc',
  'Token-Efficiency & Session': '#38d9a9',
  'Hidden / Meta / Self-referential': '#f06595',
  'Retrieval & Knowledge': '#4dabf7',
  'Governance & Safety': '#ffd43b',
  'Self-Improvement': '#69db7c',
  'Skills & Orchestration': '#ff8787',
  'Memory & Subconscious': '#74c0fc',
  'Learning & Continuity': '#b197fc',
};
const FALLBACK = '#8aa0c6';

const g = JSON.parse(readFileSync(SRC, 'utf8'));

const nodes = g.nodes.map(n => ({
  id: n.id,
  label: n.label || n.id,
  group: n.layer || 'unassigned',  // layer = full-coverage hierarchy
  kind: n.kind || 'die',           // die (code organ) vs peripheral (flow)
}));
const ids = new Set(nodes.map(n => n.id));

// keep only real node→node edges (drop the ~82 edges whose target is a file path)
const edges = (g.edges || g.links)
  .map(e => ({ source: e.source ?? e.from, target: e.target ?? e.to, type: e.kind || e.type || 'calls' }))
  .filter(e => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);

// group order = by node count desc (biggest layers first) for a balanced ring
const counts = {};
for (const n of nodes) counts[n.group] = (counts[n.group] || 0) + 1;
const groups = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
const groupColor = {};
for (const grp of groups) groupColor[grp] = LAYER_COLOR[grp] || FALLBACK;

const payload = {
  meta: `YURI die view (the MERGE — entire system) — ${nodes.length} nodes / ${edges.length} node-edges / ${groups.length} layers · kinds: die+peripheral`,
  groups, groupColor, nodes, edges,
};
mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(OUT, 'window.GRAPH = ' + JSON.stringify(payload) + ';\n');
console.log(`wrote ${OUT}\nnodes=${nodes.length} node-edges=${edges.length} layers=${groups.length}`);
console.log('layers:', groups.map(grp => `${grp}(${counts[grp]})`).join(', '));
