#!/usr/bin/env node
/**
 * lane-output.mjs — the WORKER-LANE OUTPUT ENFORCEMENT primitive.
 *
 * The worker-lane model (llm-compat-contract laneWorkerModel): a lane does the work and leaves a finished
 * work-product in its DETERMINED, categorized output location — never the live tree. This module is the
 * executable side of that: it resolves the location (via the contract's laneOutputLocation), ensures the
 * directory, hands back the outfile path, and offers a confinement check for the live boundary.
 *
 * Lane types:
 *  - OUTPUT lanes (llm-lane / DeepSeek, the Gemma worker dispatch): emit to a file — route it through laneOutfile.
 *  - AGENTIC-EDIT lane (Codex exec): edits the live tree directly and is NEVER sandboxed (owner rule). Its
 *    "staging" is the uncommitted git diff + the no-commit rule + main-session review → promote. isWithinLaneOutput
 *    is the assertion an output lane is confined; Codex confinement is the commit gate, not a path wall.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneOutputLocation } from './llm-compat-contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');

// Resolve + ensure a lane's output directory; return the absolute outfile path inside it. The categorized,
// deterministic home for a lane's work-product (keyed by lane / task / operation / outputType).
export function laneOutfile({ lane, task, operation, outputType, traceId, file } = {}) {
  const rel = laneOutputLocation({ lane, task, operation, outputType, traceId });
  const dir = path.join(REPO, rel);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, file || 'output');
}

// CONFINEMENT: is a write path inside the lane's output location (the live boundary held for output lanes)?
export function isWithinLaneOutput(absPath, { lane, task, operation, outputType, traceId } = {}) {
  const dir = path.resolve(REPO, laneOutputLocation({ lane, task, operation, outputType, traceId }));
  const target = path.resolve(String(absPath || ''));
  return target === dir || target.startsWith(dir + path.sep);
}

// The staging ROOT (everything outside it is live; a lane writes only inside it).
export function laneOutputRoot() {
  return path.join(REPO, '_SYSTEM/lane-output');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write('lane-output: library — import { laneOutfile, isWithinLaneOutput, laneOutputRoot }\n');
}
