/**
 * OPUS-SIDE NATIVE AGENT SPAWN IMPLEMENTATION
 *
 * This is the REFERENCE implementation for the Opus session to execute native
 * Claude Agents when MURE is armed. The GLM-side native-spawn-loop.mjs provides
 * the interface and dry-run path; THIS CODE is what the Opus session replaces
 * the stub with.
 *
 * WHEN TO USE:
 * - MURE is armed (YURI_MURE_ARMED=1 OR _SYSTEM/state/mure.enabled exists)
 * - runCompany returns nativeSpecs (roles with substrate='native')
 * - The Opus session has access to the Agent tool
 *
 * HOW TO INTEGRATE:
 * 1. In the Opus session, after calling runCompany(task), read nativeSpecs
 * 2. For each spec, use the Agent tool to spawn a native Agent
 * 3. Write the result packet to runDir/native-{id}.json using the schema below
 * 4. The convergence gate will read both GLM and native packets
 *
 * EXAMPLE OPUS USAGE:
 *
 * ```javascript
 * // In the Opus session (via a tool or script call):
 * import { runCompany } from '_SYSTEM/mure/company.mjs';
 *
 * const task = {
 *   summary: 'Design a secure authentication system',
 *   subtasks: [
 *     { id: 'audit-1', role: 'sentinel', need: ['security-review'], prompt: 'Audit the auth module' },
 *     { id: 'scout-1', role: 'scout', need: ['research'], prompt: 'Research auth best practices' },
 *   ],
 * };
 *
 * const result = await runCompany(task, { armed: true });
 * // result.nativeSpecs contains [{ id, role, model, prompt }, ...]
 *
 * // NOW SPAWN THE NATIVE AGENTS (Opus-side only):
 * const nativeResults = await spawnNativeAgentsOpus(result.nativeSpecs, result.swarm.runDir);
 * // nativeResults.pool contains the agent outputs
 * // convergence will now read both GLM and native packets
 * ```
 */

// ============================================================================
// NATIVE SPEC SHAPE (from planCompany)
// ============================================================================
/**
 * @typedef {Object} NativeSpec
 * @property {string} id - Unique identifier for this execution (used as leafId)
 * @property {string} role - Role id (e.g., 'sentinel', 'scout', 'helmsman')
 * @property {string} model - Claude model to use (opus/sonnet/haiku)
 * @property {string} prompt - The full task prompt for the Agent
 */

// ============================================================================
// RESULT PACKET SHAPE (substrate-agnostic for convergence)
// ============================================================================
/**
 * @typedef {Object} NativeResultPacket
 * @property {string} laneId - The model used (opus/sonnet/haiku)
 * @property {string} role - The role id (matches spec.id)
 * @property {string} task - The task prompt
 * @property {string} resultLabel - Extracted RESULT_LABEL (NNXX_DESCRIPTION_X_P/F_PASS_COMMITTED)
 * @property {string} evidence - Evidence lines (TERM_COUNT/FILE_COUNT/MATCH) if applicable
 * @property {string} status - 'ok' | 'disarmed' | 'dry-run' | 'failed'
 * @property {string} text - Full Agent response text
 * @property {number} durationMs - Execution time in milliseconds
 * @property {string} runId - Run identifier (from swarm runDir basename)
 * @property {string} traceId - Trace identifier (e.g., 'native-opus-spawn')
 * @property {string} spanId - Span identifier (matches spec.id)
 */

// ============================================================================
// OPUS-SIDE SPAWN IMPLEMENTATION (Reference)
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractResultLabel } from '../Scripts/glm-fleet.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');

/**
 * Spawn a single native Claude Agent via the Opus Agent tool.
 *
 * NOTE: This function CANNOT be implemented in a script — it MUST be called
 * from the Opus session where the Agent tool is available.
 *
 * The Opus session should call the Agent tool with these parameters:
 * - model: spec.model (opus/sonnet/haiku)
 * - instruction: The role prompt (use buildRolePrompt from company.mjs)
 * - tools: Standard YURI tool set (read_file, grep, bash, write_file, etc.)
 *
 * @param {NativeSpec} spec - The spec from planCompany
 * @returns {Promise<{ text: string, resultLabel: string, status: string }>}
 */
