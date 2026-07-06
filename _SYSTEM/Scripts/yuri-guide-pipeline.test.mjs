// Tests for the YURI Navigation-Layer guide pipeline (authored guide → canonical node → projected skill).
// Covers the load-bearing parts: the export-MATCH hard gate (a guide must not lie about an organ's call
// surface) and the skill projection (render). Importing the modules must NOT mutate the graph or write skills
// — the CLI entrypoints are guarded; these imports prove it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportGate } from './yuri-guide-seed.mjs';
import { render, oneLine } from './yuri-guide-project.mjs';

test('exportGate: exact match passes', () => {
  const g = exportGate(['b', 'a', 'c'], ['c', 'a', 'b']); // order-independent
  assert.equal(g.ok, true);
  assert.deepEqual(g.missing, []);
  assert.deepEqual(g.invented, []);
});

test('exportGate: a forgotten real export FAILS (listed as missing)', () => {
  const g = exportGate(['decode'], ['decode', 'encode']);
  assert.equal(g.ok, false);
  assert.deepEqual(g.missing, ['encode']);
  assert.deepEqual(g.invented, []);
});

test('exportGate: an invented export FAILS (a guide cannot claim a non-existent symbol)', () => {
  const g = exportGate(['decode', 'ghostFn'], ['decode']);
  assert.equal(g.ok, false);
  assert.deepEqual(g.missing, []);
  assert.deepEqual(g.invented, ['ghostFn']);
});

test('oneLine: collapses whitespace and truncates long text with an ellipsis', () => {
  assert.equal(oneLine('a\n  b\t c'), 'a b c');
  const long = 'x'.repeat(300);
  const out = oneLine(long, 50);
  assert.ok(out.length <= 51, 'truncated to budget');
  assert.ok(out.endsWith('…'), 'ends with ellipsis');
});

const FIXTURE = {
  id: 'demo-organ',
  label: 'Demo Organ',
  tiers: ['mechanism'],
  mechanism: {
    label: 'Demo Organ', layer: 'Energy & Math', files: ['_SYSTEM/Scripts/demo.mjs'],
    guide: {
      purpose: 'A demo organ for testing the projector.',
      invocation: 'both', cliSubcommands: ['run'],
      exports: [{ name: 'doThing', signature: 'doThing(x)', inputs: 'a number', outputs: 'the doubled number' }],
      securityBoundary: 'Read-only; no protected paths.',
      whenToUse: 'When you need a demo.',
      gotchas: ['It is only a demo.'],
    },
  },
};

test('render: produces valid skill frontmatter + every section, grounded in node.guide', () => {
  const md = render(FIXTURE);
  // frontmatter
  assert.match(md, /^---\nname: organ-demo-organ\n/);
  assert.match(md, /description: "A demo organ for testing the projector\./);
  assert.match(md, /generated: true/);
  assert.match(md, /source_node: "demo-organ"/);
  // the generated do-not-edit provenance header
  assert.match(md, /GENERATED from the canonical graph node "demo-organ"/);
  assert.match(md, /DO NOT hand-edit/);
  // sections + the real export surface
  assert.match(md, /## Exports/);
  assert.match(md, /`doThing\(x\)`/);
  assert.match(md, /in: a number/);
  assert.match(md, /out: the doubled number/);
  assert.match(md, /## Security boundary\nRead-only; no protected paths\./);
  assert.match(md, /## When to use\nWhen you need a demo\./);
  assert.match(md, /## Gotchas\n- It is only a demo\./);
  assert.match(md, /## Session Notes/);
  // CLI subcommands surfaced
  assert.match(md, /\*\*CLI:\*\* `run`/);
});

test('render: an import-only organ (no CLI) is labelled as such', () => {
  const node = JSON.parse(JSON.stringify(FIXTURE));
  node.mechanism.guide.cliSubcommands = [];
  assert.match(render(node), /\*\*CLI:\*\* none \(import-only surface\)/);
});
