// @capability: etsy-oauth-pkce
// @serves: etsy oauth | authorize etsy | etsy login | connect etsy shop | etsy access token
// @does: one-time Etsy Open API v3 OAuth 2.0 Authorization-Code + PKCE(S256) flow — local loopback catcher on :3003, exchanges the code for access+refresh tokens, stores them for etsy-client.mjs
// @use: run once after credentials.json is filled, to authorize the app against René's shop
// @exports: (CLI entry only)
//
// Flow (verified against developers.etsy.com/documentation/essentials/authentication, 2026-07-04):
//   1. build https://www.etsy.com/oauth/connect?...&code_challenge=S256&state=...
//   2. owner approves in browser → Etsy redirects to http://localhost:3003/oauth/redirect?code=&state=
//   3. POST https://api.etsy.com/v3/public/oauth/token (grant_type=authorization_code, +code_verifier)
//   4. save {access_token, refresh_token, expires_at} → state/etsy/tokens.json

import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { URL } from 'node:url';
import { loadCreds, saveTokens, TOKEN_URL, AUTHORIZE_URL, ping } from './etsy-client.mjs';

const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function openBrowser(url) {
  try {
    const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true }).unref();
  } catch { /* the printed URL is the fallback */ }
}

async function main() {
  const creds = loadCreds();

  // Fail fast if the key isn't even valid — saves a confusing browser round-trip.
  const p = await ping(creds).catch((e) => ({ ok: false, status: 'err', body: { error: e.message } }));
  if (!p.ok) {
    console.error(`\n✗ API key not usable yet (ping ${p.status}). ${JSON.stringify(p.body)}`);
    console.error('  → Confirm the app is Approved/active in Your Apps, and keystring/shared_secret are correct.');
    process.exit(1);
  }
  console.log(`✓ API key valid (ping ok). Starting OAuth for shop "${creds.shop_name}".`);

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  const state = b64url(randomBytes(16));

  const redirect = new URL(creds.redirect_uri);
  const port = Number(redirect.port) || 3003;

  const authUrl = `${AUTHORIZE_URL}?` + new URLSearchParams({
    response_type: 'code',
    client_id: creds.keystring,
    redirect_uri: creds.redirect_uri,
    scope: creds.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  const server = createServer(async (req, res) => {
    const u = new URL(req.url, `http://localhost:${port}`);
    if (u.pathname !== redirect.pathname) { res.writeHead(404); res.end('not the redirect path'); return; }

    const code = u.searchParams.get('code');
    const gotState = u.searchParams.get('state');
    const err = u.searchParams.get('error');

    const done = (title, msg, ok) => {
      res.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><meta charset=utf-8><body style="font:16px system-ui;padding:3rem;max-width:34rem;margin:auto">
        <h2>${title}</h2><p>${msg}</p><p style="color:#888">You can close this tab and return to the terminal.</p></body>`);
    };

    if (err) { done('Authorization failed', `Etsy returned: ${err}`, false); console.error('✗ OAuth error:', err); server.close(); process.exit(1); }
    if (gotState !== state) { done('State mismatch', 'CSRF check failed — aborted.', false); console.error('✗ state mismatch'); server.close(); process.exit(1); }
    if (!code) { done('No code', 'No authorization code received.', false); server.close(); process.exit(1); }

    try {
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: creds.keystring,
          redirect_uri: creds.redirect_uri,
          code,
          code_verifier: verifier,
        }),
      });
      const j = await tokenRes.json();
      if (!tokenRes.ok) throw new Error(`token ${tokenRes.status}: ${JSON.stringify(j)}`);

      saveTokens({
        access_token: j.access_token,
        refresh_token: j.refresh_token,
        expires_at: Date.now() + (j.expires_in || 3600) * 1000,
        scope: j.scope,
        obtained_at: new Date().toISOString(),
      });
      done('Connected ✓', `Authorized scopes: ${j.scope || creds.scopes.join(' ')}. Tokens stored locally.`, true);
      console.log(`\n✓ Authorized. scope="${j.scope}" — tokens saved to state/etsy/tokens.json`);
      console.log('  Next: node _SYSTEM/Scripts/etsy/etsy-pull.mjs');
      server.close();
      setTimeout(() => process.exit(0), 200);
    } catch (e) {
      done('Token exchange failed', e.message, false);
      console.error('✗ token exchange failed:', e.message);
      server.close();
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`\nOAuth catcher listening on ${creds.redirect_uri}`);
    console.log('\nOpen this URL to approve (opening your browser now):\n');
    console.log(authUrl + '\n');
    openBrowser(authUrl);
  });
}

main().catch((e) => { console.error('OAuth setup failed:', e.message); process.exit(1); });
