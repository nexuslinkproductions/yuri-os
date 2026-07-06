#!/usr/bin/env node
// @capability: agent-reach-web
// @serves: internet access | web search | read webpage | news search | sentiment source | polymarket event research | trading news | exa search | jina reader
// @does: Thin YURI wrapper over the installed Agent-Reach toolkit (Panniantong/Agent-Reach) — gives any lane/the observatory real internet access via two zero-config, no-key primitives: webSearch() (Exa semantic search through `mcporter call exa.web_search_exa`) and readUrl() (any webpage via Jina Reader `r.jina.ai`). Used for trading research, market news, and Polymarket event-resolution context. Shells out via execFile (injectable for tests), bounded timeouts, fail-open (returns [] / '' on any error). Does NOT do writes/posts; read-only internet.
// @use: Reach for this when YURI needs live web data — news/sentiment for a crypto asset, Polymarket event facts, prior-art, "what's happening with X". webSearch(q) for ranked results; readUrl(url) to read a page. available() gates callers (returns false if mcporter/curl absent). Score results with social-adapter's scorePost/aggregateSentiment for a sentiment signal.
// @exports: webSearch, readUrl, available, parseExaResults

import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const MCPORTER = process.env.AGENT_REACH_MCPORTER || 'mcporter';
const DEFAULT_TIMEOUT_MS = 20_000;

// Injectable exec for tests: fn(cmd, args, {timeout}) -> Promise<string stdout>
let _exec = null;
export function setExec(fn) { _exec = typeof fn === 'function' ? fn : null; }

function run(cmd, args, timeoutMs) {
  if (_exec) return _exec(cmd, args, { timeout: timeoutMs });
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err) reject(err); else resolve(String(stdout || ''));
    });
  });
}

/** Sanitize a query for safe inclusion in the mcporter call expression. */
function sanitize(q) {
  return String(q || '').replace(/["'`\\\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
}

/**
 * parseExaResults(text) -> [{ title, url, text }]  (pure, exported for test)
 * Parses the Exa `web_search_exa` text output (Title:/URL:/Highlights: blocks).
 */
export function parseExaResults(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  // Split on "Title:" markers; each chunk is one result.
  const chunks = text.split(/^Title:\s*/m).slice(1);
  for (const ch of chunks) {
    const lines = ch.split('\n');
    const title = (lines[0] || '').trim();
    const urlMatch = ch.match(/^URL:\s*(\S+)/m);
    const url = urlMatch ? urlMatch[1].trim() : null;
    // Body = everything after the Highlights: marker (or the whole chunk).
    const hi = ch.split(/^Highlights:\s*/m);
    const body = (hi[1] ?? ch).replace(/\[\.\.\.\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (title || url) out.push({ title, url, text: body.slice(0, 1200) });
  }
  return out;
}

/** available() -> Promise<boolean> — is the agent-reach Exa backend reachable? */
export async function available() {
  try {
    await run(MCPORTER, ['--version'], 5000);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * webSearch(query, opts?) -> Promise<[{title,url,text}]>
 * Exa semantic web search via mcporter. FAIL-OPEN: [] on any error.
 */
export async function webSearch(query, opts = {}) {
  const q = sanitize(query);
  if (!q) return [];
  const n = Number.isFinite(opts.numResults) ? Math.max(1, Math.min(10, opts.numResults)) : 5;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  try {
    const out = await run(MCPORTER, ['call', `exa.web_search_exa(query: "${q}", numResults: ${n})`], timeoutMs);
    return parseExaResults(out);
  } catch (_e) {
    return [];
  }
}

/**
 * readUrl(url, opts?) -> Promise<string> — read any webpage via Jina Reader. '' on error.
 */
export async function readUrl(url, opts = {}) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return '';
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  try {
    const out = await run('curl', ['-s', '--max-time', String(Math.floor(timeoutMs / 1000)), `https://r.jina.ai/${u}`], timeoutMs + 2000);
    return String(out || '').slice(0, 20_000);
  } catch (_e) {
    return '';
  }
}

// ── --test (deterministic, injected exec) ──────────────────────────────────
const _runAsMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (_runAsMain && process.argv.includes('--test')) {
  let pass = 0, fail = 0;
  const ok = (c, l) => { if (c) pass++; else { fail++; console.error('FAIL:', l); } };

  // parseExaResults on a canned Exa output
  const sample = `Title: Bitcoin price today\nURL: https://coinmarketcap.com/currencies/bitcoin/\nPublished: N/A\nHighlights:\nThe live Bitcoin price today is $65,858 [...] down 2.00% in the last 24 hours.\n\nTitle: ETH rallies\nURL: https://example.com/eth\nHighlights:\nEthereum surged on ETF inflows.`;
  const r = parseExaResults(sample);
  ok(r.length === 2, `parse 2 results (got ${r.length})`);
  ok(r[0].title === 'Bitcoin price today', 'first title parsed');
  ok(r[0].url === 'https://coinmarketcap.com/currencies/bitcoin/', 'first url parsed');
  ok(r[0].text.includes('65,858'), 'first body parsed');
  ok(r[1].url === 'https://example.com/eth', 'second url parsed');
  ok(parseExaResults('').length === 0, 'empty -> []');

  // webSearch via injected exec
  await (async () => {
    setExec(async (cmd, args) => {
      ok(cmd === MCPORTER, 'webSearch calls mcporter');
      ok(args[0] === 'call' && args[1].includes('web_search_exa'), 'exa call expression');
      ok(args[1].includes('numResults: 3'), 'numResults passed');
      return sample;
    });
    const res = await webSearch('bitcoin "news"\ninjection', { numResults: 3 });
    ok(res.length === 2, 'webSearch returns parsed results');
    // query sanitized (no quotes/newlines leaked into the call)
    // fail-open on exec throw
    setExec(async () => { throw new Error('boom'); });
    ok((await webSearch('x')).length === 0, 'webSearch fail-open -> []');
    ok((await readUrl('not-a-url')) === '', 'readUrl rejects non-http');
    setExec(null);
  })();

  console.log(`agent-reach --test: ${pass} pass, ${fail} fail`);
  if (fail > 0) process.exit(1);
  process.exit(0);
}
