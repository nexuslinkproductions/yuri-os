#!/usr/bin/env node
// build-circuitry-instrument.mjs — emit the INTERACTIVE circuitry instrument (HTML).
// Built to BUILD-MANUAL.md. Runs the verified spectral ATLAS engine, bakes the
// payload, emits a self-contained file://-openable interactive HTML:
//   pan/zoom/pinch · minimap · layer chips · moat spotlight · search · detail panel.
// Security contract (§8): Map (no object-literal id keys) · createElementNS for SVG ·
// escapeHtml incl ' · data never flows into fill/style/href.
//
//   node 02_RESOURCES/RESEARCH/circuitry/build-circuitry-instrument.mjs
//
// NOTE: this is the ATLAS lens, interactive. FLOORPLAN toggle + inspect + live-pulse
// layer in next per the manual; the shell is built to receive them.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSpectralAtlas, LAYER_ORDER, MOAT_LAYERS } from "./laplacian.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const graph = JSON.parse(readFileSync(join(HERE, "../yuri-circuitry-graph.json"), "utf8"));
const nodes = graph.nodes ?? [];
const edges = graph.edges ?? [];

function statusOf(n) {
  const d = (n.description || "") + " " + (n.label || "");
  if (!n.files || n.files.length === 0 || /\bPHANTOM\b/.test(d)) return "phantom";
  if (/\bUNWIRED\b|\bDORMANT\b|\bSUPERSEDED\b|NO live trigger|no live hook|currently surfaces nothing/i.test(d)) return "dormant";
  return "live";
}

const nodeIds = new Set(nodes.map((n) => n.id));
const graphEdges = edges.filter((e) => nodeIds.has(e.to));
const atlas = buildSpectralAtlas(nodes, graphEdges, { w: 1700, h: 1700 });

// artifact-IO (edge -> a file/state path, not a node): panel-only
const artifactIO = new Map();
for (const e of edges) {
  if (nodeIds.has(e.to)) continue;
  if (!artifactIO.has(e.from)) artifactIO.set(e.from, []);
  artifactIO.get(e.from).push({ kind: e.kind, target: e.to, description: e.description || "" });
}

const counts = { live: 0, dormant: 0, phantom: 0 };
const payloadNodes = nodes.map((n) => {
  const s = statusOf(n);
  counts[s]++;
  const p = atlas.positions[n.id];
  return {
    id: n.id, label: n.label, layer: n.layer, moat: MOAT_LAYERS.has(n.layer),
    status: s, x: p.x, y: p.y, r: atlas.radii[n.id],
    files: n.files || [], triggeredBy: n.triggeredBy || "", description: n.description || "",
    io: artifactIO.get(n.id) || [],
  };
});

const payload = {
  meta: {
    nodeCount: nodes.length, edgeCount: edges.length, graphEdgeCount: graphEdges.length,
    layerCount: LAYER_ORDER.length, counts, canvas: atlas.canvas, atlasMeta: atlas.meta,
  },
  layers: LAYER_ORDER.map((l) => ({ name: l, moat: MOAT_LAYERS.has(l), count: nodes.filter((n) => n.layer === l).length })),
  nodes: payloadNodes,
  edges: graphEdges.map((e) => ({ from: e.from, to: e.to, kind: e.kind, description: e.description || "" })),
  hulls: atlas.hulls,
};

