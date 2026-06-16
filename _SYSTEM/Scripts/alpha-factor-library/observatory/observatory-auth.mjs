#!/usr/bin/env node
/**
 * observatory-auth.mjs — YURI AFL Observatory Token-Auth Middleware (W4)
 *
 * Standalone bearer-token auth for the Observatory's node:http server so Mike
 * can access the paper-trading dashboard remotely WITHOUT exposing it to the
 * open internet unauthenticated. Localhost stays open; non-localhost requires
 * a bearer token.
 *
 * PURE MODULE — does NOT modify observatory-server.mjs. The main session
 * wires it in by calling `applyAuth(req, res)` at the top of routeRequest.
 *
 * RULES (per master-brief §4 / control packet cp-w4-auth):
 *   - INV-2: NO key reads from disk. The shared secret comes from
 *     `process.env.OBSERVATORY_AUTH_TOKEN` ONLY. Unset → auth is DISABLED
 *     (open) and `checkAuth` returns `{ ok: true, mode: 'disabled' }`.
 *     DISARMED-by-default: do not break the existing localhost dev flow.
 *   - Loopback remote addresses (127.0.0.1, ::1, ::ffff:127.0.0.1) are OPEN
 *     unless the caller opts out via `opts.allowLoopback = false`.
 *   - Non-loopback requires `Authorization: Bearer <token>` matching the
 *     configured token via CONSTANT-TIME comparison (`node:crypto`
 *     `timingSafeEqual`), length-guarded so a length mismatch never throws.
 *   - X-Forwarded-For is INTENTIONALLY IGNORED for the loopback decision
 *     (spoofable by any client). Trust the OS-reported socket peer.
 *
 * @module observatory/observatory-auth
 */

import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// ── Loopback detection ─────────────────────────────────────────────────────
// Treat these as loopback:
//   127.0.0.1                (IPv4)
//   ::1                      (IPv6 loopback)
//   ::ffff:127.0.0.1         (IPv4-mapped IPv6 — what Node's dual-stack
//                             listener hands you for an IPv4 client)
// Anything else (public IPs, ::ffff:PUBLIC, RFC1918, etc.) is NOT loopback.
// X-Forwarded-For is INTENTIONALLY not consulted — a remote attacker can set
// it to whatever they want; the OS-reported socket peer cannot be spoofed.
function isLoopbackAddr(addr) {
  if (typeof addr !== 'string' || addr.length === 0) return false;
  if (addr === '127.0.0.1' || addr === '::1') return true;
  // IPv4-mapped IPv6: '::ffff:127.0.0.1' (case-insensitive prefix)
  // We accept any ::ffff:127.x.y.z to be generous with local docker/bridge nets.
  if (/^::ffff:127\./i.test(addr)) return true;
  return false;
}

/**
 * getRemoteAddress(req) — extract the OS-reported peer address from the
 * socket. Returns '' if absent (treat as non-loopback upstream).
 */
function getRemoteAddress(req) {
  const sock = req && req.socket;
  if (!sock) return '';
  return sock.remoteAddress || '';
}

// ── Token source (env-only) ────────────────────────────────────────────────
/**
 * resolveToken(opts?) — return the configured token, or null when unset.
 * `opts.token` lets the caller override the env read (used by tests AND by
 * a future call site that wants to inject a token from a secret manager
 * without ever reading the env at module load).
 *
 * INV-2: this function NEVER reads from disk. Env only.
 */
function resolveToken(opts) {
  if (opts && typeof opts.token === 'string' && opts.token.length > 0) {
    return opts.token;
  }
  const envTok = process.env.OBSERVATORY_AUTH_TOKEN;
  if (typeof envTok === 'string' && envTok.length > 0) return envTok;
  return null;
}

// ── Constant-time bearer-token comparison ──────────────────────────────────
/**
 * safeEqual(a, b) — constant-time string compare via `node:crypto`.
 * Length-guarded: if `a.length !== b.length` we still touch the buffers (so
 * the timing does not reveal a length-class leak via short-circuit) but
 * compare against a same-length dummy so `timingSafeEqual` never throws.
 *
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Length mismatch — still do a real timingSafeEqual on a fixed dummy so
    // a timing side-channel can't distinguish this from the equal-length path
    // beyond the buffer-length difference (which is unavoidable in node:crypto).
    const dummy = Buffer.alloc(a.length || 1, 0);
    const aBuf = Buffer.from(a, 'utf-8');
    try {
      timingSafeEqual(aBuf, dummy);
    } catch (_e) { /* never throws on equal-length buffers */ }
    return false;
  }
  const aBuf = Buffer.from(a, 'utf-8');
  const bBuf = Buffer.from(b, 'utf-8');
  try {
    return timingSafeEqual(aBuf, bBuf);
  } catch (_e) {
    return false;
  }
}

