#!/usr/bin/env node
//
// yuri-model-ab-bench.mjs — head-to-head local-model comparator.
//
// Complements yuri-local-model-benchmark.mjs (which is a single-policy compliance
// check). This tool runs IDENTICAL YURI-relevant scenarios against TWO+ Ollama
// models and produces a head-to-head table: cold-load, decode tok/s, prompt tok/s,
// total latency, validator pass, GPU/CPU split (the "runs smoothly" signal), and a
// bounded output excerpt for qualitative judgment.
//
// Usage:
//   node yuri-model-ab-bench.mjs --models "A,B" [--think] [--json] [--scenario-limit N] [--timeout-ms N]
//   node yuri-model-ab-bench.mjs            # defaults to the new distill vs gemma baseline
//
import { execFileSync } from 'node:child_process';
import os from 'node:os';

const NEW_MODEL = 'hf.co/Jackrong/Qwen3.5-9B-GLM5.1-Distill-v1-GGUF:Q5_K_M';
const BASELINE = 'gemma4:12b-it-qat';

const opts = parseArgs(process.argv.slice(2));
const models = opts.models.length ? opts.models : [NEW_MODEL, BASELINE];
const scenarios = buildScenarios().slice(0, opts.scenarioLimit || undefined);
const host = coerceHttpScheme(process.env.OLLAMA_HOST || 'http://localhost:11434');

const run = { generated_at: new Date().toISOString(), machine: machineSummary(), host, think: opts.think, models: {}, scenarios: scenarios.map((s) => ({ id: s.id, metric: s.metric })) };

for (const model of models) {
  process.stderr.write(`\n=== ${model} ===\n`);
  const installed = await isInstalled(model);
  const modelReport = { installed, ps_after_load: null, results: [] };
  if (!installed) {
    process.stderr.write(`  NOT INSTALLED — skipping\n`);
    run.models[model] = modelReport;
    continue;
  }
  // Warm the model once (cold load happens here; first scenario then measures warm decode).
  await warmup(model, opts.timeoutMs, opts.think);
  modelReport.ps_after_load = psSnapshot(model);
  for (const sc of scenarios) {
    const memBefore = memSnapshot();
    const started = Date.now();
    try {
      const r = await generate(model, sc.prompt, sc.system, opts.timeoutMs, opts.think);
      const elapsed = Date.now() - started;
      const out = r.response || r.message?.content || '';
      const evalCount = Number(r.eval_count || 0);
      const evalNs = Number(r.eval_duration || 0);
      const promptEvalCount = Number(r.prompt_eval_count || 0);
      const promptEvalNs = Number(r.prompt_eval_duration || 0);
      const loadNs = Number(r.load_duration || 0);
      const v = sc.validate(out);
      modelReport.results.push({
        id: sc.id, metric: sc.metric, status: v.ok ? 'ok' : 'validator_failed',
        elapsed_ms: elapsed,
        cold_load_ms: Math.round(loadNs / 1e6),
        decode_tok_s: evalNs > 0 ? Number((evalCount / (evalNs / 1e9)).toFixed(1)) : null,
        prompt_tok_s: promptEvalNs > 0 ? Number((promptEvalCount / (promptEvalNs / 1e9)).toFixed(1)) : null,
        eval_count: evalCount, prompt_eval_count: promptEvalCount,
        output_chars: out.length,
        validation: v,
        excerpt: out.replace(/\s+/g, ' ').trim().slice(0, 220),
        mem_before_free_gb: memBefore.free_gb,
        mem_after_free_gb: memSnapshot().free_gb,
      });
      process.stderr.write(`  ${sc.id}: ${v.ok ? 'ok' : 'FAIL'} ${modelReport.results.at(-1).decode_tok_s} tok/s ${elapsed}ms\n`);
    } catch (e) {
      modelReport.results.push({ id: sc.id, metric: sc.metric, status: 'error', elapsed_ms: Date.now() - started, error: e?.message || String(e) });
      process.stderr.write(`  ${sc.id}: ERROR ${e?.message}\n`);
    }
  }
  run.models[model] = modelReport;
}

run.comparison = buildComparison(run, models, scenarios);

if (opts.json) {
  process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
} else {
  printHuman(run, models, scenarios);
}

// ---------------------------------------------------------------------------

