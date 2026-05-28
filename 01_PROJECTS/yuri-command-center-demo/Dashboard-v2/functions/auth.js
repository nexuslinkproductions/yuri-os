/**
 * auth.js — login / verify / logout for ops.c2moviez.com.
 *
 * Hardened in Phase N1 (2026-04-28):
 *   • Password hash:    bcrypt cost-12   (was: raw SHA256 no-salt)
 *   • Token format:     HS256 JWT-ish + jti for revocation
 *   • Token transport:  httpOnly + Secure + SameSite=Strict cookie ONLY
 *                       (the body returns { ok:true, expires } — no token)
 *   • Rate limit:       Supabase auth_rate_check RPC (5 / 60s / IP)
 *                       Falls back to in-memory if migration not applied yet
 *   • Audit trail:      Every login/verify/logout/rate_limited row in
 *                       auth_events (silent if table missing)
 *   • Input validation: zod schema rejects malformed payloads
 *
 * Env vars (Netlify production):
 *   AUTH_PASSWORD_BCRYPT     — bcrypt hash (cost ≥ 12)  [REQUIRED]
 *   AUTH_PASSWORD_HASH       — legacy SHA256 hash       [optional, transition only]
 *   AUTH_SECRET              — 64-char hex for HMAC signing [REQUIRED]
 *   ALLOWED_ORIGIN           — CORS origin              [defaults to ops.c2moviez.com]
 *   SUPABASE_URL             — for rate-limit + audit RPCs  [REQUIRED for prod hardening]
 *   SUPABASE_SERVICE_ROLE_KEY — same                    [REQUIRED for prod hardening]
 *
 * To roll the password (or set initially):
 *   node -e "require('bcryptjs').hash(process.argv[1],12).then(console.log)" "<NewPassword>"
 *   Paste output → Netlify → Site settings → Env vars → AUTH_PASSWORD_BCRYPT
 *   Hit /.netlify/functions/auth?action=logout (or wait 12h) to invalidate old sessions.
 */

const crypto = require('crypto');
const { z } = require('zod');

// bcryptjs is pure-JS (no native bindings) so it runs unchanged in
// Netlify's Lambda environment.
let bcrypt;
try { bcrypt = require('bcryptjs'); } catch { bcrypt = null; }

let supa;
try {
  const { createClient } = require('@supabase/supabase-js');
  // Accept both env-var names — older functions use SUPABASE_SERVICE_KEY,
  // canonical Supabase docs use SUPABASE_SERVICE_ROLE_KEY.
  const SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (process.env.SUPABASE_URL && SVC_KEY) {
    supa = createClient(process.env.SUPABASE_URL, SVC_KEY, {
      auth: { persistSession: false },
    });
  }
} catch { /* fall back to no-supa mode */ }

// ── Constants ──────────────────────────────────────────────────────
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://ops.c2moviez.com';
const TOKEN_TTL_HOURS = 12;
const COOKIE_NAME = 'exeo_token';

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Credentials': 'true',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// ── Schemas ────────────────────────────────────────────────────────
const ActionSchema = z.object({
  action: z.enum(['login', 'verify', 'logout']),
  password: z.string().min(1).max(256).optional(),
  // Body-token is no longer accepted; we only read the cookie.
});

// ── In-memory fallback rate limiter ───────────────────────────────
// Used if Supabase isn't configured yet. Less robust (resets on cold
// start) but better than nothing. Real prod uses auth_rate_check RPC.
const memBucket = new Map();
function memRateLimit(ip) {
  const now = Date.now();
  const arr = (memBucket.get(ip) || []).filter(t => now - t < 60_000);
  arr.push(now);
  memBucket.set(ip, arr);
  return arr.length > 5;
}

// ── Token primitives ──────────────────────────────────────────────
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function createToken(payload, secret, ttlHours = TOKEN_TTL_HOURS) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Date.now();
  const exp = now + ttlHours * 3600 * 1000;
  const jti = crypto.randomUUID();
  const body = b64url(JSON.stringify({ ...payload, jti, exp, iat: now }));
  const sig = hmac(secret, header + '.' + body);
  return { token: header + '.' + body + '.' + sig, jti, exp };
}

function verifyTokenStructure(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  if (hmac(secret, header + '.' + body) !== sig) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch { return null; }
}

// Async wrapper that ALSO consults the revocation list.
async function verifyTokenFull(token, secret) {
  const payload = verifyTokenStructure(token, secret);
  if (!payload) return null;
  if (!supa || !payload.jti) return payload;            // pre-migration mode
  try {
    const { data } = await supa
      .from('auth_revocations')
      .select('jti')
      .eq('jti', payload.jti)
      .maybeSingle();
    if (data) return null;                              // revoked
  } catch { /* table missing, allow (graceful) */ }
  return payload;
}

// ── Password verification (bcrypt + SHA256 transition) ────────────
async function passwordMatches(password) {
  const bcryptHash = process.env.AUTH_PASSWORD_BCRYPT;
  if (bcryptHash && bcrypt) {
    try {
      const ok = await bcrypt.compare(password, bcryptHash);
      if (ok) return 'bcrypt';
    } catch (e) {
      console.error('bcrypt error:', e.message);
    }
  }
  // Legacy fallback so we don't lock the CEO out before he sets the
  // bcrypt env var. Remove this block once AUTH_PASSWORD_BCRYPT is live.
  const legacyHash = process.env.AUTH_PASSWORD_HASH;
  if (legacyHash) {
    const sha = crypto.createHash('sha256').update(password, 'utf8').digest('hex');
    if (sha === legacyHash) return 'sha256-legacy';
  }
  return null;
}