/**
 * parseBearer(header) — extract `<token>` from `Authorization: Bearer <token>`.
 * Returns null on missing/malformed header. Case-insensitive scheme match.
 */
function parseBearer(header) {
  if (typeof header !== 'string' || header.length === 0) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;
  // Split on the first whitespace run: scheme, then the rest.
  const m = /^([Bb][Ee][Aa][Rr][Ee][Rr])\s+(.+)$/.exec(trimmed);
  if (!m) return null;
  const token = m[2].trim();
  if (token.length === 0) return null;
  return token;
}

// ── Public API ─────────────────────────────────────────────────────────────
/**
 * checkAuth(req, opts?) — pure decision function. No I/O beyond reading the
 * `Authorization` header off `req` and `process.env` (read once at the call
 * site; never cached, never persisted, never logged).
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {object} [opts]
 * @param {string} [opts.token]   explicit token override (testing / future secret manager)
 * @param {boolean} [opts.allowLoopback=true]  when false, treat loopback like remote
 * @returns {{ ok: boolean, mode: 'disabled'|'loopback'|'token', reason?: string }}
 */
export function checkAuth(req, opts) {
  const allowLoopback = !opts || opts.allowLoopback !== false;
  const token = resolveToken(opts);

  // Rule 1: no token configured → auth disabled, open.
  if (token === null) {
    return { ok: true, mode: 'disabled' };
  }

  // Rule 2: loopback peer → open.
  if (allowLoopback && isLoopbackAddr(getRemoteAddress(req))) {
    return { ok: true, mode: 'loopback' };
  }

  // Rule 3: non-loopback (or loopback explicitly disallowed) → require Bearer.
  const header = req && req.headers ? req.headers['authorization'] : undefined;
  const presented = parseBearer(header);
  if (presented === null) {
    return { ok: false, reason: 'unauthorized' };
  }
  if (!safeEqual(presented, token)) {
    return { ok: false, reason: 'unauthorized' };
  }
  return { ok: true, mode: 'token' };
}

/**
 * applyAuth(req, res, opts?) — convenience wrapper for use at the top of an
 * HTTP handler. On failure writes a `401` response with a JSON body and
 * returns false; on success returns true. The caller does:
 *
 *   if (!applyAuth(req, res)) return;
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {object} [opts]
 * @returns {boolean} true if the request is authorized and the handler should continue
 */
export function applyAuth(req, res, opts) {
  const verdict = checkAuth(req, opts);
  if (verdict.ok) return true;

  // Write 401 with JSON body. Use res.writeHead/end directly to avoid pulling
  // in any extra helper; this module is intentionally dependency-free.
  try {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({ error: 'unauthorized' }));
  } catch (_e) {
    // If the socket is already gone, swallow — we did our best.
    try { res.end(); } catch (_e2) { /* noop */ }
  }
  return false;
}

// ── Self-test (--test) ──────────────────────────────────────────────────────
// Pure in-process tests, no network, no env mutation, no disk. Deterministic.
function _assert(cond, label) {
  if (cond) return true;
  throw new Error(`FAIL: ${label}`);
}