const json = JSON.stringify(payload).replace(/<\/script>/gi, "<\\/script>");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=6">
<meta name="theme-color" content="#0C0E13">
<title>YURI OS — Living Circuitry · Spectral Atlas</title>
<meta name="description" content="The YURI organ map as a deterministic spectral circuit — ${payload.meta.nodeCount} organs, ${payload.meta.graphEdgeCount} signal threads, ${payload.meta.layerCount} layers. Every position is a solved eigenvector.">
<style>
:root{
  --nx-ground:#0C0E13; --nx-ground-2:#12151C; --nx-ground-3:#1A1E28; --nx-ground-4:#232836;
  --nx-thread:#C9A14A; --nx-thread-bright:#E3C677; --nx-thread-deep:#8A6A28;
  --nx-patina:#2E7D74; --nx-patina-bright:#4FB3A6; --nx-neutral:#6E8FB0;
  --nx-ink-100:#F6F4EE; --nx-ink-80:#C6C8CF; --nx-ink-60:#8E929D; --nx-ink-40:#5B606C;
  --nx-warn:#D7A24A; --nx-risk:#C76E63;
  --nx-line:rgba(201,161,74,0.18); --nx-line-soft:rgba(246,244,238,0.08);
  --nx-grad-thread:linear-gradient(120deg,var(--nx-thread-deep) 0%,var(--nx-thread) 38%,var(--nx-thread-bright) 55%,var(--nx-thread) 72%,var(--nx-thread-deep) 100%);
  --nx-grad-ground:radial-gradient(140% 120% at 50% 38%,#161A24 0%,var(--nx-ground) 60%,#07080B 100%);
  --nx-font-display:"Hoefler Text","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;
  --nx-font-text:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif;
  --nx-font-mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
  --nx-radius-sm:6px; --nx-radius:12px;
  --nx-shadow-2:0 8px 24px -8px rgba(0,0,0,0.55),0 2px 6px rgba(0,0,0,0.35);
  --nx-dur-fast:180ms; --nx-dur:420ms; --nx-ease:cubic-bezier(0.22,1,0.36,1); --nx-ease-settle:cubic-bezier(0.16,1,0.30,1);
}
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;height:100%;overflow:hidden;-webkit-text-size-adjust:100%;}
body{background:var(--nx-grad-ground);background-attachment:fixed;color:var(--nx-ink-80);font-family:var(--nx-font-text);-webkit-font-smoothing:antialiased;}
::selection{background:var(--nx-thread);color:var(--nx-ground);}
#stage{position:fixed;inset:0;z-index:1;cursor:grab;touch-action:none;}
#stage.grabbing{cursor:grabbing;}
#viewport{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;}
svg.board{display:block;overflow:visible;}
header{position:fixed;top:0;left:0;right:0;z-index:20;padding:18px 26px 30px;pointer-events:none;background:linear-gradient(180deg,rgba(7,8,11,0.92) 0%,rgba(7,8,11,0.55) 60%,transparent 100%);}
.nx-overline{font-size:0.7rem;letter-spacing:0.22em;text-transform:uppercase;font-weight:600;color:var(--nx-thread);display:inline-flex;align-items:center;gap:8px;}
.nx-overline::before{content:"";width:28px;height:1px;background:var(--nx-grad-thread);}
h1{font-family:var(--nx-font-display);font-weight:600;letter-spacing:-0.02em;line-height:1.02;margin:9px 0 0;font-size:clamp(1.7rem,3.6vw,2.9rem);background:var(--nx-grad-thread);background-size:220% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:sheen 9s linear infinite;}
@keyframes sheen{to{background-position:220% 0;}}
.subhead{display:flex;flex-wrap:wrap;gap:16px;margin-top:10px;font-size:0.78rem;color:var(--nx-ink-60);font-family:var(--nx-font-mono);}
.subhead b{color:var(--nx-ink-100);font-weight:600;} .subhead .sep{color:var(--nx-thread-deep);}
.moatnote{margin-top:9px;max-width:640px;font-size:0.82rem;line-height:1.5;color:var(--nx-ink-60);}
.moatnote .gold{color:var(--nx-thread-bright);}
#rail{position:fixed;top:18px;right:26px;z-index:22;display:flex;gap:8px;align-items:center;pointer-events:auto;}
.nx-btn,.nx-input{font-family:var(--nx-font-mono);font-size:0.74rem;background:var(--nx-ground-3);color:var(--nx-ink-80);border:1px solid var(--nx-line-soft);border-radius:var(--nx-radius-sm);padding:8px 11px;cursor:pointer;transition:border-color var(--nx-dur-fast),color var(--nx-dur-fast);}
.nx-input{cursor:text;width:170px;color:var(--nx-ink-100);}
.nx-input::placeholder{color:var(--nx-ink-40);}
.nx-btn:hover,.nx-input:focus{border-color:var(--nx-thread);color:var(--nx-ink-100);outline:none;}
.nx-btn.active{background:linear-gradient(180deg,rgba(201,161,74,0.16),transparent),var(--nx-ground-3);border-color:var(--nx-thread);color:var(--nx-thread-bright);}
#chips{position:fixed;top:120px;left:26px;right:26px;z-index:18;display:flex;flex-wrap:wrap;gap:7px;pointer-events:auto;-webkit-mask-image:linear-gradient(90deg,#000 92%,transparent);mask-image:linear-gradient(90deg,#000 92%,transparent);}
.chip{font-family:var(--nx-font-mono);font-size:0.66rem;letter-spacing:0.04em;padding:5px 10px;border-radius:999px;border:1px solid var(--nx-line-soft);background:rgba(18,21,28,0.7);backdrop-filter:blur(6px);color:var(--nx-ink-60);cursor:pointer;white-space:nowrap;transition:all var(--nx-dur-fast);}
.chip:hover{color:var(--nx-ink-100);border-color:var(--nx-line);}
.chip.moat{color:var(--nx-thread);border-color:var(--nx-line);}
.chip.on{background:var(--nx-grad-thread);color:var(--nx-ground);border-color:transparent;font-weight:600;}
.chip .c{opacity:0.6;margin-left:5px;}
#legend{position:fixed;left:26px;bottom:26px;z-index:20;background:rgba(18,21,28,0.82);backdrop-filter:blur(10px);border:1px solid var(--nx-line-soft);border-radius:var(--nx-radius);padding:13px 15px;font-family:var(--nx-font-mono);font-size:0.66rem;color:var(--nx-ink-60);max-width:260px;box-shadow:var(--nx-shadow-2);}
#legend .lh{font-size:0.58rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--nx-thread);margin:0 0 8px;}
.lg{display:flex;align-items:center;gap:9px;margin:4px 0;}
.sw{width:18px;height:2px;border-radius:2px;flex:none;} .dot{width:9px;height:9px;border-radius:50%;flex:none;}
.legrow{display:grid;grid-template-columns:1fr 1fr;gap:2px 12px;margin-top:8px;padding-top:8px;border-top:1px solid var(--nx-line-soft);}
#minimap{position:fixed;right:26px;bottom:26px;z-index:20;width:200px;border:1px solid var(--nx-line-soft);border-radius:var(--nx-radius);background:rgba(7,8,11,0.78);backdrop-filter:blur(8px);overflow:hidden;box-shadow:var(--nx-shadow-2);cursor:pointer;}
#minimap svg{display:block;} #mmView{fill:rgba(201,161,74,0.10);stroke:var(--nx-thread);stroke-width:3;}
#panel{position:fixed;top:0;right:0;height:100%;width:min(412px,92vw);z-index:30;display:flex;flex-direction:column;background:linear-gradient(180deg,var(--nx-ground-2),var(--nx-ground));border-left:1px solid var(--nx-line);box-shadow:-30px 0 60px -30px rgba(0,0,0,0.8);transform:translateX(100%);transition:transform var(--nx-dur) var(--nx-ease-settle);}
#panel.open{transform:translateX(0);}
#panel .ph{position:relative;padding:24px 26px 16px;border-bottom:1px solid var(--nx-line-soft);background:linear-gradient(180deg,rgba(201,161,74,0.05),transparent 70%);}
#panel .ph::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--nx-grad-thread);}
.p-layer{font-size:0.64rem;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;color:var(--nx-thread);}
#panel h2{font-family:var(--nx-font-display);font-weight:600;font-size:1.4rem;line-height:1.18;margin:8px 0 0;color:var(--nx-ink-100);}
.statusrow{display:flex;gap:7px;align-items:center;margin-top:12px;}
.badge{font-family:var(--nx-font-mono);font-size:0.58rem;letter-spacing:0.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;border:1px solid currentColor;}
.b-live{color:var(--nx-patina-bright);} .b-dormant{color:var(--nx-warn);} .b-phantom{color:var(--nx-risk);} .b-moat{color:var(--nx-thread-bright);background:rgba(201,161,74,0.1);}
#panel .body{padding:18px 26px 40px;overflow-y:auto;}
.sec{margin-top:18px;} .sec:first-child{margin-top:0;}
.sec h3{font-size:0.6rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--nx-ink-40);margin:0 0 8px;}
.desc{font-size:0.93rem;line-height:1.6;color:var(--nx-ink-100);} .trig{font-size:0.83rem;line-height:1.55;color:var(--nx-ink-80);}
#panel code{font-family:var(--nx-font-mono);font-size:0.72rem;color:var(--nx-thread-bright);word-break:break-all;display:block;padding:4px 0;border-bottom:1px solid var(--nx-line-soft);}
.io{font-family:var(--nx-font-mono);font-size:0.7rem;line-height:1.5;padding:7px 0;border-bottom:1px solid var(--nx-line-soft);}
.io .k{color:var(--nx-thread);text-transform:uppercase;font-size:0.56rem;letter-spacing:0.08em;} .io .d{color:var(--nx-ink-60);margin-top:2px;}
.conn{font-size:0.8rem;line-height:1.5;padding:8px 0;border-bottom:1px solid var(--nx-line-soft);cursor:pointer;display:flex;gap:8px;align-items:baseline;transition:color var(--nx-dur-fast);}
.conn:hover{color:var(--nx-thread-bright);} .conn .ar{font-family:var(--nx-font-mono);font-size:0.6rem;color:var(--nx-ink-40);white-space:nowrap;}
#closeP{position:absolute;top:16px;right:16px;width:30px;height:30px;border-radius:50%;cursor:pointer;background:var(--nx-ground-3);border:1px solid var(--nx-line-soft);color:var(--nx-ink-60);font-size:15px;line-height:1;}
#closeP:hover{color:var(--nx-ink-100);border-color:var(--nx-thread);}
.hull{fill:rgba(246,244,238,0.012);stroke:rgba(246,244,238,0.10);stroke-width:1.2;transition:opacity var(--nx-dur-fast);}
.hull.moat{fill:rgba(201,161,74,0.045);stroke:rgba(201,161,74,0.38);stroke-dasharray:3 7;}
.dlabel{font-family:var(--nx-font-display);font-size:21px;font-style:italic;fill:var(--nx-ink-60);opacity:0.5;pointer-events:none;} .dlabel.moat{fill:var(--nx-thread-bright);opacity:0.7;}
.edge{fill:none;stroke-width:1;opacity:0.15;transition:opacity var(--nx-dur-fast),stroke-width var(--nx-dur-fast);}
.edge.calls{stroke:var(--nx-thread);} .edge.reads{stroke:var(--nx-neutral);} .edge.writes{stroke:var(--nx-patina-bright);}
.edge.hl{opacity:0.9;stroke-width:2;stroke-dasharray:5 6;animation:flow 0.9s linear infinite;}
@keyframes flow{to{stroke-dashoffset:-22;}}
.edge.dim{opacity:0.03;}
.node{cursor:pointer;}
.node .halo{transition:opacity var(--nx-dur-fast);}
.node .core{transition:fill var(--nx-dur-fast),stroke var(--nx-dur-fast);stroke:rgba(0,0,0,0.35);stroke-width:0.5;}
.node .nl{font-family:var(--nx-font-text);font-size:10px;fill:var(--nx-ink-60);pointer-events:none;opacity:0;transition:opacity var(--nx-dur-fast);}
.node.moat .nl{fill:var(--nx-ink-80);}
.node:hover .nl,.node.sel .nl,.node.showlabel .nl{opacity:1;}
.node.sel .core{stroke:var(--nx-thread-bright);stroke-width:2;}
.node.dim{opacity:0.12;} .node.dim .nl{opacity:0;}
.core-live{fill:var(--nx-patina-bright);} .core-dormant{fill:var(--nx-warn);} .core-phantom{fill:var(--nx-risk);}
.node.moat .core{fill:var(--nx-thread-bright);}
#boot{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:var(--nx-ground);font-family:var(--nx-font-mono);font-size:0.85rem;color:var(--nx-ink-60);}
@media (max-width:680px){.moatnote{display:none;}#minimap{display:none;}#chips{top:104px;left:14px;right:14px;}#legend{left:14px;bottom:14px;}#rail .nx-input{width:96px;}#rail{right:14px;}}
</style>
</head>
<body>
<div id="stage"><div id="viewport"><div id="boardwrap"></div></div></div>
<header>
  <span class="nx-overline">YURI OS · deterministic spectral circuit</span>
  <h1>Living Circuitry</h1>
  <div class="subhead" id="subhead"></div>
  <p class="moatnote">Every organ sits where the wiring <span class="gold">solved it</span> — positions are eigenvectors of the graph Laplacian, not a force-blob. The <span class="gold">moat core</span> clusters because it is the most tightly-wired thing in YURI; the <span class="gold">orphan rim</span> is the file-only organs.</p>
</header>
<div id="rail">
  <input id="search" class="nx-input" type="text" placeholder="filter organs…" autocomplete="off" spellcheck="false">
  <button class="nx-btn" id="moatBtn" title="Spotlight the moat">◆ moat</button>
  <button class="nx-btn" id="labelBtn" title="Toggle all labels">labels</button>
  <button class="nx-btn" id="fit" title="Fit">fit</button>
  <button class="nx-btn" id="zin">+</button><button class="nx-btn" id="zout">−</button>
</div>
<div id="chips"></div>
<aside id="panel">
  <button id="closeP" aria-label="close">×</button>
  <div class="ph"><div class="p-layer" id="pLayer"></div><h2 id="pTitle"></h2><div class="statusrow" id="pStatus"></div></div>
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
  <div class="lg"><span class="sw" style="background:var(--nx-thread)"></span>calls</div>
  <div class="lg"><span class="sw" style="background:var(--nx-neutral)"></span>reads</div>
  <div class="lg"><span class="sw" style="background:var(--nx-patina-bright)"></span>writes</div>
  <div class="legrow">
    <div class="lg"><span class="dot" style="background:var(--nx-patina-bright)"></span>live</div>
    <div class="lg"><span class="dot" style="background:var(--nx-warn)"></span>dormant</div>
    <div class="lg"><span class="dot" style="background:var(--nx-risk)"></span>phantom</div>
    <div class="lg" style="color:var(--nx-thread)"><span class="dot" style="background:var(--nx-thread-bright)"></span>moat</div>
  </div>
</div>
<div id="minimap"></div>
<div id="boot">solving the circuit…</div>
<script id="graph-data" type="application/json">${json}</script>
<script>
"use strict";
var SVGNS="http://www.w3.org/2000/svg";
function el(t,c){var e=document.createElementNS(SVGNS,t);if(c)e.setAttribute("class",c);return e;}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","'":"&#39;"}[c];});}
var DATA=JSON.parse(document.getElementById("graph-data").textContent);
var CW=DATA.meta.canvas.w, CH=DATA.meta.canvas.h;
var byId=new Map(DATA.nodes.map(function(n){return [n.id,n];}));
var adj=new Map(DATA.nodes.map(function(n){return [n.id,[]];}));
DATA.edges.forEach(function(e){ if(adj.has(e.from))adj.get(e.from).push({dir:"out",other:e.to,kind:e.kind}); if(adj.has(e.to))adj.get(e.to).push({dir:"in",other:e.from,kind:e.kind}); });

document.getElementById("subhead").innerHTML=
  '<span><b>'+DATA.meta.nodeCount+'</b> organs</span><span class="sep">/</span>'+
  '<span><b>'+DATA.meta.graphEdgeCount+'</b> signal threads</span><span class="sep">/</span>'+
  '<span><b>'+DATA.meta.layerCount+'</b> layers</span><span class="sep">/</span>'+
  '<span><b>'+DATA.meta.counts.live+'</b> live · <b>'+DATA.meta.counts.dormant+'</b> dormant · <b>'+DATA.meta.counts.phantom+'</b> phantom</span>';

var svg=el("svg","board");
svg.setAttribute("width",CW);svg.setAttribute("height",CH);svg.setAttribute("viewBox","0 0 "+CW+" "+CH);

// hulls (districts)
var hullLayer=el("g","hulls");
DATA.hulls.forEach(function(h){
  var p=el("path","hull"+(h.moat?" moat":""));p.setAttribute("d",h.path);hullLayer.appendChild(p);
});
svg.appendChild(hullLayer);
// district labels
var dlabels=el("g","dlabels");
DATA.hulls.forEach(function(h){
  var t=el("text","dlabel"+(h.moat?" moat":""));t.setAttribute("x",h.labelX);t.setAttribute("y",h.labelY);t.setAttribute("text-anchor","middle");t.textContent=h.layer;dlabels.appendChild(t);
});

// edges (threads)
var edgeLayer=el("g","edges");var edgeEls=[];
DATA.edges.forEach(function(e){
  var a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)return;
  var p=el("path","edge "+e.kind);
  var mx=(a.x+b.x)/2, my=(a.y+b.y)/2, dx=b.x-a.x, dy=b.y-a.y, off=Math.sqrt(dx*dx+dy*dy)*0.12;
  var nx=-dy, ny=dx, nl=Math.sqrt(nx*nx+ny*ny)||1; mx+=nx/nl*off; my+=ny/nl*off;
  p.setAttribute("d","M"+a.x+" "+a.y+" Q "+mx+" "+my+" "+b.x+" "+b.y);
  p.dataset.from=e.from;p.dataset.to=e.to;edgeLayer.appendChild(p);edgeEls.push(p);
});
svg.appendChild(edgeLayer);

