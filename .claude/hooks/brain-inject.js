#!/usr/bin/env node
// brain-inject.js — Unified brain boot for Yuri OS / NUDIMMUD
// Replaces: soul-persona-inject.js + palace-context-inject.js + memory-rag-inject.js
// at SessionStart. All context injections become one coherent <yuri-brain> block.
//
// Architecture:
//   [identity]      → SOUL.md persona rules (who Yuri is, how to think)
//   [learned_rules] → global.md dream-processor synthesized session rules (what sessions taught)
//   [spatial]       → palace-index.md top hub concepts (what's most active in the vault)
//   [memory]        → semantic memory query over memory files (session-context relevant)
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

const REPO_ROOT        = process.env.NUDIMMUD_ROOT || '/Users/marcelspatz/YURI-OS-MUSUBI';
const SOUL_FILE        = path.join(REPO_ROOT, 'SOUL.md');
const GLOBAL_MD        = path.join(REPO_ROOT, '.claude', 'yuri-sentinel', 'learning', 'global.md');
const PALACE_PATHS     = [path.join(REPO_ROOT, 'claude-palace-out', 'palace-index.md')];
const STATE_FILE       = path.join(REPO_ROOT, '.claude', 'state', 'session-state.json');
const LAUNCH_GATE      = path.join(REPO_ROOT, '.claude', 'state', 'launch-gate.json');
const LANE_HEALTH_FILE = path.join(REPO_ROOT, '.claude', 'state', 'lane-health-status.json');

// M2 Pro hardware constraints — hardcoded, updated only when hardware changes
const HARDWARE = {
  machine: 'MacBook M2 Pro 16GB',
  safe_local: ['llama3.2:latest', 'needle'],
  frozen:     ['deepseek-r1:8b', 'qwen2.5:7b', 'qwen2.5-coder:7b', 'qwen3.5:4b', 'gemma4:latest', 'gemma4:e2b', 'deepseek-liberated:latest'],
  note:       'P9 soak (deepseek-r1:8b) requires Mac Mini M4 Pro — do NOT run on this machine',
  max_concurrent_lanes: 10,
};

// ── Dream-processor synthesized rules ──────────────────────────────────────

