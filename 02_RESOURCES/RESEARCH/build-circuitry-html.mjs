#!/usr/bin/env node
// build-circuitry-html.mjs
// Reproducible generator: reads the prose-backfilled circuitry graph and emits a
// self-contained, zero-dependency interactive visualization of the YURI organ map —
// the flagship "living circuitry" platform.
//
//   node 02_RESOURCES/RESEARCH/build-circuitry-html.mjs
//
// Source of truth : 02_RESOURCES/RESEARCH/yuri-circuitry-graph.json (83 nodes / 153 edges, 100% prose)
// Design language : Nexus Link "Forge & Thread" bespoke system (--nx-* namespace), as established by
//                   _SYSTEM/reports/NEXUS_LINK_REVENUE_PLAN_2026-05-30.html.  NOT the YURI HUD/Kagami tokens.
//                   The Celtic-knot/woven-thread identity maps onto the circuit: edges are signal threads.
// Output          : 02_RESOURCES/RESEARCH/yuri-circuitry-2026-06-03.html  (data inlined, opens via file://)
//
// Leads with the MOAT (per yuri-competitive-landscape-code-level-2026-06-03.md): the work-dynamics energy
// instrument + the cognition/brain-dump-decode engine + governed memory carry the light (gold thread);
// commodity layers sit dim at the edge.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "yuri-circuitry-graph.json");
const OUT = join(HERE, "yuri-circuitry-2026-06-03.html");

const graph = JSON.parse(readFileSync(SRC, "utf8"));
const nodes = graph.nodes ?? [];
const edges = graph.edges ?? [];

// --- layer order: moat-core layers lead, commodity layers trail ---
const MOAT_LAYERS = new Set(["Energy & Math", "Cognition & Persona", "Memory & Subconscious"]);
const LAYER_ORDER = [
  "Cognition & Persona",
  "Energy & Math",
  "Memory & Subconscious",
  "Retrieval & Knowledge",
  "Learning & Continuity",
  "Governance & Safety",
  "Skills & Orchestration",
  "Token-Efficiency & Session",
  "Hidden / Meta / Self-referential",
];
for (const n of nodes) if (!LAYER_ORDER.includes(n.layer)) LAYER_ORDER.push(n.layer);

// --- status from prose (live / dormant / phantom) ---
function statusOf(n) {
  const d = (n.description || "") + " " + (n.label || "");
  if (!n.files || n.files.length === 0 || /\bPHANTOM\b/.test(d)) return "phantom";
  if (/\bUNWIRED\b|\bDORMANT\b|\bSUPERSEDED\b|NO live trigger|no live hook|currently surfaces nothing/i.test(d))
    return "dormant";
  return "live";
}

// --- layout: columnar, one column per layer, nodes stacked ---
const NODE_W = 234, NODE_H = 58, V_GAP = 22, COL_GAP = 154, PAD_X = 96, PAD_TOP = 188;
const byLayer = new Map(LAYER_ORDER.map((l) => [l, []]));
for (const n of nodes) byLayer.get(n.layer).push(n);

const pos = new Map();
let maxRows = 0;
LAYER_ORDER.forEach((layer, col) => {
  const list = byLayer.get(layer) || [];
  maxRows = Math.max(maxRows, list.length);
  const x = PAD_X + col * (NODE_W + COL_GAP);
  list.forEach((n, row) => {
    const y = PAD_TOP + row * (NODE_H + V_GAP);
    pos.set(n.id, { x, y, cx: x + NODE_W / 2, cy: y + NODE_H / 2, node: n, status: statusOf(n), col });
  });
});
const COL_W = NODE_W + COL_GAP;
const CANVAS_W = PAD_X * 2 + LAYER_ORDER.length * COL_W - COL_GAP;
const CANVAS_H = PAD_TOP + maxRows * (NODE_H + V_GAP) + 96;

// --- split edges: graph edges vs artifact I/O (to a non-node file/state path) ---
const nodeIds = new Set(nodes.map((n) => n.id));
const graphEdges = [];
const artifactIO = new Map();
for (const e of edges) {
  if (nodeIds.has(e.to)) graphEdges.push(e);
  else {
    if (!artifactIO.has(e.from)) artifactIO.set(e.from, []);
    artifactIO.get(e.from).push({ kind: e.kind, target: e.to, description: e.description });
  }
}

const counts = { live: 0, dormant: 0, phantom: 0 };
for (const p of pos.values()) counts[p.status]++;

const payload = {
  meta: {
    generatedAt: graph.generatedAt || null,
    nodeCount: nodes.length, edgeCount: edges.length, layerCount: LAYER_ORDER.length,
    counts, canvas: { w: CANVAS_W, h: CANVAS_H },
    layout: { NODE_W, NODE_H, COL_W, PAD_TOP },
  },
  layers: LAYER_ORDER.map((l, i) => ({
    name: l, moat: MOAT_LAYERS.has(l), count: (byLayer.get(l) || []).length,
    x: PAD_X + i * COL_W,
  })),
  nodes: [...pos.values()].map((p) => ({
    id: p.node.id, label: p.node.label, layer: p.node.layer, layerIdx: p.col,
    files: p.node.files || [], triggeredBy: p.node.triggeredBy || "",
    description: p.node.description || "", status: p.status, moat: MOAT_LAYERS.has(p.node.layer),
    x: p.x, y: p.y, cx: p.cx, cy: p.cy, io: artifactIO.get(p.node.id) || [],
  })),
  edges: graphEdges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, description: e.description })),
};

