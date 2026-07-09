#!/usr/bin/env node
// @capability: sol-moe-injected-executor
// @serves: deterministic execution of Sol MoE company manifests without live OpenClaw coupling
// @does: consumes a sol-moe-company-v1 plan, invokes a caller-supplied spawn callback, keeps availability and quality routes separate, and returns execution telemetry without writing state
// @use: await executeSolMoePlan(plan, { spawn: async (request) => result, maxConcurrency: 3 })
// @exports: executeSolMoePlan

const DEFAULT_MAX_CONCURRENCY = 3;
const AVAILABILITY_FAILURES = new Set(['availability', 'transport', 'timeout', 'rate-limit']);

/**
 * Execute a manifest produced by planSolMoeCompany().
 *
 * The injected callback receives the original spawn entry plus:
 *   { routeKind, attempt, upstream: { evidence, producer? } }
 * It may return { ok, output, accepted, verifierPass, verdict, failureKind,
 * error, durationMs }. A thrown callback error is treated as a transport
 * failure unless it carries an explicit failureKind/kind.
 *
 * This function never imports OpenClaw, calls sessions_spawn, or persists data.
 */
export async function executeSolMoePlan(plan, options = {}) {
  validateInputs(plan, options);
  const spawn = options.spawn;
  const maxConcurrency = normalizeConcurrency(options.maxConcurrency);
  const telemetry = [];
  const results = [];
  let globalSequence = 0;

  const record = (event) => {
    globalSequence += 1;
    const stored = { sequence: globalSequence, ...event };
    telemetry.push(stored);
    return stored;
  };

  for (const routeRecord of plan.routes) {
    const taskId = String(routeRecord?.taskId || '');
    if (routeRecord?.held === true) {
      results.push({
        taskId,
        role: routeRecord.role || null,
        riskClass: routeRecord.route?.classification?.riskClass || null,
        status: 'owner-held',
        selectedRouteKind: null,
        producer: null,
        verifier: null,
        evidence: [],
        attempts: [],
        failure: null,
      });
      continue;
    }

    const taskTelemetry = [];
    let attemptCounter = 0;
    const reserveAttempt = () => {
      attemptCounter += 1;
      return attemptCounter;
    };
    const append = (event) => {
      const stored = record(event);
      taskTelemetry.push(stored);
      return stored;
    };
    const queues = taskQueues(plan.queues, taskId);

    const evidenceAttempts = queues.evidence.map((entry) => ({
      entry,
      attempt: reserveAttempt(),
    }));
    const evidenceRuns = await runBounded(evidenceAttempts, maxConcurrency, async ({ entry, attempt }) => (
      invokeSpawn(spawn, entry, {
        routeKind: 'evidence',
        phase: 'evidence',
        attempt,
        upstream: { evidence: [] },
      })
    ));
    for (const run of evidenceRuns) append(run.event);
    const evidence = evidenceRuns.map(evidenceObservation);

    const primaryEntry = queues.producers[0] || null;
    if (!primaryEntry) {
      results.push(failedTask(routeRecord, evidence, taskTelemetry, {
        code: 'PRODUCER_MISSING',
        message: `No producer queue entry for ${taskId}`,
      }));
      continue;
    }

    const primaryRouteKind = routeRecord.route?.selection === 'availability-fallback'
      ? 'availability-fallback'
      : 'primary';
    let producerRun = await invokeSpawn(spawn, primaryEntry, {
      routeKind: primaryRouteKind,
      phase: 'producer',
      attempt: reserveAttempt(),
      upstream: { evidence },
    });
    append(producerRun.event);

    if (!producerRun.response.ok) {
      if (!isAvailabilityFailure(producerRun.response.failureKind)) {
        results.push(failedTask(routeRecord, evidence, taskTelemetry, {
          code: 'PRODUCER_SEMANTIC_FAILURE',
          message: `Producer failed semantically for ${taskId}; availability fallbacks are forbidden for quality failures.`,
          failureKind: producerRun.response.failureKind,
          error: producerRun.response.error,
        }, {
          producer: producerObservation(producerRun),
          selectedRouteKind: producerRun.request.routeKind,
        }));
        continue;
      }

      let fallbackSucceeded = false;
      for (const fallback of queues.availabilityFallbacks) {
        producerRun = await invokeSpawn(spawn, fallback, {
          routeKind: 'availability-fallback',
          phase: 'producer',
          attempt: reserveAttempt(),
          upstream: { evidence },
        });
        append(producerRun.event);
        if (producerRun.response.ok) {
          fallbackSucceeded = true;
          break;
        }
        if (!isAvailabilityFailure(producerRun.response.failureKind)) break;
      }
      if (!fallbackSucceeded) {
        const semanticFallbackFailure = producerRun.response.failureKind === 'semantic';
        results.push(failedTask(routeRecord, evidence, taskTelemetry, {
          code: semanticFallbackFailure
            ? 'PRODUCER_SEMANTIC_FAILURE'
            : 'AVAILABILITY_FALLBACK_EXHAUSTED',
          message: semanticFallbackFailure
            ? `Availability candidate failed semantically for ${taskId}.`
            : `All task-scoped availability producers failed for ${taskId}.`,
          failureKind: producerRun.response.failureKind,
          error: producerRun.response.error,
        }, {
          producer: producerObservation(producerRun),
          selectedRouteKind: producerRun.request.routeKind,
        }));
        continue;
      }
    }

    let selectedRouteKind = producerRun.request.routeKind;
    let producer = producerObservation(producerRun);
    const requiresVerifier = routeRecord.route?.classification?.requiresVerifier === true
      || routeRecord.route?.verifier?.required === true;
    const verifierEntry = queues.verifiers[0] || null;

    if (!verifierEntry) {
      if (requiresVerifier) {
        results.push(failedTask(routeRecord, evidence, taskTelemetry, {
          code: 'REQUIRED_VERIFIER_MISSING',
          message: `Required verifier queue entry is missing for ${taskId}.`,
        }, { producer, selectedRouteKind }));
        continue;
      }
      results.push(passedTask(routeRecord, evidence, taskTelemetry, producer, null, selectedRouteKind));
      continue;
    }

    let verifierRun = await runVerifier(spawn, verifierEntry, {
      evidence,
      producer,
      attempt: reserveAttempt(),
    });
    append(verifierRun.event);

    if (!verifierRun.response.ok && verifierRun.response.failureKind !== 'semantic') {
      results.push(failedTask(routeRecord, evidence, taskTelemetry, {
        code: 'VERIFIER_EXECUTION_FAILURE',
        message: `Verifier transport/availability failed for ${taskId}; producer quality escalation cannot repair the verifier.`,
        failureKind: verifierRun.response.failureKind,
        error: verifierRun.response.error,
      }, { producer, verifier: verifierObservation(verifierRun), selectedRouteKind }));
      continue;
    }

    if (verifierAccepted(verifierRun.response)) {
      results.push(passedTask(
        routeRecord,
        evidence,
        taskTelemetry,
        producer,
        verifierObservation(verifierRun),
        selectedRouteKind,
      ));
      continue;
    }

    let qualityPassed = false;
    for (const escalation of queues.qualityEscalations) {
      const escalationRun = await invokeSpawn(spawn, escalation, {
        routeKind: 'quality-escalation',
        phase: 'producer',
        attempt: reserveAttempt(),
        upstream: {
          evidence,
          priorProducer: producer,
          priorVerifier: verifierObservation(verifierRun),
        },
      });
      append(escalationRun.event);
      if (!escalationRun.response.ok) continue;

      producerRun = escalationRun;
      producer = producerObservation(escalationRun);
      selectedRouteKind = 'quality-escalation';
      verifierRun = await runVerifier(spawn, verifierEntry, {
        evidence,
        producer,
        attempt: reserveAttempt(),
      });
      append(verifierRun.event);

      if (!verifierRun.response.ok && verifierRun.response.failureKind !== 'semantic') {
        results.push(failedTask(routeRecord, evidence, taskTelemetry, {
          code: 'VERIFIER_EXECUTION_FAILURE',
          message: `Verifier transport/availability failed after quality escalation for ${taskId}.`,
          failureKind: verifierRun.response.failureKind,
          error: verifierRun.response.error,
        }, { producer, verifier: verifierObservation(verifierRun), selectedRouteKind }));
        qualityPassed = null;
        break;
      }
      if (verifierAccepted(verifierRun.response)) {
        qualityPassed = true;
        break;
      }
    }

    if (qualityPassed === null) continue;
    if (qualityPassed) {
      results.push(passedTask(
        routeRecord,
        evidence,
        taskTelemetry,
        producer,
        verifierObservation(verifierRun),
        selectedRouteKind,
      ));
      continue;
    }

    results.push(failedTask(routeRecord, evidence, taskTelemetry, {
      code: 'QUALITY_ESCALATION_EXHAUSTED',
      message: `Verifier rejected the producer and every task-scoped quality escalation was exhausted for ${taskId}.`,
    }, { producer, verifier: verifierObservation(verifierRun), selectedRouteKind }));
  }

  for (const blocked of plan.blocked || []) {
    results.push({
      taskId: String(blocked.taskId || ''),
      role: blocked.role || null,
      riskClass: blocked.details?.riskClass || null,
      status: blocked.status || 'fail-loud',
      selectedRouteKind: null,
      producer: null,
      verifier: null,
      evidence: [],
      attempts: [],
      failure: {
        code: blocked.code || 'BLOCKED_BY_PLAN',
        message: blocked.reason || 'Task was blocked during planning.',
        details: blocked.details || null,
      },
    });
  }

  const failed = results.filter((result) => result.status === 'fail-loud').length;
  const passed = results.filter((result) => result.status === 'passed').length;
  const held = results.filter((result) => result.status === 'owner-held').length;
  return {
    schemaVersion: 'sol-moe-execution-v1',
    mode: 'injected-spawn-only',
    status: failed ? 'fail-loud' : 'passed',
    results,
    telemetry,
    summary: {
      tasks: results.length,
      passed,
      held,
      failed,
      spawnAttempts: telemetry.length,
    },
  };
}

