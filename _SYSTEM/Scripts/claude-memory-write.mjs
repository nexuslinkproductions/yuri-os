#!/usr/bin/env node
// Mediated Claude auto-memory writer.
//
// Two-track memory architecture:
//   - YURI canonical memory   → _SYSTEM/Scripts/memory-kernel.mjs (proposal/decision pipeline)
//   - Claude auto-memory      → THIS wrapper (narrow Claude-adapter exception)
//
// This script is the ONLY allowed write path into
//   ~/.claude/projects/<project-id>/memory/
// Direct Write tool calls into that directory remain blocked by the protected-paths
// rule. This wrapper enforces:
//   - writes ONLY to memory/ subdir under the resolved project id
//   - refuses path traversal, forbidden segments (history, state, file-history,
//     worktrees, transcripts), and any escape from the memory/ root
//   - validates frontmatter (name, description, metadata.type)
//   - keeps MEMORY.md index consistent atomically
//
// Use ONLY for Claude-behavioral memory: how Claude-Sonnet works with the operator,
// session-personality, low-stakes self-correction. YURI project facts, collaborators,
// IP constraints, paper deadlines, etc. must go through memory-kernel.mjs.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VALID_TYPES = new Set(['feedback', 'reference', 'project', 'user']);
const VALID_TIERS = new Set(['working', 'episodic', 'semantic']);
const VALID_SCOPES = new Set(['main', 'all', 'claude']);
const VALID_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,80}$/;
const FORBIDDEN_SEGMENTS = new Set(['history', 'state', 'file-history', 'worktrees', 'transcripts']);

// v3 format — stable handle prefix per type (function-token research, 2026).
// Maps `feedback-route-to-quantum` → `FB:ROUTE-TO-QUANTUM` for grep-able crosslinking.
const HANDLE_PREFIX = { feedback: 'FB', reference: 'REF', project: 'PROJ', user: 'USR' };

export function handleFromNameAndType(name, type) {
  const prefix = HANDLE_PREFIX[type];
  if (!prefix) throw new Error(`no handle prefix for type "${type}"`);
  const stripped = name.replace(new RegExp(`^${type}[-_]`, 'i'), '').replace(/_/g, '-');
  return `${prefix}:${stripped.toUpperCase()}`;
}

