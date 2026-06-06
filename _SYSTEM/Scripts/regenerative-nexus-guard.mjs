#!/usr/bin/env node
/**
 * regenerative-nexus-guard.mjs — PHASE 1 (READ-ONLY DETECTOR) of the Regenerative Nexus Guard.
 *
 * Detects "built-but-unwired" YURI artifacts: an artifact is UNWIRED when it exists in the built
 * set (disk) but has no required edge in the declared wiring set (registries / manuals / graph /
 * settings / commands). Wraps circuitry-auto-register.mjs (similarity/test-cover substrate) and the
 * declarative contract in nexus-guard-contracts.json. Design: [[regenerative-nexus-guard-2026-06-06]].
 *
 * DETECTION CLASSES (design A–G):
 *   A orphan export   — exported symbol referenced by no other scanned file        (textual, LOW conf)
 *   B orphan module   — no import path from any entrypoint                         (import-graph, MED conf)
 *   C test no-cover   — .test.mjs resolves to no module (or fingerprint MISMATCH)  (matcher, HIGH conf)
 *   D math unregistered — _SYSTEM/Scripts/math/*.mjs absent from manual AND graph   (set-diff, HIGH conf)
 *   E alias no-command — skill /alias trigger with no .claude/commands/<alias>.md  (set-diff, HIGH conf)
 *   F hook not-in-settings — .claude/hooks/* not referenced in settings.json        (set-diff, HIGH conf)
 *   G ungraphed node  — core module absent from yuri-circuitry-graph nodes[].files (set-diff, HIGH conf)
 *
 * READ-ONLY: scans + emits a JSON report + human summary. It writes NO canonical surface. The only
 * proposed mutation is class-E command-shim scaffolding, surfaced as `safeAutoWire` proposals for the
 * OWNER-GATED phase 2 — this file does not apply them. Everything else → owner review packet.
 *
 * Deterministic, embedding-free, no wall-clock in the core (CLI stamps generatedAt). Pure detection
 * functions are exported and unit-tested; disk-reading wrappers compose them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCircuitryRecords, resolveTestsCover, listMjs } from './circuitry-auto-register.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// ── protected-path guard (mirror of the substrate — never read protected surfaces) ───────────────
const PROTECTED_PREFIXES = ['backend/data/', '.claude/state/', '.claude/history/', '.claude/file-history/', '.claude/projects/', '.env', 'node_modules/', '.amp/'];
const toRel = (p) => p.split(path.sep).join('/');
/** Collapse ./ and ../ to a forward-slash repo-relative path so a protected-prefix check cannot be
 *  bypassed by a `./.env`-style prefix (Codex C3 fail-open fix). */
export function normalizeRel(rel) {
  return toRel(path.normalize(rel)).replace(/^(\.\/)+/, '');
}
export function isProtectedRel(rel) {
  if (path.isAbsolute(rel)) return true;               // fail-closed: absolute paths are out of bounds
  const n = normalizeRel(rel);
  if (n === '..' || n.startsWith('../')) return true;  // fail-closed: escapes the repo root
  return PROTECTED_PREFIXES.some((p) => n === p.replace(/\/$/, '') || n.startsWith(p));
}
function assertContained(abs, label = 'path') {
  const realRoot = fs.realpathSync(REPO_ROOT);
  let real; try { real = fs.realpathSync(abs); } catch { return abs; }
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw new Error(`${label} escapes repo: ${abs}`);
  return real;
}
function readText(rel) {
  if (isProtectedRel(rel)) return '';
  const abs = path.join(REPO_ROOT, rel);
  try { assertContained(abs, 'read'); return fs.readFileSync(abs, 'utf8'); } catch { return ''; }
}
function existsRel(rel) {
  if (isProtectedRel(rel)) return false;
  try { assertContained(path.join(REPO_ROOT, rel), 'exists'); return fs.existsSync(path.join(REPO_ROOT, rel)); } catch { return false; }
}