function buildScenarios() {
  return [
    {
      id: 'json_route_packet', metric: 'routing JSON accuracy',
      system: 'Return only strict JSON. No markdown, no prose.',
      prompt: 'Allowed scenario values: control-plane-orchestration, local-summary, code-symbol-check. For this request choose exactly control-plane-orchestration: "brain dump to durable orchestration control plane with graph plan, verify, sanitize, promote". Return {"scenario":"...","confidence":0.0}.',
      validate: (o) => { const j = parseJson(o); return { ok: j?.scenario === 'control-plane-orchestration', expected: 'control-plane-orchestration', observed: j?.scenario ?? null }; },
    },
    {
      id: 'claim_evidence_json', metric: 'claim/evidence JSON compliance',
      system: 'Return only valid JSON. No markdown.',
      prompt: 'YURI rule: unverified operational claims must be routed to verification before promotion. Return {"claim_status":"unverified","verify_before_promotion":true,"local_truth_claim":false}.',
      validate: (o) => { const j = parseJson(o); return { ok: j?.claim_status === 'unverified' && j?.verify_before_promotion === true && j?.local_truth_claim === false, expected: 'unverified/true/false', observed: j ?? null }; },
    },
    {
      id: 'code_symbol_json', metric: 'code-symbol extraction',
      system: 'Return only strict JSON.',
      prompt: 'Given TypeScript `function resolveLocalSlm(lane){ return lane === "code-local" ? "gemma4:12b-it-qat" : "gemma4:12b-it-qat"; }`, return {"symbol":"...","code_local_model":"..."}.',
      validate: (o) => { const j = parseJson(o); return { ok: j?.symbol === 'resolveLocalSlm' && j?.code_local_model === 'gemma4:12b-it-qat', expected: 'resolveLocalSlm + gemma4:12b-it-qat', observed: j ?? null }; },
    },
    {
      id: 'reasoning_word_problem', metric: 'multi-step reasoning correctness',
      system: 'Solve carefully. End your answer with a line exactly like: ANSWER: <number>',
      prompt: 'A lane runs 3 jobs. Job 1 takes 11s. Job 2 takes twice job 1. Job 3 takes job 1 plus job 2, minus 7s. They run strictly sequentially (no overlap). What is the total wall-clock time in seconds? Show steps, then ANSWER: <number>.',
      // 11 + 22 + (11+22-7=26) = 59
      validate: (o) => { const m = o.match(/ANSWER:\s*([0-9]+)/i); const n = m ? Number(m[1]) : null; return { ok: n === 59, expected: 59, observed: n }; },
    },
    {
      id: 'extraction_strict_json', metric: 'structured extraction',
      system: 'Return only strict JSON array. No prose.',
      prompt: 'Extract every model tag mentioned, in order, as a JSON array of strings: "Policy pins gemma4:12b-it-qat for code, qwen2.5-coder:7b is retired, deepseek-v4-pro is cloud." Return e.g. ["a","b"].',
      validate: (o) => { const j = parseJson(o); const arr = Array.isArray(j) ? j : null; const ok = !!arr && arr.includes('gemma4:12b-it-qat') && arr.includes('qwen2.5-coder:7b') && arr.includes('deepseek-v4-pro'); return { ok, expected: '3 tags in array', observed: arr }; },
    },
    {
      id: 'braindump_decode', metric: 'instruction-following / decode quality',
      system: 'You are a terse technical assistant. Output exactly 3 lines, each starting with a dash.',
      prompt: 'Decode this brain dump into exactly 3 prioritized next-actions (3 dashed lines, nothing else): "ok so the local model thing — need it wired into compat, also benchmark vs gemma, and figure out if the 16gb mac chokes on it, oh and index the findings after".',
      validate: (o) => { const lines = o.trim().split(/\n+/).filter((l) => l.trim().startsWith('-')); return { ok: lines.length === 3, expected: '3 dashed lines', observed: lines.length }; },
    },
  ];
}

