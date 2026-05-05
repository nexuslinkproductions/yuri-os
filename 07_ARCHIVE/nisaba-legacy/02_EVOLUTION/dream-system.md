# NISABA — HOUSE 2: EVOLUTION SYSTEM
*The Self-Improvement Temple. Where corrections become permanent law.*

---

## THE EVOLUTION DOCTRINE

Claude starts fresh every session.
Every correction you gave last session is forgotten.
Every pattern you established disappears.
Unless you built a system to remember.

NISABA's Evolution System turns user corrections into permanent rules — automatically, without manual editing, using three hooks and one dream worker.

**The signal is already there.** Every "no, not like that" is a data point. Every "yes, exactly" is a confirmation. The session transcript contains all of it. The Evolution System reads it.

---

## THE THREE HOOKS

### Hook 1: SubagentStart — Inject lessons before the agent wakes

Before any specialist agent runs, this hook fires. It reads saved lessons for that agent type. If lessons exist, it writes a `<mnemosyne>` block that Claude Code prepends to the agent's context automatically.

**The agent wakes up already knowing what went wrong last time.**

```javascript
// .claude/hooks/nisaba-subagent-start.js
'use strict';
const fs = require('fs');
const path = require('path');

const LEARNING_DIR = path.join(process.env.HOME, '.claude', 'nisaba', 'learning');
const PROJECT_LEARNING_DIR = path.join(process.cwd(), '.claude', 'nisaba', 'learning');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const agentType = (event.agent_type || '')
      .replace(/^[^:]+:/, '').trim().toLowerCase();

    const parts = [];

    // Layer 1: Global lessons (apply to every agent, every project)
    const globalGlobal = readFile(path.join(LEARNING_DIR, 'global.md'));
    if (globalGlobal) parts.push(`### Global Lessons (all projects)\n\n${globalGlobal}`);

    // Layer 2: Project global lessons (apply to every agent in this project)
    const projectGlobal = readFile(path.join(PROJECT_LEARNING_DIR, 'global.md'));
    if (projectGlobal) parts.push(`### Project Lessons (this project)\n\n${projectGlobal}`);

    // Layer 3: Agent-specific global lessons
    if (agentType) {
      const globalAgent = readFile(path.join(LEARNING_DIR, 'agents', `${agentType}.md`));
      if (globalAgent) parts.push(`### Lessons for ${agentType} (all projects)\n\n${globalAgent}`);

      // Layer 4: Agent-specific project lessons
      const projectAgent = readFile(path.join(PROJECT_LEARNING_DIR, 'agents', `${agentType}.md`));
      if (projectAgent) parts.push(`### Lessons for ${agentType} (this project)\n\n${projectAgent}`);
    }

    if (parts.length === 0) { process.exit(0); return; }

    const attr = agentType ? ` agent="${agentType}"` : '';
    process.stdout.write(`<mnemosyne${attr}>\n\n${parts.join('\n\n---\n\n')}\n\n</mnemosyne>\n`);
  } catch (e) {}
  process.exit(0);
});

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8').trim(); }
  catch { return ''; }
}
```

**Improvement over BTN baseline:**
BTN's hook reads from one project-local directory.
NISABA reads from 4 layers: global-global, project-global, global-agent, project-agent.
Universal lessons propagate to all projects automatically. No manual copying.

---

### Hook 2: Stop — Capture the session when it ends

When the session closes, this hook reads the full conversation and extracts raw signal.
No pre-classification. No interpretation. Just the facts.

Three things are captured:
1. Every human message verbatim
2. Every agent that ran (type, prompt preview, output preview)
3. Every skill file that was loaded

The dream worker does the interpretation later.

```javascript
// .claude/hooks/nisaba-on-stop.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const LEARNING_DIR = path.join(process.env.HOME, '.claude', 'nisaba', 'learning');
const PROJECT_LEARNING_DIR = path.join(process.cwd(), '.claude', 'nisaba', 'learning');
const SESSIONS_DIR = path.join(PROJECT_LEARNING_DIR, 'sessions');

