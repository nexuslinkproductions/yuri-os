#!/usr/bin/env node
/**
 * UserPromptSubmit hook (Pulse Cortex sensory layer)
 *
 * Responsibilities:
 *   1. Existing EOT keyword detection ("done" / "finished" / "end")
 *   2. PATCH 032: trivial-skip filter + detached pulse-orchestrator spawn
 *
 * Stays non-blocking: heavy work runs in a detached child via spawn(unref).
 * The hook exits in <50ms regardless of orchestrator state.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROOT = REPO_ROOT;
const ORCHESTRATOR = path.join(REPO_ROOT, 'Scripts', 'pulse-orchestrator.mjs');
const STATE_DIR = path.join(REPO_ROOT, '.claude', 'state');
const PULSE_PLAN_FILE = path.join(STATE_DIR, 'pulse-plan.json');
const TELEMETRY_LOG = path.join(STATE_DIR, 'pulse-hook-telemetry.log');
const BRAIN_STALE_FILE = path.join(STATE_DIR, 'brain-stale.sentinel');
// L5b — subconscious cue-recall (prior-turn-lag re-injection)
const RECALL_FILE = path.join(STATE_DIR, 'subconscious-recall.json');
const RECALL_SCRIPT = path.join(REPO_ROOT, '_SYSTEM', 'Scripts', 'yuri-recall.mjs');
const COLD_DB_FILE = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'memory-cold.db');
const RECALL_MAX_AGE_MS = 60 * 60 * 1000; // drop recall envelopes older than 1h (stale leftovers)

// L8 QUARANTINE — pulse-orchestrator is a retired dead layer. Evidence (2026-05-31): its only
// production invoker is spawnOrchestrator() below, which targets <repo>/Scripts/pulse-orchestrator.mjs
// — a path that does not exist (the real file is _SYSTEM/Scripts/), so the spawn has always failed
// silently. Nothing in settings.json or LaunchAgents runs it; pulse-bus.json is written by other
// components (sentinel/beacon/calibration), NOT the orchestrator. The governor RAG spawn fed the
// orchestrator's dispatchDeepSeekPreflight, which therefore never ran. Memory injection is now the
// wall-respecting L5b subconscious recall path. Flip this flag to false to fully restore the old path.
const PULSE_ORCHESTRATOR_RETIRED = true;

// M3 — Dynamic brain re-injection: check for brain:stale sentinel from prior turn's council
function checkBrainStale() {
  try {
    if (!fs.existsSync(BRAIN_STALE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(BRAIN_STALE_FILE, 'utf8'));
    // Consume sentinel — fires exactly once per council cycle
    fs.unlinkSync(BRAIN_STALE_FILE);
    const summaries = (data.consensusSummaries || []).map(s => `  · ${s}`).join('\n');
    return [
      '<brain-update>',
      `Council found ${data.reason} on prior turn (${data.turnId}).`,
      summaries ? `Consensus:\n${summaries}` : '',
      'Brain context updated. Integrate these findings into current reasoning.',
      '</brain-update>',
    ].filter(Boolean).join('\n');
  } catch { return null; }
}

// L5b — subconscious cue-recall. Two halves of a prior-turn-lag loop:
//   readPriorRecall(): consume the envelope the PRIOR turn's detached recall wrote, re-inject it.
//   spawnRecall(): fire THIS turn's recall detached; it writes the envelope the NEXT turn consumes.
// The hook can't block on recall (<50ms exit guarantee), so a recall always lands one turn late —
// acceptable: consecutive prompts in a session stay topically related, so the prior cue is still
// relevant. Consume-once (unlink on read) → a recall surfaces exactly once, never re-injects stale.
function readPriorRecall() {
  try {
    if (!fs.existsSync(RECALL_FILE)) return null;
    const raw = fs.readFileSync(RECALL_FILE, 'utf8');
    try { fs.unlinkSync(RECALL_FILE); } catch (_) {}   // consume-once
    const doc = JSON.parse(raw);
    if (!doc || !doc.block) return null;
    if (doc.ts && (Date.now() - doc.ts) > RECALL_MAX_AGE_MS) return null; // drop stale leftovers
    return String(doc.block);
  } catch (_) { return null; }
}

function spawnRecall(cue, turnId) {
  // Inert until the cold store exists (populated by the L6 consolidation pass). No DB → no spawn
  // and no empty-DB side effect. yuri-recall.mjs owns the query/rank/ledger-bump; the hook only
  // fires-and-forgets (detached + unref), keeping the <50ms exit guarantee.
  if (!fs.existsSync(COLD_DB_FILE)) return false;
  try {
    const child = spawn('node', [RECALL_SCRIPT, '--out', RECALL_FILE, cue.slice(0, 400)], {
      cwd: REPO_ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, YURI_RECALL_TURN: turnId },
    });
    child.unref();
    return true;
  } catch (e) {
    logTelemetry(`recall-spawn-failed turn=${turnId} reason=${e.message}`);
    return false;
  }
}

// EOT is now a system behavior, not a manual command.
// Detects handoff intent in natural language → injects EOT skill auto-trigger.
// The pipeline runs automatically; no need to type /eot.
const HANDOFF_TRIGGERS = [
  'handoff', 'hand off', 'hand-off',
  'end of transmission',
  'session close', 'close session',
  'wrap up session', 'archive session',
  'session end', 'end session',
  'eot please', 'run eot',
  'i need a handoff', 'create handoff',
  'generate handoff',
];

function isHandoff(text) {
  const lower = text.toLowerCase().trim();
  return HANDOFF_TRIGGERS.some(t => lower.includes(t));
}

// PATCH 032: trivial-skip heuristics — mirror classifyComplexity trivial branch
const MUTATE_VERBS   = /(implement|fix|patch|refactor|debug|rename|delete|migrate|audit|review|deploy|create|add|remove|build|wire|extend|promote)/i;
const ANALYSIS_VERBS = /\b(assess|analyze|analyse|evaluate|compare|recommend|braindump|brain dump|fan out|council|deep analysis|deep dive|what can be improved|what are the flaws|whats wrong|thoughts on|opinion on)\b/i;
const FILE_PATH      = /[/][\w-]+\.[a-z]+/i;
const LANE_MENTION   = /@\w+/;
const HAS_QUESTION   = /\?/;

function isTrivial(text) {
  if (!text) return true;
  if (text.length >= 60) return false;
  if (MUTATE_VERBS.test(text)) return false;
  if (ANALYSIS_VERBS.test(text)) return false;
  if (FILE_PATH.test(text)) return false;
  if (LANE_MENTION.test(text)) return false;
  if (HAS_QUESTION.test(text)) return false;
  return true;
}

// SPRINT 3 — Skill auto-trigger: detect intent → inject skill invocation hint
// Eliminates need to manually type /skill-name for common workflows
const SKILL_AUTO_TRIGGERS = [
  {
    patterns: [
      '/design', 'design this', 'design the', 'design a ', 'design an ',
      'ui for', 'css for', 'hud design', 'visual design', 'redesign',
      'stylesheet', 'frontend component', 'landing page', 'landing-page',
      'make it look', 'make the ui', 'update the ui', 'ui update',
    ],
    skill: 'design-master',
    desc: 'UI/design work',
  },
  {
    patterns: ['/graphify', 'graphify', 'knowledge graph', 'graph this', 'visualize connections', 'map the dependencies'],
    skill: 'graphify',
    desc: 'knowledge graph',
  },
  {
    patterns: ['/sharingan', 'sharingan', 'reverse engineer', 'copy this pattern', 'analyze this codebase', 'break down this repo', 'deconstruct this'],
    skill: 'sharingan',
    desc: 'reverse-engineering',
  },
  {
    patterns: ['/report', 'generate report', 'html report', 'create slides', 'make a report', 'yuri report'],
    skill: 'yuri-report',
    desc: 'report generation',
  },
  {
    patterns: ['/codebase-to-course', 'codebase to course', 'codebase course', 'interactive tutorial from', 'turn this into a course', 'make a course from'],
    skill: 'codebase-to-course',
    desc: 'course generation',
  },
  {
    patterns: ['/eot', 'end of transmission', 'session close', 'wrap up session', 'close session'],
    skill: 'end-of-transmission',
    desc: 'session close',
  },
  {
    patterns: ['/spec', 'write a spec', 'create spec', 'product spec', 'feature spec', 'write spec for'],
    skill: 'anthropic-skills:write-spec',
    desc: 'spec writing',
  },
  {
    patterns: ['/shura', 'shura review', '6-perspective', 'adversarial review', 'multi-perspective review'],
    skill: 'yuri-shura',
    desc: 'adversarial multi-perspective review',
  },
  {
    patterns: ['/introspect', 'introspect', 'graph health', 'architecture graph', 'system audit', 'yuri graph'],
    skill: 'visual-introspection',
    desc: 'system architecture review',
  },
  {
    patterns: ['/compact', 'compact hint', 'need to compact', 'context getting full'],
    skill: 'compact-optimizer',
    desc: 'context compaction',
  },
];

function buildSkillAutoTrigger(text) {
  const lower = text.toLowerCase();
  const matched = SKILL_AUTO_TRIGGERS.filter(t =>
    t.patterns.some(p => lower.includes(p.toLowerCase()))
  );
  if (!matched.length) return null;
  const lines = matched.map(t => `  → ${t.skill}  [${t.desc}]`).join('\n');
  return `<auto-skill-trigger>\nApplicable skill(s) detected — invoke via Skill tool:\n${lines}\n</auto-skill-trigger>`;
}

// ── Haki — lightweight intent pre-cognition (sync, <3ms) ─────────────────────
const HAKI_PATTERNS = [
  { intent: 'implement_or_fix',    keys: ['fix','implement','build','create','add','wire','update','patch','debug','refactor'], w: 3 },
  { intent: 'understand_or_learn', keys: ['how','what','why','explain','understand','show me','walk me','tell me'], w: 2 },
  { intent: 'plan_or_design',      keys: ['plan','design','architect','roadmap','strategy','approach','structure','should we'], w: 2 },
  { intent: 'validate_or_review',  keys: ['review','check','verify','is this correct','assess','audit','look at'], w: 2 },
  { intent: 'investigate_blocker', keys: ['not working','broken','error','failing','wrong','issue','problem','why is','bug'], w: 3 },
  { intent: 'meta_system',         keys: ['musubi','brain','neuron','soul','skill','hook','sprint','system','pulse','agent'], w: 2 },
];

function generateHakiIntent(text) {
  const lower = text.toLowerCase();
  const scored = HAKI_PATTERNS.map(p => ({
    intent: p.intent,
    score: p.keys.filter(k => lower.includes(k)).length * p.w,
  })).filter(s => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

  if (!scored.length) return null;
  const total = scored.reduce((s, x) => s + x.score, 0);
  const ranked = scored.map((s, i) => `P${i+1}[${Math.round(s.score/total*100)}%] ${s.intent}`).join(' · ');
  const ambig = scored[0] && scored[0].score / total < 0.45 && scored[1]
    ? ' ⚠ ambiguous — surface P1+P2' : '';
  return `<haki-intent>\n${ranked}${ambig}\n</haki-intent>`;
}

function parseHakiIntents(hakiHint) {
  if (!hakiHint) return null;

  const body = String(hakiHint)
    .replace(/<\/?haki-intent>/g, '')
    .trim();
  if (!body) return null;

  const intents = body
    .split(/\s*·\s*/)
    .map(part => part.replace(/\s*⚠.*$/, '').trim())
    .map(part => {
      const match = part.match(/^P(\d+)\[(\d+)%\]\s*(.+)$/);
      if (!match) return null;
      return {
        rank: Number(match[1]),
        label: match[3].trim(),
        probability: Number(match[2]),
      };
    })
    .filter(Boolean);

  return intents.length ? intents : null;
}

