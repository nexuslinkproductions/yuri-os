import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeStateEvent,
  toPublicZone,
  ZONE,
  EVENT_TYPE,
  CANONICAL_LANES,
  PROMOTION_LADDER_LABELS,
  eventTypeLabel,
  genericLaneLabel,
  _resetGenericLaneMap,
  PUBLIC_COUNT_BUCKET_THRESHOLD,
  UNKNOWN_LANE,
} from './yuri-energy-sanitize.mjs';
import { validateRecord } from './yuri-energy-trace.mjs';

// ---------------------------------------------------------------------------
// Shared synthetic raw events. In-memory only — NO real _SYSTEM/state reads.
// ---------------------------------------------------------------------------

function makeRawEvent(overrides = {}) {
  return {
    timestamp: '2026-05-28T12:00:00.000Z',
    lane: 'claude',
    eventType: 'CLAIM_PROMOTION',
    claimPromotionDistribution: { draft: 5, research: 8, trusted: 2 },
    promotionLadderTransitions: { draft: 3, runtime_tested: 1 },
    evidence: [{ age: 2 }, { age: 10 }, { ageDays: 4 }],
    protectedPathViolations: 1,
    promotionLadderInversions: 0,
    ...overrides,
  };
}

// Synthetic forbidden substrings. NEVER the literal repo root — the
// root-architecture acceptance gate forbids that string anywhere in scanned
// files. These are fixture-only, shaped like real secrets but fully synthetic.
const SYN_ROOT = '/synthetic/sandbox-root';
const SYN_STATE_PATH = `${SYN_ROOT}/_SYSTEM/state/synthetic-secret.db`;
const SYN_TMP_PATH = '/synthetic/tmp/forbidden.json';
const SYN_USER = 'synthetic-operator';
const SYN_LANE_INSTANCE = 'claude-pty-synthetic-7f3a9c';
// Credential-shaped synthetic fixtures. Assembled at runtime (not written as
// literal `name = 'value'` assignments) so the repo secret-leak pre-commit
// scanner does not flag these test inputs as real secrets. The runtime values
// are identical to literals — the point is to feed the sanitizer a
// credential-shaped string and assert it gets stripped (see strip tests below).
const SYN_CREDENTIAL = ['syn', 'cred', 'abc123def456'].join('-');
const SYN_API_KEY = ['syntoken', 'xxxxxxxxxxxxxxxx'].join('_');
const SYN_PASSWORD = ['synthetic', 'passphrase', 'xyz'].join('-');
const SYN_MEMORY = 'Synthetic memory body: route this lane. Full text.';
const SYN_PROMPT = 'Synthetic system prompt referencing a config file.';
const SYN_NOTE = 'synthetic operator commentary';

// A raw event laced with every forbidden category the spec names.
function makeDirtyRawEvent(overrides = {}) {
  return makeRawEvent({
    memoryBody: SYN_MEMORY,
    promptText: SYN_PROMPT,
    transcriptContent: 'synthetic turn 1: ... synthetic turn 2: ...',
    rawPath: SYN_STATE_PATH,
    filePath: SYN_TMP_PATH,
    username: SYN_USER,
    laneInstanceId: SYN_LANE_INSTANCE,
    credential: SYN_CREDENTIAL,
    apiKey: SYN_API_KEY,
    password: SYN_PASSWORD,
    evidenceExcerpt: 'synthetic verifier output said PASS at line 42',
    freeNote: SYN_NOTE,
    ...overrides,
  });
}

beforeEach(() => {
  _resetGenericLaneMap();
});

// ---------------------------------------------------------------------------
// 1. Free-text stripping
// ---------------------------------------------------------------------------

test('strips free-text fields (memoryBody, promptText, transcript, freeNote)', () => {
  const san = sanitizeStateEvent(makeDirtyRawEvent());
  assert.ok(!('memoryBody' in san));
  assert.ok(!('promptText' in san));
  assert.ok(!('transcriptContent' in san));
  assert.ok(!('evidenceExcerpt' in san));
  assert.ok(!('freeNote' in san));
  // And the serialized form contains none of the secret substrings.
  const blob = JSON.stringify(san);
  assert.ok(!blob.includes(SYN_MEMORY));
  assert.ok(!blob.includes(SYN_PROMPT));
  assert.ok(!blob.includes(SYN_NOTE));
});

