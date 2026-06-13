#!/usr/bin/env node
//
// yuri-slm-value-probe.mjs — measure an SLM's VALUE to YURI, not its leaderboard score.
//
// Speed/quality-vs-Claude is the wrong question for a local 9B. The right question: of the bounded,
// verifiable, high-volume YURI job types an SLM is SUPPOSED to absorb, what fraction does it handle
// acceptably — and what does that displace? This runs a representative suite of REAL YURI job types
// THROUGH THE GOVERNED LANE (llm-lane.mjs <lane> --no-tools), validates each deterministically, and
// emits a value scorecard: role-fit acceptance rate + per-axis enablement + cost displaced at volume.
//
// Usage: node yuri-slm-value-probe.mjs [--lane qwen-local] [--json] [--volume-per-day 1000]
//
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const LANE_BIN = path.join(__dirname, 'llm-lane.mjs');

const opts = parseArgs(process.argv.slice(2));
const LANE = opts.lane || 'qwen-local';
const VOL = opts.volumePerDay || 1000;

// Representative YURI job types an SLM is the RIGHT tool for. Each: a self-contained prompt + a
// deterministic validator. These mirror the capability-manifest local role: triage, summarize,
// extraction, decode, classify, rank, cross-ref candidate generation.
const JOBS = [
  { id: 'decode_5state', role: 'brain-dump pre-decode',
    sys: 'Output exactly 5 lines, each "LABEL: text". Labels in order: ACTIVE OBJECTIVE, EVIDENCE, IMPLEMENTATION TASK, PARKED BRANCH, REJECTED-NOISE.',
    prompt: 'Route this brain dump: "qwen looks faster, we measured 22 vs 17 tok/s, maybe retire gemma, remember to reindex, feels snappier lately".',
    val: (o) => { const need = ['ACTIVE OBJECTIVE', 'EVIDENCE', 'IMPLEMENTATION TASK', 'PARKED BRANCH', 'REJECTED']; const hit = need.filter((n) => o.toUpperCase().includes(n)).length; return { ok: hit >= 4, detail: `${hit}/5 states` }; } },
  { id: 'triage_route', role: 'lane routing / triage',
    sys: 'Return ONLY JSON {"lane":"..."}. Allowed: native, slm-local, cloud-reason, claude. native=deterministic math/hash; slm-local=bounded summarize/extract; cloud-reason=hard reasoning; claude=architecture.',
    prompt: 'Task: "compute the SHA-256 of a string and return the hex". Which lane?',
    val: (o) => { const j = json(o); return { ok: j?.lane === 'native', detail: `lane=${j?.lane}` }; } },
  { id: 'extract_json', role: 'structured extraction',
    sys: 'Return ONLY a JSON array of strings, model tags in order.',
    prompt: 'Extract every model tag: "policy pins gemma4:12b-it-qat, retired qwen2.5-coder:7b, cloud is deepseek-v4-pro".',
    val: (o) => { const a = json(o); const ok = Array.isArray(a) && ['gemma4:12b-it-qat', 'qwen2.5-coder:7b', 'deepseek-v4-pro'].every((t) => a.includes(t)); return { ok, detail: ok ? '3/3 tags' : `got ${JSON.stringify(a)?.slice(0, 60)}` }; } },
  { id: 'rank_relevance', role: 'memory recall re-ranking',
    sys: 'Return ONLY JSON {"top":"id"} — the id of the snippet most relevant to the query.',
    prompt: 'Query: "how do I run the local model". Snippets: {"a":"ollama serve via the app binary"},{"b":"deepseek pricing per 1M tokens"},{"c":"japanese aesthetics wabi-sabi palette"}. Most relevant id?',
    val: (o) => { const j = json(o); return { ok: j?.top === 'a', detail: `top=${j?.top}` }; } },
  { id: 'classify_severity', role: 'event classification',
    sys: 'Return ONLY JSON {"severity":"low|medium|high|critical"}.',
    prompt: 'Classify: "a PreToolUse guard let a write to .env through, exposing a secret". Severity?',
    val: (o) => { const j = json(o); return { ok: ['high', 'critical'].includes(String(j?.severity).toLowerCase()), detail: `sev=${j?.severity}` }; } },
  { id: 'summarize_condense', role: 'condensation',
    sys: 'Output at most 2 bullet lines starting with "-". No preamble.',
    prompt: 'Condense: "The Homebrew ollama lacked the llama-server runner so every model errored; the official Ollama.app binary bundles the Metal runner, so the fix was to run the server from the app binary instead of the Homebrew CLI."',
    val: (o) => { const b = o.trim().split(/\n+/).filter((l) => l.trim().startsWith('-')); return { ok: b.length >= 1 && b.length <= 2 && o.length < 320, detail: `${b.length} bullets, ${o.length} chars` }; } },
  { id: 'tag_extract', role: 'tagging / cross-ref candidates',
    sys: 'Return ONLY a JSON array of 3-6 lowercase topic tags.',
    prompt: 'Tag this note: "wired qwen-local as a curated llm-compat lane, organ-gated through llm-lane.mjs, runs 100% GPU on the M2 Pro".',
    val: (o) => { const a = json(o); return { ok: Array.isArray(a) && a.length >= 3, detail: Array.isArray(a) ? `${a.length} tags` : 'not array' }; } },
];

