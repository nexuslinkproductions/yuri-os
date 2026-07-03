#!/usr/bin/env node
/**
 * native-spawn-loop.mjs — Opus-top native agent spawn loop for MURE
 *
 * Consumes nativeSpecs from runCompany (role + model + prompt), spawns Claude Agents
 * directly via the Opus Agent tool (not via lane-dispatch), and writes substrate-agnostic
 * result packets to the shared runDir for convergence.
 *
 * WHY: lane-dispatch → llm-lane only supports cloud lanes (deepseek, mimo), not native
 * Anthropic lanes (opus/sonnet/haiku). Native Claude Agents are ONLY spawnable via the
 * Agent tool from an Opus session. This loop is the Opus-side execution seam.
 *
 * DISARMED by default (zero native spawns, zero Anthropic spend). Arming requires:
 *   YURI_MURE_ARMED=1 OR flag _SYSTEM/state/mure.enabled
 *
 * @use: import { spawnNativeLoop } from 'native-spawn-loop.mjs'
 *       spawnNativeLoop(nativeSpecs, runDir) → { pool, skipped }
 * @exports: spawnNativeLoop
 */

// @capability: native-spawn-loop
// @serves: native agent spawn | mure native substrate | opus-side execution seam | spawn native claude agents | dual-substrate native lane | native specs to packets
// @does: the Opus-side native-Agent execution SEAM for MURE — consumes nativeSpecs (role/model/prompt) from runCompany and writes substrate-agnostic result packets to the shared runDir for convergence. Native Claude Agents are ONLY spawnable via the Agent tool from an Opus session, so the script/GLM side produces DISARMED/dry-run stub packets; the REAL native execution is the Opus session reading nativeSpecs + spawning Agents directly, then writing packets back. DISARMED-safe (zero spawns without YURI_MURE_ARMED=1 / mure.enabled).
// @use: import { spawnNativeLoop } from mure/native-spawn-loop.mjs; await spawnNativeLoop(nativeSpecs, runDir) → { pool, skipped }. Called by company.mjs dispatchNative.
// @exports: spawnNativeLoop, isArmed

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractResultLabel, validatePacket } from '../Scripts/glm-fleet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const ARM_ENV = 'YURI_MURE_ARMED';
const ARM_FLAG = path.join(REPO_ROOT, '_SYSTEM', 'state', 'mure.enabled');

/**
 * Check if MURE is armed for native spawns.
 * DISARMED = dry-run (zero spawns, zero Anthropic spend).
 */
export function isArmed() {
  if (process.env[ARM_ENV] === '1') return true;
  try { return fs.existsSync(ARM_FLAG); } catch { return false; }
}

/**
 * Native Agent spawn — ONLY available from a live Opus/Cursor Agent session (D-6 honesty).
 */
async function spawnNativeAgent(spec, { armed = false } = {}) {
  if (!armed) {
    return {
      text: `[DISARMED] Native Agent '${spec.role}' (model=${spec.model}) not spawned — MURE disarmed\n\nPrompt: ${spec.prompt}`,
      resultLabel: '',
      status: 'disarmed',
    };
  }
  return {
    text: `[BLOCKED: Native Agent '${spec.role}' (model=${spec.model}) requires a live Opus/Cursor Agent session — not spawnable from script]\n\nPrompt: ${spec.prompt}`,
    resultLabel: '',
    status: 'blocked-needs-opus-session',
  };
}

/**
 * Spawn a loop of native Agents, one per nativeSpec.
 * Writes substrate-agnostic result packets to runDir/native-{id}.json.
 *
 * @param {Array<{id,role,model,prompt}>} nativeSpecs - specs from planCompany
 * @param {string} runDir - absolute path to the shared results directory
 * @returns {Promise<{ pool: { [id]: { label, text, status } }, skipped: Array<{file,error}> }>}
 */
export async function spawnNativeLoop(nativeSpecs = [], runDir = '') {
  const pool = {};
  const skipped = [];
  const armed = isArmed();

  if (!Array.isArray(nativeSpecs) || nativeSpecs.length === 0) {
    return { pool, skipped: [{ file: '(none)', error: 'no native specs' }] };
  }

  if (!runDir || !fs.existsSync(runDir)) {
    return { pool, skipped: [{ file: runDir, error: 'runDir does not exist' }] };
  }

  // Ensure results dir exists
  fs.mkdirSync(runDir, { recursive: true });

  for (const spec of nativeSpecs) {
    const id = spec.id || spec.role || 'native';
    const jsonFile = path.join(runDir, `native-${id}.json`);
    const lane = spec.model || 'sonnet';

    try {
      const t0 = Date.now();
      let result;
      result = await spawnNativeAgent(spec, { armed });

      const durationMs = Date.now() - t0;
      const packet = {
        laneId: lane,
        role: id,  // leafId for convergence
        task: spec.prompt,
        resultLabel: result.resultLabel || extractResultLabel(result.text) || '',
        evidence: '',
        status: result.status,
        text: result.text,
        durationMs,
        runId: path.basename(path.dirname(runDir)),
        traceId: 'native-spawn-loop',
        spanId: id,
      };

      if (validatePacket(packet)) {
        fs.writeFileSync(jsonFile, JSON.stringify(packet, null, 2));
        pool[id] = {
          label: packet.resultLabel,
          text: packet.text,
          status: packet.status,
        };
      } else {
        packet.status = 'malformed';
        fs.writeFileSync(jsonFile, JSON.stringify(packet, null, 2));
        skipped.push({ file: jsonFile, error: 'packet validation failed' });
      }
    } catch (e) {
      skipped.push({ file: jsonFile, error: String(e?.message || e) });
    }
  }

  return { pool, skipped };
}

// CLI: node native-spawn-loop.mjs --specs '<json>' --runDir '<path>'
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const specsIdx = args.indexOf('--specs');
  const runDirIdx = args.indexOf('--runDir');
  const specsPath = specsIdx >= 0 ? args[specsIdx + 1] : '';
  const runDir = runDirIdx >= 0 ? args[runDirIdx + 1] : '';

  if (!specsPath || !runDir) {
    process.stderr.write('Usage: node native-spawn-loop.mjs --specs <specs.json> --runDir <runDir>\n');
    process.exit(1);
  }

  const specsRaw = fs.readFileSync(specsPath, 'utf8');
  const specs = JSON.parse(specsRaw);
  spawnNativeLoop(specs, runDir)
    .then(({ pool, skipped }) => {
      process.stdout.write(JSON.stringify({ pool, skipped, armed: isArmed() }, null, 2) + '\n');
      process.exit(skipped.length > 0 ? 1 : 0);
    })
    .catch((e) => {
      process.stderr.write(`Error: ${e?.message || e}\n`);
      process.exit(1);
    });
}