// ── contract loading (fallback to a minimal default if the file is absent/corrupt) ───────────────
const DEFAULT_CONTRACT = {
  version: 1,
  registries: {
    circuitryGraph: '02_RESOURCES/RESEARCH/yuri-circuitry-graph.json',
    mathManual: '02_RESOURCES/RESEARCH/MATH-SCIENCE-MANUAL.md',
    settings: '.claude/settings.json',
    commandsDir: '.claude/commands',
    hooksDir: '.claude/hooks',
    skillDirs: ['.claude/skills', '.agents/skills'],
  },
  scope: { coreRoots: ['_SYSTEM/Scripts/math', '_SYSTEM/Scripts/self-improvement'], allRoots: ['_SYSTEM/Scripts'] },
  domains: {},
  filenameExemptions: { rules: [] },
  pathExemptions: { rules: [] },
};
export function loadContract(rel = '_SYSTEM/Scripts/nexus-guard-contracts.json') {
  const txt = readText(rel);
  // C3/C5 fail-open fix: a missing/corrupt contract must surface LOUDLY (a finding), not run silently
  // on DEFAULT_CONTRACT with no exemptions/scope. validateExemptions reads __diagnostics.
  const fallback = (reason) => ({ ...DEFAULT_CONTRACT, __diagnostics: [{ code: 'contract-load-fallback', reason, rel }] });
  if (!txt) return fallback('missing-or-unreadable');
  let c; try { c = JSON.parse(txt); } catch (e) { return fallback(`corrupt-json:${e.message}`); }
  // merge so a partial contract still has scope/registries
  return {
    ...DEFAULT_CONTRACT, ...c,
    registries: { ...DEFAULT_CONTRACT.registries, ...(c.registries || {}) },
    scope: { ...DEFAULT_CONTRACT.scope, ...(c.scope || {}) },
    filenameExemptions: c.filenameExemptions || DEFAULT_CONTRACT.filenameExemptions,
    pathExemptions: c.pathExemptions || DEFAULT_CONTRACT.pathExemptions,
  };
}

