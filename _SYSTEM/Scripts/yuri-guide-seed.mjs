#!/usr/bin/env node
/**
 * yuri-guide-seed.mjs — seed authored organ guides onto the CANONICAL graph nodes.
 *
 * Pipeline stage 1 of the YURI Navigation Layer (Marcel decision 2026-06-09: the guide is generated
 * FROM the canonical node — node = single source of truth; the skill is a projection of node.guide):
 *
 *   _SYSTEM/organ-guides.json  --(this seed)-->  node.mechanism.guide in _SYSTEM/yuri-graph.json
 *                              --(yuri-guide-project.mjs)-->  .claude/skills/organ-<id>/SKILL.md
 *
 * HARD GATE: every guide's exports[] is checked against the module's REAL exports (live `import`).
 * A guide that invents or omits an export is REFUSED — a nav guide that lies about the call surface is
 * worse than none. Missing nodes that carry a `newNode` block are CREATED (e.g. yuri-nerve, which
 * shipped after the last graph regen and was never registered).
 *
 * Idempotent: re-running overwrites node.mechanism.guide with the authored source. Indent-preserving
 * (re-stringifies the canonical with its existing indentation) so the graph diff stays minimal.
 *
 * Usage: node yuri-guide-seed.mjs [--check]   (--check verifies the gate + reports, writes nothing)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..', '..');
const GRAPH = path.join(REPO, '_SYSTEM/yuri-graph.json');
const GUIDES = path.join(REPO, '_SYSTEM/organ-guides.json');
const CHECK = process.argv.includes('--check');

const detectIndent = (raw) => { const m = raw.match(/^\{\n([ \t]+)"/); return m ? m[1] : '  '; };

async function realExports(file) {
  const abs = path.join(REPO, file);
  const mod = await import(pathToFileURL(abs).href);
  return Object.keys(mod).sort();
}

// The HARD GATE, pure + testable: a guide's claimed export names must EXACTLY equal the module's real export set.
export function exportGate(claimed, real) {
  const c = [...claimed].sort(); const r = [...real].sort();
  const missing = r.filter((x) => !c.includes(x));   // real exports the guide forgot
  const invented = c.filter((x) => !r.includes(x));  // names the guide claims that don't exist
  return { ok: missing.length === 0 && invented.length === 0, missing, invented };
}

function guideBlock(g) {
  return {
    purpose: g.purpose,
    exports: g.exports,
    cliSubcommands: g.cliSubcommands || [],
    invocation: g.invocation || 'both',
    securityBoundary: g.securityBoundary,
    whenToUse: g.whenToUse,
    gotchas: g.gotchas || [],
    _authored: '2026-06-09 main-session (source-grounded)',
  };
}

async function main() {
  const raw = fs.readFileSync(GRAPH, 'utf8');
  const indent = detectIndent(raw);
  const graph = JSON.parse(raw);
  const guides = JSON.parse(fs.readFileSync(GUIDES, 'utf8')).guides;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const report = [];
  let failed = 0; let created = 0; let seeded = 0;

  for (const g of guides) {
    const existing = byId.get(g.nodeId);
    // Resolve the module path from the AUTHORITATIVE node (existing node's files, or the newNode block),
    // not a guess — organs live under Scripts/ and Scripts/math/.
    const file = (existing?.mechanism?.files || existing?.flow?.files || g.newNode?.files || [`_SYSTEM/Scripts/${g.nodeId}.mjs`])[0];
    // HARD GATE: guide.exports[].name must EXACTLY equal the module's real export set.
    let real;
    try { real = await realExports(file); } catch (e) { report.push(`FAIL ${g.nodeId}: cannot import ${file} (${e.message})`); failed += 1; continue; }
    const claimed = (g.exports || []).map((e) => e.name);
    const gate = exportGate(claimed, real);
    if (!gate.ok) {
      report.push(`FAIL ${g.nodeId}: export drift — missing=[${gate.missing.join(',')}] invented=[${gate.invented.join(',')}]`);
      failed += 1; continue;
    }

    let node = byId.get(g.nodeId);
    if (!node) {
      if (!g.newNode) { report.push(`FAIL ${g.nodeId}: node missing and no newNode block to create it`); failed += 1; continue; }
      node = { id: g.nodeId, tiers: ['mechanism'], flow: null, mechanism: { label: g.newNode.label, layer: g.newNode.layer, files: g.newNode.files, triggeredBy: g.newNode.triggeredBy, description: g.newNode.description }, label: g.newNode.label };
      if (!CHECK) { graph.nodes.push(node); byId.set(g.nodeId, node); }
      created += 1;
      report.push(`CREATE ${g.nodeId}: new canonical node (${file})  exports OK (${real.length})`);
    } else {
      report.push(`SEED   ${g.nodeId}: exports OK (${real.length})`);
    }
    if (!CHECK) {
      node.mechanism = node.mechanism || {};
      // A newNode entry OWNS its node's identity (organ-guides.json is the source) — idempotently sync the
      // core mechanism fields on every seed so an authored fix (e.g. a corrected layer) propagates forward.
      if (g.newNode) {
        node.label = g.newNode.label;
        node.tiers = node.tiers && node.tiers.length ? node.tiers : ['mechanism'];
        Object.assign(node.mechanism, { label: g.newNode.label, layer: g.newNode.layer, files: g.newNode.files, triggeredBy: g.newNode.triggeredBy, description: g.newNode.description });
      }
      node.mechanism.guide = guideBlock(g);
    }
    seeded += 1;
  }

  process.stdout.write(report.join('\n') + '\n');
  process.stdout.write(`\n${CHECK ? 'CHECK' : 'SEEDED'}: ${seeded} guides (${created} new nodes), ${failed} failed, total nodes ${graph.nodes.length}\n`);

  if (failed) { process.stderr.write(`GATE FAILED: ${failed} guide(s) failed the export-match gate — nothing written.\n`); process.exit(1); }
  if (!CHECK) {
    if (graph.generatedAt !== undefined) graph._guidesSeededNote = 'organ guides seeded by yuri-guide-seed.mjs from _SYSTEM/organ-guides.json';
    fs.writeFileSync(GRAPH, JSON.stringify(graph, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
    process.stdout.write(`WROTE ${path.relative(REPO, GRAPH)} (indent preserved: ${JSON.stringify(indent)})\n`);
  }
}

// CLI-only — importing this module (tests/callers) must NOT mutate the canonical graph.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { process.stderr.write(`yuri-guide-seed fatal: ${e.message}\n`); process.exit(1); });
}
