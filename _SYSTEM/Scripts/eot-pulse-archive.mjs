#!/usr/bin/env node

/**
 * Archive notable recent Kagami events into the self-improvement pulse archive.
 * This replaces the legacy direct `.claude/state` pulse-bus reader.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKagamiEvents } from './kagami-event-bus.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ARCHIVE_DIR = path.join(REPO_ROOT, '_SYSTEM', 'SELF-IMPROVEMENT', 'pulse-archive');

function notable(event) {
  return /FAILED|AUTHORIZATION|COST|HANDOFF|MEMORY|ROUTE|VERIFICATION/u.test(event.kind || '');
}

function main() {
  const events = readKagamiEvents({ limit: 500 }).filter(notable);
  const date = new Date().toISOString().slice(0, 10);
  const archive = {
    date,
    source: '_SYSTEM/state/kagami-control/events.jsonl',
    eventCount: events.length,
    findings: events.map((event) => ({
      ts: event.ts,
      kind: event.kind,
      lane: event.lane || event.payload?.lane || null,
      summary: String(event.payload?.reason || event.payload?.status || event.kind || '').slice(0, 300),
      evidenceRefs: event.evidenceRefs || [],
    })),
  };

  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const out = path.join(ARCHIVE_DIR, `${date}.json`);
  writeFileSync(out, `${JSON.stringify(archive, null, 2)}\n`);
  console.log(`pulse archive: ${archive.eventCount} notable events -> ${path.relative(REPO_ROOT, out)}`);
}

main();