const json = JSON.stringify(payload);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5">
<meta name="theme-color" content="#0C0E13">
<title>YURI OS — Living Circuitry · MUSUBI ONE</title>
<meta name="description" content="The YURI organ map as an interactive woven circuit: ${payload.meta.nodeCount} organs, ${payload.meta.edgeCount} signal threads, ${payload.meta.layerCount} layers — the moat made visible.">
<style>
/* ============================================================================
   YURI — LIVING CIRCUITRY · "Forge & Thread" bespoke system (--nx-*)
   Derived from NEXUS_LINK_REVENUE_PLAN. Woven gold thread on deep ink ground;
   teal patina counterpoint; serif display. Self-contained, system fonts only.
   ========================================================================== */
:root{
  --nx-ground:#0C0E13; --nx-ground-2:#12151C; --nx-ground-3:#1A1E28; --nx-ground-4:#232836;
  --nx-thread:#C9A14A; --nx-thread-bright:#E3C677; --nx-thread-deep:#8A6A28;
  --nx-patina:#2E7D74; --nx-patina-bright:#4FB3A6;
  --nx-parchment:#F4F0E6;
  --nx-ink-100:#F6F4EE; --nx-ink-80:#C6C8CF; --nx-ink-60:#8E929D; --nx-ink-40:#5B606C;
  --nx-pos:#5FA882; --nx-warn:#D7A24A; --nx-risk:#C76E63; --nx-neutral:#6E8FB0;
  --nx-line:rgba(201,161,74,0.18); --nx-line-soft:rgba(246,244,238,0.08); --nx-line-strong:rgba(201,161,74,0.40);
  --nx-grad-thread:linear-gradient(120deg,var(--nx-thread-deep) 0%,var(--nx-thread) 38%,var(--nx-thread-bright) 55%,var(--nx-thread) 72%,var(--nx-thread-deep) 100%);
  --nx-grad-ground:radial-gradient(140% 120% at 50% -10%,#161A24 0%,var(--nx-ground) 60%,#07080B 100%);
  --nx-font-display:"Hoefler Text","Iowan Old Style","Palatino Linotype",Palatino,"Times New Roman",Georgia,serif;
  --nx-font-text:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;
  --nx-font-mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,"Liberation Mono",monospace;
  --nx-tracking-overline:0.22em;
  --nx-radius-sm:6px; --nx-radius:12px; --nx-radius-lg:20px;
  --nx-shadow-1:0 1px 2px rgba(0,0,0,0.30),0 1px 1px rgba(0,0,0,0.20);
  --nx-shadow-2:0 8px 24px -8px rgba(0,0,0,0.55),0 2px 6px rgba(0,0,0,0.35);
  --nx-shadow-3:0 24px 60px -20px rgba(0,0,0,0.65),0 6px 16px rgba(0,0,0,0.40);
  --nx-glow-thread:0 0 0 1px rgba(201,161,74,0.30),0 10px 40px -12px rgba(201,161,74,0.28);
  --nx-dur-fast:180ms; --nx-dur:420ms; --nx-dur-slow:760ms;
  --nx-ease-weave:cubic-bezier(0.22,1,0.36,1); --nx-ease-draw:cubic-bezier(0.65,0,0.35,1); --nx-ease-settle:cubic-bezier(0.16,1,0.30,1);
}
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;height:100%;overflow:hidden;-webkit-text-size-adjust:100%;}
body{background:var(--nx-grad-ground);background-attachment:fixed;color:var(--nx-ink-80);
  font-family:var(--nx-font-text);font-feature-settings:"kern" 1,"liga" 1;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}