export async function spawnNativeAgentOpus(spec) {
  // TODO: Replace this stub with actual Agent tool call from Opus session
  //
  // OPUS-SIDE IMPLEMENTATION PATTERN:
  // 1. Call Agent tool with model=spec.model
  // 2. Pass the spec.prompt as the task/instruction
  // 3. Allow Agent to use YURI tools (read_file, bash, etc.)
  // 4. Capture the Agent's output text
  // 5. Extract RESULT_LABEL from the output
  // 6. Return { text, resultLabel, status: 'ok' }
  //
  // Example Agent call (conceptual):
  // const agent = await Agent({
  //   model: spec.model,
  //   instruction: spec.prompt,
  //   tools: ['read_file', 'write_file', 'bash', 'grep', 'search', 'xref_query'],
  // });
  // const text = agent.finalOutput;
  // const resultLabel = extractResultLabel(text);
  // return { text, resultLabel, status: 'ok' };

  // Stub return (for GLM-side compatibility):
  return {
    text: `[STUB: Opus Agent '${spec.role}' (model=${spec.model}) — NOT IMPLEMENTED IN SCRIPT]\n\nThis stub should be replaced by an actual Agent tool call from the Opus session.\n\nPrompt: ${spec.prompt}`,
    resultLabel: '',
    status: 'dry-run',
  };
}

/**
 * Spawn a loop of native Agents and write substrate-agnostic result packets.
 *
 * This matches the interface of spawnNativeLoop from native-spawn-loop.mjs.
 * The Opus session should call this function after runCompany returns nativeSpecs.
 *
 * @param {Array<NativeSpec>} nativeSpecs - Specs from planCompany
 * @param {string} runDir - Absolute path to the shared results directory
 * @returns {Promise<{ pool: { [id]: { label, text, status } }, skipped: Array<{file,error}> }>}
 */
export async function spawnNativeAgentsOpus(nativeSpecs = [], runDir = '') {
  const pool = {};
  const skipped = [];

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

      // ACTUAL AGENT SPAWN (Opus-side only):
      const result = await spawnNativeAgentOpus(spec);

      const durationMs = Date.now() - t0;
      const packet = {
        laneId: lane,
        role: id,
        task: spec.prompt,
        resultLabel: result.resultLabel || extractResultLabel(result.text) || '',
        evidence: '', // Agent should populate if evidence lines are generated
        status: result.status,
        text: result.text,
        durationMs,
        runId: path.basename(path.dirname(runDir)),
        traceId: 'native-opus-spawn',
        spanId: id,
      };

      // Write packet (same schema as GLM leaves for convergence)
      fs.writeFileSync(jsonFile, JSON.stringify(packet, null, 2));

      pool[id] = {
        label: packet.resultLabel,
        text: packet.text,
        status: packet.status,
      };
    } catch (e) {
      skipped.push({ file: jsonFile, error: String(e?.message || e) });
    }
  }

  return { pool, skipped };
}

// ============================================================================
// INTEGRATION EXAMPLE (Conceptual)
// ============================================================================
/**
 * This is how the Opus session should integrate native Agent spawning:
 *
 * 1. Call runCompany to get the plan + nativeSpecs
 * 2. Spawn native Agents using spawnNativeAgentsOpus
 * 3. Run convergence on the combined GLM + native pool
 * 4. Finalize if convergence passes
 *
 * PSEUDOCODE (for Opus session):
 *
 * ```javascript
 * import { runCompany } from '_SYSTEM/mure/company.mjs';
 * import { spawnNativeAgentsOpus } from '_SYSTEM/mure/native-opus-implementation.mjs';
 * import { aggregatePoolOutputs } from '_SYSTEM/Scripts/glm-fleet.mjs';
 *
 * const task = { summary: '...', subtasks: [...] };
 * const companyResult = await runCompany(task, { armed: true });
 *
 * // Spawn native Agents (Opus-side only)
 * if (companyResult.nativeSpecs.length > 0) {
 *   await spawnNativeAgentsOpus(companyResult.nativeSpecs, companyResult.swarm.runDir);
 * }
 *
 * // Aggregate both GLM and native outputs
 * const { pool } = aggregatePoolOutputs(companyResult.swarm.runDir);
 *
 * // Now convergence has both GLM and native results
 * console.log('Combined pool:', pool);
 * ```
 */

export { spawnNativeAgentOpus as spawnNativeAgent };