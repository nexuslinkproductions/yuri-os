#!/usr/bin/env node
/**
 * MURE Apply Preflight — 10-check safety net before dispatch
 *
 * Ship: WS-H-M0-apply-preflight
 * Authority: MURE_ENFORCEMENT_MINIMUM_2026-06-30.md §D.2
 *
 * Run before any --apply dispatch. Validates:
 *   1. mure.mjs --validate ok
 *   2. No unresolved blocking rulings on target task file
 *   3. Visual-plan gate satisfied if requiresVisualPlan
 *   4. Arm flags present for apply/dispatch mode
 *   5. No stale company-dispatch/runSwarm processes
 *   6. .claude/jobs/ writable
 *   7. glm-max timeout = 1_800_000 ms
 *   8. MLP enabled if --mlp-learn
 *   9. Dry-run plan JSON valid
 *  10. Print wait-for-job.mjs recommendation
 *
 * Usage:
 *   node _SYSTEM/Scripts/apply-preflight.mjs --task-file <path>
 *   node _SYSTEM/Scripts/apply-preflight.mjs --apply-ready --task-file <path>
 *
 * Exit codes:
 *   0 — all checks pass (or warnings only)
 *   1 — hard failure (apply should NOT proceed)
 */

import { spawnSync } from 'child_process';
import { readFileSync, existsSync, accessSync, constants, promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

const GLM_MAX_TIMEOUT_MS = 1_800_000; // 30 minutes

class PreflightResult {
  constructor() {
    this.passes = [];
    this.warnings = [];
    this.failures = [];
  }

  pass(message) {
    this.passes.push(message);
    console.log(`✓ ${message}`);
  }

  warn(message) {
    this.warnings.push(message);
    console.warn(`⚠ ${message}`);
  }

  fail(message) {
    this.failures.push(message);
    console.error(`✗ ${message}`);
  }

  get exitCode() {
    return this.failures.length > 0 ? 1 : 0;
  }

  summary() {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Preflight summary: ${this.passes.length} pass, ${this.warnings.length} warn, ${this.failures.length} fail`);
    if (this.exitCode === 0) {
      console.log('✓ Preflight PASSED — apply may proceed');
    } else {
      console.log('✗ Preflight FAILED — apply BLOCKED');
    }
    console.log('='.repeat(60));
  }
}

function spawnOrFail(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    stdio: 'pipe',
    shell: true,
  });

  if (result.error) {
    throw new Error(`Failed to spawn ${command}: ${result.error.message}`);
  }

  return {
    status: result.status,
    stdout: result.stdout?.toString('utf-8') || '',
    stderr: result.stderr?.toString('utf-8') || '',
  };
}

/**
 * Check 1: Validate mure.mjs --validate
 */
function checkMureValidate(result, applyReady) {
  if (!applyReady) {
    result.pass('Check 1: mure.mjs --validate skipped (not --apply-ready)');
    return;
  }

  try {
    const { status, stdout, stderr } = spawnOrFail(
      'node',
      [join(REPO_ROOT, '_SYSTEM/mure/mure.mjs'), '--validate'],
      { cwd: REPO_ROOT }
    );

    if (status === 0) {
      result.pass('Check 1: mure.mjs --validate passed');
    } else {
      result.fail(`Check 1: mure.mjs --validate failed (exit ${status})`);
      if (stderr.trim()) {
        console.error(stderr.trim());
      }
    }
  } catch (error) {
    result.fail(`Check 1: mure.mjs --validate error: ${error.message}`);
  }
}

/**
 * Check 2: No unresolved blocking rulings on task file
 */
function checkBlockingRulings(result, taskFilePath) {
  if (!taskFilePath) {
    result.pass('Check 2: No task file specified — skipped blocking ruling check');
    return;
  }

  const taskFile = join(REPO_ROOT, taskFilePath);
  if (!existsSync(taskFile)) {
    result.fail(`Check 2: Task file not found: ${taskFilePath}`);
    return;
  }

  try {
    const task = JSON.parse(readFileSync(taskFile, 'utf-8'));
    const held = task.held || [];

    if (held.length === 0) {
      result.pass('Check 2: No unresolved blocking rulings');
    } else {
      const blocking = held.filter(h => h.blocking);
      if (blocking.length === 0) {
        result.pass(`Check 2: ${held.length} non-blocking rulings (held but not blocking)`);
      } else {
        result.fail(`Check 2: ${blocking.length} unresolved blocking rulings:`);
        blocking.forEach(h => {
          console.error(`  - ${h.id || 'unknown'}: ${h.reason || h.title || 'no reason'}`);
        });
      }
    }
  } catch (error) {
    result.warn(`Check 2: Could not parse task file: ${error.message}`);
  }
}

/**
 * Check 3: Visual-plan gate satisfied
 */
function checkVisualGate(result, taskFilePath) {
  if (!taskFilePath) {
    result.pass('Check 3: No task file specified — skipped visual gate check');
    return;
  }

  const taskFile = join(REPO_ROOT, taskFilePath);
  if (!existsSync(taskFile)) {
    result.warn('Check 3: Task file missing — cannot check visual gate');
    return;
  }

  try {
    const task = JSON.parse(readFileSync(taskFile, 'utf-8'));
    const requiresVisual = task.requiresVisualPlan === true;

    if (!requiresVisual) {
      result.pass('Check 3: No visual-plan requirement');
      return;
    }

    // Check for visual-plan.gate flag or similar
    const gateFlag = join(REPO_ROOT, 'visual-plan.gate');
    if (existsSync(gateFlag)) {
      result.pass('Check 3: Visual-plan gate satisfied (gate file exists)');
    } else {
      result.fail('Check 3: Visual-plan gate NOT satisfied (requires visual-plan.gate)');
    }
  } catch (error) {
    result.warn(`Check 3: Could not check visual gate: ${error.message}`);
  }
}

/**
 * Check 4: Arm flags present
 */
function checkArmFlags(result, applyReady) {
  if (!applyReady) {
    result.pass('Check 4: Arm flags not required (not --apply-ready)');
    return;
  }

  // Check mure.enabled
  const mureEnabled = process.env.MURE_ENABLED === '1';
  if (mureEnabled) {
    result.pass('Check 4a: MURE_ENABLED=1 set');
  } else {
    result.fail('Check 4a: MURE_ENABLED not set (required for apply)');
  }

  // Check glm-fleet flag if GLM roles present (warn only, since we don't know task content)
  const glmFleet = process.env.MURE_GLM_FLEET === '1';
  if (glmFleet) {
    result.pass('Check 4b: MURE_GLM_FLEET=1 set');
  } else {
    result.warn('Check 4b: MURE_GLM_FLEET not set (may be needed for GLM leaves)');
  }

  // Check ollama sidecar flag if needed (warn only)
  const ollamaSidecar = process.env.MURE_OLLAMA_SIDECAR === '1';
  if (ollamaSidecar) {
    result.pass('Check 4c: MURE_OLLAMA_SIDECAR=1 set');
  } else {
    result.warn('Check 4c: MURE_OLLAMA_SIDECAR not set (may be needed for Ollama sidecars)');
  }
}

/**
 * Check 5: No stale company-dispatch / runSwarm processes
 */
function checkStaleProcesses(result) {
  try {
    // Check for stale company-dispatch processes
    const { status: cdStatus, stdout: cdStdout } = spawnOrFail('pgrep', ['-fl', 'company-dispatch']);
    const cdCount = cdStatus === 0 ? (cdStdout.match(/\n/g) || []).length + 1 : 0;

    if (cdCount === 0) {
      result.pass('Check 5a: No stale company-dispatch processes');
    } else {
      result.warn(`Check 5a: ${cdCount} company-dispatch process(es) running — verify not stale`);
      if (cdStdout.trim()) {
        console.warn(cdStdout.trim());
      }
    }

    // Check for stale runSwarm processes
    const { status: rsStatus, stdout: rsStdout } = spawnOrFail('pgrep', ['-fl', 'runSwarm']);
    const rsCount = rsStatus === 0 ? (rsStdout.match(/\n/g) || []).length + 1 : 0;

    if (rsCount === 0) {
      result.pass('Check 5b: No stale runSwarm processes');
    } else {
      result.warn(`Check 5b: ${rsCount} runSwarm process(es) running — verify not stale`);
      if (rsStdout.trim()) {
        console.warn(rsStdout.trim());
      }
    }
  } catch (error) {
    // pgrep may not be available on all systems
    result.warn(`Check 5: Could not check stale processes: ${error.message}`);
  }
}

/**
 * Check 6: .claude/jobs/ writable
 */
function checkJobsWritable(result) {
  const jobsDir = join(REPO_ROOT, '.claude', 'jobs');

  try {
    accessSync(jobsDir, constants.W_OK);
    result.pass('Check 6: .claude/jobs/ writable');
  } catch (error) {
    result.fail(`Check 6: .claude/jobs/ not writable: ${error.message}`);
  }
}

/**
 * Check 7: glm-max timeout matches expected
 */
function checkGlmMaxTimeout(result) {
  try {
    const glmFleetPath = join(REPO_ROOT, '_SYSTEM/mure/glm-fleet.mjs');
    if (!existsSync(glmFleetPath)) {
      result.pass('Check 7: glm-fleet.mjs not found — skipped timeout check');
      return;
    }

    const glmFleetContent = readFileSync(glmFleetPath, 'utf-8');

    // Look for GLM_MAX_TIMEOUT_MS definition
    const timeoutMatch = glmFleetContent.match(/GLM_MAX_TIMEOUT_MS\s*=\s*(\d+)/);
    if (!timeoutMatch) {
      result.warn('Check 7: GLM_MAX_TIMEOUT_MS not found in glm-fleet.mjs');
      return;
    }

    const actualTimeout = parseInt(timeoutMatch[1], 10);
    if (actualTimeout === GLM_MAX_TIMEOUT_MS) {
      result.pass(`Check 7: glm-max timeout = ${GLM_MAX_TIMEOUT_MS} ms (correct)`);
    } else {
      result.fail(`Check 7: glm-max timeout = ${actualTimeout} ms (expected ${GLM_MAX_TIMEOUT_MS} ms)`);
    }
  } catch (error) {
    result.warn(`Check 7: Could not verify glm-max timeout: ${error.message}`);
  }
}

/**
 * Check 8: MLP enabled if --mlp-learn
 */
function checkMlpEnabled(result, mlpLearn) {
  if (!mlpLearn) {
    result.pass('Check 8: MLP check skipped (--mlp-learn not set)');
    return;
  }

  const mlpEnabled = process.env.MURE_MLP_LEARN === '1' || process.env.MLP_LEARN_ENABLED === '1';
  if (mlpEnabled) {
    result.pass('Check 8: MLP enabled (MLP_LEARN_ENABLED/MURE_MLP_LEARN=1)');
  } else {
    result.fail('Check 8: --mlp-learn set but MLP not enabled (set MLP_LEARN_ENABLED=1)');
  }
}

/**
 * Check 9: Dry-run plan JSON valid
 */
function checkDryRunPlan(result, taskFilePath, applyReady) {
  if (!taskFilePath) {
    result.pass('Check 9: No task file specified — skipped dry-run validation');
    return;
  }

  const taskFile = join(REPO_ROOT, taskFilePath);
  if (!existsSync(taskFile)) {
    result.warn('Check 9: Task file missing — cannot validate dry-run plan');
    return;
  }

  try {
    const task = JSON.parse(readFileSync(taskFile, 'utf-8'));

    // Support both workstreams (company-dispatch format) and subtasks (build-master format)
    const workstreams = task.workstreams || task.subtasks;

    // Basic structure validation - at minimum need some task structure
    if (!workstreams && !task.tasks && !task.leaves) {
      result.fail('Check 9: Task JSON missing task structure (workstreams/subtasks/tasks/leaves)');
      return;
    }

    // Validate workstreams/subtasks array if present
    if (workstreams) {
      if (!Array.isArray(workstreams)) {
        result.fail('Check 9: workstreams/subtasks is not an array');
        return;
      }

      // Check each workstream/subtask has required fields
      let wsValid = true;
      workstreams.forEach((ws, i) => {
        // Support different field naming conventions
        const hasId = ws.id || ws.leafId;
        const hasTitle = ws.title || ws.need || ws.prompt;
        if (!hasId || !hasTitle) {
          wsValid = false;
          result.fail(`Check 9: Workstream/subtask ${i} missing id (${!!hasId}) or title/need (${!!hasTitle})`);
        }
      });

      if (wsValid) {
        result.pass(`Check 9: Dry-run plan JSON valid (${workstreams.length} workstreams/subtasks)`);
      }
    } else if (task.tasks || task.leaves) {
      // Alternative format (tasks or leaves array)
      const taskArray = task.tasks || task.leaves;
      if (Array.isArray(taskArray)) {
        result.pass(`Check 9: Dry-run plan JSON valid (${taskArray.length} tasks/leaves)`);
      } else {
        result.pass('Check 9: Dry-run plan JSON has valid structure');
      }
    } else {
      result.pass('Check 9: Dry-run plan JSON valid');
    }
  } catch (error) {
    result.fail(`Check 9: Task JSON invalid: ${error.message}`);
  }
}

/**
 * Check 10: Print wait-for-job.mjs recommendation
 */
function printWaitForJobHint(result, taskFilePath) {
  if (!taskFilePath) {
    result.pass('Check 10: No task file — generic wait-for-job hint');
    console.log('\n💡 Wait-for-job hint:');
    console.log('  node _SYSTEM/Scripts/wait-for-job.mjs --run-id <swarm-run-id> --expect finishedAt --timeout 7200000 --poll-ms 5000');
    return;
  }

  const taskFile = join(REPO_ROOT, taskFilePath);
  let runIdHint = 'swarm-<run-id>';

  try {
    const task = JSON.parse(readFileSync(taskFile, 'utf-8'));
    // Try various id fields
    const id = task.id || task.taskId || task.name || task.summary?.slice(0, 20);
    if (id) {
      const shortId = typeof id === 'string' ? id.slice(0, 12).replace(/[^a-zA-Z0-9-]/g, '') : 'swarm';
      runIdHint = `swarm-${shortId}`;
    }
  } catch (error) {
    // Use default hint
  }

  result.pass('Check 10: wait-for-job recommendation printed');
  console.log('\n💡 Wait-for-job hint for orchestrator:');
  console.log(`  node _SYSTEM/Scripts/wait-for-job.mjs --run-id ${runIdHint} --expect finishedAt --timeout 7200000 --poll-ms 5000`);
  console.log('\n  Or wait for specific leaf:');
  console.log(`  node _SYSTEM/Scripts/wait-for-job.mjs --run-id ${runIdHint} --leaf <leaf-id> --expect resultLabel --timeout 1800000`);
}

/**
 * Main preflight execution
 */
function main() {
  const args = process.argv.slice(2);
  const applyReady = args.includes('--apply-ready');
  const mlpLearn = args.includes('--mlp-learn');

  const taskFileIndex = args.indexOf('--task-file');
  const taskFilePath = taskFileIndex !== -1 && args[taskFileIndex + 1]
    ? args[taskFileIndex + 1]
    : null;

  console.log('='.repeat(60));
  console.log('MURE Apply Preflight');
  console.log('='.repeat(60));
  if (taskFilePath) {
    console.log(`Task file: ${taskFilePath}`);
  }
  console.log(`Mode: ${applyReady ? '--apply-ready (dispatch mode)' : 'validation mode'}`);
  console.log('='.repeat(60) + '\n');

  const result = new PreflightResult();

  // Run all 10 checks
  checkMureValidate(result, applyReady);
  checkBlockingRulings(result, taskFilePath);
  checkVisualGate(result, taskFilePath);
  checkArmFlags(result, applyReady);
  checkStaleProcesses(result);
  checkJobsWritable(result);
  checkGlmMaxTimeout(result);
  checkMlpEnabled(result, mlpLearn);
  checkDryRunPlan(result, taskFilePath, applyReady);
  printWaitForJobHint(result, taskFilePath);

  // Print summary
  result.summary();

  process.exit(result.exitCode);
}

main();