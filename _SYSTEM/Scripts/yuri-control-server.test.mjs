import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preview, validate, localOriginOk, authedMutation, APPLY_TOKEN, PORT } from './yuri-control-server.mjs';

test('preview scores the protected scenario with the REAL gate', () => {
  const prot = preview({}).find((s) => s.name === 'Protected-path write');
  assert.equal(prot.deltaU, 100);
  assert.equal(prot.accept, false);
  assert.equal(prot.dominantTerm, 'protectedPathViolations');
});

test('eta=0 zeroes the energy but the STRUCTURAL veto still REJECTS the protected scenario', () => {
  // Zeroing eta removes the energy from the violation (deltaU=0)... but the hard
  // veto is structural, not weight-based, so you cannot disable protected-path
  // enforcement by zeroing its weight. Stronger guarantee than the old config-driven accept.
  const prot = preview({ weights: { eta: 0 } }).find((s) => s.name === 'Protected-path write');
  assert.equal(prot.deltaU, 0);
  assert.equal(prot.accept, false);
});

test('preview: a failed check fires the calibration terms (ΔU > 0, reject)', () => {
  const fail = preview({}).find((s) => s.name === 'A check FAILS');
  assert.ok(fail.deltaU > 0, `expected ascent, got ${fail.deltaU}`);
  assert.equal(fail.accept, false);
});

test('preview: a healthy edit descends (ΔU < 0, accept)', () => {
  const ok = preview({}).find((s) => s.name === 'Healthy edit lands');
  assert.ok(ok.deltaU < 0);
  assert.equal(ok.accept, true);
});

test('validate drops unknown / negative / non-finite, keeps valid', () => {
  const v = validate({ weights: { eta: -5, bogus: 1, delta: 2 }, threshold: 0.3, salience: { surpriseK: 3 }, enforce: true });
  assert.equal(v.weights.eta, undefined);
  assert.equal(v.weights.bogus, undefined);
  assert.equal(v.weights.delta, 2);
  assert.equal(v.threshold, 0.3);
  assert.equal(v.salience.surpriseK, 3);
  assert.equal(v.enforce, true);
});

// --- mutation-endpoint hardening (report §35): bearer token + Origin/Host gate ---
const portStr = String(PORT);
test('localOriginOk accepts a localhost Host and rejects a foreign Host/Origin', () => {
  assert.equal(localOriginOk({ headers: { host: `127.0.0.1:${portStr}` } }), true);
  assert.equal(localOriginOk({ headers: { host: `localhost:${portStr}` } }), true);
  assert.equal(localOriginOk({ headers: { host: 'evil.example.com' } }), false, 'DNS-rebinding host blocked');
  assert.equal(localOriginOk({ headers: { host: `127.0.0.1:${portStr}`, origin: 'http://evil.example.com' } }), false, 'cross-site Origin blocked');
  assert.equal(localOriginOk({ headers: { host: `127.0.0.1:${portStr}`, origin: `http://localhost:${portStr}` } }), true);
});

test('authedMutation requires the exact bearer token', () => {
  assert.equal(authedMutation({ headers: { authorization: `Bearer ${APPLY_TOKEN}` } }), true);
  assert.equal(authedMutation({ headers: {} }), false, 'missing token rejected');
  assert.equal(authedMutation({ headers: { authorization: 'Bearer wrong-token' } }), false, 'wrong token rejected');
  assert.equal(authedMutation({ headers: { authorization: APPLY_TOKEN } }), false, 'non-Bearer scheme rejected');
});
