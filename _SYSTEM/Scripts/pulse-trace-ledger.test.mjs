#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendPulseTraceEvent,
  compactPulseSnapshot,
  readPulseTraceEvents,
  resolvePulseTracePaths,
  verifyPulseTraceLedger,
  writePulseTraceSnapshot,
} from './pulse-trace-ledger.mjs';

const root = mkdtempSync(join(tmpdir(), 'pulse-trace-ledger-test-'));

try {
  const plan = {
    schema_version: 2,
    contract: 'PulsePlan',
    mode: 'plan_only',
    intent: { sha256: 'intent-sha' },
    route: { lane: 'swarm', scenario: 'high-stakes-review' },
    pulseSeed: {
      objective: 'verify pulse trace ledger',
      privacyClass: 'standard',
      risks: ['trace-integrity'],
      capabilityHints: ['deterministic-verification'],
      workPackets: [{ id: 'verify', capability: 'deterministic-verification', priority: 'required' }],
      legacyAliases: [],
    },
    symbioticPulse: {
      selectedLanes: ['triage-local'],
      skippedCandidates: [{ laneId: 'deepseek-v4-pro', reason: 'missing key' }],
      activationGraph: {
        schema_version: 1,
        type: 'bounded_dag',
        triggerAllAtOnce: false,
        nodes: [{ id: 'intake_classify' }],
        edges: [],
      },
      stages: [
        {
          id: 'intake_classify',
          capability: 'intent-normalization',
          purpose: 'Classify only.',
          laneIds: ['triage-local'],
          nativeOnly: false,
          dependsOn: [],
          triggerAllAtOnce: false,
        },
      ],
    },
    pulseTrace: {
      traceId: 'pulse-trace-test',
    },
  };

  const event = appendPulseTraceEvent({
    traceId: 'pulse-trace-test',
    type: 'pulse.dry_run.planned',
    status: 'planned',
    payload: {
      stage_order: ['intake_classify'],
      selected_lane_ids: ['triage-local'],
      stores_hidden_reasoning: false,
    },
  }, { root });

  assert.equal(event.trace_id, 'pulse-trace-test', 'trace id should be normalized');
  assert.equal(event.type, 'pulse.dry_run.planned', 'event type mismatch');
  assert.equal(event.payload.stage_order[0], 'intake_classify', 'payload should be preserved');

  const snapshotPath = writePulseTraceSnapshot(
    'pulse-trace-test',
    compactPulseSnapshot(plan, {
      mode: 'pulse_dry_run',
      trigger_all_at_once: false,
      selected_lane_ids: ['triage-local'],
      stages: [{ id: 'intake_classify', status: 'planned', laneResults: [] }],
    }),
    { root },
  );
  assert(existsSync(snapshotPath), 'snapshot should be written');

  const events = readPulseTraceEvents({ root });
  assert.equal(events.length, 1, 'ledger event count mismatch');
  assert.equal(events[0].payload_sha256, event.payload_sha256, 'payload hash should round-trip');

  const verification = verifyPulseTraceLedger({ root });
  assert.equal(verification.ok, true, `ledger verification failed: ${verification.errors.join(', ')}`);

  assert.throws(
    () => appendPulseTraceEvent({
      traceId: 'blocked',
      type: 'pulse.bad',
      status: 'blocked',
      payload: { chainOfThought: 'not allowed' },
    }, { root }),
    /forbidden hidden reasoning key/,
    'ledger must reject hidden reasoning keys',
  );

  const paths = resolvePulseTracePaths({ root });
  assert(paths.ledgerPath.endsWith('ledger.ndjson'), 'ledger path mismatch');

  process.stdout.write('pulse-trace-ledger: pass\n');
} finally {
  rmSync(root, { recursive: true, force: true });
}