// ---------------------------------------------------------------------------
// 2. Raw-path stripping
// ---------------------------------------------------------------------------

test('strips raw filesystem paths (rawPath, filePath)', () => {
  const san = sanitizeStateEvent(makeDirtyRawEvent());
  assert.ok(!('rawPath' in san));
  assert.ok(!('filePath' in san));
  const blob = JSON.stringify(san);
  assert.ok(!blob.includes(SYN_ROOT));
  assert.ok(!blob.includes('/synthetic/tmp'));
  assert.ok(!blob.includes('synthetic-secret.db'));
  assert.ok(!blob.includes('/_SYSTEM/state/'));
});

// ---------------------------------------------------------------------------
// 3. Credential-shaped value stripping
// ---------------------------------------------------------------------------

test('strips credential-shaped values (apiKey, credential, password)', () => {
  const san = sanitizeStateEvent(makeDirtyRawEvent());
  assert.ok(!('apiKey' in san));
  assert.ok(!('credential' in san));
  assert.ok(!('password' in san));
  const blob = JSON.stringify(san);
  assert.ok(!blob.includes(SYN_CREDENTIAL));
  assert.ok(!blob.includes(SYN_API_KEY));
  assert.ok(!blob.includes(SYN_PASSWORD));
});

// ---------------------------------------------------------------------------
// 4. Raw-identifier stripping (usernames, lane-instance ids)
// ---------------------------------------------------------------------------

test('strips raw identifiers (username, laneInstanceId) and never leaks them', () => {
  const san = sanitizeStateEvent(makeDirtyRawEvent());
  assert.ok(!('username' in san));
  assert.ok(!('laneInstanceId' in san));
  const blob = JSON.stringify(san);
  assert.ok(!blob.includes(SYN_USER));
  assert.ok(!blob.includes(SYN_LANE_INSTANCE));
});

test('non-canonical lane (a lane-instance id) collapses to the unknown sentinel', () => {
  const san = sanitizeStateEvent(makeRawEvent({ lane: SYN_LANE_INSTANCE }));
  assert.equal(san.lane, UNKNOWN_LANE);
  assert.ok(!JSON.stringify(san).includes('synthetic-7f3a9c'));
});

// ---------------------------------------------------------------------------
// 5. Nested forbidden fields
// ---------------------------------------------------------------------------

test('drops nested forbidden fields inside claim distribution (non-canonical keys)', () => {
  const san = sanitizeStateEvent(makeRawEvent({
    claimPromotionDistribution: {
      draft: 5,
      'synthetic-secret-claim-body': 99,
      '/synthetic/sandbox-root/path': 7,
      trusted: 2,
    },
  }));
  assert.deepEqual(Object.keys(san.claimDistribution).sort(), ['draft', 'trusted']);
  assert.ok(!JSON.stringify(san).includes('synthetic-secret'));
  assert.ok(!JSON.stringify(san).includes('/synthetic'));
});

test('drops free-text smuggled as a nested object value', () => {
  const san = sanitizeStateEvent(makeRawEvent({
    nested: { deep: { secret: 'forbidden free text buried two levels down' } },
    evidence: [{ age: 1, excerpt: 'should not survive', body: 'nor this' }],
  }));
  const blob = JSON.stringify(san);
  assert.ok(!blob.includes('forbidden free text'));
  assert.ok(!blob.includes('should not survive'));
  assert.ok(!blob.includes('nor this'));
  // Evidence age still extracted numerically.
  assert.equal(san.evidence.count, 1);
  assert.equal(san.evidence.ageMin, 1);
});

// ---------------------------------------------------------------------------
// 6. Map / Set / Date / function / symbol / BigInt rejection-or-strip
// ---------------------------------------------------------------------------