const COOLDOWN_MS = 4 * 3_600_000; // 4 hours between dream runs
const MIN_SESSIONS = 3;             // minimum new sessions before dreaming

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => raw += c);
process.stdin.on('end', () => {
  try {
    const event = JSON.parse(raw);
    const { session_id, transcript_path } = event;

    if (!transcript_path || !fs.existsSync(transcript_path)) {
      process.exit(0); return;
    }

    const obs = parseSession(session_id || 'unknown', transcript_path);
    writeObservation(obs);

    if (shouldDream()) spawnDream();
  } catch (e) {}
  process.exit(0);
});

function parseSession(sessionId, transcriptPath) {
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const humanMessages = [];
  const agentsRun = [];
  const skillsRead = new Set();
  const corrections = []; // NISABA enrichment: explicit correction detection
  let pendingAgent = null;

  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }

    const role = e.message?.role;
    const content = e.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      if (role === 'user' && block.type === 'text') {
        const text = (block.text || '').trim();
        if (text.length > 2) {
          humanMessages.push(text.slice(0, 300));

          // NISABA: detect correction signals
          const correctionPatterns = [
            /\bno[,.]?\s+(don'?t|remove|stop|never|avoid)/i,
            /\bwrong\b/i,
            /\bnot like that\b/i,
            /\bstill\b.*\bsame\b/i,
            /\bagain\b/i,
            /\bwtf\b/i,
            /\bplease don'?t\b/i
          ];
          const isCorrection = correctionPatterns.some(p => p.test(text));
          if (isCorrection) corrections.push(text.slice(0, 200));
        }
      }

      if (role === 'user' && block.type === 'tool_result' && pendingAgent) {
        const parts = Array.isArray(block.content)
          ? block.content
          : [{ type: 'text', text: String(block.content || '') }];
        const meta = parts.find(p => p.type === 'text' && p.text?.includes('agentId:'));
        if (meta) {
          const output = parts
            .filter(p => p !== meta && p.type === 'text' && p.text)
            .map(p => p.text).join('\n').trim();
          agentsRun.push({
            type: pendingAgent.type,
            prompt_preview: pendingAgent.prompt,
            output_preview: output.slice(0, 400).replace(/\s+/g, ' '),
          });
          pendingAgent = null;
        }
      }

      if (role === 'assistant' && block.type === 'tool_use') {
        if (block.name === 'Agent') {
          const t = (block.input?.subagent_type || 'unknown')
            .replace(/^[^:]+:/, '').toLowerCase();
          pendingAgent = { type: t, prompt: (block.input?.prompt || '').slice(0, 150) };
        }
        if (block.name === 'Read') {
          const m = (block.input?.file_path || '').match(/skills\/([^/]+)\/SKILL\.md$/i);
          if (m) skillsRead.add(m[1]);
        }
      }
    }
  }

  return {
    id: `sess-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
    ts: new Date().toISOString(),
    session_id: sessionId,
    project: path.basename(process.cwd()),
    human_messages: humanMessages,
    corrections: corrections, // NISABA enrichment
    agents_run: agentsRun,
    skills_read: [...skillsRead],
  };
}

function writeObservation(obs) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const file = path.join(SESSIONS_DIR, `${date}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(obs) + '\n');
}

function shouldDream() {
  const lockFile = path.join(PROJECT_LEARNING_DIR, '.dream-lock');
  if (fs.existsSync(lockFile)) {
    const lastRun = parseInt(fs.readFileSync(lockFile, 'utf8'));
    if (Date.now() - lastRun < COOLDOWN_MS) return false;
  }
  // Count new sessions since last dream
  const date = new Date().toISOString().split('T')[0];
  const file = path.join(SESSIONS_DIR, `${date}.jsonl`);
  if (!fs.existsSync(file)) return false;
  const count = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
  return count >= MIN_SESSIONS;
}

function spawnDream() {
  const lockFile = path.join(PROJECT_LEARNING_DIR, '.dream-lock');
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  fs.writeFileSync(lockFile, String(Date.now()));

  const dreamScript = path.join(__dirname, 'nisaba-dream.js');
  const child = spawn('node', [dreamScript], {
    detached: true,
    stdio: 'ignore',
    cwd: process.cwd()
  });
  child.unref();
}
```

---

### Hook 3: Dream Worker — Find patterns, write rules

This runs in the background. It reads session observations, classifies corrections by agent type, finds repeating patterns, and writes rules directly to the appropriate files.

**The dream worker uses an LLM to do the pattern recognition.** This is the key insight BTN landed. You don't code the logic — you describe the task and let Claude Haiku run it cheaply.

```javascript
// .claude/hooks/nisaba-dream.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const LEARNING_DIR = path.join(process.env.HOME, '.claude', 'nisaba', 'learning');
const PROJECT_LEARNING_DIR = path.join(process.cwd(), '.claude', 'nisaba', 'learning');
const SESSIONS_DIR = path.join(PROJECT_LEARNING_DIR, 'sessions');