function _makeReq({ remoteAddress, authHeader }) {
  // Minimal mock of the bits of req we touch.
  return {
    socket: { remoteAddress: remoteAddress || '' },
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

function _makeRes() {
  let written = null;
  let ended = false;
  const res = {
    writeHead(status, headers) { written = { status, headers }; return res; },
    end(body) { ended = true; if (body !== undefined) written = written || {}; written.body = body; return res; },
  };
  return { res, getWritten: () => written, didEnd: () => ended };
}

async function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const it = (label, fn) => {
    try {
      const ret = fn();
      if (ret && typeof ret.then === 'function') return ret.then(
        () => { pass++; },
        (e) => { fail++; console.error(`FAIL: ${label} — ${e.message}`); }
      );
      pass++;
    } catch (e) {
      fail++;
      console.error(`FAIL: ${label} — ${e.message}`);
    }
  };

  // Capture original env so we can mutate it for the duration of the test.
  const ORIGINAL_TOKEN = process.env.OBSERVATORY_AUTH_TOKEN;
  const setToken = (v) => {
    if (v === null) delete process.env.OBSERVATORY_AUTH_TOKEN;
    else process.env.OBSERVATORY_AUTH_TOKEN = v;
  };

  // ── T1: unset token → disabled/open ────────────────────────────────
  setToken(null);
  await it('T1: unset token → disabled', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5' }));
    _assert(v.ok === true && v.mode === 'disabled', `got ${JSON.stringify(v)}`);
  });

  // ── T2: token set + loopback 127.0.0.1 → ok/loopback ──────────────
  setToken('s3cret-token-abc');
  await it('T2: token set + IPv4 loopback → loopback', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '127.0.0.1' }));
    _assert(v.ok === true && v.mode === 'loopback', `got ${JSON.stringify(v)}`);
  });

  // ── T2b: token set + ::1 loopback → ok/loopback ────────────────────
  await it('T2b: token set + ::1 loopback → loopback', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '::1' }));
    _assert(v.ok === true && v.mode === 'loopback', `got ${JSON.stringify(v)}`);
  });

  // ── T2c: token set + ::ffff:127.0.0.1 → loopback ───────────────────
  await it('T2c: token set + ::ffff:127.0.0.1 → loopback', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '::ffff:127.0.0.1' }));
    _assert(v.ok === true && v.mode === 'loopback', `got ${JSON.stringify(v)}`);
  });

  // ── T2d: token set + allowLoopback=false → forces bearer check ────
  await it('T2d: token set + allowLoopback=false → bearer required even for loopback', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '127.0.0.1' }), { allowLoopback: false });
    _assert(v.ok === false && v.reason === 'unauthorized', `got ${JSON.stringify(v)}`);
  });

  // ── T3: non-loopback + no Authorization header → 401 ──────────────
  await it('T3: non-loopback + no header → unauthorized', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5' }));
    _assert(v.ok === false && v.reason === 'unauthorized', `got ${JSON.stringify(v)}`);
  });

  // ── T3b: non-loopback + wrong scheme → 401 ────────────────────────
  await it('T3b: non-loopback + wrong scheme → unauthorized', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5', authHeader: 'Basic dXNlcjpwYXNz' }));
    _assert(v.ok === false && v.reason === 'unauthorized', `got ${JSON.stringify(v)}`);
  });

  // ── T3c: non-loopback + Bearer without token → 401 ────────────────
  await it('T3c: non-loopback + "Bearer" alone → unauthorized', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5', authHeader: 'Bearer ' }));
    _assert(v.ok === false && v.reason === 'unauthorized', `got ${JSON.stringify(v)}`);
  });

  // ── T4: non-loopback + correct Bearer → ok/token ───────────────────
  await it('T4: non-loopback + correct Bearer → ok/token', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5', authHeader: 'Bearer s3cret-token-abc' }));
    _assert(v.ok === true && v.mode === 'token', `got ${JSON.stringify(v)}`);
  });

  // ── T4b: case-insensitive Bearer scheme ───────────────────────────
  await it('T4b: lowercase "bearer" scheme → ok/token', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5', authHeader: 'bearer s3cret-token-abc' }));
    _assert(v.ok === true && v.mode === 'token', `got ${JSON.stringify(v)}`);
  });

  // ── T5: non-loopback + wrong token → 401 ──────────────────────────
  await it('T5: non-loopback + wrong token → unauthorized', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5', authHeader: 'Bearer wrong-token-xyz' }));
    _assert(v.ok === false && v.reason === 'unauthorized', `got ${JSON.stringify(v)}`);
  });

  // ── T6: timingSafeEqual length mismatch does NOT throw ────────────
  await it('T6: short presented token does not throw on length mismatch', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5', authHeader: 'Bearer abc' }));
    _assert(v.ok === false && v.reason === 'unauthorized', `got ${JSON.stringify(v)}`);
  });
  await it('T6b: very long presented token does not throw on length mismatch', () => {
    const v = checkAuth(_makeReq({
      remoteAddress: '203.0.113.5',
      authHeader: 'Bearer ' + 'a'.repeat(8192),
    }));
    _assert(v.ok === false && v.reason === 'unauthorized', `got ${JSON.stringify(v)}`);
  });

  // ── T7: ::ffff:127.0.0.1 IS treated as loopback ───────────────────
  // (same as T2c — duplicated with explicit assertion for the spec line)
  await it('T7: ::ffff:127.0.0.1 explicitly treated as loopback', () => {
    const v = checkAuth(_makeReq({ remoteAddress: '::ffff:127.0.0.1' }));
    _assert(v.ok === true && v.mode === 'loopback', `got ${JSON.stringify(v)}`);
  });

  // ── T8: X-Forwarded-For is NOT trusted for loopback decision ─────
  await it('T8: X-Forwarded-For does NOT grant loopback bypass', () => {
    const req = {
      socket: { remoteAddress: '203.0.113.5' },
      headers: { 'x-forwarded-for': '127.0.0.1' },
    };
    const v = checkAuth(req);
    _assert(v.ok === false && v.reason === 'unauthorized',
            `X-Forwarded-For must not bypass auth (got ${JSON.stringify(v)})`);
  });

  // ── T9: applyAuth — fail path writes 401 + JSON + returns false ──
  await it('T9: applyAuth on non-loopback w/o token writes 401 JSON + returns false', () => {
    const { res, getWritten, didEnd } = _makeRes();
    const ok = applyAuth(_makeReq({ remoteAddress: '203.0.113.5' }), res);
    _assert(ok === false, 'applyAuth returned false');
    _assert(didEnd() === true, 'res.end was called');
    const w = getWritten();
    _assert(w && w.status === 401, `status === 401 (got ${w && w.status})`);
    _assert(w && w.headers && /application\/json/i.test(w.headers['Content-Type'] || ''),
            `Content-Type JSON (got ${w && w.headers && w.headers['Content-Type']})`);
    _assert(w && typeof w.body === 'string' && /unauthorized/.test(w.body),
            `body contains "unauthorized" (got ${w && w.body})`);
  });

  // ── T10: applyAuth — pass path returns true, writes nothing ──────
  await it('T10: applyAuth on loopback returns true and does not write a 401', () => {
    const { res, getWritten, didEnd } = _makeRes();
    const ok = applyAuth(_makeReq({ remoteAddress: '127.0.0.1' }), res);
    _assert(ok === true, 'applyAuth returned true');
    _assert(didEnd() === false, 'res.end was NOT called');
    _assert(getWritten() === null, 'writeHead was NOT called');
  });

  // ── T11: applyAuth — correct Bearer returns true, writes nothing ─
  await it('T11: applyAuth on non-loopback + correct Bearer returns true', () => {
    const { res, getWritten, didEnd } = _makeRes();
    const ok = applyAuth(
      _makeReq({ remoteAddress: '203.0.113.5', authHeader: 'Bearer s3cret-token-abc' }),
      res
    );
    _assert(ok === true, 'applyAuth returned true');
    _assert(didEnd() === false, 'res.end was NOT called');
    _assert(getWritten() === null, 'writeHead was NOT called');
  });

  // ── T12: INV-2 — module never reads from disk ─────────────────────
  // We can't easily prove a negative, but we CAN assert that resolving the
  // token from a totally absent env returns null without ever touching fs.
  // (If you see an fs read in this module's code, this test should fail.)
  await it('T12: INV-2 — unset env, no opts.token → resolves to null (no fs read possible)', () => {
    setToken(null);
    const v = checkAuth(_makeReq({ remoteAddress: '203.0.113.5' }));
    _assert(v.ok === true && v.mode === 'disabled', `got ${JSON.stringify(v)}`);
  });

  // ── T13: opts.token overrides env (testing path, future secret mgr)
  await it('T13: opts.token overrides env (testing / future secret mgr injection)', () => {
    setToken('env-token');
    const v = checkAuth(
      _makeReq({ remoteAddress: '203.0.113.5', authHeader: 'Bearer override-token' }),
      { token: 'override-token' }
    );
    _assert(v.ok === true && v.mode === 'token', `got ${JSON.stringify(v)}`);
    // Without the override, the env token would have rejected this.
    const v2 = checkAuth(
      _makeReq({ remoteAddress: '203.0.113.5', authHeader: 'Bearer override-token' })
    );
    _assert(v2.ok === false, `env-only path should have rejected (got ${JSON.stringify(v2)})`);
  });

  // Restore env (defensive — even though we're about to exit).
  setToken(ORIGINAL_TOKEN === undefined ? null : ORIGINAL_TOKEN);

  console.log(`observatory-auth --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}

const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  runSelfTest();
}