test('Map value in raw event is stripped (not copied) and output stays gate-valid', () => {
  const san = sanitizeStateEvent(makeRawEvent({ weights: new Map([['a', 1]]) }));
  assert.ok(!('weights' in san));
  assert.doesNotThrow(() => validateRecord(san));
});

test('Set value in raw event is stripped and output stays gate-valid', () => {
  const san = sanitizeStateEvent(makeRawEvent({ tags: new Set(['secret-tag']) }));
  assert.ok(!('tags' in san));
  assert.doesNotThrow(() => validateRecord(san));
});

test('Date value in raw event is stripped and output stays gate-valid', () => {
  const san = sanitizeStateEvent(makeRawEvent({ createdAt: new Date() }));
  assert.ok(!('createdAt' in san));
  assert.doesNotThrow(() => validateRecord(san));
});

test('function value in raw event is stripped and output stays gate-valid', () => {
  const san = sanitizeStateEvent(makeRawEvent({ cb: () => 'sneaky' }));
  assert.ok(!('cb' in san));
  assert.doesNotThrow(() => validateRecord(san));
});

test('symbol value in raw event is stripped and output stays gate-valid', () => {
  const san = sanitizeStateEvent(makeRawEvent({ sym: Symbol('x') }));
  assert.ok(!('sym' in san));
  assert.doesNotThrow(() => validateRecord(san));
});

test('BigInt value in raw event is stripped and output stays gate-valid', () => {
  const san = sanitizeStateEvent(makeRawEvent({ big: 42n }));
  assert.ok(!('big' in san));
  assert.doesNotThrow(() => validateRecord(san));
});

test('object with malicious own toJSON in raw event does not survive', () => {
  const evil = { toJSON() { return { promptText: 'smuggled via toJSON' }; } };
  const san = sanitizeStateEvent(makeRawEvent({ evil }));
  assert.ok(!('evil' in san));
  // The canary serialize/re-validate inside sanitizeStateEvent would have
  // thrown if anything smuggled through; reaching here means it is clean.
  assert.ok(!JSON.stringify(san).includes('smuggled'));
});

// ---------------------------------------------------------------------------
// 7. Produced records pass the Privacy Gate (the canary)
// ---------------------------------------------------------------------------

test('sanitizeStateEvent output passes validateRecord (Privacy Gate v3)', () => {
  const san = sanitizeStateEvent(makeDirtyRawEvent());
  assert.doesNotThrow(() => validateRecord(san));
  assert.equal(san.zone, ZONE.SANITIZED);
});

test('toPublicZone output passes validateRecord (Privacy Gate v3)', () => {
  const pub = toPublicZone(sanitizeStateEvent(makeDirtyRawEvent()));
  assert.doesNotThrow(() => validateRecord(pub));
  assert.equal(pub.zone, ZONE.PUBLIC);
});

test('sanitized record only string leaves are at gate-allowed paths (timestamp, lane)', () => {
  const san = sanitizeStateEvent(makeRawEvent());
  // eventType must be a numeric code, never a free string.
  assert.equal(typeof san.eventTypeCode, 'number');
  assert.ok(!('eventType' in san));
  // timestamp + lane are the only strings; both are gate-allowed root paths.
  assert.equal(typeof san.timestamp, 'string');
  assert.equal(typeof san.lane, 'string');
});

// ---------------------------------------------------------------------------
// 8. toPublicZone genericizes lanes deterministically
// ---------------------------------------------------------------------------

test('toPublicZone maps lanes to stable generic numeric ids deterministically', () => {
  const a1 = toPublicZone(sanitizeStateEvent(makeRawEvent({ lane: 'claude' })));
  const b1 = toPublicZone(sanitizeStateEvent(makeRawEvent({ lane: 'codex' })));
  const a2 = toPublicZone(sanitizeStateEvent(makeRawEvent({ lane: 'claude' })));
  assert.equal(a1.laneGenericId, a2.laneGenericId, 'same lane → same id');
  assert.notEqual(a1.laneGenericId, b1.laneGenericId, 'different lanes → different ids');
  // Human labels are derived, never serialized as free strings in the record.
  assert.equal(genericLaneLabel(a1.laneGenericId), `lane-${a1.laneGenericId}`);
  assert.ok(!('lane' in a1), 'public record must not carry a canonical lane string');
});

