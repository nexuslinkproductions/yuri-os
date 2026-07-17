#!/usr/bin/env node
// capability-recall.mjs — "does YURI already have a mechanism for <need>?"
//
// Surfaces existing YURI capabilities by FUNCTION/need so they are not forgotten or rebuilt.
// This is the CAPABILITY-FIRST reflex: the inverse of the local-first research mandate, for code.
// Run it before building a new primitive or going broad with xref/grep.
//
//   node _SYSTEM/Scripts/capability-recall.mjs "convergence detection"
//   node _SYSTEM/Scripts/capability-recall.mjs "fuzzy matching / boilerplate weighting"
//
// Reads _SYSTEM/capabilities.json (v1 seed; phase 2 auto-generates it from `@capability`
// annotations at each mechanism via capability-scan.mjs). Exit 0 always; advisory.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REGISTRY = path.resolve(HERE, '..', 'capabilities.json');

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const toks = (s) => new Set(norm(s).split(' ').filter((t) => t.length > 2));

export function scoreCapability(needTokens, needRaw, cap) {
  const nr = norm(needRaw);
  let s = 0;
  for (const phrase of cap.serves || []) {
    const p = norm(phrase);
    if (!p) continue;
    if (nr.includes(p) || p.includes(nr)) s += 3;                 // strong phrase hit
    const pt = toks(phrase);
    let overlap = 0;
    for (const t of pt) if (needTokens.has(t)) overlap++;
    if (pt.size) s += overlap / pt.size;                          // token-overlap fraction
  }
  const idt = toks(`${cap.id} ${cap.does || ''}`);
  let o2 = 0;
  for (const t of needTokens) if (idt.has(t)) o2++;
  s += o2 * 0.5;

  // Superseded mechanisms stay searchable for explicit migration/legacy work,
  // but they must not outrank their active replacement for ordinary recall.
  // Lifecycle state is source annotation metadata, so ranking does not encode
  // provider, terminal, model, or one-off query names.
  const asksForLegacy = /\b(?:legacy|old|right option)\b/.test(nr);
  if (cap.status === 'legacy' && cap.supersededBy && !asksForLegacy) s *= 0.25;
  return s;
}

export function rankCapabilities(need, capabilities, limit = 3) {
  const needTokens = toks(need);
  return (capabilities || [])
    .map((c) => ({ c, s: scoreCapability(needTokens, need, c) }))
    .filter((x) => x.s > 0.5)
    .sort((a, b) => b.s - a.s || String(a.c.id).localeCompare(String(b.c.id)))
    .slice(0, limit);
}

function main() {
  const need = process.argv.slice(2).join(' ').trim();
  if (!need) { process.stderr.write('usage: capability-recall.mjs "<need>"\n'); process.exit(2); }
  let reg;
  try { reg = JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); }
  catch (e) { process.stderr.write(`capability registry unreadable: ${e.message}\n`); process.exit(1); }

  const ranked = rankCapabilities(need, reg.capabilities, 3);

  if (!ranked.length) {
    console.log(`No registered YURI capability matches "${need}".`);
    console.log('→ A build MAY be justified — confirm with `xref-query.mjs` first, then register the new mechanism.');
    return;
  }
  console.log(`⚡ YURI ALREADY HAS — for "${need}":\n`);
  for (const { c, s } of ranked) {
    console.log(`  ▸ ${c.id}  (match ${s.toFixed(1)})`);
    console.log(`    ${c.does}`);
    console.log(`    → ${c.mechanism}  [${(c.exports || []).join(', ')}]`);
    console.log(`    USE: ${c.use}\n`);
  }
  console.log('CAPABILITY-FIRST: reach for the above before building new code (xref to confirm + locate).');
}

if (process.argv[1] && import.meta.url === url.pathToFileURL(process.argv[1]).href) main();
