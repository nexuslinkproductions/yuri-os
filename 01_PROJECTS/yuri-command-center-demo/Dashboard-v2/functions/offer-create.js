/**
 * Dashboard-v2/netlify/functions/offer-create.js
 *
 * Production endpoint for the discovery form when it can't reach a local
 * /api/process-offer (e.g. CEO does the meeting with the form hosted at
 * ops.c2moviez.com instead of localhost).
 *
 * Behaviour:
 *   POST /.netlify/functions/offer-create
 *     body: full discovery payload (same shape as Scripts/process-offer.js)
 *
 *   1. Validates payload (identity.kuerzel + name required).
 *   2. Inserts offers row in Supabase (status='registered').
 *   3. Pushes to Bexio (kb_offer + contact lookup/create) — full feature parity
 *      with Scripts/push-offer-to-bexio.js.
 *   4. Drafts a queue entry for the obsidian-queue-consumer to write the email
 *      draft locally (consumer reads audit_log → writes to vault). Function
 *      itself doesn't touch the local FS.
 *   5. Sends Telegram nudge to CEO.
 *   6. Returns JSON identical in shape to the local /api/process-offer.
 *
 * Env required:
 *   - SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   - BEXIO_API_TOKEN
 *   - TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USERS
 *   - BEXIO_TAX_ID (optional, default 28), BEXIO_ACCOUNT_ID (default 101)
 *
 * Status: ships in source. Deploy = G.sweep.2 (deploy alongside the Phase G
 * additions to mcp-server.js).
 */

const https = require('https');

function supaReq(method, urlPath, body, prefer = 'return=representation') {
  return new Promise((resolve, reject) => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return reject(new Error('Supabase env missing'));
    const u = new URL(`${url}/rest/v1${urlPath}`);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        Prefer: prefer,
      },
    };
    let raw = '';
    const req = https.request(opts, res => {
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`supa ${method} ${urlPath} ${res.statusCode}: ${raw.slice(0, 200)}`));
        if (!raw) return resolve(null);
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function bexioReq(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.BEXIO_API_TOKEN;
    if (!token) return reject(new Error('BEXIO_API_TOKEN env missing'));
    const u = new URL(`https://api.bexio.com${urlPath}`);
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: u.hostname, path: u.pathname + u.search, method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    let raw = '';
    const req = https.request(opts, res => {
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`bexio ${method} ${urlPath} ${res.statusCode}: ${raw.slice(0, 200)}`));
        try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function telegramSend(text, opts = {}) {
  return new Promise((resolve) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const allowed = (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean);
    const chatId = allowed[0];
    if (!token || !chatId) return resolve();
    const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...(opts.reply_markup ? { reply_markup: opts.reply_markup } : {}) });
    const u = new URL(`https://api.telegram.org/bot${token}/sendMessage`);
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', () => resolve());
    req.write(body); req.end();
  });
}

const TAX_ID     = parseInt(process.env.BEXIO_TAX_ID     || '28',  10);
const ACCOUNT_ID = parseInt(process.env.BEXIO_ACCOUNT_ID || '101', 10);
const UNIT_ID    = parseInt(process.env.BEXIO_UNIT_ID    || '1',   10);

async function findOrCreateContact(payload) {
  const email = payload.identity?.contact_email;
  const company = payload.identity?.name;
  const lang = payload.locale?.offer_lang || (payload.identity?.language?.startsWith('en') ? 'en' : 'de');

  if (email) {
    try {
      const found = await bexioReq('POST', '/2.0/contact/search', [{ field: 'mail', value: email, criteria: '=' }]);
      if (Array.isArray(found) && found.length > 0) return found[0];
    } catch {}
  }
  try {
    const found = await bexioReq('POST', '/2.0/contact/search', [{ field: 'name_1', value: company, criteria: '=' }]);
    if (Array.isArray(found) && found.length > 0) return found[0];
  } catch {}

  const cb = {
    contact_type_id: 1, name_1: company,
    mail: email || '', phone_fixed: payload.identity?.contact_phone || '',
    user_id: 1, owner_id: 1, language_id: lang === 'en' ? 2 : 1,
  };
  if (payload.identity?.contact_name) cb.name_2 = payload.identity.contact_name;
  return await bexioReq('POST', '/2.0/contact', cb);
}