function buildDreamPrompt() {
  // Load recent sessions (last 20, newest first)
  const sessions = loadRecentSessions(20);
  const lastDreamTime = getLastDreamTime();

  const sessionBlocks = sessions.map((s, i) => {
    const isNew = new Date(s.ts).getTime() > lastDreamTime;
    const marker = isNew ? '★ NEW' : '  OLD';
    const corrections = s.corrections?.length > 0
      ? `\nCORRECTIONS DETECTED:\n${s.corrections.map(c => `  - "${c}"`).join('\n')}`
      : '';
    return `${marker} | ${s.ts} | agents:[${s.agents_run.map(a => a.type).join(', ')}] | skills:[${s.skills_read.join(', ')}]
Human messages:
${s.human_messages.map((m, i) => `  ${i + 1}. "${m}"`).join('\n')}${corrections}
${s.agents_run.map(a => `${a.type} output: "${a.output_preview}"`).join('\n')}`;
  }).join('\n\n---\n\n');

  return `You analyze recent Claude Code sessions and write one-line rules to prevent repeated mistakes.

★ = new since last dream. These are fresh signal. OLD sessions provide pattern confirmation.

## Sessions
${sessionBlocks}

## Where to write rules
- ${path.join(LEARNING_DIR, 'global.md')} — lessons that apply to EVERY agent in EVERY project
- ${path.join(LEARNING_DIR, 'agents/{type}.md')} — lessons for one specific agent type, all projects
- ${path.join(PROJECT_LEARNING_DIR, 'global.md')} — lessons for every agent in THIS project only
- ${path.join(PROJECT_LEARNING_DIR, 'agents/{type}.md')} — lessons for one agent in THIS project only

## Decision logic for WHERE to write
- Correction about agent behavior (style, formatting, approach) → agent-specific global
- Correction about output format or structure → agent-specific global
- Correction about project-specific requirements (file naming, colors, client preferences) → project-specific
- Correction that would apply anywhere → global

## Rules for WHAT to write
- 1 session = noise. Same correction in 2+ sessions = write it.
- Same correction in 5+ sessions = escalate: write to global, flag for CLAUDE.md promotion
- One-line rules only. Specific, not vague.
- Read the target file first. Do not duplicate existing rules.
- Max 5 new rules per run.
- Include the date: <!-- dream ${new Date().toISOString().split('T')[0]} -->

## Quality bar
Good: "Never use em-dashes. Use commas or short sentences instead."
Good: "Always write color grades as hex values, not descriptive names."
Good: "Client proposals must open with the client's stated goal, not our capabilities."
Bad: "Be more careful with formatting."
Bad: "Pay attention to what the user wants."
Bad: "Try to be consistent."

Write the rules now. Read target files first. Write only what is new. Stop after 5 rules.`;
}

function loadRecentSessions(max) {
  const sessions = [];
  const files = fs.readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .sort().reverse();

  for (const file of files) {
    const lines = fs.readFileSync(path.join(SESSIONS_DIR, file), 'utf8')
      .split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        sessions.push(JSON.parse(line));
        if (sessions.length >= max) return sessions;
      } catch {}
    }
  }
  return sessions;
}

function getLastDreamTime() {
  const lockFile = path.join(PROJECT_LEARNING_DIR, '.dream-lock');
  if (!fs.existsSync(lockFile)) return 0;
  try { return parseInt(fs.readFileSync(lockFile, 'utf8')); }
  catch { return 0; }
}

// Run the dream
const prompt = buildDreamPrompt();
const promptFile = path.join(PROJECT_LEARNING_DIR, '.dream-prompt.txt');
fs.mkdirSync(path.dirname(promptFile), { recursive: true });
fs.writeFileSync(promptFile, prompt);