function persistHakiPlan(hakiHint) {
  try {
    const intents = parseHakiIntents(hakiHint);
    const hasExistingPlan = fs.existsSync(PULSE_PLAN_FILE);
    if (!hasExistingPlan && !intents) return;

    let planDoc = {};
    let planReadOk = !hasExistingPlan;
    if (hasExistingPlan) {
      try {
        planDoc = JSON.parse(fs.readFileSync(PULSE_PLAN_FILE, 'utf8'));
        planReadOk = true;
      } catch (_) {
        planDoc = {};
      }
    }
    if (!planReadOk && !intents) return;

    const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
    const plan = isObject(planDoc.plan) ? planDoc.plan : (isObject(planDoc) ? planDoc : {});

    if (intents) {
      plan.haki_intent = intents;
      plan.haki_dominant = intents.reduce((best, current) => {
        if (!best) return current;
        if (current.probability > best.probability) return current;
        if (current.probability === best.probability && current.rank < best.rank) return current;
        return best;
      }, null);
    } else {
      delete plan.haki_intent;
      delete plan.haki_dominant;
    }

    const payload = isObject(planDoc.plan) ? { ...planDoc, plan } : plan;
    fs.writeFileSync(PULSE_PLAN_FILE, JSON.stringify(payload, null, 2));
  } catch (_) { /* silent on error */ }
}