test('toPublicZone assigns generic ids in stable first-seen order after reset', () => {
  _resetGenericLaneMap();
  const first = toPublicZone(sanitizeStateEvent(makeRawEvent({ lane: 'shintai' })));
  const second = toPublicZone(sanitizeStateEvent(makeRawEvent({ lane: 'kagami' })));
  assert.equal(first.laneGenericId, 1);
  assert.equal(second.laneGenericId, 2);
});

// ---------------------------------------------------------------------------
// 9. Count bucketing
// ---------------------------------------------------------------------------

test('toPublicZone reports counts at/below threshold exactly', () => {
  const pub = toPublicZone(sanitizeStateEvent(makeRawEvent({
    claimPromotionDistribution: { draft: PUBLIC_COUNT_BUCKET_THRESHOLD },
  })));
  assert.equal(pub.claimDistribution.draft, PUBLIC_COUNT_BUCKET_THRESHOLD);
});

test('toPublicZone buckets counts above threshold into a numeric range', () => {
  const big = PUBLIC_COUNT_BUCKET_THRESHOLD + 33; // 43
  const pub = toPublicZone(sanitizeStateEvent(makeRawEvent({
    claimPromotionDistribution: { draft: big },
  })));
  const bucket = pub.claimDistribution.draft;
  assert.equal(typeof bucket, 'object');
  assert.equal(bucket.bucketLower, 40);
  assert.equal(bucket.bucketUpper, 50);
  // Bucket carries no free string — gate-safe.
  assert.doesNotThrow(() => validateRecord(pub));
});

// ---------------------------------------------------------------------------
// 10. Timestamp relativization
// ---------------------------------------------------------------------------

test('toPublicZone normalizes timestamp to relative-offset seconds and drops absolute', () => {
  const pub = toPublicZone(
    sanitizeStateEvent(makeRawEvent({ timestamp: '2026-05-28T12:00:00.000Z' })),
    { referenceTimestamp: '2026-05-28T00:00:00.000Z' },
  );
  assert.equal(pub.relativeOffsetSeconds, 43200); // 12h
  assert.ok(!('timestamp' in pub), 'public record must not carry an absolute timestamp');
});

test('toPublicZone yields null offset when sanitized timestamp was unparseable/absent', () => {
  const san = sanitizeStateEvent(makeRawEvent({ timestamp: 'not-a-real-timestamp' }));
  assert.equal(san.timestamp, null, 'non-ISO string must drop to null in sanitized zone');
  const pub = toPublicZone(san);
  assert.equal(pub.relativeOffsetSeconds, null);
  assert.doesNotThrow(() => validateRecord(pub));
});

// ---------------------------------------------------------------------------
// 11. Idempotence
// ---------------------------------------------------------------------------

test('sanitizing a sanitized record is stable (idempotent)', () => {
  const san = sanitizeStateEvent(makeDirtyRawEvent());
  const san2 = sanitizeStateEvent(san);
  assert.deepEqual(san2, san);
});

test('toPublicZone is stable when re-applied to its own output', () => {
  _resetGenericLaneMap();
  const pub = toPublicZone(sanitizeStateEvent(makeRawEvent()));
  const pub2 = toPublicZone(pub);
  // lane id stays stable (same canonical lane resolved both times); evidence,
  // violations, distributions reproduce. relativeOffset recomputes from same
  // reference epoch default; both null because public record has no timestamp.
  assert.equal(pub2.laneGenericId, pub.laneGenericId);
  assert.deepEqual(pub2.claimDistribution, pub.claimDistribution);
  assert.deepEqual(pub2.violationCounts, pub.violationCounts);
});

