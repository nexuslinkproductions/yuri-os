#!/usr/bin/env node
/**
 * regenerative-nexus-guard.test.mjs — unit suite over the PURE detection primitives (no disk).
 * Covers each class's set-difference, import reachability, the tension scalar (log-compression +
 * L∞ floor + swap behavior), exemption hygiene, and buildReport integration + determinism.
 */
import {
  detectAliasGap, detectHookGap, detectMathUnregistered, detectGraphGap,
  reachableFrom, detectOrphanModules, detectOrphanExports, detectTestCoverGap,
  computeTension, validateExemptions, isExempt, parseSkillFrontmatter, buildReport,
  normalizeRel, isProtectedRel,
} from './regenerative-nexus-guard.mjs';

let pass = 0, fail = 0;
const ok = (c, n) => { if (c) pass++; else { fail++; console.log(`  FAIL ${n}`); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

// ── E: alias gap ─────────────────────────────────────────────────────────────────────────────────
{
  const skills = [{ rel: 's/SKILL.md', name: 's', aliases: ['have', 'gap'] }];
  const out = detectAliasGap(skills, new Set(['have']));
  ok(out.length === 1, 'E: only the missing alias is flagged');
  ok(out[0].alias === 'gap' && out[0].cls === 'E', 'E: flags the right alias');
  ok(out[0].safeAutoWire && out[0].safeAutoWire.target === '.claude/commands/gap.md', 'E: emits command-shim proposal');
  ok(detectAliasGap(skills, new Set(['have', 'gap'])).length === 0, 'E: no finding when all commands exist');
  // internalised skills (model-invocable / gates) need no command file — their aliases are model-routing handles
  ok(detectAliasGap([{ rel: 'm/SKILL.md', name: 'm', aliases: ['x'], invocation: 'model' }], new Set()).length === 0, 'E: model-invocable skill skipped');
  ok(detectAliasGap([{ rel: 'g/SKILL.md', name: 'g', aliases: ['x'], invocation: 'gate' }], new Set()).length === 0, 'E: gate skill skipped');
  ok(detectAliasGap([{ rel: 'u/SKILL.md', name: 'u', aliases: ['x'], invocation: 'user' }], new Set()).length === 1, 'E: user skill still requires a command file');
}

// ── F: hook gap ──────────────────────────────────────────────────────────────────────────────────
{
  const out = detectHookGap(['.claude/hooks/a.js', '.claude/hooks/b.mjs'], new Set(['a.js']));
  ok(out.length === 1 && out[0].artifact === '.claude/hooks/b.mjs', 'F: unreferenced hook flagged');
  ok(out[0].severity === 'high' && out[0].ownerGated === 'settings-registration', 'F: high + owner-gated');
}

// ── D: math unregistered (+ promotion escalation) ──────────────────────────────────────────────────
{
  const disk = ['a.mjs', 'b.mjs', 'c.mjs'];
  const wired = new Set(['a.mjs']);
  const tested = new Set(['b.mjs']);
  const out = detectMathUnregistered(disk, wired, tested);
  ok(out.length === 2, 'D: two unregistered');
  const b = out.find((f) => f.artifact.endsWith('b.mjs'));
  ok(b.severity === 'high', 'D: tested-but-unregistered escalates to high');
  ok(out.find((f) => f.artifact.endsWith('c.mjs')).severity === 'medium', 'D: untested stays medium');
}

// ── G: graph gap ───────────────────────────────────────────────────────────────────────────────────
{
  const out = detectGraphGap(['_SYSTEM/Scripts/math/x.mjs', '_SYSTEM/Scripts/math/y.mjs'], new Set(['_SYSTEM/Scripts/math/x.mjs']));
  ok(out.length === 1 && out[0].artifact.endsWith('y.mjs'), 'G: ungraphed module flagged');
  ok(out[0].ownerGated === 'graph-node-add', 'G: owner-gated graph add');
}

// ── B: reachability + orphan modules ───────────────────────────────────────────────────────────────
{
  // a → b → c ; d is an island ; e → e self-cycle (must not loop forever)
  const edges = new Map([['a', new Set(['b'])], ['b', new Set(['c'])], ['c', new Set()], ['d', new Set()], ['e', new Set(['e'])]]);
  const reach = reachableFrom(edges, new Set(['a']));
  ok(reach.has('a') && reach.has('b') && reach.has('c'), 'B: transitive closure reached');
  ok(!reach.has('d') && !reach.has('e'), 'B: island + unseeded not reached');
  ok(reachableFrom(edges, new Set(['e'])).size === 1, 'B: self-cycle terminates');
  const orphans = detectOrphanModules(['a', 'b', 'c', 'd'], edges, new Set(['a']));
  ok(orphans.length === 1 && orphans[0].artifact === 'd', 'B: only the island is an orphan module');
  ok(orphans[0].confidence === 'MEDIUM', 'B: import-derived → MEDIUM confidence');
}

// ── A: orphan exports (textual zero-reference) ─────────────────────────────────────────────────────
{
  const exports = [{ name: 'computeThing', rel: 'a.mjs' }, { name: 'usedElsewhere', rel: 'a.mjs' }, { name: 'fib', rel: 'a.mjs' }];
  const refMap = new Map([
    ['computeThing', new Set(['a.mjs'])],             // only own file → orphan
    ['usedElsewhere', new Set(['a.mjs', 'b.mjs'])],   // referenced externally → not orphan
    ['fib', new Set(['a.mjs', 'b.mjs'])],             // len<4 AND externally referenced → ambiguous collision, skipped
  ]);
  const out = detectOrphanExports(exports, refMap);
  ok(out.length === 1 && out[0].artifact === 'a.mjs:computeThing', 'A: only the zero-ref long-name export flagged (short ambiguous name skipped)');
  ok(out[0].confidence === 'LOW' && out[0].severity === 'low', 'A: LOW confidence + low severity');
}

// ── C: test cover gap ──────────────────────────────────────────────────────────────────────────────
{
  const coverEdges = [{ test: 't1', confidence: 'HIGH' }, { test: 't2', confidence: 'NONE' }];
  const mismatches = [{ test: 't3', claims: 'm-a', fingerprintTop: 'm-b', topScore: 0.42 }];
  const out = detectTestCoverGap(coverEdges, mismatches);
  ok(out.length === 2, 'C: one uncovered + one mismatch');
  ok(out.find((f) => f.code === 'test-no-cover').artifact === 't2', 'C: NONE → test-no-cover');
  ok(out.find((f) => f.code === 'test-mismatch').confidence === 'MEDIUM', 'C: mismatch → MEDIUM');
}

// ── tension scalar: log-compression (severity dominates count) ─────────────────────────────────────
{
  const oneHigh = computeTension([{ cls: 'D', severity: 'high', confidence: 'HIGH' }]);
  const hundredLow = computeTension(Array.from({ length: 100 }, () => ({ cls: 'A', severity: 'low', confidence: 'LOW' })));
  ok(oneHigh.T > hundredLow.T, 'TENSION: one HIGH outweighs 100 LOW (severity dominates count)');
  ok(oneHigh.hi === 1 && hundredLow.lo === 100, 'TENSION: L∞ floor counts per tier');
  ok(near(oneHigh.T, Math.round(10 * Math.log10(2) * 1000) / 1000), 'TENSION: single high = 10·log10(1+1), rounded to 3dp');
}
// L∞ floor: a swap that crosses tiers is caught; an intra-tier identity swap is the documented residual
{
  const before = computeTension([{ cls: 'F', severity: 'high', confidence: 'HIGH' }, { cls: 'D', severity: 'medium', confidence: 'HIGH' }]);
  const crossTier = computeTension([{ cls: 'D', severity: 'medium', confidence: 'HIGH' }, { cls: 'D', severity: 'medium', confidence: 'HIGH' }]);
  ok(before.hi === 1 && crossTier.hi === 0, 'TENSION: removing a HIGH drops the hi floor (cross-tier swap caught)');
  const intraA = computeTension([{ cls: 'F', severity: 'high', confidence: 'HIGH' }]);
  const intraB = computeTension([{ cls: 'D', severity: 'high', confidence: 'HIGH' }]);
  ok(intraA.hi === intraB.hi, 'TENSION: intra-tier identity swap leaves the count floor unchanged (residual — report-level set-diff covers identity)');
}
// fail-closed (Codex C4) + riskMultiplier + count-floor + determinism
{
  const t = computeTension([{ cls: 'X', severity: 'weird', confidence: 'unknown' }]);
  ok(Number.isFinite(t.T) && t.hi === 1 && t.lo === 0, 'TENSION: unknown severity/confidence FAILS CLOSED to high+1.0 (not silently downgraded)');
  const fHigh = computeTension([{ cls: 'F', severity: 'high', confidence: 'HIGH' }]);
  const dHigh = computeTension([{ cls: 'D', severity: 'high', confidence: 'HIGH' }]);
  ok(fHigh.T > dHigh.T, 'TENSION: riskMultiplier — F (mutation surface) outweighs D at equal severity');
  ok(near(fHigh.T, Math.round(10 * Math.log10(3) * 1000) / 1000), 'TENSION: F high = 10·log10(1+2·1)');
  const lo864 = computeTension(Array.from({ length: 864 }, () => ({ cls: 'A', severity: 'low', confidence: 'LOW' })));
  const lo865 = computeTension(Array.from({ length: 865 }, () => ({ cls: 'A', severity: 'low', confidence: 'LOW' })));
  ok(lo864.lo === 864 && lo865.lo === 865, 'TENSION: count floor moves per-finding even where rounded T may not (read the floor, not T alone)');
  const a = computeTension([{ cls: 'D', severity: 'high', confidence: 'HIGH' }, { cls: 'A', severity: 'low', confidence: 'LOW' }]);
  const b = computeTension([{ cls: 'D', severity: 'high', confidence: 'HIGH' }, { cls: 'A', severity: 'low', confidence: 'LOW' }]);
  ok(a.T === b.T && a.hi === b.hi, 'TENSION: deterministic');
}

// security: protected-path normalization (Codex C3 fail-open fix) + fail-closed exemption regex
{
  ok(isProtectedRel('./.env'), 'SECURITY: ./-prefixed .env is normalized + blocked (no fail-open bypass)');
  ok(isProtectedRel('backend/data/../data/x'), 'SECURITY: ../-collapsed protected path blocked');
  ok(isProtectedRel('/etc/passwd'), 'SECURITY: absolute path fails closed');
  ok(isProtectedRel('../outside.mjs'), 'SECURITY: repo escape fails closed');
  ok(normalizeRel('./a/./b') === 'a/b' && !isProtectedRel('_SYSTEM/Scripts/x.mjs'), 'SECURITY: normal repo path passes');
  ok(!isExempt('anything.mjs', 'A', { filenameExemptions: { rules: [{ match: '[', reason: 'bad', classes: ['A'] }] }, pathExemptions: { rules: [] } }).exempt, 'SECURITY: invalid exemption regex fails closed (no throw, no exempt)');
}

// exemption hygiene completeness (Codex C5/C3): loud contract-load fallback + invalid-regex + no-owner
{
  const c = { __diagnostics: [{ code: 'contract-load-fallback', reason: 'corrupt-json:x', rel: 'p' }],
              filenameExemptions: { rules: [{ match: '[', reason: 'bad' }] },
              pathExemptions: { rules: [{ path: 'p', reason: 'r' }] } };
  const out = validateExemptions(c, null);
  ok(out.some((f) => f.code === 'contract-load-fallback' && f.severity === 'high'), 'HYGIENE: corrupt-contract fallback surfaces LOUD (high)');
  ok(out.some((f) => f.code === 'exemption-invalid-regex'), 'HYGIENE: invalid exemption regex flagged as debt');
  ok(out.some((f) => f.code === 'exemption-no-owner'), 'HYGIENE: path exemption missing owner flagged');
  ok(out.some((f) => f.code === 'exemption-no-reviewBy'), 'HYGIENE: path exemption missing reviewBy lease flagged');
}

// ── exemption hygiene ──────────────────────────────────────────────────────────────────────────────
{
  const c = { filenameExemptions: { rules: [{ match: 'x', reason: 'ok' }, { match: 'y' }] }, pathExemptions: { rules: [{ path: 'p', reason: 'ok', owner: 'm', reviewBy: '2020-01-01' }] } };
  ok(validateExemptions(c, null).length === 1, 'HYGIENE: missing reason flagged; expiry skipped when now=null');
  const withNow = validateExemptions(c, '2026-06-06');
  ok(withNow.length === 2, 'HYGIENE: now set → expired reviewBy also flagged');
  ok(withNow.some((f) => f.code === 'exemption-expired'), 'HYGIENE: expired code present');
  ok(validateExemptions({ filenameExemptions: { rules: [{ match: 'z', reason: 'r', reviewBy: '2099-01-01' }] }, pathExemptions: { rules: [] } }, '2026-06-06').length === 0, 'HYGIENE: future reviewBy not expired');
}

// ── isExempt: filename + path + class scoping ──────────────────────────────────────────────────────
{
  const c = { filenameExemptions: { rules: [{ match: '\\.demo\\.mjs$', reason: 'demo', classes: ['A', 'B'] }] },
              pathExemptions: { rules: [{ path: 'lib/pub.mjs', reason: 'public', classes: '*' }] } };
  ok(isExempt('x.demo.mjs', 'A', c).exempt, 'EXEMPT: filename class match');
  ok(!isExempt('x.demo.mjs', 'C', c).exempt, 'EXEMPT: class scoping respected (C not in list)');
  ok(isExempt('lib/pub.mjs', 'G', c).exempt, 'EXEMPT: path rule with classes:* exempts all');
  ok(!isExempt('other.mjs', 'A', c).exempt, 'EXEMPT: non-match not exempt');
}

// ── parseSkillFrontmatter ──────────────────────────────────────────────────────────────────────────
{
  const src = `---\nname: my-skill\ndescription: d\ntriggers:\n  - /alpha\n  - /beta\n  - /alpha\ndescription2: x\n---\n# body /gamma`;
  const r = parseSkillFrontmatter(src);
  ok(r.name === 'my-skill', 'FRONTMATTER: name parsed');
  ok(r.aliases.length === 2 && r.aliases.includes('alpha') && r.aliases.includes('beta'), 'FRONTMATTER: aliases deduped, dedent ends block, body ignored');
}

// ── buildReport integration: exemption filtering, sort, summary, determinism ───────────────────────
{
  const contract = { filenameExemptions: { rules: [{ match: 'exempt\\.mjs$', reason: 'fixture', classes: ['G'] }] }, pathExemptions: { rules: [] } };
  const inputs = {
    skills: [{ rel: 's/SKILL.md', name: 's', aliases: ['miss'] }], commands: new Set(),
    hookFiles: ['.claude/hooks/h.js'], settingsRefs: new Set(),
    mathDisk: ['m.mjs'], mathTested: new Set(), mathWired: new Set(),
    coreModuleRels: ['ok.mjs', 'exempt.mjs'], graphFiles: new Set(),
    coverEdges: [], mismatches: [], orphanModuleFindings: [], orphanExportFindings: [],
  };
  const rep = buildReport(inputs, contract, null);
  ok(rep.findings.every((f) => f.artifact !== 'exempt.mjs'), 'REPORT: exempt artifact filtered out');
  ok(rep.exemptionsApplied.length === 1, 'REPORT: exemption recorded');
  // sort: high severity first (F hook) before low (E alias)
  ok(rep.findings[0].severity === 'high', 'REPORT: high-severity sorts first');
  ok(rep.summary.safeAutoWireProposed === 1, 'REPORT: alias shim counted as safe-auto-wire');
  ok(rep.summary.total === rep.findings.length, 'REPORT: summary total matches');
  const rep2 = buildReport(inputs, contract, null);
  ok(JSON.stringify(rep) === JSON.stringify(rep2), 'REPORT: deterministic (identical inputs → identical report)');
}

console.log(`regenerative-nexus-guard.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
