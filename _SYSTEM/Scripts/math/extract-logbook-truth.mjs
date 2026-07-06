#!/usr/bin/env node
// Scratch extractor: parse the 36-card math-theory-transfer logbook into a labeled
// ground-truth set for the transfer-distance proof. Pure read of the md, JSON out.
import { readFileSync } from 'node:fs';

const PATH = '02_RESOURCES/RESEARCH/math-theory-transfer-catalog-2026-06-03.md';
const raw = readFileSync(PATH, 'utf8');

// Split on card headers: "## N. Title — juice X · confidence Y"
const cardRe = /^##\s+(\d+)\.\s+(.+?)\s+—\s+juice\s+(\d+)\s+·\s+confidence\s+(\w+)/gim;
const blocks = [];
let m, prev = null;
while ((m = cardRe.exec(raw)) !== null) {
  if (prev) prev.end = m.index;
  prev = { n: +m[1], title: m[2].trim(), juice: +m[3], headerConf: m[4], start: m.index };
  blocks.push(prev);
}
if (prev) prev.end = raw.length;

function field(body, label) {
  // bullet line "- **LABEL** — text" possibly spanning to next bullet
  const re = new RegExp(`\\*\\*${label}\\*\\*\\s*—\\s*([\\s\\S]*?)(?=\\n-\\s+\\*\\*|\\n##\\s|$)`, 'i');
  const mm = body.match(re);
  return mm ? mm[1].replace(/\s+/g, ' ').trim() : '';
}
function conf(body, which) {
  // CONFIDENCE — Structural HIGH (...); literal MEDIUM (...)
  const c = field(body, 'CONFIDENCE');
  // tolerate "literal-mapping MEDIUM", "literal HIGH", "Structural HIGH"; declared
  // "ZERO on ..." maps to NONE (0.0) — declared-zero is not weak-positive (LOW 0.3).
  const re = new RegExp(`${which}[a-z-]*\\s*(HIGH|MEDIUM|MED|LOW|ZERO)`, 'i');
  const mm = c.match(re);
  if (mm && mm[1].toUpperCase() === 'ZERO') return 'NONE';
  const v = mm ? mm[1].toUpperCase() : null;
  return v === 'MED' ? 'MEDIUM' : v;
}
// NONE = declared-zero confidence (0.0); null stays null (unparseable ≠ declared-zero).
const CONF_NUM = { HIGH: 1.0, MEDIUM: 0.6, LOW: 0.3, NONE: 0.0 };

const cards = blocks.map((b) => {
  const body = raw.slice(b.start, b.end);
  const sourceTheory = field(body, 'SOURCE THEORY');
  const borrowed = field(body, 'BORROWED MECHANISM');
  const target = field(body, 'YURI TARGET');
  const transfer = field(body, 'THE TRANSFER');
  const mismatch = field(body, 'MISMATCH / RISK');
  const structural = conf(body, 'Structural');
  const literal = conf(body, 'literal');
  return {
    n: b.n,
    title: b.title,
    juice: b.juice,
    structuralConf: structural,
    literalConf: literal,
    structuralNum: CONF_NUM[structural] ?? null,
    literalNum: CONF_NUM[literal] ?? null,
    // SEPARATE triangle vertices (don't conflate source theory with the borrowed mechanism)
    sourceTheory,                 // A — the foreign domain
    borrowedMechanism: borrowed,  // M — the shared mechanism
    yuriTarget: target,           // B — the target organ (name)
    theTransfer: transfer,        // B-context — how it lands in the organ
    sourceText: `${sourceTheory} ${borrowed}`.trim(), // legacy blended (kept for back-compat)
    targetText: `${target} ${transfer}`.trim(),
    mismatch,
  };
});

const ok = cards.filter((c) => c.sourceText && c.targetText && c.structuralNum != null && c.literalNum != null);
process.stderr.write(`parsed=${cards.length} complete=${ok.length}\n`);
const bad = cards.filter((c) => !(c.sourceText && c.targetText && c.structuralNum != null && c.literalNum != null));
if (bad.length) process.stderr.write(`INCOMPLETE: ${bad.map((c) => c.n + ':' + (c.structuralConf || '?') + '/' + (c.literalConf || '?')).join(' ')}\n`);
console.log(JSON.stringify(cards, null, 2));