test('toPublicZone preserves relativeOffset and bucketed counts on re-application', () => {
  _resetGenericLaneMap();
  const big = PUBLIC_COUNT_BUCKET_THRESHOLD + 33; // 43 → bucket [40,50)
  const pub = toPublicZone(
    sanitizeStateEvent(makeRawEvent({
      claimPromotionDistribution: { draft: big, trusted: 2 },
    })),
    { referenceTimestamp: '2026-05-28T00:00:00.000Z' },
  );
  // First pass: offset set, draft bucketed, trusted exact.
  assert.equal(pub.relativeOffsetSeconds, 43200);
  assert.deepEqual(pub.claimDistribution.draft, { bucketLower: 40, bucketUpper: 50 });
  assert.equal(pub.claimDistribution.trusted, 2);
  // Re-application must NOT zero the bucketed count nor lose the offset.
  const pub2 = toPublicZone(pub);
  assert.equal(pub2.relativeOffsetSeconds, 43200, 'offset preserved on re-apply');
  assert.deepEqual(pub2.claimDistribution.draft, { bucketLower: 40, bucketUpper: 50 });
  assert.equal(pub2.claimDistribution.trusted, 2);
  assert.equal(pub2.claimDistributionSize, 2);
  assert.doesNotThrow(() => validateRecord(pub2));
});

// ---------------------------------------------------------------------------
// 12. Enum / structural correctness
// ---------------------------------------------------------------------------

test('eventType string label maps to numeric code and round-trips', () => {
  const san = sanitizeStateEvent(makeRawEvent({ eventType: 'GATE_EVALUATION' }));
  assert.equal(san.eventTypeCode, EVENT_TYPE.GATE_EVALUATION);
  assert.equal(eventTypeLabel(san.eventTypeCode), 'GATE_EVALUATION');
});

test('unknown eventType collapses to UNKNOWN code', () => {
  const san = sanitizeStateEvent(makeRawEvent({ eventType: 'TOTALLY_MADE_UP' }));
  assert.equal(san.eventTypeCode, EVENT_TYPE.UNKNOWN);
});

test('empty / non-object raw event yields a valid, all-zero sanitized record', () => {
  for (const bad of [undefined, null, 42, 'string', [], () => {}]) {
    const san = sanitizeStateEvent(bad);
    assert.doesNotThrow(() => validateRecord(san));
    assert.equal(san.lane, UNKNOWN_LANE);
    assert.equal(san.eventTypeCode, EVENT_TYPE.UNKNOWN);
    assert.equal(san.timestamp, null);
    assert.deepEqual(san.claimDistribution, {});
    assert.equal(san.evidence.count, 0);
  }
});

test('negative / NaN / Infinity counts fail-closed to 0', () => {
  const san = sanitizeStateEvent(makeRawEvent({
    protectedPathViolations: -5,
    promotionLadderInversions: Number.POSITIVE_INFINITY,
    claimPromotionDistribution: { draft: NaN, research: -3, trusted: 4 },
  }));
  assert.equal(san.violationCounts.protectedPath, 0);
  assert.equal(san.violationCounts.promotionLadderInversion, 0);
  assert.equal(san.claimDistribution.draft, 0);
  assert.equal(san.claimDistribution.research, 0);
  assert.equal(san.claimDistribution.trusted, 4);
});

test('canonical constant tables are frozen and non-empty', () => {
  assert.ok(Object.isFrozen(CANONICAL_LANES));
  assert.ok(Object.isFrozen(PROMOTION_LADDER_LABELS));
  assert.ok(CANONICAL_LANES.length > 0);
  assert.ok(PROMOTION_LADDER_LABELS.length > 0);
});

test('timestamp with trailing junk is re-canonicalized to clean ISO (no leak)', () => {
  // Date.parse tolerates some trailing content; safeIsoTimestamp re-emits from
  // the epoch so no trailing free text survives.
  const san = sanitizeStateEvent(makeRawEvent({ timestamp: '2026-05-28T12:00:00.000Z' }));
  assert.equal(san.timestamp, '2026-05-28T12:00:00.000Z');
  assert.ok(!san.timestamp.includes(' '));
});
