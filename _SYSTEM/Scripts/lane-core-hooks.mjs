#!/usr/bin/env node
/**
 * lane-core-hooks.mjs — the CORE-INGEST layer for pluggable model lanes.
 *
 * Makes ANY frontier model plugged into the lane (deepseek / nemotron / kimi / a future GPT /
 * Gemini / whatever) fire the SAME YURI core a native operator turn fires — from INSIDE the
 * dispatch, so a lane call is wired into the core no matter who invokes it. The model's mental
 * model: a lane call is an input into YURI; the only difference from a native turn is that the
 * orchestrating lane supplies the input instead of the operator.
 *
 * Two hook points, both fully error-isolated (a core hook NEVER breaks dispatch):
 *   coreOnDispatch({lane, prompt})  — fires at dispatch start:
 *        · ENERGY    — traceDispatchEvent records the call into the ΔU/energy landscape
 *        · MEMORY    — recall() over the cold store; returns a recall block to inject so the lane
 *                      operates with the same episodic memory a native turn gets
 *   coreOnResult({lane, prompt, output, exitCode}) — fires on result:
 *        · EVIDENCE  — append a lane_output record to the control-plane memory-ledger
 *        · PULSE     — the mandatory docked-LLM-output symbiotic pulse (advisory-until-verified);
 *                      the pulse module is retired, so the lightweight verdict is recorded directly
 *
 * This is the single seam to extend when wiring more of the core (protocol, cortex, etc.).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { traceDispatchEvent } from './math/yuri-energy-dispatch-bridge.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ledgerPath = () => process.env.YURI_MEMORY_LEDGER_PATH || path.join(REPO_ROOT, '_SYSTEM', 'state', 'memory-ledger.jsonl');
const pulsePath = () => process.env.YURI_LANE_PULSE_PATH || path.join(REPO_ROOT, '_SYSTEM', 'state', 'lane-pulse-trace.jsonl');

function appendJsonl(file, obj) {
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.appendFileSync(file, `${JSON.stringify(obj)}\n`); }
  catch { /* core hooks are best-effort; never throw into dispatch */ }
}

// Dispatch-start hooks: energy ΔU trace + memory recall (returns a recall block to inject).
export async function coreOnDispatch({ lane, prompt } = {}) {
  try { traceDispatchEvent({ lane, runId: `llm-lane-${lane}-${Date.now()}` }); } catch { /* self-isolated */ }
  let recallBlock = '';
  try {
    const { recall, renderRecallBlock } = await import('./yuri-recall.mjs');
    const ranked = recall(String(prompt || '').slice(0, 400));
    if (Array.isArray(ranked) && ranked.length) recallBlock = String(renderRecallBlock(ranked) || '').trim();
  } catch { /* cold store absent / sqlite missing -> degrade to no recall */ }
  return { recallBlock };
}

// Result hooks: evidence into the control-plane ledger + the docked-output symbiotic pulse.
export function coreOnResult({ lane, prompt, output, exitCode = 0 } = {}) {
  const text = String(output || '');
  const bytes = Buffer.byteLength(text, 'utf8');
  appendJsonl(ledgerPath(), {
    timestamp: new Date().toISOString(),
    type: 'lane_output',
    lane,
    exitCode,
    bytes,
    content: `lane ${lane} completed with ${bytes} output bytes`,
    contentSha256: crypto.createHash('sha256').update(text).digest('hex'),
    via: 'llm-lane',
  });
  // Docked-LLM output is advisory until YURI verifies it against live evidence (yuri-origin pulse
  // contract). Record the lightweight pulse verdict directly since the pulse module is retired.
  appendJsonl(pulsePath(), {
    timestamp: new Date().toISOString(),
    type: 'pulse',
    source: 'docked-llm',
    lane,
    authority: 'advisory_only',
    local_truth_claim: false,
    verdict: exitCode === 0 ? 'verify' : 'block',
    bytes,
    cue: String(prompt || '').slice(0, 120),
  });
}

export { ledgerPath, pulsePath };
