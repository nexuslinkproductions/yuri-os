'use strict';
// Auth helpers for the yuri-overseer localhost bridge.
// COPIED VERBATIM (shape) from _SYSTEM/Scripts/yuri-control-server.mjs:40-58 so the proven
// 127.0.0.1 + bearer + Origin/Host allow-list pattern guards the inject endpoint. Extracted
// into a vscode-free CommonJS module so it is unit-testable without the extension host.
const crypto = require('node:crypto');

function timingSafeEqualStr(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Absent Origin (curl / native client) is allowed; if present it MUST be local — blocks
// cross-site / DNS-rebinding POSTs initiated from a browser page. Host header must match us.
function localOriginOk(req, host, port) {
  const h = String((req.headers && req.headers.host) || '').toLowerCase();
  const okHost = h === `${host}:${port}` || h === `localhost:${port}`;
  const origin = req.headers && req.headers.origin;
  const okOrigin = !origin || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin);
  return okHost && okOrigin;
}

function authed(req, token) {
  const m = String((req.headers && req.headers.authorization) || '').match(/^Bearer\s+(.+)$/i);
  return Boolean(m) && Boolean(token) && timingSafeEqualStr(m[1], token);
}

module.exports = { timingSafeEqualStr, localOriginOk, authed };