// nodes
var nodeLayer=el("g","nodes");var nodeEls=new Map();
DATA.nodes.forEach(function(n){
  var g=el("g","node"+(n.moat?" moat":""));g.setAttribute("data-status",n.status);g.dataset.id=n.id;
  g.setAttribute("transform","translate("+n.x+","+n.y+")");
  var halo=el("circle","halo");halo.setAttribute("r",n.r*0.62);halo.setAttribute("fill",n.moat?"#E3C677":"#4FB3A6");halo.setAttribute("opacity","0.15");g.appendChild(halo);
  var core=el("circle","core core-"+n.status);core.setAttribute("r",Math.max(2.6,n.r*0.36));g.appendChild(core);
  var t=el("text","nl");t.setAttribute("x",0);t.setAttribute("y",-n.r*0.62-4);t.setAttribute("text-anchor","middle");t.textContent=n.label.length>30?n.label.slice(0,29)+"…":n.label;g.appendChild(t);
  g.addEventListener("mouseenter",function(){if(!selected)highlight(n.id);});
  g.addEventListener("mouseleave",function(){if(!selected)clearHL();else highlight(selected);});
  g.addEventListener("click",function(ev){ev.stopPropagation();select(n.id);});
  nodeLayer.appendChild(g);nodeEls.set(n.id,g);
});
svg.appendChild(dlabels);svg.appendChild(nodeLayer);
document.getElementById("boardwrap").appendChild(svg);
var boot=document.getElementById("boot");if(boot)boot.remove();

