/**
 * telegram-fact-changes.js — Daily digest of fact ledger contradictions.
 *
 * Phase L (2026-04-27): when the AI layer revises a claim, the change is
 * audit-logged as `fact.contradicted`. This function reads those rows
 * from the last 24h and sends one Telegram message with the diff so the
 * CEO can confirm or roll back. Inline buttons attached:
 *   ✓ Confirm new value     — bumps confidence to 1.0 with source 'ceo-confirmed'
 *   ↩ Rollback to old       — retracts new fact, re-asserts old at confidence 1.0
 *   👁 View full chain      — links to the Dashboard reasoning view
 *
 * Idempotent via shared-idempotency (key 'fact-changes'). If no
 * contradictions in the window, exits silently.
 *
 * Schedule: 0 19 * * 1-5  → 19:00 UTC = 21:00 CEST in summer.
 */

const https = require('https');
const { getRecentContradictions, renderValue } = require('./shared-facts');
const { alreadySentToday, markSentToday } = require('./shared-idempotency');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

function send(chatId, text, opts = {}) {
  return new Promise(resolve => {
    const payload = JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...opts });
    const reqOpts = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(reqOpts, res => { res.on('data', () => {}); res.on('end', () => resolve()); });
    req.on('error', () => resolve());
    req.write(payload); req.end();
  });
}

exports.handler = async () => {
  if (!BOT_TOKEN || !ALLOWED_USERS.length) {
    return { statusCode: 200, body: 'Not configured' };
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  if (await alreadySentToday('fact-changes', todayKey)) {
    return { statusCode: 200, body: 'Already sent today (idempotent skip)' };
  }

  // Mark FIRST to prevent race condition on simultaneous Netlify invocations
  await markSentToday('fact-changes', todayKey);

  const contradictions = await getRecentContradictions(1);

  // Filter out the migration's backfill catch (CEO-confirmed superseding
  // vault-frontmatter) — those are expected and not interesting to surface.
  // Keep everything where the new value didn't come from a higher-confidence
  // source. (We surface any change for completeness in the future.)
  const interesting = contradictions.filter(c => {
    // Skip if both old + new are the same source (no real disagreement)
    return c.old_source !== c.new_source || (c.new_confidence ?? 0) < 0.95;
  });

  if (!interesting.length) {
    return { statusCode: 200, body: 'No contradictions today' };
  }

  let msg = `🧠 <b>Fact Ledger — ${interesting.length} change${interesting.length === 1 ? '' : 's'} today</b>\n`;
  msg += `<i>EXEO revised these claims. Confirm, rollback, or ignore.</i>\n\n`;

  const lines = interesting.slice(0, 12).map(c => {
    const oldV = renderValue(c.old_value);
    const newV = renderValue(c.new_value);
    const oldConf = c.old_confidence != null ? Math.round(c.old_confidence * 100) + '%' : '?';
    const newConf = c.new_confidence != null ? Math.round(c.new_confidence * 100) + '%' : '?';
    return (
      `• <code>${c.subject_id}</code> · <b>${c.predicate}</b>\n` +
      `   ${oldV}  <i>(${c.old_source} ${oldConf})</i>\n` +
      `   → ${newV}  <i>(${c.new_source} ${newConf})</i>`
    );
  });
  msg += lines.join('\n\n');

  if (interesting.length > 12) {
    msg += `\n\n<i>+${interesting.length - 12} more — full list at ops.c2moviez.com/intel</i>`;
  }

  // Inline keyboard: one row per contradiction (top 5) with confirm + rollback.
  // For >5, show a "View all" deep-link only.
  const buttons = interesting.slice(0, 5).map(c => ([
    {
      text: `✓ Confirm ${c.subject_id}/${c.predicate.slice(0, 12)}`,
      callback_data: `fact_confirm:${c.new_fact_id}`,
    },
    {
      text: `↩ Rollback`,
      callback_data: `fact_rollback:${c.new_fact_id}:${c.old_fact_id}`,
    },
  ]));
  buttons.push([{ text: '🌐 Open Dashboard', url: 'https://ops.c2moviez.com/intel' }]);

  for (const userId of ALLOWED_USERS) {
    await send(userId, msg, { reply_markup: { inline_keyboard: buttons } });
  }

  return { statusCode: 200, body: `Fact-changes digest sent (${interesting.length} items)` };
};