function buildPositions(payload, lang) {
  const t = payload.derived?.tier_label || payload.tier;
  const v = payload.derived?.vertical_label || '';
  const monthly = payload.pricing?.monthly_chf || 0;
  const setup = payload.pricing?.setup_chf || 0;
  const moduleList = (payload.derived?.module_labels || []).map(m =>
    `• ${m.icon || ''} ${m.label}${m.saves_hours_month > 0 ? ' (+' + m.saves_hours_month + ' h/Mt)' : ''}`
  ).join('<br>');
  const subTier = lang === 'en'
    ? `<b>${t}</b>${v ? ' · ' + v + ' pack' : ''} — monthly subscription`
    : `<b>${t}</b>${v ? ' · ' + v + '-Pack' : ''} — Monatsabo`;
  const subSetup = lang === 'en'
    ? `<b>One-time setup</b> — pre-imaged Mac Mini, install + 2-week onboarding`
    : `<b>Einmalige Einrichtung</b> — vor-imageiertes Mac Mini, Installation + 2-Wochen-Begleitung`;
  return [
    { type: 'KbPositionCustom', amount: '12', unit_id: UNIT_ID, account_id: ACCOUNT_ID, tax_id: TAX_ID, unit_price: String(monthly), discount_in_percent: null,
      text: `${subTier}<br><br>${lang === 'en' ? 'Active modules' : 'Aktive Module'}:<br>${moduleList}` },
    { type: 'KbPositionCustom', amount: '1', unit_id: UNIT_ID, account_id: ACCOUNT_ID, tax_id: TAX_ID, unit_price: String(setup), discount_in_percent: null,
      text: subSetup },
  ];
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'POST only' }) };
  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'invalid JSON' }) }; }
  if (!payload?.identity?.kuerzel || !payload?.identity?.name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'identity.kuerzel + name required' }) };
  }

  const KUERZEL = payload.identity.kuerzel.toUpperCase();
  const today = new Date().toISOString().slice(0, 10);
  const offerNumber = payload.offer_number || `NX-${today.replace(/-/g,'')}-${KUERZEL}`;
  const validUntil = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 10);
  const lang = payload.locale?.offer_lang || (payload.identity?.language?.startsWith('en') ? 'en' : 'de');
  const summary = { ok: true, offer_number: offerNumber };

  // 1. Idempotent register
  const existing = await supaReq('GET', `/offers?offer_number=eq.${encodeURIComponent(offerNumber)}&tenant_id=eq.c2moviez&select=id,bexio_offer_id`).catch(() => null);
  let row;
  if (Array.isArray(existing) && existing.length > 0) {
    row = existing[0];
    summary.existing = true;
    if (row.bexio_offer_id) {
      summary.bexio_offer_id = row.bexio_offer_id;
      summary.note = 'offer already pushed; returning existing';
      return { statusCode: 200, body: JSON.stringify(summary) };
    }
  } else {
    const inserted = await supaReq('POST', '/offers', {
      tenant_id: 'c2moviez',
      offer_number: offerNumber,
      prospect_kuerzel: KUERZEL,
      prospect_name: payload.identity.name,
      contact_name: payload.identity.contact_name || null,
      contact_email: payload.identity.contact_email || null,
      language: lang,
      tier: payload.tier,
      vertical: payload.vertical,
      monthly_chf: payload.pricing?.monthly_chf || 0,
      setup_chf: payload.pricing?.setup_chf || 0,
      hours_saved: payload.pricing?.hours_saved_per_month || 0,
      modules_count: (payload.modules || []).length,
      payload, status: 'registered',
      valid_until: validUntil,
      created_by: 'offer-create-fn',
    });
    row = Array.isArray(inserted) ? inserted[0] : inserted;
    summary.offer_id = row.id;
  }

  // 2. Bexio push
  try {
    const contact = await findOrCreateContact(payload);
    const kbOffer = await bexioReq('POST', '/2.0/kb_offer', {
      title: lang === 'en'
        ? `NEXBOX ${payload.derived?.tier_label || ''} for ${payload.identity.name} (${offerNumber})`
        : `NEXBOX ${payload.derived?.tier_label || ''} für ${payload.identity.name} (${offerNumber})`,
      contact_id: contact.id,
      user_id: 1, language_id: lang === 'en' ? 2 : 1,
      bank_account_id: 3, currency_id: 1, payment_type_id: 4,
      header: lang === 'en'
        ? `Hi ${payload.identity.contact_name || ''}<br><br>Thank you for the great discovery call. Your NEXBOX configuration is below.<br><br>`
        : `Guten Tag ${payload.identity.contact_name || ''}<br><br>Vielen Dank für das angenehme Discovery-Gespräch. Ihre NEXBOX-Konfiguration unten.<br><br>`,
      footer: lang === 'en'
        ? `Questions? Reach me anytime.<br><br>Best,<br>Claudio Tinner<br>CEO, c2moviez GmbH`
        : `Fragen? Melden Sie sich jederzeit.<br><br>Freundliche Grüsse<br>Claudio Tinner<br>CEO, c2moviez GmbH`,
      mwst_type: 0, mwst_is_net: true, show_position_taxes: false,
      is_valid_from: today, is_valid_until: validUntil, delivery_address_type: 0,
      api_reference: offerNumber,
      positions: buildPositions(payload, lang),
    });
    summary.bexio_offer_id = kbOffer.id;
    summary.bexio_offer_nr = kbOffer.document_nr || kbOffer.api_reference;
    summary.bexio_url = `https://office.bexio.com/index.php/kb_offer/show/id/${kbOffer.id}`;
    summary.status = 'bexio_pushed';
    if (row?.id) {
      await supaReq('PATCH', `/offers?id=eq.${row.id}`, {
        bexio_offer_id: kbOffer.id, bexio_offer_nr: summary.bexio_offer_nr,
        bexio_url: summary.bexio_url, bexio_pushed_at: new Date().toISOString(),
        status: 'bexio_pushed',
      }, 'return=minimal');
    }
  } catch (e) {
    summary.bexio_error = e.message.slice(0, 300);
  }

  // 3. Email-draft is queued via audit_log → obsidian-queue-consumer writes locally
  await supaReq('POST', '/audit_log', {
    action: 'offer.created',
    entity_type: 'offer', entity_id: offerNumber, entity_name: payload.identity.name,
    actor: 'offer-create-fn',
    details: {
      kuerzel: KUERZEL, tier: payload.tier, vertical: payload.vertical,
      monthly_chf: payload.pricing?.monthly_chf || 0,
      bexio_offer_id: summary.bexio_offer_id || null,
      bexio_url: summary.bexio_url || null,
      language: lang,
      // The local consumer can pick this up and run draft-offer-email.js locally
      draft_email_request: {
        offer_number: offerNumber,
        kuerzel: KUERZEL,
        contact_email: payload.identity.contact_email,
        language: lang,
      },
    },
  }, 'return=minimal').catch(() => {});

  // 4. Telegram nudge
  await telegramSend(
    `<b>📤 Angebot generiert</b>\n` +
    `<b>${payload.identity.name}</b> (${KUERZEL}) · ${payload.derived?.tier_label || payload.tier}\n` +
    (summary.bexio_url ? `Bexio: ${summary.bexio_url}\n` : (summary.bexio_error ? `⚠ Bexio: ${summary.bexio_error.slice(0,100)}\n` : '')) +
    `Investition: CHF ${(payload.pricing?.monthly_chf || 0).toLocaleString('de-CH')}/Mt + CHF ${(payload.pricing?.setup_chf || 0).toLocaleString('de-CH')} Setup\n` +
    `Stunden gespart: ${payload.pricing?.hours_saved_per_month || 0} h/Mt\n\n` +
    `Audit-log gesetzt; lokaler obsidian-queue-consumer schreibt den E-Mail-Entwurf.`,
    {
      reply_markup: {
        inline_keyboard: [[
          { text: '📧 Mark sent',  callback_data: `offerSent:${offerNumber}` },
          { text: '⏸ Hold',        callback_data: `offerHold:${offerNumber}` },
        ]],
      },
    }
  );

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(summary) };
};
