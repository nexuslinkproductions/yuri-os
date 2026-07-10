#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const YURI_ROOT = process.env.YURI_ROOT || path.resolve(__dirname, '..', '..');
const SOUL_FILE = path.join(YURI_ROOT, 'SOUL.md');

// wave-3 H.8: this is now the SINGLE copy of the SOUL.md heading list (brain-inject's
// duplicate was deleted with its IDENTITY block, H.2). A SOUL.md Core-Truth heading
// rename must be mirrored here or the subagent persona injection silently drops it.
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

function readInput(callback) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => callback(raw));
}

function readSoul() {
  return fs.readFileSync(SOUL_FILE, 'utf8');
}

function extractPersonaRules(content) {
  const paragraphs = content.split(/\n\s*\n/);
  const rules = [];

  for (const heading of REQUIRED_HEADINGS) {
    const paragraph = paragraphs.find((block) => block.startsWith(`**${heading}**`));
    if (!paragraph) {
      throw new Error(`SOUL.md missing persona rule: ${heading}`);
    }
    rules.push(paragraph.replace(/\s+/g, ' ').trim());
  }

  return rules;
}

function hookEventName(raw) {
  if (!raw.trim()) return 'SessionStart';
  try {
    const parsed = JSON.parse(raw);
    return parsed.event_type || parsed.hook_event_name || 'SessionStart';
  } catch {
    return 'SessionStart';
  }
}

// Cost-tier routing doctrine — injected here because subagents do not load CLAUDE.md
// and therefore never see persona.md's "Cost-tier routing" bullet. Keep in sync with
// persona.md → Standing execution rules → "Cost-tier routing" and yuri_operating_dna.md.
const COST_TIER_DOCTRINE = 'Cost-tier routing (the Sol seat burns every turn): minimize R0 work done inline. Ladder — CHEAP lanes (deepseek-flash, mimo) take EVIDENCE + R0 only, hard mask on R1+ semantic; CHEAP-FRONTIER lanes (terra, luna, minimax-M3, glm) take R1+ producer volume; Sol + Opus are reserved for orchestration and R3 verification. Never promote deepseek-flash/mimo to producers.';

// Reasoning kernel — the operational METHOD every dispatched lane inherits (the Core
// Truths above carry the values; this carries the how). Subagents don't load CLAUDE.md /
// persona.md, so without this they reason nothing like the main session. Keep dense.
const REASONING_KERNEL = [
  'Operating method (how to reason, not only what to value):',
  '1) DECODE FIRST — every input is a brain-dump; extract the real ask + the hidden constraint + the meta-need before acting. If the top intent is genuinely ambiguous, offer the two likeliest; otherwise proceed.',
  '2) ROUTE every strong thought to ONE state — ACTIVE OBJECTIVE (act now) / EVIDENCE (verified, tag its source) / TASK (do or route to a lane) / PARKED (real but not now, track it) / REJECTED (killed, with the reason). Nothing stays loose.',
  '3) CLAIM vs EVIDENCE — model output (your own included) is advisory until LOCAL runtime verifies it; verify against live execution, never comments or happy-path. Tag each load-bearing claim CONFIRMED / PLAUSIBLE / NEEDS-VERIFICATION and carry the one check that would settle the unresolved.',
  '4) ADJUDICATE lane/peer conflicts claim-by-claim by evidence and named root-cause — never by author, reasoning tier, or confidence tone. A gate (safety / protected-path / owner authority / mutation contract) is never out-adjudicated.',
  '5) END ON A MOVE — one concrete next action or the single blocking decision; state what changed, what was checked, and residual risk as a checkable condition. No filler, no narrating the thinking, no AI-slop.',
].join(' ');

function buildContext(rules) {
  return `<soul-persona source="SOUL.md" version="2">
Yuri persona is active. Follow these behavioral rules unless they conflict with owner intent, verified evidence, safety, privacy, consent, mutation, or destructive-action gates.

${rules.map((rule) => `- ${rule}`).join('\n')}

${REASONING_KERNEL}

${COST_TIER_DOCTRINE}

Validation checkpoint: a session is not persona-current unless this block, or the full SOUL.md contract, is present in startup/subagent context.
</soul-persona>`;
}

function main(raw) {
  try {
    const content = readSoul();
    const rules = extractPersonaRules(content);
    const output = {
      hookSpecificOutput: {
        hookEventName: hookEventName(raw),
        additionalContext: buildContext(rules).split('\n').join('\\n'),
      },
    };

    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    process.stderr.write(`[soul-persona-inject] ERROR: ${error.message}\n`);
    process.exit(0);
  }
}

readInput(main);

module.exports = {
  REQUIRED_HEADINGS,
  extractPersonaRules,
  buildContext,
};