function nbrs(id){var s=new Set([id]);(adj.get(id)||[]).forEach(function(a){s.add(a.other);});return s;}
function highlight(id){var keep=nbrs(id);
  nodeEls.forEach(function(g,nid){g.classList.toggle("dim",!keep.has(nid));});
  edgeEls.forEach(function(p){var on=p.dataset.from===id||p.dataset.to===id;p.classList.toggle("hl",on);p.classList.toggle("dim",!on);});}
function clearHL(){nodeEls.forEach(function(g){g.classList.remove("dim");});edgeEls.forEach(function(p){p.classList.remove("hl");p.classList.remove("dim");});}

var panel=document.getElementById("panel");var selected=null;
function select(id){var n=byId.get(id);if(!n)return;selected=id;
  nodeEls.forEach(function(g,nid){g.classList.toggle("sel",nid===id);});highlight(id);
  document.getElementById("pLayer").textContent=n.layer+(n.moat?"  ◆ moat":"");
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
    d.innerHTML='<span class="k">'+esc(x.kind)+'</span> <code style="display:inline;border:none;padding:0">'+esc(x.target)+'</code>'+(x.description?'<div class="d">'+esc(x.description)+'</div>':'');io.appendChild(d);});
  var cc=document.getElementById("pConn");cc.innerHTML="";var conns=adj.get(id)||[];
  document.getElementById("pConnSec").style.display=conns.length?"":"none";
  conns.forEach(function(a){var o=byId.get(a.other);if(!o)return;var d=document.createElement("div");d.className="conn";
    d.innerHTML='<span class="ar">'+esc(a.kind)+' '+(a.dir==="out"?"→":"←")+'</span><span>'+esc(o.label)+'</span>';
    d.addEventListener("click",function(){select(a.other);centerOn(a.other);});cc.appendChild(d);});
  panel.classList.add("open");}