async function runVerifier(spawn, entry, context) {
  const run = await invokeSpawn(spawn, entry, {
    routeKind: 'verification',
    phase: 'verifier',
    attempt: context.attempt,
    upstream: {
      evidence: context.evidence,
      producer: context.producer,
    },
  });
  const accepted = verifierAccepted(run.response);
  return {
    ...run,
    event: {
      ...run.event,
      status: !run.response.ok ? 'failed' : (accepted ? 'accepted' : 'rejected'),
      verifierPass: run.response.ok ? accepted : null,
    },
  };
}

async function invokeSpawn(spawn, entry, context) {
  const request = Object.freeze({
    ...entry,
    routeKind: context.routeKind,
    attempt: context.attempt,
    upstream: context.upstream,
  });
  let raw;
  try {
    raw = await spawn(request);
  } catch (error) {
    raw = {
      ok: false,
      failureKind: explicitFailureKind(error) || 'transport',
      error: serializeError(error),
      durationMs: finiteDuration(error?.durationMs),
    };
  }
  const response = normalizeResponse(raw);
  return {
    entry,
    request,
    response,
    event: {
      taskId: String(entry.taskId),
      phase: context.phase,
      purpose: entry.purpose,
      routeKind: context.routeKind,
      attempt: context.attempt,
      entryId: entry.id || null,
      agentId: entry.agentId || null,
      model: entry.model || null,
      status: response.ok ? 'succeeded' : 'failed',
      failureKind: response.failureKind,
      durationMs: response.durationMs,
    },
  };
}