// ── Nen — work phase detector (sync, <5ms) ───────────────────────────────────
const NEN_SIGNALS = {
  deep_code: { keys: ['fix','implement','debug','refactor','patch','wire','function','script','.mjs','.ts','.py','.js'], w: 3 },
  design:    { keys: ['ui','css','html','design','visual','layout','component','style','hud','frontend','.tsx'], w: 3 },
  strategy:  { keys: ['architecture','roadmap','plan','strategy','approach','decision','should we','sprint','direction'], w: 3 },
  research:  { keys: ['research','investigate','find out','latest','trending','scan','what is','survey'], w: 2 },
  admin:     { keys: ['cleanup','organize','update docs','rename','status','check','list','show'], w: 1 },
};

function detectAndWriteNenPhase(text) {
  try {
    const lower = text.toLowerCase();
    const scores = Object.entries(NEN_SIGNALS).map(([phase, cfg]) => ({
      phase,
      score: cfg.keys.filter(k => lower.includes(k)).length * cfg.w,
    })).filter(s => s.score > 0).sort((a, b) => b.score - a.score);

    if (!scores.length) return;
    const total = scores.reduce((s, x) => s + x.score, 0);
    const top = scores[0];
    const confidence = Math.round(top.score / total * 100) / 100;
    if (confidence < 0.4) return;

    const configs = {
      deep_code: 'Codex-first, max depth, gpt-5.5 priority, minimal prose',
      design:    'design-master, max depth, deepseek-pro priority',
      strategy:  '6-advisor + shura, max depth, deepseek-pro priority',
      research:  'knowledge-scout lane, medium depth, deepseek-flash',
      admin:     'minimal, low depth, deepseek-flash only',
    };

    const STATE_FILE = path.join(REPO_ROOT, '.claude', 'state', 'session-state.json');
    if (fs.existsSync(STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      state.nen_phase = { phase: top.phase, confidence, config: configs[top.phase] || '', detected_at: new Date().toISOString() };
      fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    }
  } catch (_) { /* never block hook */ }
}

const DESIGN_PATTERN = /design|UI|CSS|visual|layout|component|HUD|dashboard|interface|style|color|font|typography|theme|brand|landing.?page|frontend|html.*build|build.*html|svg|animation|glassmorphism|dark.mode|musubi.brand|ember|audit.html|build.*report/i;

function logTelemetry(line) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.appendFileSync(TELEMETRY_LOG, `${new Date().toISOString()} ${line}\n`);
  } catch (_) { /* never throw */ }
}

