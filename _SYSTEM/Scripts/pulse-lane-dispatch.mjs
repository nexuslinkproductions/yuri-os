#!/usr/bin/env node
// Tier-gated lane wrapper. Complex/critical dispatches receive memory
// context and pulse logging; trivial/standard dispatches preserve speed.

import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { readMemoryContext } from './pulse-memory-context.mjs';

function parseArgs(argv) {
  const raw = argv.slice(2);
  const args = { model: '', prompt: '', passthrough: [...raw] };
  const promptParts = [];

  for (let i = 0; i < raw.length; i += 1) {
    const arg = raw[i];
    if ((arg === '-m' || arg === '--model') && raw[i + 1]) {
      args.model = raw[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('@') && !args.model) {
      args.model = arg.slice(1);
      continue;
    }
    if (arg.startsWith('-')) {
      if (['--reasoning', '--intent', '--write-scope', '-s', '--swarm'].includes(arg) && raw[i + 1]) i += 1;
      continue;
    }
    promptParts.push(arg);
  }

  args.prompt = promptParts.join(' ');
  args.model ||= 'deepseek-v4-flash';
  return args;
}

function routePlan(prompt) {
  try {
    const out = execFileSync('node', ['Scripts/offload-contract.mjs', 'route-plan', prompt], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out);
  } catch {
    return { complexityTier: 'standard' };
  }
}

function withPrompt(argv, prompt) {
  const args = argv.slice(2);
  let replaced = false;
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (!args[i].startsWith('-')) {
      args[i] = prompt;
      replaced = true;
      break;
    }
  }
  return replaced ? args : [...args, prompt];
}

function appendPulseBus(entry) {
  const stateDir = '.claude/state';
  const busPath = `${stateDir}/pulse-bus.jsonl`;
  try {
    mkdirSync(stateDir, { recursive: true });
    appendFileSync(busPath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
  } catch {
    // Lane dispatch must not fail because telemetry is unavailable.
  }
}

const args = parseArgs(process.argv);
const plan = routePlan(args.prompt);
const tier = plan.complexityTier || 'standard';

if (tier === 'trivial' || tier === 'standard') {
  const env = { ...process.env, PULSE_LANE_BYPASS: '1' };
  execFileSync('bash', ['Scripts/offload.sh', ...args.passthrough], { stdio: 'inherit', env });
  process.exit(0);
}

const mem = await readMemoryContext({ tier, budget: Number(process.env.PULSE_CONTEXT_BUDGET || 6000) });
const persona = existsSync('./SOUL.md') ? readFileSync('./SOUL.md', 'utf8').slice(0, 1200) : '';
const enriched = `${persona}\n\n--- MEMORY CONTEXT ---\n${mem}\n\n--- INSTRUCTION ---\n${args.prompt}`;

appendPulseBus({ kind: 'lane-dispatch-pre', lane: args.model, tier, scenario: plan.scenario });

const env = { ...process.env, INSIDE_PULSE_WRAPPER: '1' };
const result = execFileSync('bash', ['Scripts/offload.sh', ...withPrompt(process.argv, enriched)], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  env,
});

appendPulseBus({ kind: 'lane-dispatch-return', lane: args.model, tier, len: result.length });
process.stdout.write(result);