// ── Rate limiting (Supabase RPC with mem fallback) ────────────────
async function rateLimited(ip) {
  if (!ip) return false;
  if (supa) {
    try {
      const { data, error } = await supa.rpc('auth_rate_check', { _ip: ip });
      if (!error && data === false) return true;        // RPC says: blocked
      if (!error) return false;                          // RPC says: allowed
    } catch { /* fall through */ }
  }
  // Fallback if RPC missing
  return memRateLimit(ip);
}
async function recordAttempt(ip, success) {
  if (!supa || !ip) return;
  try { await supa.rpc('auth_record_attempt', { _ip: ip, _success: !!success }); }
  catch { /* table missing */ }
}

// ── Auth audit trail ─────────────────────────────────────────────
async function logEvent({ action, ip, ua, detail, jti, userLabel }) {
  if (!supa) return;
  try {
    await supa.from('auth_events').insert({
      action, ip: ip || null, user_agent: ua || null,
      user_label: userLabel || null, jti: jti || null, detail: detail || null,
    });
  } catch { /* table missing — silent */ }
}

// ── Cookie helpers ────────────────────────────────────────────────
function setCookie(token, ttlHours = TOKEN_TTL_HOURS) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttlHours * 3600}`;
}
function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
function readCookie(headers) {
  const c = headers?.cookie || '';
  return c.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))?.[1] || null;
}

// ── Handler ───────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers: CORS, body: 'Not allowed' };

  const ok = (data, extraHeaders = {}) => ({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders },
    body: JSON.stringify(data),
  });
  const fail = (status, msg) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...CORS },
    body: JSON.stringify({ ok: false, error: msg }),
  });

  const ip =
    (event.headers?.['x-nf-client-connection-ip'] ||
     event.headers?.['x-forwarded-for']?.split(',')[0] ||
     event.headers?.['client-ip'] || '').trim() || 'unknown';
  const ua = event.headers?.['user-agent'] || null;

  // Schema-validate payload before doing anything
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return fail(400, 'Invalid JSON'); }
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return fail(400, 'Invalid payload');
  const { action, password } = parsed.data;

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    console.error('SECURITY: AUTH_SECRET not set');
    return fail(503, 'Service not configured');
  }

  // ── LOGIN ───────────────────────────────────────────────────────
  if (action === 'login') {
    if (!password) return fail(400, 'Password required');

    if (await rateLimited(ip)) {
      await logEvent({ action: 'rate_limited', ip, ua });
      return fail(429, 'Too many attempts. Wait 1 minute.');
    }
    await recordAttempt(ip, false);                    // record pre-result

    const matchedVia = await passwordMatches(password);
    if (!matchedVia) {
      console.warn(`auth: failed login from ${ip}`);
      await logEvent({ action: 'login.failure', ip, ua, detail: 'wrong_password' });
      return fail(401, 'Access denied');
    }

    // Mark this attempt as successful (best-effort superseding row)
    await recordAttempt(ip, true);

    const { token, jti, exp } = createToken(
      { user: 'admin', role: 'owner' }, secret, TOKEN_TTL_HOURS
    );

    await logEvent({
      action: 'login.success', ip, ua, jti, userLabel: 'admin',
      detail: matchedVia === 'sha256-legacy'
        ? 'used SHA256 legacy hash — please set AUTH_PASSWORD_BCRYPT'
        : 'bcrypt',
    });

    // Token NEVER returned in body (httpOnly cookie only).
    return ok({ ok: true, expires: exp }, { 'Set-Cookie': setCookie(token) });
  }

  // ── VERIFY ──────────────────────────────────────────────────────
  if (action === 'verify') {
    const tkn = readCookie(event.headers);
    const payload = await verifyTokenFull(tkn, secret);
    if (!payload) {
      await logEvent({ action: 'verify.expired', ip, ua });
      return fail(401, 'Invalid or expired session');
    }
    return ok({ ok: true, user: payload.user, role: payload.role, expires: payload.exp });
  }

  // ── LOGOUT ──────────────────────────────────────────────────────
  if (action === 'logout') {
    const tkn = readCookie(event.headers);
    const payload = verifyTokenStructure(tkn, secret);
    if (payload?.jti && supa) {
      try {
        await supa.from('auth_revocations').upsert({
          jti: payload.jti,
          expires_at: new Date(payload.exp).toISOString(),
          reason: 'logout',
          user_label: payload.user || null,
        });
      } catch { /* table missing */ }
    }
    await logEvent({ action: 'logout', ip, ua, jti: payload?.jti || null });
    return ok({ ok: true }, { 'Set-Cookie': clearCookie() });
  }

  return fail(400, 'Unknown action');
};

// Re-export the structure check for legacy callers (auth-check.js
// will move to verifyTokenFull below — exposed for compatibility).
exports.verifyToken = verifyTokenStructure;
exports.verifyTokenFull = verifyTokenFull;