function spawnOrchestrator(text, turnId) {
  try {
    const child = spawn('node', [ORCHESTRATOR, text], {
      cwd: REPO_ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, PULSE_TURN_ID: turnId },
    });
    child.unref();

    // Invoke pulse-packager to generate session context packet (non-blocking)
    try {
      const { spawnSync } = require('child_process');
      spawnSync('node', [require('path').join(REPO_ROOT, '_SYSTEM', 'Scripts', 'pulse-packager.mjs')], {
        cwd: REPO_ROOT, env: { ...process.env }, timeout: 3000, stdio: 'ignore',
      });
    } catch (_) {}

    return true;
  } catch (e) {
    logTelemetry(`spawn-failed turn=${turnId} reason=${e.message}`);
    return false;
  }
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const messages = event.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      process.exit(0);
    }

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'user') {
      process.exit(0);
    }

    const content = lastMsg.content || [];
    const text = (Array.isArray(content)
      ? content.filter(b => b.type === 'text').map(b => b.text).join(' ')
      : String(content)
    ).trim();

    // 1. Handoff / EOT detection — integrated system behavior, not a manual command
    const lower = text.toLowerCase();
    if (isHandoff(lower)) {
      console.log(JSON.stringify({
        continue: true,
        additionalContext: [
          '<auto-skill-trigger>',
          'Handoff detected — EOT pipeline activating automatically:',
          '  → end-of-transmission  [full 9-phase session close + handoff artifact]',
          'Invoke the end-of-transmission skill now. Do not wait for confirmation.',
          '</auto-skill-trigger>',
        ].join('\n'),
      }));
      process.exit(0);
    }

    // 2. SPRINT 3 — skill auto-trigger (runs before trivial gate so short /commands are caught)
    const skillHint = buildSkillAutoTrigger(text);

    // 3a. Haki intent decomposition (non-trivial only)
    const hakiHint = buildSkillAutoTrigger(text) ? null : generateHakiIntent(text);

    // 3b. Nen phase detection — writes to session-state.json (fire-and-forget, sync fast)
    detectAndWriteNenPhase(text);

    const userPrompt = text;
    let additionalContext = '';
    if (DESIGN_PATTERN.test(userPrompt)) {
      try {
        const { execSync } = require('child_process');
        const designCtx = execSync('node _SYSTEM/Scripts/design-context-inject.mjs', {
          cwd: ROOT, timeout: 5000, encoding: 'utf8'
        }).trim();
        if (designCtx) {
          additionalContext += '\n\n<design-master-context>\n' + designCtx + '\n</design-master-context>';
          process.stderr.write('[design-auto] design-master context injected\n');
        }
      } catch (e) {
        // non-fatal, continue
      }
    }

    // 3. PATCH 032 trivial-skip + orchestrator dispatch
    const trivial = isTrivial(text);
    const turnId = crypto.randomBytes(4).toString('hex');

    if (trivial) {
      logTelemetry(`trivial-skip turn=${turnId} len=${text.length} hash=${crypto.createHash('sha1').update(text).digest('hex').slice(0,8)}`);
      // Still surface skill hints even on trivial prompts (/design, /graphify, etc.)
      const trivialContext = [skillHint, additionalContext.trimStart()].filter(Boolean).join('\n\n');
      if (trivialContext) {
        console.log(JSON.stringify({ continue: true, additionalContext: trivialContext }));
      } else {
        console.log(JSON.stringify({ continue: true }));
      }
      process.exit(0);
    }

    // Persist Haki intent before the orchestrator spawns so the child can read it immediately.
    persistHakiPlan(hakiHint);

    // PATCH 040: per-task semantic memory injection — RETIRED (L8). This fed rag-turn-context.json
    // to pulse-orchestrator's dispatchDeepSeekPreflight, which never runs (see PULSE_ORCHESTRATOR_RETIRED).
    // It also read memory.db directly (MEMORY_VS_SEARCH wall violation). Superseded by L5b recall.
    // Spawn detached — must never block the hook (<50ms exit guarantee)
    const GOVERNOR_PY = path.join(REPO_ROOT, '_SYSTEM', 'OS_KERNEL', 'memory_governor.py');
    const RAG_CONTEXT_FILE = path.join(STATE_DIR, 'rag-turn-context.json');
    if (!PULSE_ORCHESTRATOR_RETIRED && fs.existsSync(GOVERNOR_PY)) {
      try {
        const ragChild = spawn('python3', [GOVERNOR_PY, 'read', '--query', text.slice(0, 400), '--limit', '20'], {
          cwd: REPO_ROOT,
          detached: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        let ragOut = '';
        ragChild.stdout.on('data', d => { ragOut += d; });
        ragChild.stdout.on('end', () => {
          try {
            const items = JSON.parse(ragOut);
            if (Array.isArray(items) && items.length) {
              fs.writeFileSync(RAG_CONTEXT_FILE, JSON.stringify({ turnId, ts: Date.now(), items }, null, 2));
            }
          } catch (_) {}
        });
        ragChild.unref();
      } catch (_) { /* never block */ }
    }

    // L5b — consume the PRIOR turn's recall before firing THIS turn's (no self-read race),
    // then re-inject below. spawnRecall is a no-op until the cold store exists.
    const priorRecall = readPriorRecall();
    spawnRecall(text, turnId);

    const spawned = PULSE_ORCHESTRATOR_RETIRED ? false : spawnOrchestrator(text, turnId);
    if (!PULSE_ORCHESTRATOR_RETIRED) logTelemetry(`pulse-spawn turn=${turnId} spawned=${spawned} len=${text.length}`);

    // cortexHint suppressed when the orchestrator is retired — no cortex runs, so there are no
    // findings to await; injecting the old "spawned…" line would be a false claim.
    const cortexHint = PULSE_ORCHESTRATOR_RETIRED
      ? null
      : (spawned
        ? `⬢ pulse-cortex turn=${turnId} spawned — findings will populate .claude/state/pulse-bus.json within 30-60s`
        : `⬢ pulse-cortex turn=${turnId} spawn failed (see pulse-hook-telemetry.log); proceeding without cortex`);

    // M3: inject prior-turn council synthesis if brain:stale sentinel was set
    const brainUpdate = checkBrainStale();

    // Haki confidence gate: if dominant intent < 55%, surface ambiguity signal
    let hakiGate = null;
    try {
      const dom = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'pulse-plan.json'), 'utf8'))?.haki_dominant;
      if (dom && dom.probability < 55) {
        hakiGate = `<haki-gate>Low intent confidence (P1=${dom.probability}% ${dom.label}). Consider clarifying before acting — ambiguity flag active.</haki-gate>`;
      }
    } catch {}

    const baseContext = [cortexHint, brainUpdate, skillHint, hakiHint, hakiGate, priorRecall]
      .filter(Boolean).join('\n');
    additionalContext = [baseContext, additionalContext].filter(Boolean).join('');

    console.log(JSON.stringify({ continue: true, additionalContext }));
    process.exit(0);
  } catch (e) {
    logTelemetry(`hook-error: ${e.message}`);
    // Never block the user — fall through to continue:true
    console.log(JSON.stringify({ continue: true }));
    process.exit(0);
  }
});