try {
  execSync(
    `claude -p --model claude-haiku-4-5 "$(cat ${promptFile})" --allowedTools Write,Edit,Read`,
    { cwd: process.cwd(), timeout: 120_000 }
  );
} catch (e) {
  fs.appendFileSync(
    path.join(PROJECT_LEARNING_DIR, 'dream-errors.log'),
    `${new Date().toISOString()}: ${e.message}\n`
  );
}
```

---

## MEMORY ARCHITECTURE (3-Tier System)

```
TIER 1: CLAUDE.md / NISABA.md (always loaded, highest priority)
  Content: Universal operational truths
  What lives here:
    - Routing logic (always route X to Y)
    - Non-negotiable quality standards
    - Safety rules (never delete, never modify X)
  How it gets here: Promoted from Tier 2 after 5+ confirmed executions
  Who updates it: Human (manually, after NISABA flags for promotion)

TIER 2: Learning files (.claude/nisaba/learning/)
  Content: Learned patterns from dream worker
  What lives here:
    - Agent-specific rules from corrections
    - Project-specific preferences
    - Patterns confirmed in 2-4 sessions
  How it gets here: Dream worker writes here automatically
  Who updates it: Dream worker (automated)

TIER 3: Skills (.claude/skills/) and Rules (.claude/rules/)
  Content: On-demand expertise, path-targeted rules
  What lives here:
    - Domain knowledge (loaded when relevant)
    - Project-specific technical conventions
    - Client preferences (loaded for that client's files)
  How it gets here: Manual creation + dream worker updates
  Who updates it: Mixed (manual + automated)

PRECEDENCE: CLAUDE.md > Learning files > Skills/Rules > Session
```

---

## PROMOTION PROTOCOL

When a rule has been confirmed in 5+ sessions, the dream worker flags it for promotion:

```markdown
<!-- NISABA PROMOTION CANDIDATE — confirmed 7 sessions -->
Never use em-dashes in any output. Use commas, periods, or colons instead.
<!-- Flag date: 2026-04-19 -->
```

Human reviews the flagged rule and promotes it to CLAUDE.md:
```markdown
## NISABA Evolution Laws
- Never use em-dashes. Use commas, periods, or colons. (promoted 2026-04-19, 7 confirmations)
```

Once in CLAUDE.md, the rule loads on every session automatically.

---

## CONFLICT DETECTION

When a new rule contradicts an existing rule, the dream worker flags it rather than writing:

```
CONFLICT DETECTED — Dream run 2026-04-19

New pattern (3 sessions): "Use short declarative sentences, one idea per line"
Existing rule (CLAUDE.md line 47): "Use flowing prose for client communication"

These rules contradict each other.
Recommendation: Clarify scope — short sentences for technical output, prose for client communication.

Writing to: .claude/nisaba/learning/conflicts.md
Action required: Human review + CLAUDE.md clarification
```

---

## SETTINGS REGISTRATION

```json
// .claude/settings.json — register hooks
{
  "hooks": {
    "SubagentStart": [{
      "type": "command",
      "command": "node .claude/hooks/nisaba-subagent-start.js"
    }],
    "Stop": [{
      "type": "command",
      "command": "node .claude/hooks/nisaba-on-stop.js",
      "async": true
    }]
  }
}
```

---

## NISABA ENRICHMENTS (what BTN missed)

**Gap 1: Cross-project learning**
BTN hooks are per-project. NISABA uses `~/.claude/nisaba/learning/` for global lessons that propagate everywhere. Build a rule on one project, it applies to all projects automatically.

**Gap 2: Explicit correction detection**
BTN captures all human messages. NISABA additionally runs regex pattern matching to flag likely corrections (contains "no", "remove", "stop", "wrong", "wtf"). Corrections get weighted more heavily in the dream worker's analysis.

**Gap 3: Four-layer injection**
BTN injects two layers (global + agent-specific). NISABA injects four layers (global-global, project-global, global-agent, project-agent) — fine-grained control over what each agent sees.

**Gap 4: Promotion protocol**
BTN writes rules to learning files. NISABA adds a promotion pathway: after 5+ confirmations, the dream worker flags rules for human-reviewed promotion to CLAUDE.md.

**Gap 5: Conflict detection**
BTN dream worker writes without checking for contradictions. NISABA detects when a new rule would contradict an existing rule and halts — writing to a conflicts file instead of overwriting silently.

---

**Status**: ACTIVE
**House**: 02 — Evolution
**Last updated**: 2026-04-19
