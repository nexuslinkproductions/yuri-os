#!/usr/bin/env node
/**
 * arch-graph-watch.cjs — PostToolUse reflex.
 *
 * After a tool that can mutate the architecture graph, surface a warning to the working AI when a
 * module just BECAME a structural single-point-of-failure (articulation point). The watcher also
 * records it to the nerve, so it survives into the next session's afferent digest.
 *
 * CHEAP COMMON PATH: this hook fires after every Edit/Write/MultiEdit/Bash, so it does the change
 * gate ITSELF in-process — a single stat of the graph vs the mtime stored in watch-state. Only when
 * the graph's mtime actually advanced does it spawn the (heavier ESM) watcher. So the ~98% of
 * mutations that don't touch the architecture graph cost one stat + one small JSON read, no second
 * node process.
 *
 * Strictly advisory + fail-open: any error, timeout, or non-finding → exit 0, silent. Never blocks.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..', '..');
const WATCHER = path.join(REPO, '_SYSTEM/Scripts/arch-graph-watch.mjs');
const GRAPH = path.join(REPO, '_SYSTEM/yuri-graph-state.json');
const STATE = path.join(REPO, '_SYSTEM/state/arch-graph-watch-state.json');

function exit0() { process.exit(0); }

try {
  // In-process change gate — skip the spawn entirely when the graph's mtime is unchanged.
  let mtimeMs;
  try { mtimeMs = fs.statSync(GRAPH).mtimeMs; } catch (_) { exit0(); } // no graph → nothing to do
  try {
    const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    if (st && st.graphMtimeMs === mtimeMs) exit0(); // unchanged → no spawn, no work
  } catch (_) { /* state missing/corrupt → fall through and let the watcher seed/repair it */ }

  const r = spawnSync('node', [WATCHER, 'check', '--json'], {
    cwd: REPO, encoding: 'utf8', timeout: 6000, // clear margin under the 10s hook budget
  });
  if (r.status !== 0 || !r.stdout) exit0();

  let v;
  try { v = JSON.parse(r.stdout.trim().split('\n').pop()); } catch (_) { exit0(); }
  if (!v || !v.fired || v.seeded) exit0();

  const newAP = Array.isArray(v.newArticulation) ? v.newArticulation : [];
  const resolved = Array.isArray(v.resolvedArticulation) ? v.resolvedArticulation : [];
  if (newAP.length === 0 && resolved.length === 0) exit0();

  const parts = [];
  if (newAP.length) {
    parts.push(`⚠ ARCH-GRAPH: ${newAP.map((n) => `"${n}"`).join(', ')} just became a structural single-point-of-failure (cut-vertex) — removing it disconnects the architecture graph. Recorded to the nerve. Consider a redundant path or decoupling before building further on it.`);
  }
  if (resolved.length) {
    parts.push(`✓ ARCH-GRAPH: ${resolved.map((n) => `"${n}"`).join(', ')} is no longer a cut-vertex (resolved).`);
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: parts.join(' ') },
  }) + '\n');
  exit0();
} catch (_) {
  process.exit(0); // fail-open: a diagnostic never breaks the tool loop
}
