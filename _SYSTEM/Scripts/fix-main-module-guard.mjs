#!/usr/bin/env node
// One-shot codemod: replace fragile `file://${process.argv[1]}` main-module guards with pathToFileURL.
//   node _SYSTEM/Scripts/fix-main-module-guard.mjs          # apply
//   node _SYSTEM/Scripts/fix-main-module-guard.mjs --check  # exit 1 if any remain
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [
  path.join(HERE),
  path.join(HERE, 'math'),
  path.join(HERE, 'utils'),
  path.join(HERE, 'security'),
  path.join(HERE, 'policy'),
  path.join(HERE, '_lib'),
  path.join(HERE, 'alpha-factor-library'),
  path.join(HERE, 'alpha-factor-library', 'adapters'),
  path.join(HERE, 'alpha-factor-library', 'observatory'),
  path.join(HERE, '..', 'mure'),
];

const BROKEN = /import\.meta\.url === `file:\/\/\$\{process\.argv\[1\]\}`/g;
const FIXED = 'process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href';

function listMjs(d) {
  try {
    return fs.readdirSync(d).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs')).map((f) => path.join(d, f));
  } catch { return []; }
}

function ensurePathToFileURLImport(src) {
  const uses = /pathToFileURL\s*\(/.test(src);
  if (!uses) return src;
  const fromUrl = /import\s*\{([^}]*)\}\s*from\s*['"]node:url['"]/;
  const m = src.match(fromUrl);
  if (m) {
    const names = m[1].split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.includes('pathToFileURL')) {
      names.push('pathToFileURL');
      return src.replace(fromUrl, `import { ${names.join(', ')} } from 'node:url'`);
    }
    return src;
  }
  const shebang = src.startsWith('#!') ? src.indexOf('\n') + 1 : 0;
  return `${src.slice(0, shebang)}import { pathToFileURL } from 'node:url';\n${src.slice(shebang)}`;
}

const checkOnly = process.argv.includes('--check');
const repairOnly = process.argv.includes('--repair-imports');
let brokenFiles = [];
let repairedFiles = [];

for (const root of ROOTS) {
  for (const file of listMjs(root)) {
    const rel = path.relative(path.join(HERE, '..', '..'), file);
    let src = fs.readFileSync(file, 'utf8');
    let changed = false;
    const hadBroken = BROKEN.test(src);
    BROKEN.lastIndex = 0;
    if (hadBroken) {
      brokenFiles.push(rel);
      if (!checkOnly) {
        src = src.replace(BROKEN, FIXED);
        changed = true;
      }
    }
    if (!checkOnly && (repairOnly || hadBroken)) {
      const next = ensurePathToFileURLImport(src);
      if (next !== src) {
        repairedFiles.push(rel);
        src = next;
        changed = true;
      }
    }
    if (changed) fs.writeFileSync(file, src);
  }
}

if (checkOnly) {
  if (brokenFiles.length) {
    process.stderr.write(`BROKEN main-module guards remain (${brokenFiles.length}):\n`);
    for (const f of brokenFiles) process.stderr.write(`  ${f}\n`);
    process.exit(1);
  }
  console.log('OK: no fragile main-module guards remain.');
  process.exit(0);
}

console.log(`fixed ${brokenFiles.length} guard(s), repaired ${repairedFiles.length} import(s)`);
for (const f of brokenFiles) console.log(`  guard: ${f}`);
for (const f of repairedFiles) console.log(`  import: ${f}`);