::selection{background:var(--nx-thread);color:var(--nx-ground);}
/* woven grain over the ground */
body::before{content:"";position:fixed;inset:0;z-index:0;pointer-events:none;opacity:0.5;
  background-image:radial-gradient(rgba(201,161,74,0.05) 1px,transparent 1px),radial-gradient(rgba(79,179,166,0.04) 1px,transparent 1px);
  background-size:26px 26px,26px 26px;background-position:0 0,13px 13px;
  -webkit-mask-image:radial-gradient(120% 100% at 50% 0%,#000 30%,transparent 90%);mask-image:radial-gradient(120% 100% at 50% 0%,#000 30%,transparent 90%);}

/* ---------- stage / canvas ---------- */
#stage{position:fixed;inset:0;z-index:1;cursor:grab;touch-action:none;}
#stage.grabbing{cursor:grabbing;}
#viewport{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;}
svg.board{display:block;}

/* ---------- header ---------- */
header{position:fixed;top:0;left:0;right:0;z-index:20;padding:18px 26px 26px;pointer-events:none;
  background:linear-gradient(180deg,rgba(7,8,11,0.94) 0%,rgba(7,8,11,0.6) 62%,transparent 100%);}
.nx-overline{font-family:var(--nx-font-text);font-size:0.7rem;letter-spacing:var(--nx-tracking-overline);
  text-transform:uppercase;font-weight:600;color:var(--nx-thread);display:inline-flex;align-items:center;gap:8px;}
.nx-overline::before{content:"";width:28px;height:1px;background:var(--nx-grad-thread);}
h1{font-family:var(--nx-font-display);font-weight:600;letter-spacing:-0.02em;line-height:1.02;margin:9px 0 0;
  font-size:clamp(1.7rem,3.6vw,2.9rem);
  background:var(--nx-grad-thread);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;
  -webkit-text-fill-color:transparent;color:transparent;animation:sheen 9s linear infinite;}
@keyframes sheen{to{background-position:220% 0;}}
.subhead{display:flex;flex-wrap:wrap;gap:18px;margin-top:11px;font-size:0.8rem;color:var(--nx-ink-60);font-family:var(--nx-font-mono);}
.subhead b{color:var(--nx-ink-100);font-weight:600;}
.subhead .sep{color:var(--nx-thread-deep);}
.moatnote{margin-top:9px;max-width:680px;font-size:0.84rem;line-height:1.5;color:var(--nx-ink-60);}
.moatnote b{color:var(--nx-ink-80);font-weight:600;}
.moatnote .gold{color:var(--nx-thread-bright);}

/* ---------- top control rail ---------- */
#rail{position:fixed;top:18px;right:26px;z-index:22;display:flex;gap:8px;align-items:center;pointer-events:auto;}
.nx-btn,.nx-input{font-family:var(--nx-font-mono);font-size:0.74rem;background:var(--nx-ground-3);color:var(--nx-ink-80);
  border:1px solid var(--nx-line-soft);border-radius:var(--nx-radius-sm);padding:8px 11px;cursor:pointer;
  transition:border-color var(--nx-dur-fast) var(--nx-ease-weave),color var(--nx-dur-fast),background var(--nx-dur-fast);}
.nx-input{cursor:text;width:178px;color:var(--nx-ink-100);}
.nx-input::placeholder{color:var(--nx-ink-40);}
.nx-btn:hover,.nx-input:focus{border-color:var(--nx-thread);color:var(--nx-ink-100);outline:none;}
.nx-btn.active{background:linear-gradient(180deg,rgba(201,161,74,0.16),transparent),var(--nx-ground-3);border-color:var(--nx-thread);color:var(--nx-thread-bright);}

/* ---------- layer chips ---------- */
#chips{position:fixed;top:118px;left:26px;right:26px;z-index:18;display:flex;flex-wrap:wrap;gap:7px;pointer-events:auto;
  -webkit-mask-image:linear-gradient(90deg,#000 92%,transparent);mask-image:linear-gradient(90deg,#000 92%,transparent);}
.chip{font-family:var(--nx-font-mono);font-size:0.66rem;letter-spacing:0.04em;padding:5px 10px;border-radius:999px;
  border:1px solid var(--nx-line-soft);background:rgba(18,21,28,0.7);backdrop-filter:blur(6px);color:var(--nx-ink-60);
  cursor:pointer;white-space:nowrap;transition:all var(--nx-dur-fast) var(--nx-ease-weave);}
.chip:hover{color:var(--nx-ink-100);border-color:var(--nx-line);}
.chip.moat{color:var(--nx-thread);border-color:var(--nx-line);}
.chip.on{background:var(--nx-grad-thread);color:var(--nx-ground);border-color:transparent;font-weight:600;}
.chip .c{opacity:0.6;margin-left:5px;}

/* ---------- legend ---------- */
#legend{position:fixed;left:26px;bottom:26px;z-index:20;background:rgba(18,21,28,0.82);backdrop-filter:blur(10px);
  border:1px solid var(--nx-line-soft);border-radius:var(--nx-radius);padding:14px 16px;
  font-family:var(--nx-font-mono);font-size:0.68rem;color:var(--nx-ink-60);max-width:280px;box-shadow:var(--nx-shadow-2);}
#legend .lh{font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--nx-thread);margin:0 0 9px;}
.lg{display:flex;align-items:center;gap:9px;margin:4px 0;}
.sw{width:20px;height:2px;border-radius:2px;flex:none;}
.dot{width:9px;height:9px;border-radius:50%;flex:none;}
.legrow{display:grid;grid-template-columns:1fr 1fr;gap:2px 14px;margin-top:9px;padding-top:9px;border-top:1px solid var(--nx-line-soft);}

/* ---------- minimap ---------- */
#minimap{position:fixed;right:26px;bottom:26px;z-index:20;width:212px;border:1px solid var(--nx-line-soft);
  border-radius:var(--nx-radius);background:rgba(7,8,11,0.78);backdrop-filter:blur(8px);overflow:hidden;box-shadow:var(--nx-shadow-2);cursor:pointer;}
#minimap svg{display:block;}
#mmView{fill:rgba(201,161,74,0.10);stroke:var(--nx-thread);stroke-width:2;}

/* ---------- detail panel ---------- */
#panel{position:fixed;top:0;right:0;height:100%;width:min(412px,90vw);z-index:30;display:flex;flex-direction:column;
  background:linear-gradient(180deg,var(--nx-ground-2),var(--nx-ground));border-left:1px solid var(--nx-line);
  box-shadow:-30px 0 60px -30px rgba(0,0,0,0.8);transform:translateX(100%);
  transition:transform var(--nx-dur) var(--nx-ease-settle);}
#panel.open{transform:translateX(0);}
#panel .ph{position:relative;padding:26px 26px 18px;border-bottom:1px solid var(--nx-line-soft);
  background:linear-gradient(180deg,rgba(201,161,74,0.05),transparent 70%);}
#panel .ph::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--nx-grad-thread);}
.p-layer{font-family:var(--nx-font-text);font-size:0.66rem;letter-spacing:var(--nx-tracking-overline);
  text-transform:uppercase;font-weight:600;color:var(--nx-thread);}