function closePanel(){panel.classList.remove("open");selected=null;nodeEls.forEach(function(g){g.classList.remove("sel");});clearHL();}
document.getElementById("closeP").addEventListener("click",closePanel);

// pan / zoom
var stage=document.getElementById("stage"),vp=document.getElementById("viewport");
var scale=1,tx=0,ty=0;
function apply(){vp.style.transform="translate("+tx+"px,"+ty+"px) scale("+scale+")";updateMM();}
function clampS(s){return Math.min(5,Math.max(0.1,s));}
function fit(){var pad=80,aw=innerWidth-pad*2,ah=innerHeight-220;scale=clampS(Math.min(aw/CW,ah/CH));tx=(innerWidth-CW*scale)/2;ty=170+(ah-CH*scale)/2;if(ty<150)ty=150;apply();}
function centerOn(id){var n=byId.get(id);if(!n)return;tx=innerWidth/2-n.x*scale;ty=innerHeight/2-n.y*scale;apply();}
function zoomAt(cx,cy,f){var ns=clampS(scale*f);tx=cx-(cx-tx)*(ns/scale);ty=cy-(cy-ty)*(ns/scale);scale=ns;apply();}
stage.addEventListener("wheel",function(e){e.preventDefault();zoomAt(e.clientX,e.clientY,e.deltaY<0?1.12:0.89);},{passive:false});
var drag=null,pts=new Map(),pinch=null;
stage.addEventListener("pointerdown",function(e){pts.set(e.pointerId,e);
  if(pts.size===2){var a=[...pts.values()];pinch={d:Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY),s:scale};drag=null;return;}
  if(e.target.closest(".node"))return;drag={x:e.clientX,y:e.clientY,tx:tx,ty:ty};stage.classList.add("grabbing");});
