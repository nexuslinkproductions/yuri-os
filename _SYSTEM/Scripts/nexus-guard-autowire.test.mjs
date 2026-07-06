#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  applyCommandShims,
  buildCommandShimContent,
  buildGraphNodeStub,
  buildManualEntry,
  buildProposals,
  extractExportNames,
  extractHeaderDoc,
  renderProposalMarkdown,
  runAutowire,
} from './nexus-guard-autowire.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };

const sampleSrc = `#!/usr/bin/env node
/**
 * sample math module — deterministic bridge for tests.
 */
export const SAMPLE_CONST = 1;
export function scoreThing() { return SAMPLE_CONST; }
const hidden = 2;
export { hidden as exposedHidden };
`;

// shim content
{
  const text = buildCommandShimContent({ alias: 'deepseek', skill: 'deepseek-offload' });
  ok(text.includes('---\nskill: deepseek-offload\n---'), 'SHIM: frontmatter routes to skill');
  ok(text.includes('Usage: `/deepseek`'), 'SHIM: includes slash usage');
  try {
    buildCommandShimContent({ alias: '../bad', skill: 'deepseek-offload' });
    ok(false, 'SHIM: invalid alias rejected');
  } catch {
    ok(true, 'SHIM: invalid alias rejected');
  }
}

// module parsing + manual shape
{
  ok(extractHeaderDoc(sampleSrc).includes('deterministic bridge'), 'MATH: header doc extracted');
  const names = extractExportNames(sampleSrc);
  ok(names.includes('SAMPLE_CONST') && names.includes('scoreThing') && names.includes('hidden'), 'MATH: export names extracted and sorted');
  const entry = buildManualEntry({ rel: '_SYSTEM/Scripts/math/sample-module.mjs', src: sampleSrc });
  ok(entry.text.includes('### Sample Module — registry stub'), 'MATH: manual entry title matches existing format');
  ok(entry.text.includes('**Does:**') && entry.text.includes('**Math:**') && entry.text.includes('**Code:**'), 'MATH: manual entry has registry bullets');
  ok(entry.text.includes('scoreThing'), 'MATH: manual entry lists exports');
}

// graph node shape
{
  const node = buildGraphNodeStub({ rel: '_SYSTEM/Scripts/math/sample-module.mjs', src: sampleSrc, sourceClasses: ['G', 'D'] });
  ok(node.id === 'sample-module', 'GRAPH: stable id from basename');
  ok(node.layer === 'Energy & Math', 'GRAPH: layer set');
  ok(Array.isArray(node.files) && node.files[0] === '_SYSTEM/Scripts/math/sample-module.mjs', 'GRAPH: files array set');
  ok(node.description.includes('class D+G'), 'GRAPH: source classes recorded deterministically');
}

// proposal build idempotency/dedupe
{
  const report = {
    phase: 'test',
    summary: { total: 4 },
    safeAutoWire: [
      { kind: 'missing-command-shim', target: '.claude/commands/test-gap.md', alias: 'test-gap', skill: 'sample-skill' },
      { kind: 'missing-command-shim', target: '.claude/commands/test-gap.md', alias: 'test-gap', skill: 'sample-skill' },
    ],
    findings: [
      { cls: 'D', artifact: '_SYSTEM/Scripts/math/sample-module.mjs' },
      { cls: 'G', artifact: '_SYSTEM/Scripts/math/sample-module.mjs' },
      { cls: 'G', artifact: '_SYSTEM/Scripts/self-improvement/sample-other.mjs' },
    ],
  };
  const a = buildProposals(report);
  const b = buildProposals(report);
  ok(a.shims.length === 1, 'PROPOSALS: duplicate shim targets deduped');
  ok(a.math.length === 1, 'PROPOSALS: class-D math stubs counted once');
  ok(a.graph.length === 2, 'PROPOSALS: graph stubs unique by artifact');
  ok(JSON.stringify(a) === JSON.stringify(b), 'PROPOSALS: deterministic/idempotent for same report');
  const md = renderProposalMarkdown({ report, proposals: a, generatedAt: 'TEST_STAMP' });
  ok(md.includes('Generated: TEST_STAMP') && md.includes('## Command Shim Proposals'), 'PROPOSALS: markdown renders summary sections');
}

// dry-run writes only proposal artifact, not command shims
{
  const commandRel = '.claude/commands/ng2-autowire-test-probe.md';
  const proposalRel = '02_RESOURCES/RESEARCH/nexus-guard-autowire-test.tmp.md';
  const commandAbs = path.join(REPO_ROOT, commandRel);
  const proposalAbs = path.join(REPO_ROOT, proposalRel);
  const existedBefore = fs.existsSync(commandAbs);
  try {
    const result = runAutowire({
      applyShims: false,
      proposalRel,
      generatedAt: 'TEST_STAMP',
      report: {
        phase: 'test',
        summary: { total: 1 },
        safeAutoWire: [{ kind: 'missing-command-shim', target: commandRel, alias: 'ng2-autowire-test-probe', skill: 'sample-skill' }],
        findings: [],
      },
    });
    ok(result.counts.shims === 1 && result.shimApply.written.length === 0, 'DRY-RUN: shim counted but not written');
    ok(fs.existsSync(proposalAbs), 'DRY-RUN: proposal artifact written');
    ok(fs.existsSync(commandAbs) === existedBefore, 'DRY-RUN: command file existence unchanged');
  } finally {
    fs.rmSync(proposalAbs, { force: true });
  }
}

// apply path skips existing files and never overwrites
{
  const target = '.claude/commands/geass.md';
  const abs = path.join(REPO_ROOT, target);
  const before = fs.readFileSync(abs, 'utf8');
  const result = applyCommandShims([{ target, content: 'SHOULD NOT WRITE\n' }]);
  const after = fs.readFileSync(abs, 'utf8');
  ok(result.written.length === 0 && result.skipped[0].reason === 'exists', 'APPLY: existing command skipped');
  ok(before === after, 'APPLY: existing command not overwritten');
}

console.log(`nexus-guard-autowire.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