#panel h2{font-family:var(--nx-font-display);font-weight:600;font-size:1.45rem;line-height:1.18;margin:9px 0 0;color:var(--nx-ink-100);}
.statusrow{display:flex;gap:7px;align-items:center;margin-top:13px;}
.badge{font-family:var(--nx-font-mono);font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase;
  padding:3px 9px;border-radius:999px;border:1px solid currentColor;}
.b-live{color:var(--nx-patina-bright);} .b-dormant{color:var(--nx-warn);} .b-phantom{color:var(--nx-risk);}
.b-moat{color:var(--nx-thread-bright);background:rgba(201,161,74,0.1);}
#panel .body{padding:20px 26px 40px;overflow-y:auto;}
.sec{margin-top:20px;}
.sec:first-child{margin-top:0;}
.sec h3{font-family:var(--nx-font-text);font-size:0.62rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--nx-ink-40);margin:0 0 8px;}
.desc{font-size:0.95rem;line-height:1.62;color:var(--nx-ink-100);}
.trig{font-size:0.85rem;line-height:1.55;color:var(--nx-ink-80);}
#panel code{font-family:var(--nx-font-mono);font-size:0.74rem;color:var(--nx-thread-bright);word-break:break-all;
  display:block;padding:4px 0;border-bottom:1px solid var(--nx-line-soft);}
.io{font-family:var(--nx-font-mono);font-size:0.72rem;line-height:1.5;padding:7px 0;border-bottom:1px solid var(--nx-line-soft);}
.io .k{color:var(--nx-thread);text-transform:uppercase;font-size:0.58rem;letter-spacing:0.08em;}
.io .d{color:var(--nx-ink-60);margin-top:2px;}
.conn{font-size:0.82rem;line-height:1.5;padding:8px 0;border-bottom:1px solid var(--nx-line-soft);cursor:pointer;
  display:flex;gap:8px;align-items:baseline;transition:color var(--nx-dur-fast);}
.conn:hover{color:var(--nx-thread-bright);}
.conn .ar{font-family:var(--nx-font-mono);font-size:0.62rem;color:var(--nx-ink-40);white-space:nowrap;}
#closeP{position:absolute;top:18px;right:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;
  background:var(--nx-ground-3);border:1px solid var(--nx-line-soft);color:var(--nx-ink-60);font-size:15px;line-height:1;}
#closeP:hover{color:var(--nx-ink-100);border-color:var(--nx-thread);}

/* ---------- svg graph elements ---------- */
.band rect{fill:rgba(246,244,238,0.012);}
.band.moat rect{fill:rgba(201,161,74,0.035);stroke:var(--nx-line);stroke-dasharray:2 7;stroke-width:1;}
.band-label{font-family:var(--nx-font-display);font-size:15px;fill:var(--nx-ink-60);font-style:italic;}
.band-label.moat{fill:var(--nx-thread-bright);}
.band-count{font-family:var(--nx-font-mono);font-size:10px;fill:var(--nx-ink-40);letter-spacing:0.05em;}
.band-moatmark{font-family:var(--nx-font-mono);font-size:8.5px;fill:var(--nx-thread);letter-spacing:0.25em;}

.edge{fill:none;stroke-width:1.1;opacity:0.16;transition:opacity var(--nx-dur-fast),stroke-width var(--nx-dur-fast);}
.edge.calls{stroke:var(--nx-thread);} .edge.reads{stroke:var(--nx-neutral);} .edge.writes{stroke:var(--nx-patina-bright);}
.edge.hl{opacity:0.92;stroke-width:2;stroke-dasharray:5 6;animation:flow 0.9s linear infinite;}
@keyframes flow{to{stroke-dashoffset:-22;}}
.edge.dim{opacity:0.03;}

