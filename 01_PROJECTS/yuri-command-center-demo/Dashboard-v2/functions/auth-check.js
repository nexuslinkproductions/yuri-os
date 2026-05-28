/**
 * auth-check.js — shared auth gate for every protected Netlify function.
 *
 * Usage:
 *   const { checkAuth } = require('./auth-check');
 *   exports.handler = async (event) => {
 *     const denied = await checkAuth(event);
 *     if (denied) return denied;
 *     ...
 *   };
 *
 * Verifies (in order):
 *   1. HMAC-signed internal-service request, OR
 *   2. httpOnly cookie / Authorization Bearer token (HS256 + jti).
 *
 * NB: this is now ASYNC — the revocation check is a Supabase round-trip.
 * Callers must `await checkAuth(event)`.
 *
 * Internal-call signature (replaces the bare X-Internal-Key header):
 *   X-Internal-Timestamp: <unix ms>
 *   X-Internal-Sig:       hex(HMAC-SHA256(INTERNAL_SERVICE_KEY, ts + '.' + body))
 *   ±300s clock skew tolerance, body MUST be the verbatim request body.
 *
 *   Backward-compat: if X-Internal-Sig is absent BUT X-Internal-Key matches
 *   INTERNAL_SERVICE_KEY exactly, we accept it — a deprecation warning is
 *   logged. This compat path will be removed once all callers migrate.
 */

const crypto = require('crypto');

let supa;
try {
  const { createClient } = require('@supabase/supabase-js');
  // Accept both env-var names (see auth.js comment).
  const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (process.env.SUPABASE_URL && SVC_KEY) {
    supa = createClient(process.env.SUPABASE_URL, SVC_KEY, {
      auth: { persistSession: false },
    });
  }
} catch { /* graceful */ }

function verifyTokenStructure(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = crypto.createHmac('sha256', secret).update(h + '.' + b).digest('base64url');
  if (s !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

async function isRevoked(jti) {
  if (!supa || !jti) return false;
  try {
    const { data } = await supa
      .from('auth_revocations')
      .select('jti')
      .eq('jti', jti)
      .maybeSingle();
    return !!data;
  } catch { return false; }
}

function timingSafeEq(a, b) {
  const ab = Buffer.from(a, 'utf8'), bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function checkInternalSignature(event) {
  const sig = event.headers?.['x-internal-sig'];
  const ts  = event.headers?.['x-internal-timestamp'];
  const key = process.env.INTERNAL_SERVICE_KEY;
  if (!sig || !ts || !key) return false;

  // Reject stale or future-skewed timestamps (±5 min tolerance)
  const tsMs = Number(ts);
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 300_000) return false;

  const body = event.body || '';
  const expected = crypto.createHmac('sha256', key).update(ts + '.' + body).digest('hex');
  return timingSafeEq(sig, expected);
}

function deny(status, msg) {
  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Credentials': 'true',
    },
    body: JSON.stringify({ error: msg }),
  };
}

async function checkAuth(event) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error('SECURITY: AUTH_SECRET not set — blocking');
    return deny(503, 'Service not configured');
  }

  // ── 1. Internal HMAC signature ──────────────────────────────
  if (checkInternalSignature(event)) return null;

  // ── 1a. Legacy bare-key path (deprecated, will be removed) ──
  const legacyKey = event.headers?.['x-internal-key'];
  const serviceKey = process.env.INTERNAL_SERVICE_KEY;
  if (legacyKey && serviceKey && timingSafeEq(legacyKey, serviceKey)) {
    console.warn('auth-check: legacy X-Internal-Key used — migrate to HMAC sig');
    return null;
  }

  // ── 2. Cookie / Bearer token ────────────────────────────────
  const cookieToken = (event.headers?.cookie || '').match(/exeo_token=([^;]+)/)?.[1];
  const headerToken = (event.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const token = cookieToken || headerToken;
  if (!token) return deny(401, 'Authentication required');

  const payload = verifyTokenStructure(token, secret);
  if (!payload) return deny(401, 'Session expired — please log in again');

  // Revocation list
  if (payload.jti && await isRevoked(payload.jti)) {
    return deny(401, 'Session revoked — please log in again');
  }

  return null;                                            // OK
}

// Sync helper for callers that haven't migrated to async (don't use
// for new code — it skips the revocation check).
function checkAuthSyncDeprecated(event) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return deny(503, 'Service not configured');
  }
  if (checkInternalSignature(event)) return null;
  const legacyKey = event.headers?.['x-internal-key'];
  const serviceKey = process.env.INTERNAL_SERVICE_KEY;
  if (legacyKey && serviceKey && timingSafeEq(legacyKey, serviceKey)) return null;
  const cookieToken = (event.headers?.cookie || '').match(/exeo_token=([^;]+)/)?.[1];
  const headerToken = (event.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  const token = cookieToken || headerToken;
  if (!token) return deny(401, 'Authentication required');
  const payload = verifyTokenStructure(token, secret);
  if (!payload) return deny(401, 'Session expired — please log in again');
  return null;
}

module.exports = {
  checkAuth,
  verifyToken: verifyTokenStructure,
};