// Rough cloud prices ($/1M tok) for the displacement math — what the SAME job would cost elsewhere.
const PRICE = { deepseek_flash_in: 0.14, deepseek_flash_out: 0.28, claudeish_in: 3.0, claudeish_out: 15.0 };

const results = [];
for (const job of JOBS) {
  const started = Date.now();
  let out = '', err = '', code = 0;
  try { out = await runLane(LANE, job.sys, job.prompt); }
  catch (e) { code = 1; err = String(e?.message || e).slice(0, 120); }
  const ms = Date.now() - started;
  const v = code === 0 ? job.val(out) : { ok: false, detail: `dispatch_error:${err}` };
  const inTok = Math.ceil((job.sys.length + job.prompt.length) / 4);
  const outTok = Math.ceil(out.length / 4);
  results.push({ id: job.id, role: job.role, ok: v.ok, detail: v.detail, ms, inTok, outTok, excerpt: out.replace(/\s+/g, ' ').trim().slice(0, 120) });
  process.stderr.write(`  ${job.id.padEnd(20)} ${v.ok ? 'PASS' : 'FAIL'}  ${ms}ms  (${v.detail})\n`);
}

const passed = results.filter((r) => r.ok).length;
const totIn = results.reduce((a, r) => a + r.inTok, 0);
const totOut = results.reduce((a, r) => a + r.outTok, 0);
const avgIn = totIn / results.length, avgOut = totOut / results.length;
const perTaskFlash = (avgIn * PRICE.deepseek_flash_in + avgOut * PRICE.deepseek_flash_out) / 1e6;
const perTaskClaude = (avgIn * PRICE.claudeish_in + avgOut * PRICE.claudeish_out) / 1e6;

const scorecard = {
  lane: LANE,
  role_fit: { jobs: results.length, accepted: passed, acceptance_rate: Number((passed / results.length).toFixed(2)) },
  enablement_axes: {
    privacy: 'local-only — sensitive/IP content never leaves the machine (binary enabler)',
    always_on: 'no auth/quota/network — runs in hooks, loops, EOT, offline',
    main_thread_offload: 'keeps Claude context + cloud budget for the hard top',
    advisory_only: 'every output is pulse-tagged advisory_until_verified — never final truth',
  },
  cost_displaced_at_volume: {
    volume_per_day: VOL,
    vs_deepseek_flash_usd_per_day: Number((perTaskFlash * VOL).toFixed(4)),
    vs_claudeish_usd_per_day: Number((perTaskClaude * VOL).toFixed(2)),
    note: 'Dollar savings vs cheap cloud (deepseek-flash) are small per task — the real value is privacy + always-on + offload, not $. vs a frontier model the $ becomes material at volume.',
  },
  verdict: passed / results.length >= 0.7
    ? `USE IT — ${passed}/${results.length} bounded job types handled acceptably through the governed lane. Point qwen-local at: ${results.filter((r) => r.ok).map((r) => r.role).join('; ')}.`
    : `LIMITED — only ${passed}/${results.length} job types passed; keep to the ones that did and verify downstream.`,
  results,
};

if (opts.json) process.stdout.write(`${JSON.stringify(scorecard, null, 2)}\n`);
else {
  console.log(`\nSLM VALUE SCORECARD — ${LANE}`);
  console.log(`role-fit: ${passed}/${results.length} job types accepted (${Math.round(100 * passed / results.length)}%)`);
  console.log(`avg tokens/job: ${Math.round(avgIn)} in / ${Math.round(avgOut)} out`);
  console.log(`cost displaced @ ${VOL}/day: $${(perTaskFlash * VOL).toFixed(3)} vs deepseek-flash · $${(perTaskClaude * VOL).toFixed(2)} vs frontier`);
  console.log(`\nper job (role → result):`);
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.id.padEnd(20)} ${r.role.padEnd(28)} ${r.ms}ms  ${r.detail}`);
  console.log(`\nVERDICT: ${scorecard.verdict}`);
}
process.exit(passed / results.length >= 0.5 ? 0 : 1);

// ---------------------------------------------------------------------------
function runLane(lane, sys, prompt) {
  return new Promise((resolve, reject) => {
    const args = [LANE_BIN, lane, '--no-tools', '--reasoning', 'low', '--system', sys, prompt];
    execFile('node', args, { cwd: REPO_ROOT, timeout: 180000, maxBuffer: 4 * 1024 * 1024 }, (e, stdout, stderr) => {
      if (e && !stdout) return reject(new Error(stderr?.split('\n').find((l) => l.includes('LLM_COMPAT_FAIL')) || e.message));
      resolve(String(stdout || ''));
    });
  });
}
function json(o) { try { return JSON.parse(o); } catch { /* */ } const m = o.match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } }
function parseArgs(a) { const o = { lane: '', json: false, volumePerDay: 1000 }; for (let i = 0; i < a.length; i++) { if (a[i] === '--lane') o.lane = a[++i]; else if (a[i] === '--json') o.json = true; else if (a[i] === '--volume-per-day') o.volumePerDay = Number(a[++i]) || 1000; } return o; }
