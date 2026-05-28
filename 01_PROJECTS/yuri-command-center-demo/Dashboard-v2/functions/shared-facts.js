/**
 * shared-facts.js — Fact-ledger read/write helpers for Netlify functions.
 *
 * Phase L (2026-04-27) introduced public.facts in Supabase as the
 * authoritative store of stable claims (revenue, contact details, billing
 * model, etc.) with provenance and supersession history. Every AI-driven
 * function should query this BEFORE composing prompts and write to it
 * AFTER extracting new claims.
 *
 * Three exports:
 *   getKnownFacts(subjectType, subjectId)       -> [{predicate, value, …}]
 *   formatFacts(facts, opts?)                   -> human-readable block for prompts
 *   assertFact({subject_type, subject_id, …})   -> uuid of new fact row
 *
 * All read/write goes through Supabase REST — no auth-token gymnastics
 * because the facts_current view + RPCs are anon-readable/executable.
 */

const https = require('https');

function _supaUrl() { return process.env.SUPABASE_URL; }
function _supaKey() { return process.env.SUPABASE_ANON_KEY; }

function getKnownFacts(subjectType, subjectId) {
  const url = _supaUrl();
  const key = _supaKey();
  if (!url || !key) return Promise.resolve(null);
  return new Promise(resolve => {
    const u = new URL(
      `${url}/rest/v1/facts_current?subject_type=eq.${encodeURIComponent(subjectType)}` +
      `&subject_id=eq.${encodeURIComponent(subjectId)}` +
      `&select=predicate,value,confidence,source,observed_at,actor` +
      `&order=predicate.asc`
    );
    https.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return resolve(null);
        try { resolve(JSON.parse(raw)); } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Render a fact list compactly for an AI prompt. One line per predicate.
 * opts.label — optional header text (default "KNOWN FACTS")
 */
function formatFacts(facts, opts = {}) {
  const label = opts.label || 'KNOWN FACTS (authoritative — do NOT contradict)';
  if (!facts || !facts.length) {
    return `${label}:\n  (no recorded facts — all claims must come from tickets/notes only)`;
  }
  const lines = facts.map(f => {
    const v = renderValue(f.value);
    const conf = f.confidence >= 0.95 ? '✓ ceo-confirmed' : `${Math.round(f.confidence * 100)}% (${f.source})`;
    return `  • ${f.predicate}: ${v}  [${conf}]`;
  });
  return `${label}:\n${lines.join('\n')}`;
}

function renderValue(val) {
  if (val == null) return '(null)';
  if (typeof val !== 'object') return String(val);
  if (val.amount !== undefined) {
    return `${val.amount}${val.currency ? ' ' + val.currency : ''}${val.note ? ' (' + val.note + ')' : ''}`;
  }
  if (val.text !== undefined) return val.text;
  if (val.count !== undefined) return String(val.count);
  if (val.start && val.end) return `${val.start} → ${val.end}`;
  return JSON.stringify(val);
}

/**
 * Assert a new fact via the assert_fact RPC.
 * Auto-supersedes the previous fact for the same triple and emits a
 * `fact.contradicted` audit_log marker if the value changed.
 *
 * Returns the new fact row (or null on failure — fail-soft so callers
 * don't crash on transient Supabase issues).
 */
function assertFact(args) {
  const url = _supaUrl();
  const key = _supaKey();
  if (!url || !key) return Promise.resolve(null);
  if (!args.subject_type || !args.subject_id || !args.predicate || args.value === undefined) {
    return Promise.resolve(null);
  }

  const body = JSON.stringify({
    p_subject_type: args.subject_type,
    p_subject_id: args.subject_id,
    p_predicate: args.predicate,
    p_value: args.value,
    p_source: args.source || 'mcp-call',
    p_actor: args.actor || 'exeo',
    p_confidence: args.confidence ?? 0.5,
    p_source_ref: args.source_ref || null,
    p_rationale: args.rationale || null,
    p_observed_at: args.observed_at || null,
  });

  return new Promise(resolve => {
    const u = new URL(`${url}/rest/v1/rpc/assert_fact`);
    const opts = {
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    let raw = '';
    const req = https.request(opts, res => {
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return resolve(null);
        try { resolve(raw ? JSON.parse(raw) : null); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(body);
    req.end();
  });
}

/**
 * Recent contradictions feed (last N days). Used by the daily contradictions
 * digest. Returns rows from the fact_contradictions_recent view.
 */
function getRecentContradictions(days = 1) {
  const url = _supaUrl();
  const key = _supaKey();
  if (!url || !key) return Promise.resolve([]);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return new Promise(resolve => {
    const u = new URL(
      `${url}/rest/v1/fact_contradictions_recent?created_at=gte.${encodeURIComponent(cutoff)}` +
      `&select=*&order=created_at.desc&limit=50`
    );
    https.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return resolve([]);
        try { resolve(JSON.parse(raw)); } catch { resolve([]); }
      });
    }).on('error', () => resolve([]));
  });
}

module.exports = { getKnownFacts, formatFacts, renderValue, assertFact, getRecentContradictions };
