#!/usr/bin/env node
/**
 * math-register-guard.mjs — PreToolUse gate (Write|Edit). A new `_SYSTEM/Scripts/math/<x>.mjs` must be
 * REGISTERED (present in MATH-SCIENCE-MANUAL.md OR the circuitry graph) or contract-exempted BEFORE it
 * lands — closing the built-but-unregistered gap at CREATION time (the full-prerequisite-closure law,
 * not "wire it later"). FAIL-CLOSED on any error. On block, points at the autowire fast-path.
 *
 * Design: DeepSeek nexus-guard trigger lane (2026-06-06), corrected to the YURI `permissionDecision`
 * hook format (the lane's draft used `{continue:false}`, which is not how YURI hooks deny).
 *
 * NOT wired into .claude/settings.json — registering a blocking gate mutates behavior, so the
 * settings wiring is the OWNER-GATED step (the Nexus Guard's own class-F rule). This file is the
 * ready mechanism; the owner flips it on.
 *
 * Residual (documented): a module written via Bash (`cat > .../x.mjs`) bypasses the Write|Edit matcher;
 * the periodic `regenerative-nexus-guard.mjs` scan catches that. Matcher→Write|Edit|Bash is phase-2.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MATH_DIR = '_SYSTEM/Scripts/math';
const read = (rel) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return ''; } };

/** Exemption reason for a repo-relative math file, or null. (filename-regex + explicit path rules) */
export function exemptReason(relFp, contractTxt) {
  let c; try { c = JSON.parse(contractTxt || '{}'); } catch { return null; }
  const rules = [...(c.filenameExemptions?.rules || []), ...(c.pathExemptions?.rules || [])];
  for (const r of rules) {
    if (r.path && r.path === relFp) return r.reason || 'path-exempt';
    if (r.match) { try { if (new RegExp(r.match).test(relFp)) return r.reason || 'filename-exempt'; } catch { /* bad regex never exempts */ } }
  }
  return null;
}
/** Is the module registered? present in the manual (by basename) OR a graph node's files[]. */
export function isRegistered(base, relFp, manualTxt, graphTxt) {
  if (manualTxt && manualTxt.includes(base)) return true;
  try { const g = JSON.parse(graphTxt || '{}'); for (const n of (g.nodes || [])) for (const f of (n.files || [])) if (f === relFp) return true; } catch { /* corrupt graph → not registered */ }
  return false;
}
/** Pure decision (no I/O) — unit-tested. action: 'allow' | 'deny'. */
export function decide({ tool, fileRel, contractTxt, manualTxt, graphTxt }) {
  if (!/^(Write|Edit)$/i.test(tool || '')) return { action: 'allow', reason: 'not-write-edit' };
  if (!fileRel || !fileRel.startsWith(MATH_DIR + '/') || !fileRel.endsWith('.mjs') || fileRel.endsWith('.test.mjs'))
    return { action: 'allow', reason: 'out-of-scope' };
  if (exemptReason(fileRel, contractTxt)) return { action: 'allow', reason: 'exempt' };
  const base = fileRel.split('/').pop();
  if (isRegistered(base, fileRel, manualTxt, graphTxt)) return { action: 'allow', reason: 'registered' };
  return { action: 'deny', base };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const deny = (reason) => { process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }) + '\n'); process.exit(0); };
  try {
    let ev = {}; try { ev = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { /* no stdin */ }
    const fpAbs = (ev.tool_input?.file_path || ev.input?.file_path || '').replace(/\\/g, '/');
    const fileRel = fpAbs.startsWith(ROOT) ? path.relative(ROOT, fpAbs).split(path.sep).join('/') : fpAbs.replace(/^\.\//, '');
    const d = decide({
      tool: ev.tool_name || ev.tool, fileRel,
      contractTxt: read('_SYSTEM/Scripts/nexus-guard-contracts.json'),
      manualTxt: read('02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md'),
      graphTxt: read('02_RESOURCES/RESEARCH/yuri-circuitry-graph.json'),
    });
    if (d.action === 'deny') deny(
      `BLOCKED: math module "${d.base}" is unregistered (absent from MATH-SCIENCE-MANUAL.md AND the circuitry graph).\n` +
      `→ Fast path: node _SYSTEM/Scripts/nexus-guard-autowire.mjs "${fileRel}"\n` +
      `→ Escape hatch: add a pathExemption to _SYSTEM/Scripts/nexus-guard-contracts.json (reason+owner+reviewBy required)\n` +
      `→ Standing law: full-prerequisite-closure (no wire-later)`);
    process.exit(0); // allow
  } catch (e) {
    deny(`math-register-guard FAIL-CLOSED: ${e.message}`);
  }
}