function normalizeResponse(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const explicitlyFailed = raw.ok === false || ['failed', 'error'].includes(String(raw.status || '').toLowerCase());
    return {
      ok: !explicitlyFailed,
      output: Object.hasOwn(raw, 'output') ? raw.output : raw,
      accepted: raw.accepted,
      verifierPass: raw.verifierPass,
      verdict: raw.verdict,
      failureKind: explicitlyFailed ? (explicitFailureKind(raw) || 'transport') : null,
      error: explicitlyFailed ? (raw.error || raw.message || null) : null,
      durationMs: finiteDuration(raw.durationMs),
      raw,
    };
  }
  return {
    ok: true,
    output: raw,
    accepted: undefined,
    verifierPass: undefined,
    verdict: undefined,
    failureKind: null,
    error: null,
    durationMs: null,
    raw,
  };
}

function verifierAccepted(response) {
  if (!response.ok) return false;
  if (typeof response.accepted === 'boolean') return response.accepted;
  if (typeof response.verifierPass === 'boolean') return response.verifierPass;
  const nested = response.output && typeof response.output === 'object' ? response.output : null;
  if (typeof nested?.accepted === 'boolean') return nested.accepted;
  if (typeof nested?.verifierPass === 'boolean') return nested.verifierPass;
  const verdict = String(response.verdict ?? nested?.verdict ?? nested?.status ?? '').toLowerCase();
  if (['reject', 'rejected', 'fail', 'failed', 'invalid'].includes(verdict)) return false;
  if (['accept', 'accepted', 'pass', 'passed', 'valid', 'approved'].includes(verdict)) return true;
  // Gate lanes fail closed. Unstructured prose or a missing verdict cannot
  // silently promote a critical artifact to "verified".
  return false;
}

