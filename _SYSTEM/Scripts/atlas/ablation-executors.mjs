#!/usr/bin/env node
// @capability: ablation-executors
// @serves: ablation harness tool execution | anonymized arm bindings | byte-normalized tool results
// @does: FROZEN EXECUTOR CONTRACT for the five anonymized ablation arms (Hermes 2026-07-28;
//   frozen BEFORE the description text that documents it, so docs describe the tool and never
//   drive it). Each executor takes JSON args from a subject's TOOL_CALL emission and returns
//   { status, text, sourceItems } with: output byte-normalized to the SAME budget for every
//   tool (result verbosity is not a confound), timeouts returning a TIMEOUT sentinel (never
//   empty — a timeout must not masquerade as no-results), and sourceItems naming the file each
//   result line came from where the executor can know it (fragment-granular partition input).
//   tool_e contract: { operation: "contents"|"names" (required), pattern (required), scope
//   (optional, default repo root) } — two modes because the Tier-0 control measures grep-craft,
//   which includes name search; removing it would weaken the control below real grep and every
//   nav delta would inherit that. Unknown operations reject with a usage error, never guess.
// @use: node ablation-executors.mjs --test | import { executeTool } (harness only)
// @exports: executeTool, BYTE_BUDGET, TIMEOUT_MS

import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export const BYTE_BUDGET = 4000; // chars — identical for every tool, recorded per call
export const TIMEOUT_MS = 30000; // per call; on elapse the result is a TIMEOUT sentinel
const MAX_ITEMS = 50;

function normalize(text) {
  const s = String(text ?? '');
  return s.length > BYTE_BUDGET ? `${s.slice(0, BYTE_BUDGET)}\n[truncated to ${BYTE_BUDGET} bytes — same budget for every tool]` : s;
}

function run(cmd, args, { timeout = TIMEOUT_MS } = {}) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    execFile(cmd, args, { cwd: REPO_ROOT, timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (settled) return;
      settled = true;
      const elapsed_ms = Date.now() - t0;
      if (err && (err.killed || err.signal === 'SIGTERM' || err.code === 'ETIMEDOUT')) {
        resolve({ status: 'TIMEOUT', text: `[TIMEOUT after ${timeout}ms — sentinel, not an empty result]`, elapsed_ms });
        return;
      }
      // rg exits 1 on no-match: that is a result, not an error. Other non-zero exits carry
      // stderr as the result text so a usage error is visible (and NEVER contains the expect).
      const out = String(stdout || '');
      const errText = String(stderr || '');
      if (err && err.code !== 1 && out.length === 0) {
        resolve({ status: 'ERROR', text: normalize(`[exit ${err.code ?? err.signal}] ${errText.slice(0, 1000)}`), elapsed_ms });
        return;
      }
      resolve({ status: 'OK', text: normalize(out), elapsed_ms });
    });
  });
}

// FROZEN argv pins (the ai --help footgun: flags passed AS the query run a search FOR the flag —
// every query is passed after `--` or as a pinned positional, never spliced into flag position).
const BINDINGS = {
  async tool_a(args) {
    const top = Number.isInteger(args.top) ? args.top : 5;
    try {
      const mod = await import('./atlas-resolve.mjs');
      const paths = mod.resolve(String(args.question ?? ''), { top });
      return { status: 'OK', text: normalize(JSON.stringify(paths, null, 2)), sourceItems: paths.map((p) => ({ file: null, line: p, kind: 'arm_output' })) };
    } catch (err) {
      // Missing atlas state (gitignored, absent in clean worktrees) is a recorded result,
      // never an abort — the episode scores the tool as errored, which is DATA about the arm.
      return { status: 'ERROR', text: `[tool_a backend unavailable: ${String(err && err.message).slice(0, 200)}]`, sourceItems: [] };
    }
  },
  async tool_b(args) {
    const top = Number.isInteger(args.top) ? args.top : 5;
    const r = await run('node', ['_SYSTEM/Scripts/xref-query.mjs', String(args.query ?? ''), '--top', String(top)]);
    return { ...r, sourceItems: [{ file: null, line: '(merged ranked list — arm output)', kind: 'arm_output' }] };
  },
  async tool_c(args) {
    const r = await run('node', ['_SYSTEM/Scripts/capability-recall.mjs', String(args.need ?? '')]);
    return { ...r, sourceItems: [{ file: null, line: '(ranked registry entries — arm output)', kind: 'arm_output' }] };
  },
  async tool_d(args) {
    const top = Number.isInteger(args.top) ? args.top : 5;
    const r = await run('ai', ['search', String(args.query ?? ''), '--top', String(top)]);
    return { ...r, sourceItems: [{ file: null, line: '(ranked document list — arm output)', kind: 'arm_output' }] };
  },
  async tool_e(args) {
    const operation = args.operation;
    const pattern = args.pattern;
    const scope = typeof args.scope === 'string' && args.scope.length > 0 ? args.scope : '.';
    if (operation !== 'contents' && operation !== 'names') {
      return { status: 'ERROR', text: `usage error: operation must be "contents" or "names" (got ${JSON.stringify(operation)})` };
    }
    if (typeof pattern !== 'string' || pattern.length === 0) {
      return { status: 'ERROR', text: 'usage error: pattern (string, required) is missing' };
    }
    if (operation === 'contents') {
      const r = await run('rg', ['--max-count', String(MAX_ITEMS), '--no-heading', '--with-filename', '--line-number', '--', pattern, scope]);
      const items = r.status === 'OK'
        ? r.text.split('\n').filter(Boolean).map((line) => {
            const m = line.match(/^([^:]+):(\d+):(.*)$/);
            return m ? { file: m[1], line: m[3], kind: 'file_read' } : { file: null, line, kind: 'file_read' };
          })
        : [];
      return { ...r, sourceItems: items };
    }
    // names: file paths whose name matches the pattern (case-insensitive regex), bounded.
    const r = await run('rg', ['--files', scope]);
    if (r.status !== 'OK') return { ...r, sourceItems: [] };
    let re;
    try { re = new RegExp(pattern, 'i'); } catch { return { status: 'ERROR', text: `usage error: pattern is not a valid regex: ${pattern}` }; }
    const hits = r.text.split('\n').filter(Boolean).filter((p) => re.test(path.basename(p))).slice(0, MAX_ITEMS);
    return { status: 'OK', text: normalize(hits.join('\n')), sourceItems: hits.map((p) => ({ file: p, line: p, kind: 'file_read' })) };
  },
};