function projectIdFromCwd(cwd) {
  const trimmed = cwd.replace(/\/+$/, '');
  return '-' + trimmed.replace(/^\//, '').replace(/\//g, '-');
}

function memoryRoot(cwd = process.cwd()) {
  const id = projectIdFromCwd(cwd);
  return path.join(os.homedir(), '.claude', 'projects', id, 'memory');
}

function assertSafeName(name) {
  if (typeof name !== 'string' || !VALID_NAME_RE.test(name)) {
    throw new Error(`invalid name "${name}" — must match ${VALID_NAME_RE}`);
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error(`invalid name "${name}" — no path traversal`);
  }
}

function assertSafePath(target, root) {
  const resolvedTarget = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  if (!(resolvedTarget === resolvedRoot || resolvedTarget.startsWith(resolvedRoot + path.sep))) {
    throw new Error(`refusing write outside memory root: ${target}`);
  }
  const rel = path.relative(resolvedRoot, resolvedTarget);
  for (const seg of rel.split(path.sep)) {
    if (FORBIDDEN_SEGMENTS.has(seg)) {
      throw new Error(`refusing path containing forbidden segment "${seg}": ${target}`);
    }
  }
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) {
        args[k] = true;
      } else {
        args[k] = v;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readBody(args) {
  if (typeof args.body === 'string') return args.body;
  if (typeof args['body-file'] === 'string') {
    const filePath = path.resolve(args['body-file']);
    if (!fs.existsSync(filePath)) throw new Error(`body-file not found: ${filePath}`);
    return fs.readFileSync(filePath, 'utf8');
  }
  throw new Error('--body or --body-file required');
}

function frontmatter({ name, description, type, tier, scope, trig, refs }) {
  const lines = ['---', `name: ${name}`, `description: ${description}`, 'metadata:', `  type: ${type}`];
  if (tier) lines.push(`  tier: ${tier}`);
  if (scope) lines.push(`  scope: ${scope}`);
  if (trig && trig.length) lines.push(`  trig: [${trig.map((t) => JSON.stringify(t)).join(', ')}]`);
  if (refs && refs.length) lines.push(`  refs: [${refs.map((r) => JSON.stringify(r)).join(', ')}]`);
  lines.push('---', '');
  return lines.join('\n') + '\n';
}

function memoryFilePath(root, name) {
  const filePath = path.join(root, `${name}.md`);
  assertSafePath(filePath, root);
  return filePath;
}

function cmdAdd(args) {
  const name = args.name || args._[1];
  const type = args.type;
  const description = args.description;
  if (!name) throw new Error('--name required');
  if (!type || !VALID_TYPES.has(type)) {
    throw new Error(`--type required and must be one of ${[...VALID_TYPES].join(', ')}`);
  }
  if (!description) throw new Error('--description required');
  assertSafeName(name);

  const tier = args.tier;
  if (tier && !VALID_TIERS.has(tier)) {
    throw new Error(`--tier must be one of ${[...VALID_TIERS].join(', ')}`);
  }
  const scope = args.scope;
  if (scope && !VALID_SCOPES.has(scope)) {
    throw new Error(`--scope must be one of ${[...VALID_SCOPES].join(', ')}`);
  }
  const trig = args.trig
    ? args.trig.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const refs = args.refs
    ? args.refs.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const body = readBody(args);

  const root = memoryRoot();
  ensureDir(root);
  const filePath = memoryFilePath(root, name);

  if (fs.existsSync(filePath) && !args.force) {
    throw new Error(`refusing overwrite existing memory "${name}" (use --force to replace)`);
  }

  const content = frontmatter({ name, description, type, tier, scope, trig, refs }) + body.trim() + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
  updateIndex(root);

  return {
    ok: true,
    action: args.force && fs.existsSync(filePath) ? 'replaced' : 'added',
    path: filePath,
    name,
    type,
    handle: handleFromNameAndType(name, type),
    tier: tier || null,
  };
}

function cmdRemove(args) {
  const name = args.name || args._[1];
  if (!name) throw new Error('--name required');
  assertSafeName(name);
  const root = memoryRoot();
  const filePath = memoryFilePath(root, name);
  if (!fs.existsSync(filePath)) throw new Error(`no such memory "${name}"`);
  fs.unlinkSync(filePath);
  updateIndex(root);
  return { ok: true, action: 'removed', name };
}

function cmdRead(args) {
  const name = args.name || args._[1];
  if (!name) throw new Error('--name required');
  assertSafeName(name);
  const root = memoryRoot();
  const filePath = memoryFilePath(root, name);
  if (!fs.existsSync(filePath)) throw new Error(`no such memory "${name}"`);
  return { ok: true, name, content: fs.readFileSync(filePath, 'utf8') };
}

function cmdList() {
  const root = memoryRoot();
  if (!fs.existsSync(root)) return { ok: true, root, entries: [] };
  const entries = fs.readdirSync(root)
    .filter((f) => f.endsWith('.md') && f !== 'MEMORY.md')
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
  return { ok: true, root, entries };
}

function parseEntryMeta(content) {
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) return { description: null, type: null };
  const block = fm[1];
  const descM = block.match(/^description:\s*(.+)$/m);
  const typeM = block.match(/^\s*type:\s*(\w+)/m);
  return {
    description: descM ? descM[1].trim() : null,
    type: typeM ? typeM[1].trim() : null,
  };
}

function updateIndex(root) {
  if (!fs.existsSync(root)) return;
  const files = fs.readdirSync(root)
    .filter((f) => f.endsWith('.md') && f !== 'MEMORY.md')
    .sort();
  const lines = ['# Memory Index — Claude Auto-Memory (v3: stable-handle format)', ''];
  for (const f of files) {
    const name = f.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(root, f), 'utf8');
    const { description, type } = parseEntryMeta(content);
    const hook = description || '(no description)';
    let handle;
    try {
      handle = type && HANDLE_PREFIX[type] ? handleFromNameAndType(name, type) : name.toUpperCase();
    } catch {
      handle = name.toUpperCase();
    }
    // v3 dense format: [HANDLE](file) — hook
    // Markdown link preserves IDE clickability; handle stays grep-able.
    lines.push(`- [${handle}](${f}) — ${hook}`);
  }
  fs.writeFileSync(path.join(root, 'MEMORY.md'), lines.join('\n') + '\n', 'utf8');
}