function evidenceObservation(run) {
  return {
    entryId: run.entry.id || null,
    agentId: run.entry.agentId || null,
    model: run.entry.model || null,
    ok: run.response.ok,
    output: run.response.output,
    failureKind: run.response.failureKind,
    durationMs: run.response.durationMs,
  };
}

function producerObservation(run) {
  return {
    entryId: run.entry.id || null,
    agentId: run.entry.agentId || null,
    model: run.entry.model || null,
    output: run.response.output,
    durationMs: run.response.durationMs,
    routeKind: run.request.routeKind,
  };
}

function verifierObservation(run) {
  if (!run) return null;
  return {
    entryId: run.entry.id || null,
    agentId: run.entry.agentId || null,
    model: run.entry.model || null,
    accepted: verifierAccepted(run.response),
    output: run.response.output,
    failureKind: run.response.failureKind,
    durationMs: run.response.durationMs,
  };
}

function passedTask(routeRecord, evidence, attempts, producer, verifier, selectedRouteKind) {
  return {
    taskId: String(routeRecord.taskId),
    role: routeRecord.role || null,
    riskClass: routeRecord.route?.classification?.riskClass || null,
    taskType: routeRecord.route?.classification?.taskType || null,
    status: 'passed',
    selectedRouteKind,
    producer,
    verifier,
    evidence,
    attempts,
    failure: null,
  };
}

function failedTask(routeRecord, evidence, attempts, failure, state = {}) {
  return {
    taskId: String(routeRecord.taskId),
    role: routeRecord.role || null,
    riskClass: routeRecord.route?.classification?.riskClass || null,
    taskType: routeRecord.route?.classification?.taskType || null,
    status: 'fail-loud',
    selectedRouteKind: state.selectedRouteKind || null,
    producer: state.producer || null,
    verifier: state.verifier || null,
    evidence,
    attempts,
    failure,
  };
}

function taskQueues(queues, taskId) {
  const forTask = (name) => (Array.isArray(queues?.[name]) ? queues[name] : [])
    .filter((entry) => String(entry?.taskId) === taskId);
  return {
    producers: forTask('producers'),
    verifiers: forTask('verifiers'),
    evidence: forTask('evidence'),
    availabilityFallbacks: forTask('availabilityFallbacks'),
    qualityEscalations: forTask('qualityEscalations'),
  };
}

async function runBounded(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function isAvailabilityFailure(kind) {
  return AVAILABILITY_FAILURES.has(String(kind || '').toLowerCase());
}

function explicitFailureKind(value) {
  const raw = value?.failureKind || value?.kind || value?.category;
  if (raw) return String(raw).toLowerCase();
  const code = String(value?.code || '').toLowerCase();
  if (/timeout/.test(code)) return 'timeout';
  if (/rate|quota|429/.test(code)) return 'rate-limit';
  if (/unavailable|auth|provider/.test(code)) return 'availability';
  if (/semantic|reject|invalid_output/.test(code)) return 'semantic';
  return null;
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || String(error),
    code: error.code || null,
  };
}

function finiteDuration(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}

function normalizeConcurrency(value) {
  if (value === undefined) return DEFAULT_MAX_CONCURRENCY;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new TypeError('maxConcurrency must be a positive integer');
  }
  return number;
}

function validateInputs(plan, options) {
  if (!plan || !Array.isArray(plan.routes) || !plan.queues || !Array.isArray(plan.blocked || [])) {
    throw new TypeError('executeSolMoePlan requires a Sol MoE company plan');
  }
  if (typeof options.spawn !== 'function') {
    throw new TypeError('executeSolMoePlan requires an injected spawn callback');
  }
}
