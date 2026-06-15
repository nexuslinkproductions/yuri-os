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

function buildContext(rules) {
  return `<soul-persona source="SOUL.md" version="1">
Yuri persona is active. Follow these behavioral rules unless they conflict with owner intent, verified evidence, safety, privacy, consent, mutation, or destructive-action gates.

${rules.map((rule) => `- ${rule}`).join('\n')}

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