.node{cursor:pointer;}
.node .bg{fill:var(--nx-ground-3);stroke:var(--nx-line-soft);stroke-width:1;transition:fill var(--nx-dur-fast),stroke var(--nx-dur-fast);}
.node .thread{fill:none;stroke:url(#g-thread);stroke-width:2;opacity:0;transition:opacity var(--nx-dur-fast);}
.node .nl{font-family:var(--nx-font-text);font-size:11.5px;fill:var(--nx-ink-80);pointer-events:none;font-weight:500;}
.node.moat .bg{stroke:var(--nx-line);}
.node.moat .nl{fill:var(--nx-ink-100);}
.node[data-status="dormant"] .bg{stroke:rgba(215,162,74,0.45);stroke-dasharray:5 3;}
.node[data-status="phantom"] .bg{stroke:rgba(199,110,99,0.5);stroke-dasharray:2 4;}
.node:hover .bg{fill:var(--nx-ground-4);stroke:var(--nx-line);}
.node:hover .thread{opacity:0.7;}
.node.sel .bg{fill:#20242f;stroke:var(--nx-thread);stroke-width:1.5;}
.node.sel .thread{opacity:1;}
.node.dim{opacity:0.12;}
.led-live{fill:var(--nx-patina-bright);} .led-dormant{fill:var(--nx-warn);} .led-phantom{fill:var(--nx-risk);}
.node.moat .led-ring{stroke:var(--nx-thread);stroke-width:1;fill:none;opacity:0.7;}

/* entrance */
.enter .node,.enter .edge{opacity:0;}
.node{animation:nodeIn var(--nx-dur-slow) var(--nx-ease-settle) backwards;}
@keyframes nodeIn{from{opacity:0;transform:translateY(8px);}}
@media (prefers-reduced-motion:reduce){.node{animation:none;}h1{animation:none;}.edge.hl{animation:none;}}

@media (max-width:680px){
  header{padding:14px 16px 20px;}
  .moatnote{display:none;}
  #chips{top:104px;left:16px;right:16px;}
  #legend{left:16px;bottom:16px;max-width:184px;font-size:0.62rem;}
  #minimap{display:none;}
  #rail .nx-input{width:104px;}
  #rail{right:16px;}
}
</style>
</head>
<body class="enter">
<div id="stage"><div id="viewport"><div id="boardwrap"></div></div></div>

<header>
  <span class="nx-overline">YURI OS · the woven circuit</span>
  <h1>Living Circuitry</h1>
  <div class="subhead">
    <span><b>${payload.meta.nodeCount}</b> organs</span><span class="sep">/</span>
    <span><b>${payload.meta.edgeCount}</b> signal threads</span><span class="sep">/</span>
    <span><b>${payload.meta.layerCount}</b> layers</span><span class="sep">/</span>
    <span><b>${payload.meta.counts.live}</b> live · <b>${payload.meta.counts.dormant}</b> dormant · <b>${payload.meta.counts.phantom}</b> phantom</span>
  </div>
  <p class="moatnote"><b>The moat made visible.</b> Skills and harnesses are commodity — the defensible core is the work-dynamics <span class="gold">energy instrument</span>, the <span class="gold">cognition / brain-dump-decode</span> engine, and <span class="gold">governed memory</span>. Those three layers are threaded in gold; the commodity layers sit dim at the edge.</p>
</header>

<div id="rail">
  <input id="search" class="nx-input" type="text" placeholder="filter organs…" autocomplete="off" spellcheck="false">
  <button class="nx-btn" id="moatBtn" title="Spotlight the moat layers">◆ moat</button>
  <button class="nx-btn" id="fit" title="Fit to screen">fit</button>
  <button class="nx-btn" id="zin">+</button><button class="nx-btn" id="zout">−</button>
</div>

<div id="chips"></div>

<aside id="panel">
  <button id="closeP" aria-label="close">×</button>
  <div class="ph">
    <div class="p-layer" id="pLayer"></div>
    <h2 id="pTitle"></h2>
    <div class="statusrow" id="pStatus"></div>
  </div>
  <div class="body">
    <div class="sec"><h3>What it does</h3><div class="desc" id="pDesc"></div></div>
    <div class="sec"><h3>Triggered by</h3><div class="trig" id="pTrig"></div></div>
    <div class="sec" id="pFilesSec"><h3>Files</h3><div id="pFiles"></div></div>
    <div class="sec" id="pIoSec"><h3>Artifact I/O</h3><div id="pIo"></div></div>
    <div class="sec" id="pConnSec"><h3>Wired to</h3><div id="pConn"></div></div>
  </div>
</aside>

<div id="legend">
  <p class="lh">Signal · Status · Moat</p>
  <div class="lg"><span class="sw" style="background:var(--nx-thread)"></span>calls — import / invoke</div>
  <div class="lg"><span class="sw" style="background:var(--nx-neutral)"></span>reads — state / config</div>
  <div class="lg"><span class="sw" style="background:var(--nx-patina-bright)"></span>writes — persist / trace</div>
  <div class="legrow">
    <div class="lg"><span class="dot" style="background:var(--nx-patina-bright)"></span>live</div>
    <div class="lg"><span class="dot" style="background:var(--nx-warn)"></span>dormant</div>
    <div class="lg"><span class="dot" style="background:var(--nx-risk)"></span>phantom</div>
    <div class="lg" style="color:var(--nx-thread)"><span class="dot" style="border:1.5px solid var(--nx-thread);background:transparent"></span>moat core</div>
  </div>
</div>

<div id="minimap"></div>

<script id="graph-data" type="application/json">${json.replace(/<\/script>/gi, "<\\/script>")}</script>
<script>
"use strict";
var DATA = JSON.parse(document.getElementById("graph-data").textContent);
var SVGNS = "http://www.w3.org/2000/svg";
var byId = new Map(DATA.nodes.map(function(n){return [n.id,n];}));
var NODE_W = DATA.meta.layout.NODE_W, NODE_H = DATA.meta.layout.NODE_H, COL_W = DATA.meta.layout.COL_W;
var CW = DATA.meta.canvas.w, CH = DATA.meta.canvas.h;
function el(tag,cls){var e=document.createElementNS(SVGNS,tag);if(cls)e.setAttribute("class",cls);return e;}
function escapeHtml(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}

/* adjacency */
var adj = new Map(DATA.nodes.map(function(n){return [n.id,[]];}));
DATA.edges.forEach(function(e){
  if(adj.has(e.from)) adj.get(e.from).push({dir:"out",other:e.to,kind:e.kind});
  if(adj.has(e.to)) adj.get(e.to).push({dir:"in",other:e.from,kind:e.kind});
});

/* ---- board svg ---- */
var svg = el("svg","board");
svg.setAttribute("width",CW); svg.setAttribute("height",CH); svg.setAttribute("viewBox","0 0 "+CW+" "+CH);
var defs = el("defs");
var lg = el("linearGradient"); lg.setAttribute("id","g-thread"); lg.setAttribute("x1","0");lg.setAttribute("y1","0");lg.setAttribute("x2","1");lg.setAttribute("y2","1");
[["0%","#8A6A28"],["45%","#C9A14A"],["55%","#E3C677"],["100%","#8A6A28"]].forEach(function(s){var st=el("stop");st.setAttribute("offset",s[0]);st.setAttribute("stop-color",s[1]);lg.appendChild(st);});
defs.appendChild(lg);
var fg = el("filter"); fg.setAttribute("id","glow"); fg.setAttribute("x","-50%");fg.setAttribute("y","-50%");fg.setAttribute("width","200%");fg.setAttribute("height","200%");
var fb=el("feGaussianBlur"); fb.setAttribute("stdDeviation","3"); fb.setAttribute("result","b"); fg.appendChild(fb);
var fm=el("feMerge"); var m1=el("feMergeNode");m1.setAttribute("in","b");var m2=el("feMergeNode");m2.setAttribute("in","SourceGraphic");fm.appendChild(m1);fm.appendChild(m2);fg.appendChild(fm);
defs.appendChild(fg); svg.appendChild(defs);

/* layer bands */
DATA.layers.forEach(function(L){
  var g = el("g","band"+(L.moat?" moat":""));
  var r = el("rect"); r.setAttribute("x",L.x-18);r.setAttribute("y",120);r.setAttribute("width",NODE_W+36);
  r.setAttribute("height",CH-140);r.setAttribute("rx",10); g.appendChild(r);
  if(L.moat){var mm=el("text","band-moatmark");mm.setAttribute("x",L.x);mm.setAttribute("y",112);mm.textContent="◆ MOAT CORE";g.appendChild(mm);}
  var t=el("text","band-label"+(L.moat?" moat":""));t.setAttribute("x",L.x);t.setAttribute("y",146);t.textContent=L.name;g.appendChild(t);
  var c=el("text","band-count");c.setAttribute("x",L.x);c.setAttribute("y",164);c.textContent=L.count+" organs";g.appendChild(c);
  svg.appendChild(g);
});

/* edges */
var edgeLayer = el("g","edges"); var edgeEls=[];
DATA.edges.forEach(function(e){
  var a=byId.get(e.from),b=byId.get(e.to); if(!a||!b) return;
  var x1=a.cx,y1=a.cy,x2=b.cx,y2=b.cy,dx=Math.abs(x2-x1);
  var off=Math.max(46,dx*0.42); var fwd=x2>=x1?1:-1;
  var p=el("path","edge "+e.kind);
  p.setAttribute("d","M"+x1+" "+y1+" C "+(x1+off*fwd)+" "+y1+" "+(x2-off*fwd)+" "+y2+" "+x2+" "+y2);
  p.dataset.from=e.from; p.dataset.to=e.to; edgeLayer.appendChild(p); edgeEls.push(p);
});
svg.appendChild(edgeLayer);

/* nodes */
var nodeLayer = el("g","nodes"); var nodeEls=new Map();
DATA.nodes.forEach(function(n,i){
  var g=el("g","node"+(n.moat?" moat":"")); g.setAttribute("data-status",n.status);
  g.setAttribute("transform","translate("+n.x+","+n.y+")"); g.dataset.id=n.id;
  g.style.animationDelay=(n.layerIdx*55+ (i%9)*18)+"ms";
  var bg=el("rect","bg");bg.setAttribute("width",NODE_W);bg.setAttribute("height",NODE_H);bg.setAttribute("rx",10);g.appendChild(bg);
  var th=el("rect","thread");th.setAttribute("width",NODE_W);th.setAttribute("height",NODE_H);th.setAttribute("rx",10);g.appendChild(th);
  if(n.moat){var ring=el("circle","led-ring");ring.setAttribute("cx",16);ring.setAttribute("cy",NODE_H/2);ring.setAttribute("r",6);g.appendChild(ring);}
  var led=el("circle","led-"+n.status);led.setAttribute("cx",16);led.setAttribute("cy",NODE_H/2);led.setAttribute("r",3.2);g.appendChild(led);
  var words=n.label.split(/\\s+/),lines=["",""],li=0;
  for(var w=0;w<words.length;w++){var word=words[w];var cand=(lines[li]?lines[li]+" ":"")+word;
    if(cand.length>27&&li===0){li=1;lines[1]=word;}
    else if(li===1&&((lines[1]?lines[1]+" ":"")+word).length>25){lines[1]=lines[1]+" …";break;}
    else lines[li]=cand;}
  var t=el("text","nl");t.setAttribute("x",30);
  if(lines[1]){t.setAttribute("y",NODE_H/2-3);
    var s1=el("tspan");s1.setAttribute("x",30);s1.textContent=lines[0];t.appendChild(s1);
    var s2=el("tspan");s2.setAttribute("x",30);s2.setAttribute("dy",14);s2.textContent=lines[1];t.appendChild(s2);
  }else{t.setAttribute("y",NODE_H/2+4);t.textContent=lines[0];}
  g.appendChild(t);
  g.addEventListener("mouseenter",function(){if(!locked)highlight(n.id);});
  g.addEventListener("mouseleave",function(){if(!locked&&!selected)clearHL();else if(selected)highlight(selected);});
  g.addEventListener("click",function(ev){ev.stopPropagation();select(n.id);});
  nodeLayer.appendChild(g);nodeEls.set(n.id,g);
});
svg.appendChild(nodeLayer);
document.getElementById("boardwrap").appendChild(svg);

/* ---- highlight ---- */
var selected=null, locked=false;
function nbrs(id){var s=new Set([id]);(adj.get(id)||[]).forEach(function(a){s.add(a.other);});return s;}
function highlight(id){
  var keep=nbrs(id);
  nodeEls.forEach(function(g,nid){g.classList.toggle("dim",!keep.has(nid));});
  edgeEls.forEach(function(p){var on=p.dataset.from===id||p.dataset.to===id;p.classList.toggle("hl",on);p.classList.toggle("dim",!on);});
}
function clearHL(){nodeEls.forEach(function(g){g.classList.remove("dim");});edgeEls.forEach(function(p){p.classList.remove("hl");p.classList.remove("dim");});}

/* ---- detail panel ---- */
var panel=document.getElementById("panel");
function select(id){
  var n=byId.get(id); if(!n)return; selected=id;
  nodeEls.forEach(function(g,nid){g.classList.toggle("sel",nid===id);});
  highlight(id);
  document.getElementById("pLayer").textContent=n.layer+(n.moat?"  ◆ moat core":"");
  document.getElementById("pTitle").textContent=n.label;
  var st=document.getElementById("pStatus");st.innerHTML="";
  var sb=document.createElement("span");sb.className="badge b-"+n.status;sb.textContent=n.status;st.appendChild(sb);
  if(n.moat){var mb=document.createElement("span");mb.className="badge b-moat";mb.textContent="moat";st.appendChild(mb);}
  document.getElementById("pDesc").textContent=n.description;
  document.getElementById("pTrig").textContent=n.triggeredBy||"—";
  var fs=document.getElementById("pFiles");fs.innerHTML="";
  document.getElementById("pFilesSec").style.display=n.files.length?"":"none";
  n.files.forEach(function(f){var c=document.createElement("code");c.textContent=f;fs.appendChild(c);});
  var io=document.getElementById("pIo");io.innerHTML="";
  document.getElementById("pIoSec").style.display=n.io.length?"":"none";
  n.io.forEach(function(x){var d=document.createElement("div");d.className="io";
    d.innerHTML='<span class="k">'+x.kind+'</span> <code style="display:inline;border:none;padding:0">'+escapeHtml(x.target)+'</code>'+(x.description?'<div class="d">'+escapeHtml(x.description)+'</div>':'');io.appendChild(d);});
  var cc=document.getElementById("pConn");cc.innerHTML="";
  var conns=adj.get(id)||[];
  document.getElementById("pConnSec").style.display=conns.length?"":"none";
  conns.forEach(function(a){var o=byId.get(a.other);if(!o)return;
    var d=document.createElement("div");d.className="conn";
    d.innerHTML='<span class="ar">'+a.kind+' '+(a.dir==="out"?"→":"←")+'</span><span>'+escapeHtml(o.label)+'</span>';
    d.addEventListener("click",function(){select(a.other);centerOn(a.other);});cc.appendChild(d);});
  panel.classList.add("open");
}
function closePanel(){panel.classList.remove("open");selected=null;nodeEls.forEach(function(g){g.classList.remove("sel");});clearHL();}
document.getElementById("closeP").addEventListener("click",closePanel);

/* ---- pan / zoom ---- */
var stage=document.getElementById("stage"),vp=document.getElementById("viewport");
var scale=1,tx=0,ty=0;
function apply(){vp.style.transform="translate("+tx+"px,"+ty+"px) scale("+scale+")";updateMM();}
function clampS(s){return Math.min(2.6,Math.max(0.12,s));}
function fit(){var pad=70,aw=innerWidth-pad*2,ah=innerHeight-260;
  scale=clampS(Math.min(aw/CW,ah/CH,1));tx=pad+(aw-CW*scale)/2;ty=190;apply();}
function centerOn(id){var n=byId.get(id);if(!n)return;tx=innerWidth/2-n.cx*scale;ty=innerHeight/2-n.cy*scale;apply();}
function zoomAt(cx,cy,f){var ns=clampS(scale*f);tx=cx-(cx-tx)*(ns/scale);ty=cy-(cy-ty)*(ns/scale);scale=ns;apply();}
stage.addEventListener("wheel",function(e){e.preventDefault();zoomAt(e.clientX,e.clientY,e.deltaY<0?1.12:0.89);},{passive:false});
var drag=null,pts=new Map(),pinch=null;
stage.addEventListener("pointerdown",function(e){pts.set(e.pointerId,e);
  if(pts.size===2){var a=[...pts.values()];pinch={d:Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY),s:scale};drag=null;return;}
  if(e.target.closest(".node"))return;drag={x:e.clientX,y:e.clientY,tx:tx,ty:ty};stage.classList.add("grabbing");});
stage.addEventListener("pointermove",function(e){
  if(pts.has(e.pointerId))pts.set(e.pointerId,e);
  if(pinch&&pts.size===2){var a=[...pts.values()];var nd=Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY);
    var mx=(a[0].clientX+a[1].clientX)/2,my=(a[0].clientY+a[1].clientY)/2;var ns=clampS(pinch.s*(nd/pinch.d));
    tx=mx-(mx-tx)*(ns/scale);ty=my-(my-ty)*(ns/scale);scale=ns;apply();return;}
  if(drag){tx=drag.tx+(e.clientX-drag.x);ty=drag.ty+(e.clientY-drag.y);apply();}});
function endPt(e){pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(pts.size===0){drag=null;stage.classList.remove("grabbing");}}
stage.addEventListener("pointerup",endPt);stage.addEventListener("pointercancel",endPt);
stage.addEventListener("click",function(e){if(!e.target.closest(".node")&&!e.target.closest("#panel"))closePanel();});
document.getElementById("fit").addEventListener("click",fit);
document.getElementById("zin").addEventListener("click",function(){zoomAt(innerWidth/2,innerHeight/2,1.2);});
document.getElementById("zout").addEventListener("click",function(){zoomAt(innerWidth/2,innerHeight/2,0.83);});

/* ---- minimap ---- */
var MM_W=212,MM_H=Math.max(96,Math.round(212*CH/CW)),mmS=MM_W/CW;
var mm=document.getElementById("minimap");
var msvg=el("svg");msvg.setAttribute("width",MM_W);msvg.setAttribute("height",MM_H);msvg.setAttribute("viewBox","0 0 "+MM_W+" "+MM_H);
DATA.nodes.forEach(function(n){var c=el("circle");c.setAttribute("cx",n.cx*mmS);c.setAttribute("cy",n.cy*mmS);c.setAttribute("r",n.moat?1.8:1.2);
  c.setAttribute("fill",n.moat?"#E3C677":(n.status==="phantom"?"#C76E63":n.status==="dormant"?"#D7A24A":"#4FB3A6"));c.setAttribute("opacity",n.moat?0.95:0.55);msvg.appendChild(c);});
var mmView=el("rect");mmView.setAttribute("id","mmView");msvg.appendChild(mmView);mm.appendChild(msvg);
function updateMM(){var vx=(-tx/scale)*mmS,vy=(-ty/scale)*mmS,vw=(innerWidth/scale)*mmS,vh=(innerHeight/scale)*mmS;
  mmView.setAttribute("x",Math.max(0,vx));mmView.setAttribute("y",Math.max(0,vy));
  mmView.setAttribute("width",Math.min(MM_W,vw));mmView.setAttribute("height",Math.min(MM_H,vh));}
mm.addEventListener("click",function(e){var r=msvg.getBoundingClientRect();var bx=(e.clientX-r.left)/mmS,by=(e.clientY-r.top)/mmS;
  tx=innerWidth/2-bx*scale;ty=innerHeight/2-by*scale;apply();});

/* ---- layer chips ---- */
var chipBox=document.getElementById("chips");var activeLayer=null;
DATA.layers.forEach(function(L){var c=document.createElement("button");c.className="chip"+(L.moat?" moat":"");
  c.innerHTML=L.name+'<span class="c">'+L.count+'</span>';
  c.addEventListener("click",function(){
    if(activeLayer===L.name){activeLayer=null;c.classList.remove("on");nodeEls.forEach(function(g){g.classList.remove("dim");});edgeEls.forEach(function(p){p.classList.remove("dim");});return;}
    activeLayer=L.name;[].forEach.call(chipBox.children,function(x){x.classList.remove("on");});c.classList.add("on");
    nodeEls.forEach(function(g,id){g.classList.toggle("dim",byId.get(id).layer!==L.name);});
    edgeEls.forEach(function(p){var on=byId.get(p.dataset.from).layer===L.name||byId.get(p.dataset.to).layer===L.name;p.classList.toggle("dim",!on);p.classList.toggle("hl",on);});
  });chipBox.appendChild(c);});

/* ---- moat spotlight ---- */
var moatBtn=document.getElementById("moatBtn"),moatOn=false;
moatBtn.addEventListener("click",function(){moatOn=!moatOn;moatBtn.classList.toggle("active",moatOn);
  if(moatOn){nodeEls.forEach(function(g,id){g.classList.toggle("dim",!byId.get(id).moat);});
    edgeEls.forEach(function(p){var on=byId.get(p.dataset.from).moat&&byId.get(p.dataset.to).moat;p.classList.toggle("dim",!on);p.classList.toggle("hl",on);});
  }else{nodeEls.forEach(function(g){g.classList.remove("dim");});edgeEls.forEach(function(p){p.classList.remove("dim");p.classList.remove("hl");});}});

/* ---- search ---- */
document.getElementById("search").addEventListener("input",function(e){
  var q=e.target.value.trim().toLowerCase();
  if(!q){nodeEls.forEach(function(g){g.classList.remove("dim");});edgeEls.forEach(function(p){p.classList.remove("dim");});return;}
  var hit=new Set();
  DATA.nodes.forEach(function(n){if((n.label+" "+n.description+" "+n.layer+" "+n.files.join(" ")+" "+n.triggeredBy).toLowerCase().indexOf(q)>=0)hit.add(n.id);});
  nodeEls.forEach(function(g,id){g.classList.toggle("dim",!hit.has(id));});
  edgeEls.forEach(function(p){p.classList.toggle("dim",!(hit.has(p.dataset.from)&&hit.has(p.dataset.to)));});
});

/* ---- keyboard ---- */
addEventListener("keydown",function(e){
  if(e.key==="Escape")closePanel();
  if(e.key==="/"&&document.activeElement.id!=="search"){e.preventDefault();document.getElementById("search").focus();}
  if(e.key==="f")fit();
});

/* boot */
fit();
requestAnimationFrame(function(){document.body.classList.remove("enter");});
</script>
</body>
</html>`;

writeFileSync(OUT, html, "utf8");
console.log("WROTE " + OUT);
console.log("nodes=" + payload.meta.nodeCount + " edges=" + payload.meta.edgeCount +
  " graphEdges=" + payload.edges.length + " artifactEdges=" + (payload.meta.edgeCount - payload.edges.length) +
  " layers=" + payload.meta.layerCount + " live=" + counts.live + " dormant=" + counts.dormant +
  " phantom=" + counts.phantom + " canvas=" + CANVAS_W + "x" + CANVAS_H);
