#!/usr/bin/env node
/**
 * filing-gate.mjs — PreToolUse ADVISORY gate (Write|Edit). When a file is about to land in a non-canonical
 * zone, surface the canonical zone as additionalContext so the model can self-correct. It NEVER blocks and
 * NEVER force-allows: it emits advisory context only, leaving the permission flow untouched.
 *
 * FAIL-OPEN by design (the opposite of math-register-guard's fail-closed): a filing advisory must never be
 * able to break a session. Any error → silent exit 0. Pure classification only (no git grep) so it stays fast.
 *
 * Pinned canonical anchors and protected paths get no advisory (they are handled by their own vetoes; an
 * advisory there would be noise).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

(async () => {
  try {
    let ev = {};
    try { ev = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return done(); }
    const tool = ev.tool_name || ev.tool || '';
    if (!/^(Write|Edit|MultiEdit)$/i.test(tool)) return done();

    const fpAbs = (ev.tool_input?.file_path || ev.input?.file_path || '').replace(/\\/g, '/');
    if (!fpAbs) return done();

    // load the assessor from the resolved repo (CLAUDE_PROJECT_DIR). Fail-open if unavailable.
    let assessor;
    try { assessor = await import(pathToFileURL(path.join(ROOT, '_SYSTEM/Scripts/filing-assessor.mjs')).href); }
    catch { return done(); }

    const rel = fpAbs.startsWith(ROOT) ? path.relative(ROOT, fpAbs).split(path.sep).join('/') : fpAbs.replace(/^\.\//, '');
    const a = assessor.assess(rel);

    // No opinion for protected, pinned, unclassified, invalid, or correctly-placed files.
    if (!a || a.protected || a.pinned || !a.misplaced || !a.recommendedZone) return done();

    const advisory = `FILING ADVISORY (non-blocking): ${rel} canonically belongs in ${a.recommendedZone}/ `
      + `(kind: ${a.kind}). It is currently landing in ${a.currentZone}. Consider writing to `
      + `${a.recommendedZone}/${path.basename(rel)} instead, or let the filing sweep relocate it later `
      + `(node _SYSTEM/Scripts/filing-mutator.mjs "${rel}").`;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: advisory } }) + '\n');
    process.exit(0);
  } catch {
    return done();                                  // FAIL-OPEN: never break a write
  }
})();

function done() { process.exit(0); }
