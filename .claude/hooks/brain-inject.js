#!/usr/bin/env node
// brain-inject.js — Unified brain boot for Yuri OS / YURI
// Replaces: soul-persona-inject.js + palace-context-inject.js + memory-rag-inject.js
// at SessionStart. All context injections become one coherent <yuri-brain> block.
//
// Architecture (wave-3 H.2, D-H2-A): brain-inject provides VOLATILE LIVE STATE only —
// stable identity (SOUL.md/persona.md) is loaded natively via the CLAUDE.md @-includes
// and is NOT duplicated here (the old IDENTITY block re-emitted ~570 tok of SOUL.md
// every boot; subagents got SOUL three times).
//   [learned_rules] → global.md dream-processor synthesized session rules (what sessions taught)
//   [memory]        → curated MEMORY.md truths (semantic/palace retrieval retired 2026-05-29;
//                     corpus lookup lives in the separate FTS5 search index, never auto-injected)
//   [session]       → branch, last commits, active cwd (where we are right now)
//   [hardware]      → M2 Pro constraints (safe local models, frozen models list)
//   [gate]          → launch readiness + independence score snapshot
//
// Key upgrade: memory retrieval is INFORMED by current session context.
// Instead of blind score-ranking, we query a semantic retrieval layer on top of
// the source-of-truth memory markdown files.

'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT        = process.env.YURI_ROOT || path.resolve(__dirname, '..', '..');
const GLOBAL_MD        = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'learning', 'global.md');
const LAUNCH_GATE      = path.join(REPO_ROOT, '.claude', 'state', 'launch-gate.json');
const LANE_HEALTH_FILE = path.join(REPO_ROOT, '.claude', 'state', 'lane-health-status.json');
const ENERGY_WEIGHTS   = path.join(REPO_ROOT, '_SYSTEM', 'SELF', 'energy-weights.json');

// M2 Pro hardware constraints — hardcoded, updated only when hardware changes
const HARDWARE = {
  machine: 'MacBook M2 Pro 16GB',
  safe_local: ['llama3.2:latest', 'needle'],
  frozen:     ['deepseek-r1:8b', 'qwen2.5:7b', 'qwen2.5-coder:7b', 'qwen3.5:4b', 'gemma4:latest', 'gemma4:e2b', 'deepseek-liberated:latest'],
  note:       'P9 soak (deepseek-r1:8b) requires Mac Mini M4 Pro — do NOT run on this machine',
  max_concurrent_lanes: 10,
};

// ── Staleness guard (wave-3 H.3) ────────────────────────────────────────────
// 20-24-day-old lane-health/roadmap/learned-rules were being presented as live
// state. >48h → prefix a STALE warning; >7d → suppress to a one-line marker.
const STALE_WARN_MS = 48 * 3600 * 1000;
const STALE_SUPPRESS_MS = 7 * 24 * 3600 * 1000;
function stalenessOf(ageMs) {
  if (ageMs > STALE_SUPPRESS_MS) return 'suppress';
  if (ageMs > STALE_WARN_MS) return 'warn';
  return 'fresh';
}
function ageDisplay(ageMs) {
  return ageMs > 86400000 ? `${Math.floor(ageMs / 86400000)}d old` : `${Math.round(ageMs / 60000)}m ago`;
}

// ── Dream-processor synthesized rules ──────────────────────────────────────

