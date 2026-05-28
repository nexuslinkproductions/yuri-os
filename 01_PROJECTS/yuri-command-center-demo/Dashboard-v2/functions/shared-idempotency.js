/**
 * shared-idempotency.js — once-per-day storage-backed locks.
 *
 * Prevents scheduled functions from double-firing. Keys live in the
 * `daily-state` Supabase Storage bucket as `<scope>-sent-<YYYY-MM-DD>`.
 */

const { storageGetRaw, storagePut } = require('./shared-storage');

async function alreadySentToday(scope, today) {
  const val = await storageGetRaw('daily-state', `${scope}-sent-${today}`);
  return val !== null;
}

async function markSentToday(scope, today, meta = {}) {
  await storagePut('daily-state', `${scope}-sent-${today}`, { sent_at: new Date().toISOString(), ...meta });
}

module.exports = { alreadySentToday, markSentToday };
