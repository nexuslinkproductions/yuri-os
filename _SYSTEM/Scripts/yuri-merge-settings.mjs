#!/usr/bin/env node
/**
 * yuri-merge-settings.mjs — non-destructively dock YURI's Claude Code hooks into
 * a user's existing settings.json.
 *
 * YURI ships its hooks in <yuriRoot>/.claude/settings.json, written against
 * $CLAUDE_PROJECT_DIR (correct when YURI itself is the project). When YURI is a
 * SEPARATE clone docked into another project, $CLAUDE_PROJECT_DIR resolves to the
 * USER's project, not the YURI clone — so we rewrite every YURI hook command to an
 * ABSOLUTE path under <yuriRoot> before merging.
 *
 * Merge is additive and idempotent:
 *   - YURI hook groups are tagged `"_yuri": true`.
 *   - A merge first strips any existing `_yuri` groups, then re-appends the current
 *     YURI set — so re-running updates cleanly and never duplicates.
 *   - The user's own hooks (untagged) are preserved untouched.
 *   - `--remove` strips YURI hooks and leaves the user's settings otherwise intact.
 *
 * Usage:
 *   node yuri-merge-settings.mjs <targetSettingsPath> <yuriRoot> [--remove]
 *   node yuri-merge-settings.mjs --self-test
 *
 * The caller (yuri-init) is responsible for backing up the target first.
 */
import fs from 'node:fs';
import path from 'node:path';

const HOOK_EVENTS = ['SessionStart', 'UserPromptSubmit', 'SubagentStart', 'PreToolUse', 'PostToolUse', 'Stop'];

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return fallback; }
}

/** Rewrite $CLAUDE_PROJECT_DIR / ${CLAUDE_PROJECT_DIR} in a command to an absolute yuriRoot path. */
function absolutizeCommand(command, yuriRoot) {
  return command
    .replaceAll('${CLAUDE_PROJECT_DIR}', yuriRoot)
    .replaceAll('$CLAUDE_PROJECT_DIR', yuriRoot);
}

/** Build the YURI hook groups for one event, absolutized + tagged. Returns [] if none. */
function yuriGroupsForEvent(yuriHooks, event, yuriRoot) {
  const groups = Array.isArray(yuriHooks?.[event]) ? yuriHooks[event] : [];
  return groups.map((group) => ({
    ...group,
    _yuri: true,
    hooks: (group.hooks || []).map((h) => ({
      ...h,
      command: typeof h.command === 'string' ? absolutizeCommand(h.command, yuriRoot) : h.command,
    })),
  }));
}

/** Core: produce the merged settings object. Pure function — no I/O. */
export function mergeSettings(userSettings, yuriSettings, yuriRoot, { remove = false } = {}) {
  const out = { ...(userSettings || {}) };
  const userHooks = (userSettings && typeof userSettings.hooks === 'object' && userSettings.hooks) || {};
  const yuriHooks = (yuriSettings && typeof yuriSettings.hooks === 'object' && yuriSettings.hooks) || {};
  const mergedHooks = {};

  for (const event of HOOK_EVENTS) {
    // Strip any previously-injected YURI groups; keep the user's own.
    const userGroups = (Array.isArray(userHooks[event]) ? userHooks[event] : []).filter((g) => !g || g._yuri !== true);
    const yuriGroups = remove ? [] : yuriGroupsForEvent(yuriHooks, event, yuriRoot);
    const combined = [...userGroups, ...yuriGroups];
    if (combined.length) mergedHooks[event] = combined;
  }

  // Preserve any non-standard hook events the user defined, minus YURI tags.
  for (const event of Object.keys(userHooks)) {
    if (HOOK_EVENTS.includes(event)) continue;
    const kept = (Array.isArray(userHooks[event]) ? userHooks[event] : []).filter((g) => !g || g._yuri !== true);
    if (kept.length) mergedHooks[event] = kept;
  }

  if (Object.keys(mergedHooks).length) out.hooks = mergedHooks;
  else delete out.hooks;
  return out;
}

function main(argv) {
  if (argv.includes('--self-test')) return selfTest();
  const remove = argv.includes('--remove');
  const positional = argv.filter((a) => !a.startsWith('--'));
  const [targetPath, yuriRoot] = positional;
  if (!targetPath || !yuriRoot) {
    console.error('usage: yuri-merge-settings.mjs <targetSettingsPath> <yuriRoot> [--remove]');
    process.exit(2);
  }
  const user = readJson(targetPath, {});
  const yuri = readJson(path.join(yuriRoot, '.claude', 'settings.json'), {});
  const merged = mergeSettings(user, yuri, yuriRoot, { remove });
  fs.writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n');
  const n = Object.values(merged.hooks || {}).flat().filter((g) => g && g._yuri).length;
  console.log(remove ? 'YURI hooks removed from ' + targetPath : `merged ${n} YURI hook group(s) into ${targetPath}`);
}

function selfTest() {
  const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };
  const yuriRoot = '/opt/yuri';
  const yuri = { hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/brain-inject.js"' }] }] } };
  const user = { permissions: { allow: ['Bash(*)'] }, hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: 'echo mine' }] }] } };

  // 1. merge preserves user hook + adds absolutized+tagged YURI hook
  let m = mergeSettings(user, yuri, yuriRoot);
  assert(m.permissions.allow[0] === 'Bash(*)', 'user settings preserved');
  assert(m.hooks.SessionStart.length === 2, 'both user + yuri groups present');
  assert(m.hooks.SessionStart[0].hooks[0].command === 'echo mine', 'user hook untouched + first');
  assert(m.hooks.SessionStart[1]._yuri === true, 'yuri group tagged');
  assert(m.hooks.SessionStart[1].hooks[0].command === 'node "/opt/yuri/.claude/hooks/brain-inject.js"', 'command absolutized');

  // 2. idempotent: merging the result again does not duplicate
  let m2 = mergeSettings(m, yuri, yuriRoot);
  assert(m2.hooks.SessionStart.length === 2, 'idempotent re-merge (no duplication)');

  // 3. remove: strips yuri, keeps user
  let r = mergeSettings(m2, yuri, yuriRoot, { remove: true });
  assert(r.hooks.SessionStart.length === 1, 'remove strips yuri group');
  assert(r.hooks.SessionStart[0].hooks[0].command === 'echo mine', 'remove keeps user hook');

  // 4. empty user settings
  let e = mergeSettings({}, yuri, yuriRoot);
  assert(e.hooks.SessionStart.length === 1 && e.hooks.SessionStart[0]._yuri, 'works on empty user settings');

  console.log('yuri-merge-settings self-test: 4 groups, all PASS ✓');
}

main(process.argv.slice(2));