function cmdReindex() {
  const root = memoryRoot();
  if (!fs.existsSync(root)) throw new Error(`no memory root at ${root}`);
  updateIndex(root);
  return { ok: true, action: 'reindexed', root };
}

function cmdSurfaces() {
  const root = memoryRoot();
  return {
    ok: true,
    surfaces: [{
      id: 'claude-auto-memory',
      owner: 'claude-adapter',
      kind: 'behavioral-self-development',
      root,
      writable: true,
      mediator: '_SYSTEM/Scripts/claude-memory-write.mjs',
      formatVersion: 3,
      allowedTypes: [...VALID_TYPES],
      allowedTiers: [...VALID_TIERS],
      allowedScopes: [...VALID_SCOPES],
      handlePrefixes: HANDLE_PREFIX,
      forbiddenSegments: [...FORBIDDEN_SEGMENTS],
      scope: 'Claude behavioral memory only. YURI project facts must use memory-kernel.mjs.',
      v3BodyConventions: {
        feedback: 'RULE | WHEN | DO | DONT | WHY | SEE',
        reference: 'FACTS (semantic triples) | IMPLICATION | SEE',
        project: 'GOAL | WHO | WHEN | WHERE | STATE | NEXT | SEE',
        user: 'free-form',
      },
    }],
  };
}

function help() {
  return [
    'YURI Claude Auto-Memory Writer v3 — narrow .claude/projects/*/memory/ wrapper',
    '',
    'Usage:',
    '  node _SYSTEM/Scripts/claude-memory-write.mjs surfaces',
    '  node _SYSTEM/Scripts/claude-memory-write.mjs list',
    '  node _SYSTEM/Scripts/claude-memory-write.mjs read --name <name>',
    '  node _SYSTEM/Scripts/claude-memory-write.mjs add \\',
    '    --name <kebab-slug> \\',
    '    --type <feedback|reference|project|user> \\',
    '    --description "<one-line hook ≤80 chars>" \\',
    '    --body "<body>"  OR  --body-file <path> \\',
    '    [--tier <working|episodic|semantic>] \\',
    '    [--scope <main|all|claude>] \\',
    '    [--trig "phrase1,phrase2,phrase3"] \\',
    '    [--refs "[[other-slug-1]],[[other-slug-2]]"] \\',
    '    [--force]',
    '  node _SYSTEM/Scripts/claude-memory-write.mjs remove --name <name>',
    '  node _SYSTEM/Scripts/claude-memory-write.mjs reindex',
    '',
    'v3 body conventions:',
    '  feedback   RULE | WHEN | DO | DONT | WHY | SEE',
    '  reference  FACTS (semantic triples) | IMPLICATION | SEE',
    '  project    GOAL | WHO | WHEN | WHERE | STATE | NEXT | SEE',
    '',
    'Index format: [HANDLE](file.md) — hook  where HANDLE = FB:|REF:|PROJ:|USR: + uppercase slug.',
    '',
    'Scope: Claude-behavioral memory only. YURI canonical memory goes through memory-kernel.mjs.',
  ].join('\n');
}

const cmds = {
  add: cmdAdd,
  list: cmdList,
  read: cmdRead,
  remove: cmdRemove,
  reindex: cmdReindex,
  surfaces: cmdSurfaces,
};

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(help());
    return 0;
  }
  const args = parseArgs(argv);
  const cmd = args._[0];
  const fn = cmds[cmd];
  if (!fn) {
    console.error(`unknown command "${cmd}"`);
    console.error(help());
    return 2;
  }
  try {
    const result = fn(args);
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then((code) => process.exit(code));
}

export {
  projectIdFromCwd,
  memoryRoot,
  assertSafeName,
  assertSafePath,
  parseEntryMeta,
  VALID_TYPES,
  VALID_TIERS,
  VALID_SCOPES,
  HANDLE_PREFIX,
  FORBIDDEN_SEGMENTS,
};