stage.addEventListener("pointermove",function(e){if(pts.has(e.pointerId))pts.set(e.pointerId,e);
  if(pinch&&pts.size===2){var a=[...pts.values()];var nd=Math.hypot(a[0].clientX-a[1].clientX,a[0].clientY-a[1].clientY);var mx=(a[0].clientX+a[1].clientX)/2,my=(a[0].clientY+a[1].clientY)/2;var ns=clampS(pinch.s*(nd/pinch.d));tx=mx-(mx-tx)*(ns/scale);ty=my-(my-ty)*(ns/scale);scale=ns;apply();return;}
  if(drag){tx=drag.tx+(e.clientX-drag.x);ty=drag.ty+(e.clientY-drag.y);apply();}});
function endPt(e){pts.delete(e.pointerId);if(pts.size<2)pinch=null;if(pts.size===0){drag=null;stage.classList.remove("grabbing");}}
stage.addEventListener("pointerup",endPt);stage.addEventListener("pointercancel",endPt);
stage.addEventListener("click",function(e){if(!e.target.closest(".node")&&!e.target.closest("#panel"))closePanel();});
document.getElementById("fit").addEventListener("click",fit);
document.getElementById("zin").addEventListener("click",function(){zoomAt(innerWidth/2,innerHeight/2,1.2);});
document.getElementById("zout").addEventListener("click",function(){zoomAt(innerWidth/2,innerHeight/2,0.83);});