async function generate(model, prompt, system, timeoutMs, think) {
  const body = { model, prompt, system, stream: false, options: { temperature: 0, num_ctx: 8192 } };
  if (think === true) body.think = true;
  if (think === false) body.think = false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    let res = await fetch(`${host}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) {
      const txt = await res.text();
      // some GGUFs reject the think param — retry once without it
      if (/think/i.test(txt) && 'think' in body) {
        delete body.think;
        res = await fetch(`${host}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      }
      if (!res.ok) throw new Error(`OLLAMA_${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return res.json();
  } finally { clearTimeout(t); }
}

async function warmup(model, timeoutMs, think) {
  try { await generate(model, 'Reply with the single word: ready', '', Math.min(timeoutMs, 120000), think); } catch { /* cold-load measured per-scenario anyway */ }
}

async function isInstalled(model) {
  try {
    const res = await fetch(`${host}/api/tags`);
    const data = await res.json();
    const names = new Set((data.models || []).map((m) => m.name));
    if (names.has(model)) return true;
    // ollama stores hf pulls under the full hf.co/... name; also accept a loose suffix match
    return [...names].some((n) => n === model || n.endsWith(model.split('/').pop()));
  } catch { return false; }
}

function psSnapshot(model) {
  try {
    const out = execFileSync('ollama', ['ps'], { encoding: 'utf8', timeout: 5000 });
    const line = out.split(/\r?\n/).find((l) => l.includes(model.split('/').pop().split(':')[0]));
    return { raw: out.trim().split(/\r?\n/).slice(0, 4).join(' | '), model_line: line || null };
  } catch { return null; }
}

function parseJson(o) {
  try { return JSON.parse(o); } catch { /* fall through */ }
  const m = o.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function buildComparison(run, models, scenarios) {
  const out = [];
  for (const sc of scenarios) {
    const row = { id: sc.id };
    for (const m of models) {
      const r = (run.models[m]?.results || []).find((x) => x.id === sc.id);
      row[m] = r ? { status: r.status, decode_tok_s: r.decode_tok_s, elapsed_ms: r.elapsed_ms } : { status: 'absent' };
    }
    out.push(row);
  }
  // aggregate
  const agg = {};
  for (const m of models) {
    const rs = (run.models[m]?.results || []).filter((r) => r.decode_tok_s != null);
    const okCount = (run.models[m]?.results || []).filter((r) => r.status === 'ok').length;
    agg[m] = {
      installed: run.models[m]?.installed ?? false,
      validators_passed: `${okCount}/${(run.models[m]?.results || []).length}`,
      avg_decode_tok_s: rs.length ? Number((rs.reduce((a, r) => a + r.decode_tok_s, 0) / rs.length).toFixed(1)) : null,
      median_cold_load_ms: median((run.models[m]?.results || []).map((r) => r.cold_load_ms).filter((x) => x != null)),
      ps_after_load: run.models[m]?.ps_after_load?.model_line || null,
    };
  }
  return { per_scenario: out, aggregate: agg };
}

function median(arr) { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2); }

function printHuman(run, models, scenarios) {
  console.log(`\nYURI model A/B benchmark — think=${run.think}`);
  console.log(`machine: ${run.machine.arch} ${run.machine.cpus}cpu ${run.machine.total_memory_gb}GB | host: ${run.host}\n`);
  for (const m of models) {
    const a = run.comparison.aggregate[m];
    console.log(`■ ${m}`);
    console.log(`    installed=${a.installed} validators=${a.validators_passed} avg_decode=${a.avg_decode_tok_s} tok/s cold_load≈${a.median_cold_load_ms}ms`);
    if (a.ps_after_load) console.log(`    ps: ${a.ps_after_load}`);
  }
  console.log(`\nper-scenario (status / decode tok/s / ms):`);
  for (const row of run.comparison.per_scenario) {
    const cells = models.map((m) => { const c = row[m]; return `${short(m)}=${c.status === 'ok' ? '✓' : c.status === 'validator_failed' ? '✗' : c.status}:${c.decode_tok_s ?? '-'}t/s:${c.elapsed_ms ?? '-'}ms`; });
    console.log(`  ${row.id.padEnd(26)} ${cells.join('  |  ')}`);
  }
}

function short(m) { const tail = m.split('/').pop(); return tail.length > 22 ? tail.slice(0, 22) : tail; }

function coerceHttpScheme(raw) { const t = String(raw || '').replace(/\/$/, ''); if (!t) return 'http://localhost:11434'; return /^https?:\/\//i.test(t) ? t : `http://${t}`; }
function memSnapshot() { return { total_gb: Number((os.totalmem() / 1024 ** 3).toFixed(2)), free_gb: Number((os.freemem() / 1024 ** 3).toFixed(2)) }; }
function machineSummary() { return { platform: os.platform(), arch: os.arch(), cpus: os.cpus().length, total_memory_gb: Number((os.totalmem() / 1024 ** 3).toFixed(2)) }; }

function parseArgs(args) {
  const out = { models: [], think: null, json: false, scenarioLimit: 0, timeoutMs: 180000 };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--models' && args[i + 1]) { out.models = args[++i].split(',').map((s) => s.trim()).filter(Boolean); continue; }
    if (a === '--think') { out.think = true; continue; }
    if (a === '--no-think') { out.think = false; continue; }
    if (a === '--json') { out.json = true; continue; }
    if (a === '--scenario-limit' && args[i + 1]) { out.scenarioLimit = Math.max(0, parseInt(args[++i], 10) || 0); continue; }
    if (a === '--timeout-ms' && args[i + 1]) { out.timeoutMs = Math.max(1000, parseInt(args[++i], 10) || 180000); continue; }
    if (a === '--help' || a === '-h') { console.log('Usage: node yuri-model-ab-bench.mjs --models "A,B" [--think|--no-think] [--json] [--scenario-limit N] [--timeout-ms N]'); process.exit(0); }
    throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}