/** Is `rel` exempt for detection class `cls`? Returns {exempt, reason} (filename-regex OR explicit path). */
export function isExempt(rel, cls, contract) {
  const n = toRel(rel);
  const classMatches = (classes) => !classes || classes === '*' || (Array.isArray(classes) && (classes.includes(cls) || classes.includes('*')));
  const safeTest = (pattern, value) => { try { return new RegExp(pattern).test(value); } catch { return false; } }; // C3/C5: bad regex never exempts (fail-closed)
  for (const r of (contract.filenameExemptions?.rules || [])) {
    if (classMatches(r.classes) && safeTest(r.match, n)) return { exempt: true, reason: r.reason || 'filename-exempt' };
  }
  for (const r of (contract.pathExemptions?.rules || [])) {
    if (classMatches(r.classes) && (r.path === n || (r.match && safeTest(r.match, n)))) return { exempt: true, reason: r.reason || 'path-exempt' };
  }
  return { exempt: false };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
//  PURE DETECTION PRIMITIVES (no disk; unit-tested directly)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** E — declared /aliases minus existing command files. skills: [{rel, name, aliases[]}], commandSet: Set<alias>. */
export function detectAliasGap(skills, commandSet) {
  const out = [];
  for (const s of skills) {
    // INTERNALISED skills are invoked by the model/framework via the Skill tool, not typed by a user —
    // their /aliases are model-routing handles, NOT user commands, so they need no .claude/commands file.
    if (s.invocation === 'model' || s.invocation === 'gate') continue;
    for (const alias of s.aliases) {
      if (!commandSet.has(alias)) out.push({ cls: 'E', code: 'alias-no-command', severity: 'low', confidence: 'HIGH',
        artifact: s.rel, alias, detail: `skill declares trigger /${alias} but .claude/commands/${alias}.md is absent`,
        safeAutoWire: { kind: 'missing-command-shim', target: `.claude/commands/${alias}.md`, alias, skill: s.name } });
    }
  }
  return out;
}

/** F — hook files minus settings-referenced basenames. hookFiles: [rel], settingsRefs: Set<basename>. */
export function detectHookGap(hookFiles, settingsRefs) {
  const out = [];
  for (const rel of hookFiles) {
    const base = rel.split('/').pop();
    if (!settingsRefs.has(base)) out.push({ cls: 'F', code: 'hook-not-in-settings', severity: 'high', confidence: 'HIGH',
      artifact: rel, detail: `hook file present but not referenced in .claude/settings.json (unwired-new | retired-but-present | library-helper — owner classifies)`,
      ownerGated: 'settings-registration' });
  }
  return out;
}

/** D — disk math basenames minus (manual ∪ graph) basenames. */
export function detectMathUnregistered(diskBasenames, wiredBasenames, testedBasenames = new Set()) {
  const out = [];
  for (const base of diskBasenames) {
    if (!wiredBasenames.has(base)) {
      const promoted = testedBasenames.has(base);
      out.push({ cls: 'D', code: 'math-module-unregistered', severity: promoted ? 'high' : 'medium', confidence: 'HIGH',
        artifact: `_SYSTEM/Scripts/math/${base}`,
        detail: `math module on disk but absent from MATH-SCIENCE-MANUAL.md AND the circuitry graph${promoted ? ' — yet a test exists (implementation promoted locally, never documented)' : ''}` });
    }
  }
  return out;
}

/** G — core module rels minus graph-covered file set. */
export function detectGraphGap(moduleRels, graphFileSet) {
  const out = [];
  for (const rel of moduleRels) {
    if (!graphFileSet.has(toRel(rel))) out.push({ cls: 'G', code: 'node-absent-from-graph', severity: 'medium', confidence: 'HIGH',
      artifact: toRel(rel), detail: 'core module not represented by any node in yuri-circuitry-graph.json (graph regen candidate — owner-gated add-only merge)', ownerGated: 'graph-node-add' });
  }
  return out;
}

/** B — modules unreachable from the entrypoint seed set over the import edge map.
 *  edges: Map<rel, Set<rel>> importer→imported. seeds: Set<rel>. universe: rel[] (the core modules judged). */
export function reachableFrom(edges, seeds) {
  const seen = new Set(); const stack = [...seeds];
  while (stack.length) { const n = stack.pop(); if (seen.has(n)) continue; seen.add(n);
    for (const m of (edges.get(n) || [])) if (!seen.has(m)) stack.push(m); }
  return seen;
}
export function detectOrphanModules(universe, edges, seeds) {
  const reach = reachableFrom(edges, seeds);
  return universe.filter((rel) => !reach.has(rel)).map((rel) => ({ cls: 'B', code: 'orphan-module', severity: 'medium', confidence: 'MEDIUM',
    artifact: toRel(rel), detail: 'no import path from any entrypoint (settings hook / CLI main-guard / test / graph node / ai facade); GitNexus call-graph is the structural upgrade' }));
}

/** A — exported symbols referenced (textually) by no file other than their own. refMap: Map<symbol, Set<file>>. */
export function detectOrphanExports(exports, refMap) {
  const out = [];
  for (const e of exports) {
    const files = refMap.get(e.name);
    const externallyReferenced = files && [...files].some((f) => f !== e.rel);
    if (e.name.length < 4 && externallyReferenced) continue; // C2: short names only ambiguous when something else textually references them
    if (!externallyReferenced) out.push({ cls: 'A', code: 'orphan-export', severity: 'low', confidence: 'LOW', method: 'textual-zero-reference',
      artifact: `${toRel(e.rel)}:${e.name}`, detail: `exported symbol referenced in no other scanned file (textual scan; GitNexus in-degree is the structural check — never delete on this signal alone)` });
  }
  return out;
}

/** C — uncovered tests + fingerprint mismatches → findings. coverEdges/mismatches from resolveTestsCover. */
export function detectTestCoverGap(coverEdges, mismatches) {
  const out = [];
  for (const e of coverEdges) if (e.confidence === 'NONE') out.push({ cls: 'C', code: 'test-no-cover', severity: 'medium', confidence: 'HIGH',
    artifact: e.test, detail: 'test resolves to no module by import, name, or matcher' });
  for (const m of mismatches) out.push({ cls: 'C', code: 'test-mismatch', severity: 'medium', confidence: 'MEDIUM',
    artifact: m.test, detail: `test claims ${m.claims} but its text fingerprint points to ${m.fingerprintTop} (${(m.topScore ?? 0).toFixed(3)}) — proof may be attached to the wrong organ` });
  return out;
}

/** Tension scalar (folded from DeepSeek lane DS2; residual + fail-closed hardening from Codex C4).
 *  T is log-compressed PER SEVERITY TIER so SEVERITY dominates COUNT — a pile of LOW-confidence class-A
 *  findings (S_low even at 500 → 1·log10(501)≈2.7) cannot drown a single HIGH finding (10·log10(2)≈3.0).
 *  The raw hi/med/lo COUNTS are the L∞ floor: they catch any swap that SHIFTS the severity distribution
 *  (a high→medium swap drops `hi`), which the partition-fungible SUM alone misses (see
 *  [[delta-gate-severity-laundering]]). HONEST RESIDUAL (Codex C4): an INTRA-tier identity swap (remove
 *  one high, add a DIFFERENT high) leaves every count unchanged — the scalar cannot see it; the
 *  report-level per-artifact finding set is what carries identity. The floor is a DISTRIBUTION
 *  invariant, not an identity invariant. riskMultiplier doubles mutation surfaces (hooks/settings).
 *  FAIL-CLOSED: an unknown severity/confidence is bucketed to the WORST case (high / 1.0) so a typo
 *  surfaces loudly instead of silently downgrading. Age/centrality/churn is the phase-2 fold (DS1). */
const TIER_SEVERITY = { high: 10, medium: 5, low: 1 };
const CONFIDENCE_W = { HIGH: 1.0, MEDIUM: 0.5, LOW: 0.15 };
function riskMultiplier(f) { return f.cls === 'F' ? 2.0 : 1.0; }
export function computeTension(findings) {
  const S = { high: 0, medium: 0, low: 0 };
  const count = { high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    const tier = f.severity in S ? f.severity : 'high';                              // fail-closed: unknown → worst
    const conf = f.confidence in CONFIDENCE_W ? CONFIDENCE_W[f.confidence] : 1.0;     // fail-closed: unknown → worst
    S[tier] += conf * riskMultiplier(f);
    count[tier] += 1;
  }
  const T = ['high', 'medium', 'low'].reduce((acc, t) => acc + TIER_SEVERITY[t] * Math.log10(1 + S[t]), 0);
  return { T: Math.round(T * 1000) / 1000, hi: count.high, med: count.medium, lo: count.low };
}

/** Exemption hygiene (DS1): an exemption with no reason is itself debt; an exemption past its reviewBy
 *  re-enters the finding set. `now` (ISO string) gates the expiry check; null skips it (keeps pure). */
export function validateExemptions(contract, now = null) {
  const out = [];
  // C3/C5: a corrupt/missing contract fell back silently → surface it LOUDLY (high)
  for (const d of (contract.__diagnostics || [])) out.push({ cls: 'H', code: d.code, severity: 'high', confidence: 'HIGH',
    artifact: `contract:${d.rel}`, detail: `contract did not load (${d.reason}) — running on DEFAULT_CONTRACT, no custom exemptions/scope` });
  const all = [...(contract.filenameExemptions?.rules || []), ...(contract.pathExemptions?.rules || [])];
  for (const r of all) {
    const id = r.path || r.match || 'rule';
    if (!r.reason) out.push({ cls: 'H', code: 'exemption-no-reason', severity: 'medium', confidence: 'HIGH',
      artifact: `contract:${id}`, detail: 'exemption rule carries no reason — an unreasoned exemption is silent debt, not a suppression' });
    if (r.match) { try { new RegExp(r.match); } catch (e) { out.push({ cls: 'H', code: 'exemption-invalid-regex', severity: 'medium', confidence: 'HIGH',
      artifact: `contract:${id}`, detail: `exemption match is not a valid regex: ${e.message}` }); } }
    if (r.path && !r.owner) out.push({ cls: 'H', code: 'exemption-no-owner', severity: 'low', confidence: 'HIGH',
      artifact: `contract:${id}`, detail: 'path exemption has no owner — accountability gap' });
    if (r.path && !r.reviewBy) out.push({ cls: 'H', code: 'exemption-no-reviewBy', severity: 'low', confidence: 'HIGH',
      artifact: `contract:${id}`, detail: 'path exemption has no reviewBy lease — exemptions must expire' });
    if (r.reviewBy && Number.isNaN(Date.parse(r.reviewBy))) out.push({ cls: 'H', code: 'exemption-bad-reviewBy', severity: 'medium', confidence: 'HIGH',
      artifact: `contract:${id}`, detail: `reviewBy is not a parseable date: ${r.reviewBy}` });
    else if (now && r.reviewBy && String(r.reviewBy) < String(now)) out.push({ cls: 'H', code: 'exemption-expired', severity: 'medium', confidence: 'HIGH',
      artifact: `contract:${id}`, detail: `exemption past reviewBy ${r.reviewBy} — re-enters the finding set; owner extends the lease or resolves the artifact` });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
//  DISK-READING COLLECTORS (compose the registries into the pure primitives' inputs)
// ════════════════════════════════════════════════════════════════════════════════════════════════

/** Parse a SKILL.md frontmatter block → {name, aliases[]} (aliases = /xxx triggers). Embedding-free YAML-lite. */
export function parseSkillFrontmatter(src) {
  const fm = src.match(/^---\n([\s\S]*?)\n---/);
  const name = (src.match(/^name:\s*(.+)$/m) || [])[1]?.trim() || null;
  const invocation = fm ? ((fm[1].match(/^invocation:\s*(\w+)/m) || [])[1]?.trim().toLowerCase() || null) : null;
  const aliases = [];
  if (fm) {
    // collect under a `triggers:` block (list items) AND any inline `/alias` in the frontmatter
    const lines = fm[1].split('\n'); let inTriggers = false;
    for (const ln of lines) {
      if (/^triggers:\s*$/.test(ln)) { inTriggers = true; continue; }
      if (inTriggers) {
        const m = ln.match(/^\s*-\s*\/([a-z0-9][a-z0-9-]*)\s*$/i);
        if (m) { aliases.push(m[1].toLowerCase()); continue; }
        if (/^\S/.test(ln)) inTriggers = false; // dedent → block ended
      }
    }
  }
  return { name, aliases: [...new Set(aliases)], invocation };
}

function collectSkills(contract) {
  const out = [];
  for (const dir of contract.registries.skillDirs) {
    const abs = path.join(REPO_ROOT, dir);
    let entries; try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const rel = `${dir}/${e.name}/SKILL.md`;
      const src = readText(rel); if (!src) continue;
      const { name, aliases, invocation } = parseSkillFrontmatter(src);
      if (aliases.length) out.push({ rel, name: name || e.name, aliases, invocation });
    }
  }
  return out;
}
function commandSet(contract) {
  const abs = path.join(REPO_ROOT, contract.registries.commandsDir);
  let names = []; try { names = fs.readdirSync(abs); } catch { /* none */ }
  return new Set(names.filter((n) => n.endsWith('.md')).map((n) => n.replace(/\.md$/, '').toLowerCase()));
}
function hookFilesAndRefs(contract) {
  const abs = path.join(REPO_ROOT, contract.registries.hooksDir);
  let entries = []; try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { /* none */ }
  const hookFiles = entries.filter((e) => e.isFile() && /\.(js|mjs|cjs)$/.test(e.name)).map((e) => `${contract.registries.hooksDir}/${e.name}`);
  const settings = readText(contract.registries.settings);
  const refs = new Set();
  for (const m of settings.matchAll(/[A-Za-z0-9_.-]+\.(?:js|mjs|cjs)/g)) refs.add(m[0]);
  return { hookFiles, settingsRefs: refs };
}
function graphFileSet(contract) {
  const txt = readText(contract.registries.circuitryGraph);
  const set = new Set(); let g;
  try { g = JSON.parse(txt); } catch { return set; }
  for (const n of (g.nodes || [])) for (const f of (n.files || [])) set.add(toRel(f));
  return set;
}
function mathRegistries(contract) {
  const manual = readText(contract.registries.mathManual);
  const manualBases = new Set([...manual.matchAll(/[A-Za-z0-9_.-]+\.mjs/g)].map((m) => m[0]));
  const graphBases = new Set([...graphFileSet(contract)].filter((p) => p.includes('/math/')).map((p) => p.split('/').pop()));
  return new Set([...manualBases, ...graphBases]);
}

/** Registry health (Codex C3 fail-open fix): a conformance tool that reads an empty/corrupt registry
 *  silently UNDER-reports ("0 findings, clean") — the dangerous failure mode. Surface it as a finding. */
function checkRegistries(contract) {
  const out = [], reg = contract.registries;
  const checkFile = (rel, label, parse) => {
    const txt = readText(rel);
    if (!txt) { out.push({ cls: 'H', code: 'registry-missing', severity: 'high', confidence: 'HIGH', artifact: rel,
      detail: `${label} registry missing/unreadable — the guard would fail OPEN (under-report) without it` }); return; }
    if (parse) try { JSON.parse(txt); } catch (e) { out.push({ cls: 'H', code: 'registry-corrupt', severity: 'high', confidence: 'HIGH', artifact: rel,
      detail: `${label} registry is corrupt JSON (${e.message}) — guard fails OPEN` }); }
  };
  checkFile(reg.circuitryGraph, 'circuitry-graph', true);
  checkFile(reg.settings, 'settings.json', true);
  checkFile(reg.mathManual, 'math-manual', false);
  for (const [dir, label] of [[reg.commandsDir, 'commands-dir'], [reg.hooksDir, 'hooks-dir']]) {
    if (!existsRel(dir)) out.push({ cls: 'H', code: 'registry-missing', severity: 'medium', confidence: 'HIGH', artifact: dir, detail: `${label} missing — class E/F under-report` });
  }
  return out;
}

/** Resolve a relative import specifier (from importerRel) to a repo-relative .mjs path, or null. */
export function resolveImport(importerRel, spec) {
  if (!spec.startsWith('.')) return null;
  const baseAbs = path.resolve(REPO_ROOT, path.dirname(importerRel), spec);
  for (const cand of [baseAbs, baseAbs + '.mjs', baseAbs + '.js', path.join(baseAbs, 'index.mjs')]) {
    const rel = toRel(path.relative(REPO_ROOT, cand));
    if (rel.endsWith('.mjs') || rel.endsWith('.js')) { if (existsRel(rel)) return rel; }
  }
  return null;
}
function buildImportGraph(allRels) {
  const edges = new Map();
  const IMPORT_RE = /import\b[^'"]*from\s+['"]([^'"]+)['"]/g;
  const SIDE_EFFECT_IMPORT_RE = /import\s+['"]([^'"]+)['"]/g;        // C2: `import './x'` side-effect import
  const EXPORT_FROM_RE = /export\b[^'"]*from\s+['"]([^'"]+)['"]/g;   // C2: `export {x} from './y'` re-export edge
  const DYN_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const rel of allRels) {
    const src = readText(rel); const set = new Set();
    for (const re of [IMPORT_RE, SIDE_EFFECT_IMPORT_RE, EXPORT_FROM_RE, DYN_RE]) { re.lastIndex = 0; let m; while ((m = re.exec(src))) { const r = resolveImport(rel, m[1]); if (r) set.add(r); } }
    edges.set(rel, set);
  }
  return edges;
}
function hasMainGuard(src, rel = '') {
  const base = rel.split('/').pop();
  return /import\.meta\.url\s*===\s*`file:\/\/\$\{process\.argv\[1\]\}`/.test(src)
    || (/process\.argv\[1\]/.test(src) && /import\.meta\.url/.test(src))
    || (src.startsWith('#!') && !!base && src.includes('process.argv[1]') && src.includes(base)); // C2: shebang CLI entrypoint
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
//  REPORT BUILDER (pure over collected inputs) + top-level run()
// ════════════════════════════════════════════════════════════════════════════════════════════════

export function buildReport(inputs, contract, now = null) {
  const { skills, commands, hookFiles, settingsRefs, mathDisk, mathTested, mathWired, coreModuleRels, graphFiles,
          coverEdges, mismatches, orphanModuleFindings, orphanExportFindings, registryHealth } = inputs;

  const raw = [
    ...(registryHealth || []),
    ...detectAliasGap(skills, commands),
    ...detectHookGap(hookFiles, settingsRefs),
    ...detectMathUnregistered(mathDisk, mathWired, mathTested),
    ...detectGraphGap(coreModuleRels, graphFiles),
    ...detectTestCoverGap(coverEdges, mismatches),
    ...orphanModuleFindings,
    ...orphanExportFindings,
    ...validateExemptions(contract, now),
  ];
  // apply exemptions (by artifact path, stripping any :symbol suffix)
  const findings = [], exemptionsApplied = [];
  for (const f of raw) {
    const artPath = String(f.artifact).split(':')[0];
    const ex = isExempt(artPath, f.cls, contract);
    if (ex.exempt) { exemptionsApplied.push({ ...f, exemptReason: ex.reason }); continue; }
    findings.push(f);
  }
  const sevRank = { high: 0, medium: 1, low: 2 };
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);  // C4: total comparator — returns 0 on equality so the sort is stable/deterministic
  findings.sort((a, b) =>
    ((sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3)) ||
    cmp(a.cls, b.cls) || cmp(a.artifact, b.artifact) || cmp(a.code || '', b.code || '') || cmp(a.alias || '', b.alias || ''));

  const byClass = {}; for (const f of findings) byClass[f.cls] = (byClass[f.cls] || 0) + 1;
  const highConfidence = findings.filter((f) => f.confidence === 'HIGH').length;
  const lowConfidence = findings.filter((f) => f.confidence === 'LOW').length;
  const seenWire = new Set();  // C1: dedupe shim proposals by target (the .agents + .claude skill mirrors share an alias)
  const safeAutoWire = findings.filter((f) => f.safeAutoWire).map((f) => f.safeAutoWire)
    .filter((w) => (seenWire.has(w.target) ? false : (seenWire.add(w.target), true)));

  return {
    version: 1,
    phase: '1-read-only-detector',
    summary: {
      total: findings.length, byClass, highConfidence, lowConfidence,
      tension: computeTension(findings),
      exemptionsApplied: exemptionsApplied.length,
      safeAutoWireProposed: safeAutoWire.length,
    },
    findings,
    safeAutoWire,
    exemptionsApplied,
    notes: [
      'READ-ONLY: no canonical surface was written. safeAutoWire entries are PROPOSALS for the owner-gated phase 2, not applied.',
      'Classes C/D/E/F/G are deterministic set-differences (HIGH confidence). Class B is import-graph-derived (MEDIUM). Class A is a textual zero-reference scan (LOW) — GitNexus call-graph/in-degree is the phase-2 structural upgrade. Class H is exemption hygiene.',
      'tension.T is log-compressed per severity tier (severity dominates count). tension.hi/med/lo are raw counts — the non-offsettable L∞ floor: a wired↔unwired swap within a tier cannot launder them. Read hi first.',
      'PHASE-2 (folded research, parked): git-derived age + Tarjan betweenness centrality + churn weighting (S_c = Σ confidence·age·centrality·churn); GitNexus DSM reachability promoting class A/B from textual→structural on the top-N batches; root-cause batching; exemption sunset/saturation alarm. Grounded in the reflexion-model conformance literature (DS1).',
    ],
  };
}

export function run({ coreRoots, full = false, now = null } = {}) {
  const contract = loadContract();
  const roots = full ? contract.scope.allRoots : (coreRoots || contract.scope.coreRoots);
  const registryHealth = checkRegistries(contract);

  // E / F / D — registries
  const skills = collectSkills(contract);
  const commands = commandSet(contract);
  const { hookFiles, settingsRefs } = hookFilesAndRefs(contract);
  const mathDiskAll = listMjs(path.join(REPO_ROOT, '_SYSTEM/Scripts/math'), { includeTests: false }).map((r) => r.split('/').pop());
  const mathDisk = mathDiskAll.filter((b) => !isExempt(`_SYSTEM/Scripts/math/${b}`, 'D', contract).exempt);
  const mathTested = new Set(listMjs(path.join(REPO_ROOT, '_SYSTEM/Scripts/math'), { includeTests: true })
    .filter((r) => /\.test\.mjs$/.test(r)).map((r) => r.split('/').pop().replace(/\.test\.mjs$/, '.mjs')));
  const mathWired = mathRegistries(contract);

  // G / C / B / A — core-scoped circuitry records
  const { modules, symbols, tests } = extractCircuitryRecords({ roots });
  const graphFiles = graphFileSet(contract);
  const coreModuleRels = modules.map((m) => m.rel).filter((rel) => !isExempt(rel, 'G', contract).exempt);

  const { edges: coverEdges, mismatches } = resolveTestsCover(tests, modules);

  // B: import graph over modules+tests; seeds = graphed ∪ settings-referenced ∪ CLI-main-guard ∪ test-imported
  const allRels = [...modules.map((m) => m.rel), ...tests.map((t) => t.rel)];
  const edges = buildImportGraph(allRels);
  const seeds = new Set();
  for (const rel of allRels) {
    if (graphFiles.has(toRel(rel))) seeds.add(rel);
    if (settingsRefs.has(rel.split('/').pop())) seeds.add(rel);
    if (/\.test\.mjs$/.test(rel)) { seeds.add(rel); continue; }
    const src = readText(rel); if (hasMainGuard(src, rel)) seeds.add(rel);
  }
  // entrypoint seed: modules referenced in package.json scripts (DS1 class-B over-fire gate)
  try {
    const pkg = JSON.parse(readText('package.json') || '{}');
    const scriptText = Object.values(pkg.scripts || {}).join(' ');
    for (const m of scriptText.matchAll(/[\w./-]+\.mjs/g)) {
      const rel = toRel(m[0]).replace(/^\.\//, '');
      if (allRels.includes(rel)) seeds.add(rel);
    }
  } catch { /* no package scripts */ }
  const bUniverse = modules.map((m) => m.rel).filter((rel) => !isExempt(rel, 'B', contract).exempt && !/\.test\.mjs$/.test(rel));
  const orphanModuleFindings = detectOrphanModules(bUniverse, edges, seeds);

  // A: textual reference map over all core source (modules+tests), then orphan exports of non-exempt modules
  const refMap = new Map();
  const IDENT_RE = /[A-Za-z_$][\w$]*/g;
  for (const rel of allRels) {
    const src = readText(rel); const seen = new Set();
    for (const m of src.matchAll(IDENT_RE)) seen.add(m[0]);
    for (const id of seen) { if (!refMap.has(id)) refMap.set(id, new Set()); refMap.get(id).add(rel); }
  }
  const exportList = symbols.filter((s) => !isExempt(s.rel, 'A', contract).exempt).map((s) => ({ name: s.name, rel: s.rel }));
  const orphanExportFindings = detectOrphanExports(exportList, refMap);

  return buildReport({
    skills, commands, hookFiles, settingsRefs,
    mathDisk, mathTested, mathWired,
    coreModuleRels, graphFiles,
    coverEdges, mismatches, orphanModuleFindings, orphanExportFindings,
    registryHealth,
  }, contract, now);
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const full = process.argv.includes('--full');
  const jsonIdx = process.argv.indexOf('--json');
  const now = new Date().toISOString();
  const report = run({ full, now });
  const stamped = { ...report, generatedAt: now, scope: full ? 'all-roots' : 'core-roots' };

  const s = report.summary;
  console.log(`\n⬡ regenerative-nexus-guard  (PHASE 1 · READ-ONLY)  scope=${stamped.scope}`);
  console.log(`  findings: ${s.total}  (${s.highConfidence} HIGH-confidence · ${s.lowConfidence} LOW-confidence)`);
  console.log(`  by class: ${Object.entries(s.byClass).map(([k, v]) => `${k}=${v}`).join(' · ') || 'none'}`);
  console.log(`  wiring tension: T=${s.tension.T}  ·  L∞ floor hi=${s.tension.hi} med=${s.tension.med} lo=${s.tension.lo}`);
  console.log(`  exemptions applied: ${s.exemptionsApplied}  ·  safe auto-wire proposed: ${s.safeAutoWireProposed}`);
  const CLASS_NAME = { A: 'orphan-export', B: 'orphan-module', C: 'test-no-cover', D: 'math-unregistered', E: 'alias-no-command', F: 'hook-not-in-settings', G: 'node-absent-from-graph', H: 'exemption-hygiene' };
  for (const cls of ['F', 'D', 'C', 'E', 'G', 'H', 'B', 'A']) {
    const fs_ = report.findings.filter((f) => f.cls === cls); if (!fs_.length) continue;
    console.log(`\n  [${cls}] ${CLASS_NAME[cls]} (${fs_.length}):`);
    for (const f of fs_.slice(0, 12)) console.log(`    ${f.severity.padEnd(6)} ${f.confidence.padEnd(6)} ${f.artifact}${f.alias ? '  →/' + f.alias : ''}`);
    if (fs_.length > 12) console.log(`    … +${fs_.length - 12} more (see JSON)`);
  }
  if (jsonIdx >= 0) {
    const out = process.argv[jsonIdx + 1] || '02_RESOURCES/RESEARCH/nexus-guard-report.json';
    fs.writeFileSync(path.join(REPO_ROOT, out), JSON.stringify(stamped, null, 2));
    console.log(`\n  JSON report → ${out}`);
  }
  console.log('');
}