// minimap
var MM_W=200,MM_H=Math.max(110,Math.round(200*CH/CW)),mmS=MM_W/CW;
var mm=document.getElementById("minimap");
var msvg=el("svg");msvg.setAttribute("width",MM_W);msvg.setAttribute("height",MM_H);msvg.setAttribute("viewBox","0 0 "+MM_W+" "+MM_H);
DATA.nodes.forEach(function(n){var c=el("circle");c.setAttribute("cx",n.x*mmS);c.setAttribute("cy",n.y*mmS);c.setAttribute("r",n.moat?1.8:1.1);c.setAttribute("fill",n.moat?"#E3C677":(n.status==="phantom"?"#C76E63":n.status==="dormant"?"#D7A24A":"#4FB3A6"));c.setAttribute("opacity",n.moat?0.95:0.5);msvg.appendChild(c);});
var mmView=el("rect");mmView.setAttribute("id","mmView");msvg.appendChild(mmView);mm.appendChild(msvg);
function updateMM(){var vx=(-tx/scale)*mmS,vy=(-ty/scale)*mmS,vw=(innerWidth/scale)*mmS,vh=(innerHeight/scale)*mmS;mmView.setAttribute("x",Math.max(0,vx));mmView.setAttribute("y",Math.max(0,vy));mmView.setAttribute("width",Math.min(MM_W,vw));mmView.setAttribute("height",Math.min(MM_H,vh));}
mm.addEventListener("click",function(e){var r=msvg.getBoundingClientRect();var bx=(e.clientX-r.left)/mmS,by=(e.clientY-r.top)/mmS;tx=innerWidth/2-bx*scale;ty=innerHeight/2-by*scale;apply();});