function loadLearnedRules() {
  try {
    if (!fs.existsSync(GLOBAL_MD)) return '(no synthesized rules yet)';
    const content = fs.readFileSync(GLOBAL_MD, 'utf8');
    // Strip the Global Session Seed boilerplate — keep only Auto-synthesized sections
    const autoSections = content.match(/### Auto-synthesized[\s\S]*?(?=\n### |\n# |$)/g) || [];
    if (!autoSections.length) return '(no synthesized rules yet)';
    return autoSections
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
    if (!fs.existsSync(LANE_HEALTH_FILE)) return '(no health snapshot — run Scripts/lane-health.sh)';
    const h = JSON.parse(fs.readFileSync(LANE_HEALTH_FILE, 'utf8'));
    const age = Math.round((Date.now() - new Date(h.ts).getTime()) / 60000);
    const lanes = h.lanes || {};
    const rows = Object.entries(lanes)
      .map(([k, v]) => `  ${v === 'LIVE' ? '✓' : '✗'} ${k}: ${v}`)
      .join('\n');
    return `as-of: ${age}m ago\n${rows}`;
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

// ── SOUL persona rules ──────────────────────────────────────────────────────

const REQUIRED_HEADINGS = [
  'Be an adversarial ally.',
  'Use contextual edge without corrupting the work.',
  'Treat rules as testable machinery.',
  'Think with a cognitive workflow, not a costume.',
  'Run divergent scan before convergence when the task benefits.',
  'Use monotropic depth with exit checks.',
  'Switch salience deliberately.',
  'Use polymathic transfer with verification.',
  'Compress into lattice maps.',
];

function extractPersonaRules(content) {
  const paragraphs = content.split(/\n\s*\n/);
  const rules = [];
  for (const heading of REQUIRED_HEADINGS) {
    const p = paragraphs.find(b => b.startsWith(`**${heading}**`));
    if (p) rules.push(p.replace(/\s+/g, ' ').trim());
  }
  return rules;
}

// ── Palace hub concepts ─────────────────────────────────────────────────────

function parsePalace(content) {
  const hubMatch = content.match(/## Hub Concepts \(Most Central\)([\s\S]*?)(?=\n## [A-Z]|$)/);
  if (!hubMatch) return [];
  const conceptRE = /^\d+\.\s+\*\*([^*]+)\*\*\s+\(([^)]+)\)\s*\n\s*[-•]\s+Centrality:\s+([\d.]+)\s*\n\s*[-•]\s+Connections:\s+(\d+)/gm;
  const concepts = [];
  let m;
  while ((m = conceptRE.exec(hubMatch[1])) !== null) {
    concepts.push({ name: m[1].trim(), type: m[2].trim(), centrality: parseFloat(m[3]), connections: parseInt(m[4], 10) });
  }
  return concepts.slice(0, 12);
}

function loadSemanticMemory(sessionContext) {
  try {
    const { execSync } = require('child_process');
    if (!sessionContext) throw new Error('missing session context');
    const raw = execSync(
      'node Scripts/memory-query.mjs "$MEMORY_QUERY_CONTEXT" --top 8',
      {
        cwd: REPO_ROOT,
        timeout: 10000,
        encoding: 'utf8',
        env: {
          ...process.env,
          MEMORY_QUERY_CONTEXT: sessionContext,
        },
      }
    );
    const results = JSON.parse(raw);
    if (!results.length) return '(no relevant LTM items)';
    return results.map(r => `- **${r.name}** (${r.type}): ${r.description}`).join('\n');
  } catch (e) {
    try {
      const fallback = fs.readFileSync(path.join(REPO_ROOT, '.claude/projects/-Users-marcelspatz-YURI-OS-MUSUBI/memory/MEMORY.md'), 'utf8')
        .split('\n').filter(l => l.startsWith('-')).slice(0, 8).join('\n');
      return fallback || '(memory unavailable)';
    } catch { return '(memory unavailable)'; }
  }
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

// ── Neurodivergent engine ────────────────────────────────────────────────────
// Operationalizes Marcel's neurotype traits as testable behavioral modules.
// Source: _SYSTEM/SELF/Identity.md (Autistic/ADHD/Polymath parameters)

function loadNeurodivergentEngine(cortexTier) {
  const IDENTITY_FILE = path.join(REPO_ROOT, '_SYSTEM', 'SELF', 'Identity.md');
  const isComplex = cortexTier && ['complex', 'critical'].includes(cortexTier);

  const modules = [
    { trait: 'Autistic pattern depth',   rule: 'Full spec-read + mechanism map before complex analysis; never skim' },
    { trait: 'ADHD burst mode',          rule: 'Batch independent tasks into parallel tool calls — fan-out, never serial' },
    { trait: 'Hyperfocus lock',          rule: `${isComplex ? '⚡ ACTIVE' : 'Standby'}: when deep in a thread, block advisor scatter to adjacent concerns` },
    { trait: 'Polymath transfer',        rule: 'Check: does this problem map to a solved domain? Name source→target→mechanism before applying' },
    { trait: 'Interest-driven salience', rule: 'High-interest = max depth; admin/low-interest = minimum tokens → route to lane' },
    { trait: 'Pattern-first decode',     rule: 'Marcel sends brain dumps → decode structure first, ask only when decoding reveals true ambiguity' },
  ];

  // Verify Identity.md exists (graceful fallback)
  let neurotype = 'Autistic+ADHD+Polymath (from Identity.md)';
  try {
    if (fs.existsSync(IDENTITY_FILE)) {
      const content = fs.readFileSync(IDENTITY_FILE, 'utf8');
      const match = content.match(/## Neurotype & Mind([\s\S]*?)(?=\n## |$)/);
      if (match) neurotype = match[1].trim().split('\n').slice(0, 3).join(' · ').replace(/[*-]/g, '').trim();
    }
  } catch (_) {}

  return `Neurotype: ${neurotype}\n` + modules.map(m => `[${m.trait}] ${m.rule}`).join('\n');
}

// ── Self-awareness — L1–L3 ───────────────────────────────────────────────────
// L1: cortex state (already in DYNAMIC section)
// L2: behavioral fingerprint from nisaba/self-model/fingerprint.json
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

// ── NVIDIA NIM live lane map ─────────────────────────────────────────────────
// Source: .claude/config/models.json → nvidia_nim.live_status (updated by probe runs)

function loadNvidiaLanes() {
  try {
    const MODELS_JSON = path.join(REPO_ROOT, '.claude', 'config', 'models.json');
    if (!fs.existsSync(MODELS_JSON)) return null;
    const cfg = JSON.parse(fs.readFileSync(MODELS_JSON, 'utf8'));
    const nim = cfg.nvidia_nim;
    if (!nim) return null;
    const { live_status, routing_decision_guide } = nim;
    if (!live_status) return null;
    const lines = [
      `tested: ${live_status.tested} | live=${live_status.live?.length ?? 0} dead=${live_status.dead?.length ?? 0}`,
      `  ✓ live:  ${(live_status.live || []).join(', ')}`,
      `  ✗ dead:  ${(live_status.dead || []).join(', ')}`,
    ];
    if (routing_decision_guide) {
      lines.push('routing:');
      for (const [task, lane] of Object.entries(routing_decision_guide).slice(0, 5)) {
        lines.push(`  ${task.padEnd(32)} → ${lane}`);
      }
    }
    return lines.join('\n');
  } catch { return null; }
}

// ── Neuron loop last run ──────────────────────────────────────────────────────
// Source: .claude/state/neuron-loop.log (written by Scripts/neuron-loop.mjs)

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
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const lines = [];
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

// ── Nen phase — active work mode ─────────────────────────────────────────────

function loadNenPhase() {
  const STATE_FILE_PATH = path.join(REPO_ROOT, '.claude', 'state', 'session-state.json');
  try {
    if (!fs.existsSync(STATE_FILE_PATH)) return null;
    const state = JSON.parse(fs.readFileSync(STATE_FILE_PATH, 'utf8'));
    if (!state.nen_phase) return null;
    const { phase, confidence, config } = state.nen_phase;
    return `Phase: ${phase} | Confidence: ${confidence != null ? Math.round(confidence * 100) + '%' : '?'}\n${config || ''}`;
  } catch { return null; }
}

// ── Compose unified block ───────────────────────────────────────────────────

function buildBrainBlock({ rules, learnedRules, palace, memoryLines, palaceStatus, sessionCtx, gateSnapshot, laneHealth, cortexDynamic, pdcContext, animaDNA, neurodivergent, selfAwareness, geassLock, nenPhase, nvidiaLanes, neuronLoop, roadmapState }) {
  const identityLines = rules.map(r => `- ${r}`).join('\n');

  const spatialLines = palace.length
    ? palace.slice(0, 6).map((c, i) =>
        `  ${i + 1}. ${c.name} (${c.type}) — ${c.connections} refs, centrality ${c.centrality.toFixed(3)}`
      ).join('\n')
    : '  (palace unavailable)';

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

  const neurodivSection = neurodivergent
    ? `\n### NEURODIVERGENT_ENGINE — Active behavioral modules\n${neurodivergent}`
    : '';

  const selfAwarenessSection = selfAwareness
    ? `\n### SELF_AWARENESS — Behavioral fingerprint (L2/L3)\n${selfAwareness}`
    : '';

  const nvidiaSection = nvidiaLanes
    ? `\n### NVIDIA_NIM — Live lane map (probed ${new Date().toISOString().slice(0,10)})\n${nvidiaLanes}`
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

  const nenSection = nenPhase
    ? `\n### NEN_PHASE — Active work phase\n${nenPhase}`
    : '';

  return `<yuri-brain>
### IDENTITY — Yuri persona active (SOUL.md)
${identityLines}

### LEARNED_RULES — Dream-processor synthesis (global.md)
${learnedRules}

### SPATIAL — Vault hub concepts — ${palaceStatus}
${spatialLines}

### MEMORY — LTM (semantic query)
${memoryLines}

### SESSION — Current context
${sessionCtx || '(checkpoint unavailable)'}

### HARDWARE — M2 Pro constraints
safe local: ${hwSafe}
frozen (DO NOT RUN): ${hwFrozen}
${HARDWARE.note}

### LANE_HEALTH — AI routing availability
${laneHealth}

### GATE — Launch readiness
${gateSnapshot}${pdcSection}${dynamicSection}${animaDNASection}${neurodivSection}${selfAwarenessSection}${nvidiaSection}${neuronSection}${roadmapSection}${geassSection}${nenSection}
</yuri-brain>`;
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  // 1. Persona
  let rules = [];
  try { rules = extractPersonaRules(fs.readFileSync(SOUL_FILE, 'utf8')); } catch (_) {}

  // 2. Learned rules from dream processor
  const learnedRules = loadLearnedRules();

  // 3. Palace
  let palace = [], palaceStatus = 'UNAVAILABLE';
  for (const p of PALACE_PATHS) {
    try {
      if (fs.existsSync(p)) {
        palace = parsePalace(fs.readFileSync(p, 'utf8'));
        const age = Math.floor((Date.now() - fs.statSync(p).mtimeMs) / 86400000);
        palaceStatus = age > 7 ? `STALE (${age}d old)` : `CURRENT (${age}d old)`;
        break;
      }
    } catch (_) {}
  }

  // 4. Session context
  const sessionCtx = loadSessionContext();

  // 5. Memory — semantic session-context query
  const memoryLines = loadSemanticMemory(sessionCtx);

  // 6. Lane health
  const laneHealth = loadLaneHealth();

  // 7. Gate snapshot
  const gateSnapshot = loadGateSnapshot();

  // 8. Write palace context to session-state.json (for other hooks)
  try {
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (!state.vault_context) {
        state.vault_context = { status: palaceStatus, hub_concepts_top_12: palace, injected_at: new Date().toISOString() };
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
      }
    }
  } catch (_) {}

  // 9. Emit unified <yuri-brain> block
  const cortexDynamic  = loadCortexDynamic();
  const pdcContext     = loadPdcContext();

  // Extract complexity tier from cortex state for neurodivergent engine
  let cortexTier = 'standard';
  try {
    const CORTEX_STATE = path.join(REPO_ROOT, '.claude', 'state', 'cortex-state.json');
    if (fs.existsSync(CORTEX_STATE)) {
      cortexTier = JSON.parse(fs.readFileSync(CORTEX_STATE, 'utf8')).complexityTier || 'standard';
    }
  } catch (_) {}

  const animaDNA      = loadAnimaDNAModes();
  const neurodivergent= loadNeurodivergentEngine(cortexTier);
  const selfAwareness = loadSelfAwareness();
  const geassLock     = loadGeassLock();
  const nenPhase      = loadNenPhase();
  const nvidiaLanes   = loadNvidiaLanes();
  const neuronLoop    = loadNeuronLoopState();
  const roadmapState  = loadRoadmapState();

  const block = buildBrainBlock({ rules, learnedRules, palace, memoryLines, palaceStatus, sessionCtx, laneHealth, gateSnapshot, cortexDynamic, pdcContext, animaDNA, neurodivergent, selfAwareness, geassLock, nenPhase, nvidiaLanes, neuronLoop, roadmapState });

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: block.split('\n').join('\\n'),
    },
  }) + '\n');

  process.exit(0);
}

main();