export async function executeTool(label, args) {
  const binding = BINDINGS[label];
  if (!binding) return { status: 'ERROR', text: `usage error: unknown tool ${JSON.stringify(label)}`, elapsed_ms: 0 };
  const t0 = Date.now();
  const result = await binding(args && typeof args === 'object' ? args : {});
  // run() reports its own elapsed; in-process paths (tool_a, tool_e names filter) get it here.
  if (typeof result.elapsed_ms !== 'number') result.elapsed_ms = Date.now() - t0;
  return result;
}

// ---------------------------------------------------------------------------
// Self-test — positive AND negative probes, unmasked exit codes.
// ---------------------------------------------------------------------------
async function runSelfTest() {
  let pass = true;
  const check = (name, cond, detail) => {
    console.log(`[ablation-executors --test] ${name}: ${cond ? 'PASS' : 'FAIL'}${cond ? '' : ` ${detail || ''}`}`);
    if (!cond) pass = false;
  };

  const contents = await executeTool('tool_e', { operation: 'contents', pattern: 'normIdent', scope: '_SYSTEM/Scripts/atlas' });
  check('tool_e contents finds a known token', contents.status === 'OK' && contents.text.includes('normIdent'), contents.text.slice(0, 120));
  check('tool_e contents carries file_read source items with files', contents.sourceItems.length > 0 && contents.sourceItems[0].kind === 'file_read' && typeof contents.sourceItems[0].file === 'string');

  const names = await executeTool('tool_e', { operation: 'names', pattern: 'bench-validate', scope: '_SYSTEM/Scripts/atlas' });
  check('tool_e names finds a known file', names.status === 'OK' && names.text.includes('bench-validate.mjs'), names.text.slice(0, 120));
  check('tool_e names carries the hit path as file (partition input)', names.sourceItems.length > 0 && names.sourceItems[0].file && names.sourceItems[0].file.endsWith('bench-validate.mjs'));

  const badOp = await executeTool('tool_e', { operation: 'fuzzy', pattern: 'x' });
  check('tool_e rejects unknown operation with usage error', badOp.status === 'ERROR' && badOp.text.includes('"contents" or "names"'), badOp.text);

  const noPattern = await executeTool('tool_e', { operation: 'contents' });
  check('tool_e rejects missing pattern', noPattern.status === 'ERROR' && noPattern.text.includes('pattern'), noPattern.text);

  // No-hit probe: pattern assembled at runtime so the literal never appears in this file
  // (a fixed gibberish string self-matched the test file — measured, not hypothetical).
  const gibberish = ['zxqk', 'vbnm', 'jjqq', 'wv'].join('');
  const noHit = await executeTool('tool_e', { operation: 'contents', pattern: gibberish, scope: '_SYSTEM/Scripts/atlas' });
  check('tool_e no-match is OK-with-empty, not an error', noHit.status === 'OK' && noHit.text.trim() === '', JSON.stringify(noHit).slice(0, 120));

  const unknownTool = await executeTool('tool_z', {});
  check('unknown tool label rejects', unknownTool.status === 'ERROR' && unknownTool.text.includes('unknown tool'));

  const a = await executeTool('tool_a', { question: 'what enforces the pre-commit gate', top: 3 });
  // tool_a needs gitignored atlas state (checkpoints.json) that a clean worktree lacks — the
  // binding must report that as an ERROR result, never abort the suite; the live smoke of
  // tool_a's retrieval belongs to the primary tree where the state exists.
  check('tool_a returns JSON paths, or its missing-state error is a recorded result',
    (a.status === 'OK' && Array.isArray(JSON.parse(a.text)))
    || (a.status === 'ERROR' && /checkpoints|atlas/i.test(a.text)),
    `${a.status}: ${a.text.slice(0, 100)}`);
  check('tool_a reports elapsed_ms on every path', typeof a.elapsed_ms === 'number' && a.elapsed_ms >= 0, String(a.elapsed_ms));

  const c = await executeTool('tool_c', { need: 'zzqxv napoleonic thimblewort' });
  check('tool_c no-match shows message + advisory, exit 0', c.status === 'OK' && c.text.includes('No registered') && c.text.includes('build MAY be justified'), c.text.slice(0, 150));

  console.log(`[ablation-executors --test] overall: ${pass ? 'PASS' : 'FAIL'}`);
  return pass ? 0 : 1;
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain && process.argv.includes('--test')) runSelfTest().then((c) => { process.exitCode = c; });
