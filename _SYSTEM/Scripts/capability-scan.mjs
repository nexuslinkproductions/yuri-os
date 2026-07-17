#!/usr/bin/env node
// capability-scan.mjs — regenerate _SYSTEM/capabilities.json from `@capability:` annotations at
// each YURI mechanism (the source of truth). Auto-registration: annotate the mechanism, regenerate;
// the registry never drifts. CAPABILITY-FIRST mandate: .claude/rules/capability_first.md
//   node _SYSTEM/Scripts/capability-scan.mjs            -> write capabilities.json
//   node _SYSTEM/Scripts/capability-scan.mjs --check    -> exit 1 if the registry is stale (CI guard)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SYS = path.resolve(HERE, '..');
const ROOT = path.resolve(SYS, '..');
const OUT = path.join(SYS, 'capabilities.json');
const DIRS = [
  path.join(SYS, 'Scripts'),
  path.join(SYS, 'Scripts', '_lib'),                  // shared helper libs (lane-command-gate, ...)
  path.join(SYS, 'Scripts', 'math'),
  path.join(SYS, 'Scripts', 'alpha-factor-library'),  // AFL organ subdir
  path.join(SYS, 'Scripts', 'alpha-factor-library', 'adapters'),    // AFL venue/exe adapters (readdirSync is non-recursive — subdirs must be listed explicitly)
  path.join(SYS, 'Scripts', 'alpha-factor-library', 'observatory'), // AFL observatory realtime feeds (tick-stream/trades-stream/depth-book/mark-price/...)
  path.join(SYS, 'mure'),                             // MURE agentic-collective modules (role-registry, governance, goal-engine, math-bridge, company)
];
const VOICE_DIR = path.join(SYS, 'Scripts', 'voice');
const MECHANISM_DIRS = new Set([...DIRS, VOICE_DIR].map((dir) => path.resolve(dir)));

const listFiles = (d, exts = ['.mjs']) => {
  try {
    return fs.readdirSync(d)
      .filter((f) => exts.some((e) => f.endsWith(e)) && !f.endsWith('.test.mjs') && !f.endsWith('.test.py')
        && !['capability-scan.mjs', 'capability-recall.mjs'].includes(f))  // the tooling mentions @capability; not mechanisms
      .map((f) => path.join(d, f));
  }
  catch { return []; }
};

export function isMechanismFile(file) {
  const absolute = path.resolve(file);
  const dir = path.dirname(absolute);
  if (!MECHANISM_DIRS.has(dir)) return false;
  const ext = path.extname(absolute);
  const allowed = dir === VOICE_DIR ? ['.mjs', '.py', '.sh'] : ['.mjs'];
  const base = path.basename(absolute);
  return allowed.includes(ext)
    && !base.endsWith('.test.mjs')
    && !base.endsWith('.test.py')
    && !['capability-scan.mjs', 'capability-recall.mjs'].includes(base);
}

export function parseCapabilityContent(file, content) {
  const lines = String(content).split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:\/\/|#)\s*@capability:\s*(\S+)/);  // a real // (js) or # (py/sh) comment line, not a string/regex literal
    if (!m) continue;
    // POSIX-normalize the stored path: path.relative emits OS-native separators, so a Windows
    // clone would write backslashes here -> the committed registry (forward-slash) drifts and
    // --check blocks every Windows commit. .split(path.sep).join('/') is inert on macOS/Linux.
    const cap = { id: m[1].trim(), serves: [], does: '', use: '', exports: [], mechanism: path.relative(ROOT, file).split(path.sep).join('/') };
    for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
      const l = lines[j];
      let g;
      if ((g = l.match(/@serves:\s*(.+)/))) cap.serves = g[1].split('|').map((s) => s.trim()).filter(Boolean);
      else if ((g = l.match(/@does:\s*(.+)/))) cap.does = g[1].trim();
      else if ((g = l.match(/@use:\s*(.+)/))) cap.use = g[1].trim();
      else if ((g = l.match(/@exports:\s*(.+)/))) cap.exports = g[1].split(',').map((s) => s.trim()).filter(Boolean);
      else if (!l.includes('//') && !l.includes('#') && l.trim()) break; // left the comment block (js or py/sh)
    }
    out.push(cap);
  }
  return out;
}

function sparseTrackedSources() {
  const relDirs = [...MECHANISM_DIRS].map((dir) => path.relative(ROOT, dir).split(path.sep).join('/'));
  const records = execFileSync('git', ['ls-files', '-v', '-z', '--', ...relDirs], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  const sources = [];
  for (const record of records) {
    const match = record.match(/^(\S) (.+)$/);
    if (!match || match[1] !== 'S') continue;
    const rel = match[2];
    const file = path.join(ROOT, ...rel.split('/'));
    if (fs.existsSync(file) || !isMechanismFile(file)) continue;
    const content = execFileSync('git', ['show', `:${rel}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    sources.push({ file, content });
  }
  return sources;
}

export function scanCapabilities() {
  const present = [
    ...DIRS.flatMap((dir) => listFiles(dir)),
    ...listFiles(VOICE_DIR, ['.mjs', '.py', '.sh']),
  ].map((file) => ({ file, content: fs.readFileSync(file, 'utf8') }));
  const sources = new Map();
  for (const source of [...sparseTrackedSources(), ...present]) sources.set(path.resolve(source.file), source);
  return [...sources.values()]
    .flatMap(({ file, content }) => parseCapabilityContent(file, content))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Voice subsystem is Python + shell (not .mjs) — scan it for @capability in # comments too, so the
// whole voice stack is recall-discoverable (capability-first). .mjs dirs scan as before.
function main() {
  const caps = scanCapabilities();

  // Safety net: never nuke a working registry to empty if annotations aren't in place yet.
  if (!caps.length) {
    process.stderr.write('capability-scan: no @capability annotations found — leaving capabilities.json untouched.\n');
    return;
  }

  const registry = {
    _doc: 'YURI capability registry — function-indexed NEED->MECHANISM map. AUTO-GENERATED by capability-scan.mjs from @capability annotations at each mechanism. Edit the annotation at the source, never this file. Query: node _SYSTEM/Scripts/capability-recall.mjs "<need>". Mandate: .claude/rules/capability_first.md',
    version: 2,
    generated: 'capability-scan',
    count: caps.length,
    capabilities: caps,
  };
  const json = `${JSON.stringify(registry, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur.trim() !== json.trim()) {
      process.stderr.write(`STALE: capabilities.json differs from scan (${caps.length} caps). Run: node _SYSTEM/Scripts/capability-scan.mjs\n`);
      process.exitCode = 1;
      return;
    }
    console.log(`OK: capability registry current (${caps.length} capabilities).`);
    return;
  }
  fs.writeFileSync(OUT, json);
  console.log(`wrote ${path.relative(ROOT, OUT)} (${caps.length} capabilities)`);
  for (const c of caps) console.log(`  • ${c.id}  [${c.mechanism}]  serves:${c.serves.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
