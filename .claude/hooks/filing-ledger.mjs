#!/usr/bin/env node
/**
 * filing-ledger.mjs — PostToolUse ledger (Write|Edit|MultiEdit). Logs every file write to an append-only
 * JSONL ledger at _SYSTEM/state/filing-ledger.jsonl with its zone classification, so the session-end filing
 * sweep has a source of truth for "what landed where this session." If a write is misplaced, it also surfaces
 * a one-line advisory for post-session cleanup.
 *
 * FAIL-OPEN: any error → silent exit 0. Never blocks (PostToolUse can't block the already-done write anyway).
 * Protected paths are NOT logged (they are off-limits to the filing system, including its audit trail).
 * _SYSTEM/state/ is writable (NOT a protected surface); the ledger lives there.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const LEDGER = '_SYSTEM/state/filing-ledger.jsonl';

(async () => {
  try {
    let ev = {};
    try { ev = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return done(); }
    const tool = ev.tool_name || ev.tool || '';
    if (!/^(Write|Edit|MultiEdit)$/i.test(tool)) return done();

    const fpAbs = (ev.tool_input?.file_path || ev.input?.file_path || '').replace(/\\/g, '/');
    if (!fpAbs) return done();

    let mod;
    try { mod = await import(pathToFileURL(path.join(ROOT, '_SYSTEM/Scripts/filing-assessor.mjs')).href); }
    catch { return done(); }

    const rel = fpAbs.startsWith(ROOT) ? path.relative(ROOT, fpAbs).split(path.sep).join('/') : fpAbs.replace(/^\.\//, '');
    if (rel === LEDGER) return done();                 // never log the ledger's own writes

    const a = mod.assess(rel);
    if (!a || a.protected) return done();              // protected surfaces are never recorded

    const entry = {
      ts: new Date().toISOString(),
      session: process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_SESSION || 'unknown',
      tool,
      path: a.path,
      kind: a.kind,
      currentZone: a.currentZone,
      recommendedZone: a.recommendedZone,
      misplaced: !!a.misplaced,
      pinned: !!a.pinned,
      fileType: a.fileType || null,
    };
    try {
      fs.mkdirSync(path.join(ROOT, '_SYSTEM/state'), { recursive: true });
      fs.appendFileSync(path.join(ROOT, LEDGER), JSON.stringify(entry) + '\n');
    } catch { /* ledger write best-effort; never break */ }

    if (a.misplaced && a.recommendedZone) {
      const advisory = `FILING LEDGER: ${a.path} landed in ${a.currentZone} but belongs in ${a.recommendedZone}/ (kind: ${a.kind}). Logged for the session-end filing sweep.`;
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: advisory } }) + '\n');
    }
    process.exit(0);
  } catch {
    return done();                                     // FAIL-OPEN
  }
})();

function done() { process.exit(0); }