// chips
var chipBox=document.getElementById("chips");var activeLayer=null;
DATA.layers.forEach(function(L){if(!L.count)return;var c=document.createElement("button");c.className="chip"+(L.moat?" moat":"");c.innerHTML=esc(L.name)+'<span class="c">'+L.count+'</span>';
  c.addEventListener("click",function(){
    if(activeLayer===L.name){activeLayer=null;c.classList.remove("on");clearHL();return;}
    activeLayer=L.name;[].forEach.call(chipBox.children,function(x){x.classList.remove("on");});c.classList.add("on");
    nodeEls.forEach(function(g,id){g.classList.toggle("dim",byId.get(id).layer!==L.name);});
    edgeEls.forEach(function(p){var on=byId.get(p.dataset.from).layer===L.name||byId.get(p.dataset.to).layer===L.name;p.classList.toggle("dim",!on);p.classList.toggle("hl",on);});
  });chipBox.appendChild(c);});

// moat spotlight
var moatBtn=document.getElementById("moatBtn"),moatOn=false;
moatBtn.addEventListener("click",function(){moatOn=!moatOn;moatBtn.classList.toggle("active",moatOn);
  if(moatOn){nodeEls.forEach(function(g,id){g.classList.toggle("dim",!byId.get(id).moat);});edgeEls.forEach(function(p){var on=byId.get(p.dataset.from).moat&&byId.get(p.dataset.to).moat;p.classList.toggle("dim",!on);p.classList.toggle("hl",on);});}else{clearHL();}});

// labels toggle
var labelBtn=document.getElementById("labelBtn"),labelsOn=false;
labelBtn.addEventListener("click",function(){labelsOn=!labelsOn;labelBtn.classList.toggle("active",labelsOn);nodeEls.forEach(function(g){g.classList.toggle("showlabel",labelsOn);});});

// search
document.getElementById("search").addEventListener("input",function(e){var q=e.target.value.trim().toLowerCase();
  if(!q){clearHL();return;}var hit=new Set();
  DATA.nodes.forEach(function(n){if((n.label+" "+n.description+" "+n.layer+" "+n.files.join(" ")+" "+n.triggeredBy).toLowerCase().indexOf(q)>=0)hit.add(n.id);});
  nodeEls.forEach(function(g,id){g.classList.toggle("dim",!hit.has(id));});
  edgeEls.forEach(function(p){p.classList.toggle("dim",!(hit.has(p.dataset.from)&&hit.has(p.dataset.to)));});});

addEventListener("keydown",function(e){if(e.key==="Escape")closePanel();if(e.key==="f")fit();if(e.key==="/"&&document.activeElement.id!=="search"){e.preventDefault();document.getElementById("search").focus();}});
fit();
</script>
</body>
</html>`;

const OUT = join(HERE, "yuri-circuitry-instrument.html");
writeFileSync(OUT, html, "utf8");
console.log("WROTE " + OUT);
console.log("nodes=" + payload.meta.nodeCount + " graphEdges=" + payload.meta.graphEdgeCount +
  " live=" + counts.live + " dormant=" + counts.dormant + " phantom=" + counts.phantom +
  " components=" + payload.meta.atlasMeta.components + " giant=" + payload.meta.atlasMeta.giant +
  " orphans=" + payload.meta.atlasMeta.orphans + " canvas=" + atlas.canvas.w + "x" + atlas.canvas.h);
