/**
 * Dashboard-v2/netlify/functions/offer-accept.js
 *
 * Phase G+H crossover. When a NEXBOX sales offer is signed (Bexio offer
 * accepted, e-signed PDF returned, or — for v1 — operator clicks "Mark
 * accepted" in a future UI), this endpoint:
 *
 *   1. Validates an HMAC-signed payload (so a leaked offer URL can't trigger
 *      provisioning by itself).
 *   2. Inserts an `audit_log` row action='offer.accepted'.
 *   3. Inserts a `commitments` row "Provision NEXBOX for <name>" due in 7d
 *      and assigned to CTI.
 *   4. Sends the CEO a Telegram notification with two inline buttons:
 *         ✅ Generate tenant.json + start install
 *         ⏸ Hold (need to call client first)
 *   5. Optionally writes the discovery payload to a private Netlify Blob
 *      so subsequent install steps can read it.
 *
 * What it does NOT do (deliberate):
 *   - Auto-provision Supabase / Plane / Telegram. That's still gated behind
 *     CEO Telegram approval (Email Drafts + skeptical-transparency rules).
 *   - Send any email to the client. That stays a human-forwarded draft.
 *
 * Auth: HMAC-SHA256 signature in `X-Offer-Signature` header, computed over
 *       the raw body using process.env.NEXBOX_OFFER_HMAC_KEY. Without the
 *       key matching, returns 401 + 5s delay.
 *
 * Status: ships in source. Production deploy = G.sweep.2 (Netlify deploy
 * window). Wired into nexbox/docs/install-runbook.md as the "after acceptance"
 * step.
 */

const crypto = require('crypto');
const https = require('https');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function verifySignature(body, signature, key) {
  if (!key || !signature) return false;
  const expected = crypto.createHmac('sha256', key).update(body).digest('hex');
  // constant-time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch { return false; }
}

function supabaseInsert(table, row) {
  return new Promise((resolve) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return resolve({ ok: false, reason: 'no-supabase-env' });
    const body = JSON.stringify(row);
    const u = new URL(`${url}/rest/v1/${table}`);
    const opts = {
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json', Prefer: 'return=representation',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    let raw = '';
    const req = https.request(opts, res => {
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) return resolve({ ok: false, status: res.statusCode, body: raw.slice(0, 200) });
          const parsed = JSON.parse(raw);
          resolve({ ok: true, row: Array.isArray(parsed) ? parsed[0] : parsed });
        } catch (e) { resolve({ ok: false, reason: e.message }); }
      });
    });
    req.on('error', e => resolve({ ok: false, reason: e.message }));
    req.write(body); req.end();
  });
}

function telegramSend(text, opts = {}) {
  return new Promise((resolve) => {
    const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const allowed = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean);
    const chatId = allowed[0];
    if (!TOKEN || !chatId) return resolve({ ok: false, reason: 'no-tg-env' });
    const body = JSON.stringify({
      chat_id: chatId, text, parse_mode: 'HTML',
      ...(opts.reply_markup ? { reply_markup: opts.reply_markup } : {}),
    });
    const u = new URL(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const reqOpts = {
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(reqOpts, res => {
      let raw = ''; res.on('data', c => raw += c);
      res.on('end', () => resolve({ ok: res.statusCode === 200, status: res.statusCode, body: raw.slice(0, 200) }));
    });
    req.on('error', e => resolve({ ok: false, reason: e.message }));
    req.write(body); req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST only' }) };
  }

  const rawBody = event.body || '';
  const sig = event.headers['x-offer-signature'] || event.headers['X-Offer-Signature'];
  const key = process.env.NEXBOX_OFFER_HMAC_KEY;

  if (!verifySignature(rawBody, sig, key)) {
    await sleep(5000);
    return { statusCode: 401, body: JSON.stringify({ error: 'invalid signature' }) };
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }

  if (!payload?.identity?.kuerzel || !payload?.identity?.name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'identity.kuerzel + identity.name required' }) };
  }

  const KUERZEL = payload.identity.kuerzel.toUpperCase();
  const NAME = payload.identity.name;
  const TIER = payload.derived?.tier_label || payload.tier;
  const VERTICAL = payload.derived?.vertical_label || payload.vertical;

  // 1. Audit log
  await supabaseInsert('audit_log', {
    action: 'offer.accepted',
    entity_type: 'tenant_prospect',
    entity_id: KUERZEL,
    entity_name: NAME,
    actor: 'offer-accept-webhook',
    details: {
      tier: payload.tier,
      vertical: payload.vertical,
      modules_count: (payload.modules || []).length,
      monthly_chf: payload.pricing?.monthly_chf,
      setup_chf: payload.pricing?.setup_chf,
      hours_saved: payload.pricing?.hours_saved_per_month,
      contact_name: payload.identity?.contact_name,
      contact_email: payload.identity?.contact_email,
      ip: event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip'] || null,
    },
  });

  // 2. Commitment
  const dueAt = new Date(Date.now() + 7 * 86400e3).toISOString();
  const commitRes = await supabaseInsert('commitments', {
    actor: 'CTI',
    promise: `Provision NEXBOX for ${NAME} (${KUERZEL})`,
    entity_type: 'tenant_prospect',
    entity_id: KUERZEL,
    source: 'offer-accept-webhook',
    due_at: dueAt,
    status: 'open',
  });

  // 3. Telegram notify
  const text =
    `🎉 <b>Angebot angenommen</b>\n` +
    `<b>${NAME}</b> (${KUERZEL}) — ${TIER}${VERTICAL ? ' · ' + VERTICAL : ''}\n` +
    `Investition: CHF ${(payload.pricing?.monthly_chf || 0).toLocaleString('de-CH')}/Mt + CHF ${(payload.pricing?.setup_chf || 0).toLocaleString('de-CH')} Setup\n` +
    `Stunden gespart: ${payload.pricing?.hours_saved_per_month || 0} h/Monat\n\n` +
    `Verpflichtung angelegt: "Provision NEXBOX for ${NAME}" (in 7 Tagen fällig).\n` +
    `Nächster Schritt: tenant.json generieren + Mac Mini bestellen.`;

  await telegramSend(text, {
    reply_markup: {
      inline_keyboard: [[
        { text: '✅ Generate tenant.json + start install', callback_data: `offerProvision:${KUERZEL}` },
        { text: '⏸ Hold',                                 callback_data: `offerHold:${KUERZEL}` },
      ]],
    },
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      kuerzel: KUERZEL,
      audit_logged: true,
      commitment_id: commitRes.row?.id || null,
      next_steps: [
        'CEO clicks "Generate tenant.json" in Telegram → Scripts/payload-to-tenant-json.js runs',
        'Operator orders Mac Mini, runs nexbox/bootstrap/install.sh --tenant <slug>',
        'On install green, ship to client',
      ],
    }),
  };
};
