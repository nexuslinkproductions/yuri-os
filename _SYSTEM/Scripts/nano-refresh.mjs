#!/usr/bin/env node
// @capability: nano-self-refresh
// @serves: nano refresh | self-refresh | nano brain | what changed since last tick | tail peer decisions | swarm awareness | stay up to date
// @does: per-nano self-refresh — git HEAD/recent/dirty (own worktree) + peer decisions on the Kagami bus since the nano's cursor → a compact <nano-brain> block + an advanced cursor (afterId/afterTs)
// @use: the FIRST step of every NANO SWARM tick — re-sync to live reality before claiming or acting, so a long-running nano never drifts
// @exports: buildNanoBrain, refresh
//
// nano-refresh.mjs — NANO SWARM self-refresh (property 1). Pure formatter (buildNanoBrain) + a thin
// I/O wrapper (refresh) that reads git + the event bus. Cursor semantics: advance PAST all new events
// (no re-surfacing) but DISPLAY only the most-recent N (awareness, not a work queue). Fail-soft on git
// (a nano must refresh even in a weird repo state); never throws out of refresh.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readKagamiEventsSince } from './kagami-event-bus.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function git(args, root = REPO_ROOT) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 8000, maxBuffer: 4 * 1024 * 1024 }).trim();
  } catch {
    return ''; // fail-soft: refresh must survive a detached HEAD / non-repo / locked index
  }
}

export function gitHead(root) {
  const sha = git(['rev-parse', '--short', 'HEAD'], root);
  const ref = git(['rev-parse', '--abbrev-ref', 'HEAD'], root);
  return { sha: sha || '(unknown)', ref: ref || '(detached)' };
}
export function gitRecent(n = 3, root) {
  const out = git(['log', `-${Math.max(1, n)}`, '--oneline', '--no-decorate'], root);
  return out ? out.split('\n').filter(Boolean) : [];
}
export function gitDirty(root) {
  const out = git(['status', '--porcelain'], root);
  return out ? out.split('\n').filter(Boolean) : [];
}

/**
 * PURE: render the compact <nano-brain> situational block. All inputs supplied — no I/O, no clock —
 * so it is fully deterministic and unit-testable. `events` are the events to DISPLAY (already bounded);
 * `newCount` is the true count of new events since the cursor (may exceed events.length).
 */
export function buildNanoBrain({ nanoId = 'nano', head = {}, commits = [], dirty = [], events = [], newCount = null, cursorAdvancedTo = null, nowIso = '' } = {}) {
  const total = newCount == null ? events.length : newCount;
  const evLines = events.map((e) => {
    const snip = String(e?.payload ? JSON.stringify(e.payload) : '').replace(/\s+/g, ' ').slice(0, 80);
    return `  [${e?.lane || '?'}/${e?.kind || '?'}] ${snip}`;
  });
  const dirtyLine = dirty.length ? `${dirty.length} uncommitted (${dirty.slice(0, 3).map((d) => d.trim()).join(', ')}${dirty.length > 3 ? ', …' : ''})` : 'clean';
  const cur = cursorAdvancedTo ? `id=${cursorAdvancedTo.afterId || '-'} ts=${cursorAdvancedTo.afterTs || '-'}` : '(unchanged)';
  return [
    `<nano-brain nano="${nanoId}"${nowIso ? ` ts="${nowIso}"` : ''}>`,
    `HEAD ${head.sha || '(unknown)'} (${head.ref || '?'})`,
    `recent: ${commits.length ? commits.join(' | ') : '(none)'}`,
    `worktree: ${dirtyLine}`,
    `peers since cursor (${total}${total > events.length ? `, showing last ${events.length}` : ''}):`,
    ...(evLines.length ? evLines : ['  (no new swarm events)']),
    `cursor -> ${cur}`,
    `</nano-brain>`,
  ].join('\n');
}

/**
 * Live self-refresh: read git + the event bus, render the brain, return the ADVANCED cursor.
 * Advances the cursor PAST every new event (no re-surfacing next tick); displays only the most
 * recent `displayN`. Never throws — a refresh failure must not crash the tick.
 */
// `root` = the Kagami EVENT-BUS state root (where events live). `worktree` = the nano's GIT working
// tree (where git HEAD/log/status run) — a DIFFERENT root; defaults to the real repo. Conflating the
// two made git run in the event-state dir (caught by the 2-nano e2e). They are kept distinct here.
export function refresh(nanoId, { cursor = {}, root, worktree, sinceN = 3, displayN = 20, nowIso = '' } = {}) {
  let allNew = [];
  try {
    allNew = readKagamiEventsSince({ afterId: cursor.afterId, afterTs: cursor.afterTs }, { root });
  } catch { allNew = []; }
  const shown = displayN > 0 ? allNew.slice(-displayN) : allNew;
  const last = allNew.length ? allNew[allNew.length - 1] : null;
  const cursorAdvancedTo = last ? { afterId: last.id, afterTs: last.ts } : (cursor.afterId || cursor.afterTs ? cursor : null);
  const head = gitHead(worktree);
  const commits = gitRecent(sinceN, worktree);
  const dirty = gitDirty(worktree);
  const brain = buildNanoBrain({ nanoId, head, commits, dirty, events: shown, newCount: allNew.length, cursorAdvancedTo, nowIso });
  return { brain, cursor: cursorAdvancedTo, counts: { commits: commits.length, dirty: dirty.length, newEvents: allNew.length } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const nanoId = process.argv[2] || 'nano-cli';
  const r = refresh(nanoId, { nowIso: new Date().toISOString() });
  process.stdout.write(`${r.brain}\n`);
}
