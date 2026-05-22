#!/usr/bin/env node
/**
 * YURI-owned Kagami event bus.
 *
 * This is the canonical append-only record for control-plane decisions. Claude
 * runtime files may mirror some events later, but they are not the source of
 * truth.
 */

import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  KAGAMI_CANONICAL_STATE_ROOT,
  KAGAMI_CONTROL_DOMAIN_VERSION,
  KAGAMI_EVENT_KINDS,
  assertNoProtectedCanonicalState,
} from './kagami-control-domain.mjs';
import { isProtectedPath } from './lane-kernel.mjs';

export const KAGAMI_EVENT_BUS_FILE = 'events.jsonl';

export function resolveKagamiEventRoot(root = process.env.KAGAMI_CONTROL_STATE_ROOT || KAGAMI_CANONICAL_STATE_ROOT) {
  const value = String(root || '').trim() || KAGAMI_CANONICAL_STATE_ROOT;
  if (isProtectedPath(value)) {
    throw new Error(`Kagami event root cannot be protected: ${value}`);
  }
  assertNoProtectedCanonicalState([value]);
  return path.resolve(value);
}

export function kagamiEventFile(root) {
  return path.join(resolveKagamiEventRoot(root), KAGAMI_EVENT_BUS_FILE);
}

export function buildKagamiEvent(kind, payload = {}, options = {}) {
  if (!KAGAMI_EVENT_KINDS.includes(kind) && !options.allowUnknownKind) {
    throw new Error(`Unknown Kagami event kind: ${kind}`);
  }

  const event = compactObject({
    id: options.id || `evt_${randomUUID()}`,
    ts: options.ts || new Date().toISOString(),
    schemaVersion: KAGAMI_CONTROL_DOMAIN_VERSION,
    kind,
    signedBy: options.signedBy || payload.signedBy || 'kagami',
    session: payload.session || options.session,
    lane: payload.lane || options.lane,
    goalId: payload.goalId || options.goalId,
    parentId: payload.parentId || options.parentId,
    evidenceRefs: payload.evidenceRefs || options.evidenceRefs || [],
    payload,
  });

  return event;
}

export function appendKagamiEvent(kind, payload = {}, options = {}) {
  const root = resolveKagamiEventRoot(options.root);
  mkdirSync(root, { recursive: true });
  const event = buildKagamiEvent(kind, payload, options);
  appendFileSync(path.join(root, KAGAMI_EVENT_BUS_FILE), `${JSON.stringify(event)}\n`);
  return event;
}

export function readKagamiEvents(options = {}) {
  const file = kagamiEventFile(options.root);
  if (!existsSync(file)) return [];
  const rows = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`Invalid Kagami event JSON at line ${index + 1}: ${err.message}`);
      }
    });

  const limit = Number(options.limit || 0);
  return limit > 0 ? rows.slice(-limit) : rows;
}

export function appendRouteDecisionEvent(decision, extra = {}, options = {}) {
  return appendKagamiEvent(
    'ROUTE_DECISION_RECORDED',
    {
      source: extra.source || 'rick',
      decision,
      session: extra.session,
      lane: decision?.lane || '',
      blocked: Boolean(decision?.blocked),
      routeClass: decision?.class || '',
      reason: decision?.reason || '',
      mode: decision?.mode || '',
    },
    options,
  );
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const events = readKagamiEvents({ limit: Number(process.argv[2] || 20) });
  console.log(JSON.stringify(events, null, 2));
}
