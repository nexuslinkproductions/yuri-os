#!/usr/bin/env node

/**
 * EOT archive worker - promote notable Kagami events to durable pulse archive.
 *
 * The old Phase 10 worker read `.claude/state`. Current YURI closeout uses the
 * YURI-owned Kagami event bus instead.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { KAGAMI_CANONICAL_STATE_ROOT } from './kagami-control-domain.mjs';
import { readKagamiEvents } from './kagami-event-bus.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');
const ARCHIVE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'SELF-IMPROVEMENT', 'pulse-archive');

const KEEP_KINDS = new Set([
  'AUTHORIZATION_REQUIRED',
  'CODEX_VERIFICATION_FAILED',
  'CODEX_VERIFICATION_PASSED',
  'COST_GOVERNOR_TRIPPED',
  'HANDOFF_RECORDED',
  'MEMORY_CANDIDATE_PROPOSED',
  'ROUTE_DECISION_RECORDED',
]);

function main() {
  const events = readKagamiEvents({ limit: 1000 }).filter((event) => KEEP_KINDS.has(event.kind));
  const date = new Date().toISOString().slice(0, 10);
  const archive = {
    date,
    source: `${KAGAMI_CANONICAL_STATE_ROOT}/events.jsonl`,
    commits: process.argv.slice(2),
    findings: events.map((event) => ({
      id: event.id,
      ts: event.ts,
      kind: event.kind,
      lane: event.lane || event.payload?.lane || null,
      session: event.session || event.payload?.session || null,
      evidenceRefs: event.evidenceRefs || [],
      payloadHash: hashPayload(event.payload || {}),
    })),
    telemetry: {
      event_count: events.length,
      verification_failures: events.filter((event) => event.kind === 'CODEX_VERIFICATION_FAILED').length,
      route_decisions: events.filter((event) => event.kind === 'ROUTE_DECISION_RECORDED').length,
    },
  };

  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const out = path.join(ARCHIVE_DIR, `${date}.json`);
  writeFileSync(out, `${JSON.stringify(archive, null, 2)}\n`);
  console.log(`phase-10 archive: ${path.relative(REPO_ROOT, out)}`);
  console.log(`  findings kept: ${events.length}`);
  console.log(`  telemetry: ${JSON.stringify(archive.telemetry)}`);
}

function hashPayload(payload) {
  const text = JSON.stringify(payload);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(31, hash) + text.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