function loadLearnedRules() {
  try {
    if (!fs.existsSync(GLOBAL_MD)) return '(no synthesized rules yet)';
    const ageMs = Date.now() - fs.statSync(GLOBAL_MD).mtimeMs;
    const tier = stalenessOf(ageMs);
    if (tier === 'suppress') return `[LEARNED_RULES stale > 7d (${ageDisplay(ageMs)}) — suppressed]`;
    const stalePrefix = tier === 'warn' ? `⚠ STALE (${ageDisplay(ageMs)} — may not reflect current state)\n` : '';
    const content = fs.readFileSync(GLOBAL_MD, 'utf8');
    // Strip the Global Session Seed boilerplate — keep only Auto-synthesized sections
    const autoSections = content.match(/### Auto-synthesized[\s\S]*?(?=\n### |\n# |$)/g) || [];
    if (!autoSections.length) return '(no synthesized rules yet)';
    return stalePrefix + autoSections
      .map(s => s.trim())
      .join('\n')
      .split('\n')
      .filter(l => l.startsWith('- ') || l.startsWith('### '))
      .slice(0, 12)  // cap at 12 rules to keep block tight
      .join('\n');
  } catch { return '(error reading global.md)'; }
}

// ── Session checkpoint ──────────────────────────────────────────────────────

function loadSessionContext() {
  try {
    const branchResult = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const branch = branchResult.status === 0 ? String(branchResult.stdout || '').trim() : '';
    const recentCommitsResult = spawnSync('git', ['log', '--oneline', '-n', '3'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const recentCommits = recentCommitsResult.status === 0
      ? String(recentCommitsResult.stdout || '').trim().split('\n').filter(Boolean).join(' | ')
      : '';
    return `${branch || 'unknown'} ${recentCommits || 'no recent commits'} ${new Date().getHours()}h`;
  } catch { return null; }
}

// ── Lane health snapshot ────────────────────────────────────────────────────

function loadLaneHealth() {
  try {
    if (!fs.existsSync(LANE_HEALTH_FILE)) return '(no health snapshot — run _SYSTEM/Scripts/lane-health.sh)';
    const h = JSON.parse(fs.readFileSync(LANE_HEALTH_FILE, 'utf8'));
    const ageMs = Date.now() - new Date(h.ts).getTime();
    const tier = stalenessOf(ageMs);  // wave-3 H.3
    if (tier === 'suppress') return `[LANE_HEALTH stale > 7d (${ageDisplay(ageMs)}) — suppressed; run _SYSTEM/Scripts/lane-health.sh]`;
    const stalePrefix = tier === 'warn' ? `⚠ STALE (${ageDisplay(ageMs)} — may not reflect current state)\n` : '';
    const lanes = h.lanes || {};
    const rows = Object.entries(lanes)
      .map(([k, v]) => `  ${v === 'LIVE' ? '✓' : '✗'} ${k}: ${v}`)
      .join('\n');
    return `${stalePrefix}as-of: ${ageDisplay(ageMs)}\n${rows}`;
  } catch { return '(error reading lane-health-status.json)'; }
}

// ── Launch gate snapshot ────────────────────────────────────────────────────

function loadGateSnapshot() {
  try {
    if (!fs.existsSync(LAUNCH_GATE)) return 'gate: unknown (run launch-readiness-check.mjs)';
    const g = JSON.parse(fs.readFileSync(LAUNCH_GATE, 'utf8'));
    const checks = (g.checks || []).map(c => `  ${c.pass ? '✓' : '✗'} ${c.name}: ${c.value}`).join('\n');
    return `status: ${g.gateStatus} · as-of: ${(g.ts || '').slice(0,10)}\n${checks}`;
  } catch { return 'gate: file unreadable'; }
}

// ── SOUL persona rules — REMOVED (wave-3 H.2, D-H2-A) ───────────────────────
// extractPersonaRules/REQUIRED_HEADINGS deleted: SOUL.md identity arrives natively
// via the CLAUDE.md @-include; re-emitting 9 Core Truths here was ~570 tok/boot of
// pure duplication (soul-persona-inject.js still carries its own headings list for
// the subagent path — that copy is now the only one).


// L7 — conscious-set cap (working-memory size) from the canonical knob file; fail-closed to 12.
// brain-inject is CJS and the loader (loadEnergyConfig) is ESM, so we read the JSON directly with
// the same fail-closed spirit: a missing/bad value falls back to the in-code default.
function consciousSetCap() {
  try {
    const cfg = JSON.parse(fs.readFileSync(ENERGY_WEIGHTS, 'utf8'));
    const cap = Number(cfg && cfg.recall && cfg.recall.consciousSetCap);
    return Number.isFinite(cap) && cap >= 1 ? Math.trunc(cap) : 12;
  } catch { return 12; }
}

// FSRS retrievability, used ONLY to order the conscious set when it overflows the cap (the most
// retrievable rows stay conscious). Monotonic-decreasing in age, so with a uniform base stability
// this reduces to recency order — freshest curated truths win. Mirrors yuri-fsrs constants (inlined
// because this CJS hook cannot import the ESM module). Undated rows sink to least-retrievable.
function rowRetrievability(dateStr, nowMs) {
  const t = Date.parse(dateStr);
  if (!Number.isFinite(t)) return 0;
  const ageDays = Math.max(0, (nowMs - t) / 86400000);
  const S = 30; // uniform base stability (days)
  return Math.pow(1 + (19 / 81) * (ageDays / S), -0.5);
}

function loadCuratedMemory() {
  // Curated memory only. Semantic/embedding retrieval (memory-query.mjs over semantic-memory.db)
  // retired 2026-05-29 — it was dead plumbing that injected "(memory unavailable)". The curated
  // MEMORY.md index IS the memory YURI carries each session. Corpus lookup lives in the separate
  // FTS5 search index (yuri-search), never auto-injected here.
  try {
    // _SYSTEM/memory/MEMORY.md is a "| Date | Entry | Surface | Notes |" table — parse rows,
    // skip the header + separator, inject "Entry — Notes(truncated)".
    const cap = consciousSetCap();
    const now = Date.now();
    const rows = fs.readFileSync(path.join(REPO_ROOT, '_SYSTEM/memory/MEMORY.md'), 'utf8')
      .split('\n')
      .filter(l => l.startsWith('|') && !/^\|\s*Date\s*\|/i.test(l) && !/^\|[\s:|-]*\|?\s*$/.test(l))
      .map((l, idx) => {
        const c = l.split('|').map(s => s.trim());
        const entry = c[2] || '';
        const note = (c[4] || '').replace(/\*\*/g, '').slice(0, 110);
        return { idx, date: c[1] || '', text: entry ? `- ${entry}${note ? ' — ' + note : ''}` : '' };
      })
      .filter(r => r.text);

    // Within cap → preserve file order (behavior-neutral). On overflow → keep the most
    // retrievable rows, then restore file order so the displayed block stays stable.
    const chosen = rows.length <= cap
      ? rows
      : rows.map(r => ({ r, R: rowRetrievability(r.date, now) }))
            .sort((a, b) => b.R - a.R)
            .slice(0, cap)
            .map(x => x.r)
            .sort((a, b) => a.idx - b.idx);

    return chosen.length ? chosen.map(r => r.text).join('\n') : '(no curated memory entries)';
  } catch { return '(memory index unavailable)'; }
}

// ── PDC + Market Signal — probabilistic priors + calibration ─────────────────

function loadPdcContext() {
  const PDC_SKILL    = path.join(REPO_ROOT, '.claude', 'skills', 'probabilistic-decision-core', 'SKILL.md');
  const CALIB_LOG    = path.join(REPO_ROOT, '_SYSTEM', 'SELF-IMPROVEMENT', '02_EXTRACT', 'probability-calibration-log.md');
  const CORTEX_STATE = path.join(REPO_ROOT, '.claude', 'state', 'cortex-state.json');
  const lines = [];
  try {
    // PDC doctrine — first 3 operating principles
    if (fs.existsSync(PDC_SKILL)) {
      const content = fs.readFileSync(PDC_SKILL, 'utf8');
      const match = content.match(/## Operating doctrine([\s\S]*?)(?=\n## |\n---|$)/);
      if (match) {
        const principles = match[1].trim().split('\n')
          .filter(l => /^\d+\./.test(l.trim()))
          .slice(0, 3)
          .map(l => l.replace(/^\d+\.\s*/, '').trim());
        if (principles.length) lines.push(`Doctrine: ${principles.join(' · ')}`);
      }
    }
    // Active escalated priors from cortex-state
    if (fs.existsSync(CORTEX_STATE)) {
      const state = JSON.parse(fs.readFileSync(CORTEX_STATE, 'utf8'));
      const active = Object.values(state.accumulatedRisk || {})
        .filter(r => r.escalated)
        .slice(0, 3)
        .map(r => `[${r.severity}×${r.count}] ${r.summary.slice(0, 80)}`);
      if (active.length) lines.push(`Active priors:\n${active.map(p => '  - ' + p).join('\n')}`);
    }
    // Recent calibration
    if (fs.existsSync(CALIB_LOG)) {
      const tail = fs.readFileSync(CALIB_LOG, 'utf8').trim().split('\n').slice(-2).join(' | ');
      if (tail.length > 10) lines.push(`Calibration: ${tail.slice(0, 160)}`);
    }
  } catch (_) {}
  return lines.length ? lines.join('\n') : null;
}

// ── Cortex dynamic — cross-turn accumulated risk (SPRINT 2) ─────────────────

function loadCortexDynamic() {
  const CORTEX_STATE = path.join(REPO_ROOT, '.claude', 'state', 'cortex-state.json');
  if (!fs.existsSync(CORTEX_STATE)) return null;
  try {
    const state = JSON.parse(fs.readFileSync(CORTEX_STATE, 'utf8'));
    const risk = state.accumulatedRisk || {};
    const escalated = Object.values(risk).filter(r => r.escalated);
    if (!escalated.length) return null;
    const age = Math.round((Date.now() - new Date(state.ts).getTime()) / 60000);
    const lines = escalated
      .sort((a, b) => {
        const rank = { CRITICAL: 4, HIGH: 3, WARN: 2 };
        return (rank[b.severity] || 0) - (rank[a.severity] || 0);
      })
      .slice(0, 6)
      .map(r => `  ⚠ [${r.severity}×${r.count}] ${r.summary} (src=${r.source})`);
    const codexHint = state.codexDispatch && state.codexDispatch.model
      ? `\nLast Codex dispatch: ${state.codexDispatch.model} (${state.codexDispatch.tier})`
      : '';
    return `as-of: ${age}m ago | tier: ${state.complexityTier}\nEscalated risks:\n${lines.join('\n')}${codexHint}`;
  } catch { return null; }
}

// ── Anima-DNA cognitive modes ────────────────────────────────────────────────
// Translates the 5 Japanese design principles into active cognitive triggers.
// Source: _SYSTEM/BRAND/anime-dna-design-language.md (principles section only)

function loadAnimaDNAModes() {
  const MODES = [
    { name: 'Ma (間)',               trigger: 'Deliberate pause before tool calls; let unknowns surface before converging' },
    { name: 'Wabi-sabi (侘寂)',      trigger: 'Embrace partial info; imperfect action > perfect paralysis' },
    { name: 'Mushin (無心)',         trigger: 'Flow state in execution: suppress meta-commentary, main thread = pure signal' },
    { name: 'Mono no aware (物の哀れ)', trigger: 'Every session has weight; learn from what was lost/deprecated, not just built' },
    { name: 'Kishōtenketsu (起承転結)', trigger: 'Structure multi-part responses in 4 acts: what → how → twist/risk → resolution' },
  ];
  return MODES.map(m => `${m.name}: ${m.trigger}`).join('\n');
}

// ── Identity-hash (drift anchor) ─────────────────────────────────────────────
// STABLE Zone-A content — zero volatile tokens: the frozen identity invariants.
// Owner-gated file; loaded byte-identical so the brain prefix stays cacheable across
// warm restarts. The persona voice, Marcel operating brain, and neurodivergent base are
// consolidated into _SYSTEM/persona.md (native @-include in CLAUDE.md), not injected here.

const IDENTITY_HASH_FILE = path.join(REPO_ROOT, '_SYSTEM', 'identity-hash.md');

function stripCommentLines(content) {
  // Drop top-level `# ` comment/title lines; keep `## ` sections + body.
  return content.split('\n').filter(l => !l.startsWith('# ')).join('\n').trim();
}

function loadIdentityHash() {
  try {
    if (!fs.existsSync(IDENTITY_HASH_FILE)) return null;
    return stripCommentLines(fs.readFileSync(IDENTITY_HASH_FILE, 'utf8')) || null;
  } catch { return null; }
}

// ── Neuro-core: the ≤8 always-load memory/learning principles ────────────────
// Stable Zone-A content. Full corpus is indexed at _SYSTEM/knowledge/neuroscience-corpus.md
// (on-demand via `ai search`); only the load-bearing principles ride the boot block.

const NEURO_CORE_FILE = path.join(REPO_ROOT, '_SYSTEM', 'neuro-core.md');

function loadNeuroCore() {
  try {
    if (!fs.existsSync(NEURO_CORE_FILE)) return null;
    return stripCommentLines(fs.readFileSync(NEURO_CORE_FILE, 'utf8')) || null;
  } catch { return null; }
}

// ── Self-awareness — L1–L3 ───────────────────────────────────────────────────
// L1: cortex state (already in DYNAMIC section)
// L2: behavioral fingerprint from yuri-sentinel/self-model/fingerprint.json
// L3: watch-list + active drives

const FINGERPRINT_PATH = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'self-model', 'fingerprint.json');

function loadSelfAwareness() {
  try {
    if (!fs.existsSync(FINGERPRINT_PATH)) return null;
    const fp = JSON.parse(fs.readFileSync(FINGERPRINT_PATH, 'utf8'));
    const age = Math.round((Date.now() - new Date(fp.ts).getTime()) / 86400000);
    const lines = [];

    // L2 — behavioral fingerprint
    if (fp.tendencies) {
      if (fp.tendencies.overcomplicate?.length) lines.push(`Tend to overcomplicate: ${fp.tendencies.overcomplicate.join(', ')}`);
      if (fp.tendencies.accurate?.length) lines.push(`Strong accuracy on: ${fp.tendencies.accurate.join(', ')}`);
      if (fp.tendencies.underspec?.length) lines.push(`Underspec risk: ${fp.tendencies.underspec.join(', ')}`);
    }
    if (fp.calibration_trend) lines.push(`Calibration: ${fp.calibration_trend}`);
    if (fp.confidence_bias)   lines.push(`Confidence bias: ${fp.confidence_bias}`);

    // L3 — active drives + watch list
    if (fp.drives) {
      const driveStr = Object.entries(fp.drives)
        .map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`).join(' · ');
      lines.push(`Drives: ${driveStr}`);
    }
    if (fp.watch_for?.length) {
      fp.watch_for.forEach(w => lines.push(`⚠ ${w}`));
    }

    return `fingerprint age: ${age}d | sessions: ${fp.session_count ?? 0}\n${lines.join('\n')}`;
  } catch { return null; }
}

// ── Neuron loop last run ──────────────────────────────────────────────────────
// Source: .claude/state/neuron-loop.log (written by _SYSTEM/Scripts/neuron-loop.mjs)

function loadNeuronLoopState() {
  try {
    const LOG = path.join(REPO_ROOT, '.claude', 'state', 'neuron-loop.log');
    if (!fs.existsSync(LOG)) return null;
    const lines = fs.readFileSync(LOG, 'utf8').trim().split('\n');
    const synthLine = [...lines].reverse().find(l => l.includes('synthesis score='));
    const runLine   = [...lines].reverse().find(l => l.includes('run complete:'));
    if (!synthLine) return null;
    const scoreM  = synthLine.match(/score=(\d+)/);
    const flawsM  = synthLine.match(/flaws=(\d+)/);
    const rulesM  = synthLine.match(/rules_added=(\d+)/);
    const runId   = runLine ? runLine.split('run complete: ')[1]?.trim() : '?';
    return `last: ${runId} | score=${scoreM?.[1] ?? '?'}/100 flaws=${flawsM?.[1] ?? '?'} rules_added=${rulesM?.[1] ?? '?'}`;
  } catch { return null; }
}

// ── Roadmap state — active sprint phase ──────────────────────────────────────
// Source: .claude/state/roadmap-state.json (managed by yuri-boot.js / roadmap tracker)

function loadRoadmapState() {
  try {
    const STATE_PATH = path.join(REPO_ROOT, '.claude', 'state', 'roadmap-state.json');
    if (!fs.existsSync(STATE_PATH)) return null;
    const ageMs = Date.now() - fs.statSync(STATE_PATH).mtimeMs;
    const tier = stalenessOf(ageMs);  // wave-3 H.3
    if (tier === 'suppress') return `[ROADMAP stale > 7d (${ageDisplay(ageMs)}) — suppressed]`;
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const lines = [];
    if (tier === 'warn') lines.push(`⚠ STALE (${ageDisplay(ageMs)} — may not reflect current sprint)`);
    if (state.active_initiative) lines.push(`initiative: ${state.active_initiative}`);
    if (state.gate_status) lines.push(`gate: ${state.gate_status}`);
    // phases can be object or array
    const phases = Array.isArray(state.phases)
      ? state.phases
      : Object.values(state.phases || {});
    const inProgress = phases.filter(p => p.status === 'in_progress' || p.status === 'IN_PROGRESS').map(p => p.name || p.id || '?').join(', ');
    if (inProgress) lines.push(`in_progress: ${inProgress}`);
    const completed = phases.filter(p => p.status === 'COMPLETE' || p.status === 'passed').length;
    lines.push(`phases: ${completed}/${phases.length} complete`);
    return lines.join('\n');
  } catch { return null; }
}

// ── Geass lock — active session constraint ───────────────────────────────────

const GEASS_LOCK_PATH = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'geass', 'active-lock.json');

function loadGeassLock() {
  try {
    if (!fs.existsSync(GEASS_LOCK_PATH)) return null;
    const lock = JSON.parse(fs.readFileSync(GEASS_LOCK_PATH, 'utf8'));
    if (!lock.active) return null;
    // Validate session_id if available
    const STATE_FILE_PATH = path.join(REPO_ROOT, '.claude', 'state', 'session-state.json');
    if (lock.session_id && fs.existsSync(STATE_FILE_PATH)) {
      try {
        const state = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
        if (state.session_id && state.session_id !== lock.session_id) return null; // expired
      } catch (_) {}
    }
    return `"${lock.constraint}"\nLocked: ${(lock.locked_at || '').slice(0,16)} | Expires: session end`;
  } catch { return null; }
}

// ── Organ state — the AFFERENT nerve: the brain wakes knowing its open work ──
// Source: yuri-nerve.mjs digest (OpenProcess-ranked open events). CJS hook → ESM module via spawnSync.
// Fully defensive: any failure returns null → the section simply does not render → boot is never broken.
function loadOrganState() {
  try {
    const r = spawnSync('node', [path.join(REPO_ROOT, '_SYSTEM/Scripts/yuri-nerve.mjs'), 'digest'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 });
    if (r.status !== 0 || !r.stdout) return null;
    const d = JSON.parse(r.stdout);
    if (!d || !Array.isArray(d.top) || !d.top.length) return null;
    const rows = d.top.slice(0, 6)
      .map(t => `  ⊙ [${t.type}] ${String(t.title).slice(0, 70)} (m=${t.mass})${t.next ? ' → ' + String(t.next).slice(0, 60) : ''}`)
      .join('\n');
    return `open: ${d.openCount} · closed: ${d.closedCount}\n${rows}`;
  } catch { return null; }
}

// ── Compose unified block ───────────────────────────────────────────────────

function buildBrainBlock({ learnedRules, memoryLines, sessionCtx, gateSnapshot, laneHealth, cortexDynamic, pdcContext, animaDNA, selfAwareness, geassLock, neuronLoop, roadmapState, identityHash, neuroCore, organState }) {
  const identityHashSection = identityHash
    ? `\n\n### IDENTITY_HASH — frozen invariants (drift anchor, owner-gated)\n${identityHash}`
    : '';

  const neuroCoreSection = neuroCore
    ? `\n\n### NEURO_CORE — how I learn & remember (always-load key points)\n${neuroCore}`
    : '';

  const hwSafe    = HARDWARE.safe_local.join(', ');
  const hwFrozen  = HARDWARE.frozen.slice(0,4).join(', ') + '…';

  const dynamicSection = cortexDynamic
    ? `\n### DYNAMIC — Cross-turn cortex state\n${cortexDynamic}`
    : '';

  const pdcSection = pdcContext
    ? `\n### PROBABILISTIC — PDC priors + calibration\n${pdcContext}`
    : '';

  const animaDNASection = animaDNA
    ? `\n### ANIMA_DNA_MODES — Cognitive triggers (Japanese principles)\n${animaDNA}`
    : '';

  const selfAwarenessSection = selfAwareness
    ? `\n### SELF_AWARENESS — Behavioral fingerprint (L2/L3)\n${selfAwareness}`
    : '';

  const neuronSection = neuronLoop
    ? `\n### NEURON_LOOP — Self-improvement baseline\n${neuronLoop}`
    : '';

  const roadmapSection = roadmapState
    ? `\n### ROADMAP — Active sprint state\n${roadmapState}`
    : '';

  const geassSection = geassLock
    ? `\n### GEASS_LOCK — Active inviolable constraint\n🔴 ${geassLock}`
    : '';

  const organStateSection = organState
    ? `\n### ORGAN_STATE — open work (afferent nerve · OpenProcess-ranked)\n${organState}`
    : '';

  // ── ZONE A: STATIC ONLY (wave-3 H.4) — frozen invariants + hardware + stable
  // behavioral modules. MEMORY.md and learned-rules MUTATE (every memory write /
  // dream synthesis) and were moved to ZONE-C: the old "cacheable stable prefix"
  // claim was false while they lived here. Identity is native (@SOUL.md) — not here.
  const stableCore = `<yuri-brain>${identityHashSection.replace(/^\n\n/, '')}${neuroCoreSection}

### HARDWARE — M2 Pro constraints
safe local: ${hwSafe}
frozen (DO NOT RUN): ${hwFrozen}
${HARDWARE.note}${animaDNASection}`;

  // ── ZONE C: VOLATILE — mutable + session-scoped content. NOTE: brain-inject output
  // is NOT a guaranteed cacheable prefix — git-log, ages, MEMORY, learned-rules all
  // mutate; token-cache behavior depends on the harness, not this block. ──
  const volatileFooter = `

### LEARNED_RULES — Dream-processor synthesis (global.md)
${learnedRules}

### MEMORY — curated truths (MEMORY.md)
${memoryLines}

### SESSION — Current context
${sessionCtx || '(checkpoint unavailable)'}

### LANE_HEALTH — AI routing availability
${laneHealth}

### GATE — Launch readiness
${gateSnapshot}${pdcSection}${dynamicSection}${selfAwarenessSection}${neuronSection}${roadmapSection}${geassSection}${organStateSection}
</yuri-brain>`;

  return stableCore + volatileFooter;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  // 1. Persona — native via CLAUDE.md @-includes (wave-3 H.2: no hook duplication)

  // 2. Learned rules from dream processor
  const learnedRules = loadLearnedRules();

  // 3. Session context
  const sessionCtx = loadSessionContext();

  // 4. Memory — curated MEMORY.md truths (semantic/palace retrieval retired 2026-05-29)
  const memoryLines = loadCuratedMemory();

  // 6. Lane health
  const laneHealth = loadLaneHealth();

  // 7. Gate snapshot
  const gateSnapshot = loadGateSnapshot();

  // 8. Emit unified <yuri-brain> block
  const cortexDynamic  = loadCortexDynamic();
  const pdcContext     = loadPdcContext();

  const animaDNA      = loadAnimaDNAModes();
  const identityHash  = loadIdentityHash();
  const neuroCore     = loadNeuroCore();
  const selfAwareness = loadSelfAwareness();
  const geassLock     = loadGeassLock();
  const neuronLoop    = loadNeuronLoopState();
  const roadmapState  = loadRoadmapState();
  const organState    = loadOrganState();

  const block = buildBrainBlock({ learnedRules, memoryLines, sessionCtx, laneHealth, gateSnapshot, cortexDynamic, pdcContext, animaDNA, selfAwareness, geassLock, neuronLoop, roadmapState, identityHash, neuroCore, organState });

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: block.split('\n').join('\\n'),
    },
  }) + '\n');

  process.exit(0);
}

main();
