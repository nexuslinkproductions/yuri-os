#!/usr/bin/env node
/**
 * Rick lane dispatch with explicit model switch.
 *
 * Wraps rick-tmux-lanes.mjs to send `/model <model>` to the target pane,
 * wait for Claude to acknowledge the model switch, then send the actual
 * prompt. Use this for any dispatch where the lane's model must be a
 * specific variant (typically Opus for substrate work; per
 * FB:QUANTUM-OPUS-UPGRADE).
 *
 * The model switch is a Claude-session-level setting set via the `/model`
 * slash command. The underlying feed wrapper has no model-switch capability;
 * this wrapper composes two feed calls with a wait between them.
 *
 * Usage:
 *   node _SYSTEM/Scripts/rick-opus-dispatch.mjs <lane> --prompt "<text>" \
 *     [--execute] [--model opus|sonnet|haiku|default] [--ack-wait-ms 3000]
 *
 * Default model: opus
 * Default ack-wait-ms: 3000
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANES_SCRIPT = path.join(__dirname, 'rick-tmux-lanes.mjs');

export const VALID_MODELS = new Set(['opus', 'sonnet', 'haiku', 'default']);
export const DEFAULT_ACK_WAIT_MS = 3000;

export function parseArgs(argv) {
  const args = {
    _: [],
    model: 'opus',
    ackWaitMs: DEFAULT_ACK_WAIT_MS,
    execute: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--prompt') {
      args.prompt = argv[++i];
    } else if (a === '--prompt-file') {
      args.promptFile = argv[++i];
    } else if (a === '--model') {
      args.model = argv[++i];
    } else if (a === '--ack-wait-ms') {
      const n = Number.parseInt(argv[++i], 10);
      if (Number.isFinite(n) && n >= 0) args.ackWaitMs = n;
    } else if (a === '--execute') {
      args.execute = true;
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (!a.startsWith('--')) {
      args._.push(a);
    }
  }
  return args;
}

export function usage() {
  return [
    'Usage:',
    '  node _SYSTEM/Scripts/rick-opus-dispatch.mjs <lane> --prompt "<text>" \\',
    '    [--execute] [--model opus|sonnet|haiku|default] [--ack-wait-ms 3000]',
    '',
    'Wraps rick-tmux-lanes.mjs to switch the target pane to a specific Claude',
    'model before sending the actual prompt. Used for Quantum-Opus or any',
    'lane that needs an explicit model variant per FB:QUANTUM-OPUS-UPGRADE.',
    '',
    'Defaults:',
    '  --model opus',
    '  --ack-wait-ms 3000',
    '',
    'Examples:',
    '  # Switch quantum to opus and send a packet reference',
    '  node rick-opus-dispatch.mjs quantum --prompt "Quantum — packet at /path" --execute',
    '',
    '  # Use sonnet explicitly (downgrade from opus session if needed)',
    '  node rick-opus-dispatch.mjs prime --prompt "..." --model sonnet --execute',
  ].join('\n');
}

function runFeed(lane, prompt, execute) {
  const args = ['feed', lane, '--prompt', prompt];
  if (execute) args.push('--execute');
  return spawnSync('node', [LANES_SCRIPT, ...args], {
    stdio: 'inherit',
    encoding: 'utf8',
  });
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args._.length === 0) {
    console.error('error: lane is required (e.g., quantum, prime)');
    console.error(usage());
    return 2;
  }
  if (!args.prompt && !args.promptFile) {
    console.error('error: --prompt or --prompt-file is required');
    return 2;
  }
  if (!VALID_MODELS.has(args.model)) {
    console.error(`error: unknown --model "${args.model}" — must be one of ${[...VALID_MODELS].join(', ')}`);
    return 2;
  }

  const lane = args._[0];

  // Resolve prompt content
  let promptText = args.prompt;
  if (args.promptFile) {
    const fs = await import('node:fs');
    promptText = fs.readFileSync(args.promptFile, 'utf8');
  }

  // Step 1: switch model
  process.stderr.write(`[rick-opus-dispatch] step 1/2: switch ${lane} to /model ${args.model}\n`);
  const r1 = runFeed(lane, `/model ${args.model}`, args.execute);
  if (r1.status !== 0) {
    process.stderr.write(`[rick-opus-dispatch] model switch failed (exit ${r1.status})\n`);
    return 1;
  }

  // Step 2: wait for ack
  process.stderr.write(`[rick-opus-dispatch] waiting ${args.ackWaitMs}ms for Claude to process model switch\n`);
  await sleep(args.ackWaitMs);

  // Step 3: send actual prompt
  process.stderr.write(`[rick-opus-dispatch] step 2/2: send prompt (${promptText.length} chars)\n`);
  const r2 = runFeed(lane, promptText, args.execute);
  if (r2.status !== 0) {
    process.stderr.write(`[rick-opus-dispatch] prompt feed failed (exit ${r2.status})\n`);
    return 1;
  }

  process.stderr.write(`[rick-opus-dispatch] complete\n`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}
