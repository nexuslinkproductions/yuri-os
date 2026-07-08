import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planExport } from './yuri-export.mjs';

// Representative top-level _SYSTEM/Scripts modules the manifest's
// `_SYSTEM/Scripts/**/*.mjs` include glob intends to ship. They live directly
// under _SYSTEM/Scripts/ (no subdirectory) — exactly the case the glob bug
// drops, because `**/` only ever resolves for paths that contain a separator
// after the glob root. Only the `math/**` / `tests/**` globs survive (their
// `**` is trailing, matched by the startsWith fallback), which is why a
// `--dry-run` ships ~107 Scripts files instead of the intended ~620.
const TOP_LEVEL_SCRIPTS_MODULES = [
  'yuri-originator.mjs',
  'memory-kernel.mjs',
  'claim-cortex.mjs',
  'llm-lane.mjs',
  'nano-spawn.mjs',
];

test('planExport includes manifest-intended top-level _SYSTEM/Scripts source modules', () => {
  const plan = planExport();

  // Each module MUST appear in the export plan as _SYSTEM/Scripts/<module>.
  // Under the glob bug these are dropped, so the first one reddens the suite
  // with a message naming the exact dropped file.
  for (const mod of TOP_LEVEL_SCRIPTS_MODULES) {
    const rel = `_SYSTEM/Scripts/${mod}`;
    assert.ok(
      plan.files.includes(rel),
      `${rel} is dropped from the export plan, but the manifest include glob _SYSTEM/Scripts/**/*.mjs intends it`
    );
  }

  // The plan must carry a real population of top-level Scripts modules, not
  // only the math/ and tests/ subtrees that survive via their own globs.
  const topLevel = plan.files.filter((f) => /^_SYSTEM\/Scripts\/[^/]+\.mjs$/.test(f));
  assert.ok(
    topLevel.length > 100,
    `expected a large set of top-level _SYSTEM/Scripts/*.mjs in the plan, got ${topLevel.length}`
  );
});

test('planExport honors exclude globs for .db/.sqlite/.jsonl artifacts', () => {
  // Sandbox through the public manifest argument: positively include the whole
  // _SYSTEM/Scripts tree (directory-prefix match works regardless of the glob
  // bug), then require the real exclude globs to drop every matching artifact.
  // This exercises the exclude-glob path directly instead of relying on the
  // narrow default include scope, under which a stray data file would be
  // rejected by the include gate rather than by the (broken) exclude glob.
  const manifest = {
    include: { roots: [], directories: ['_SYSTEM/Scripts'], globs: [] },
    exclude: {
      directories: [],
      globs: ['**/*.jsonl', '**/*.db', '**/*.sqlite'],
      files: [],
    },
  };

  const plan = planExport(manifest);
  const leaked = plan.files.filter((f) => /\.(jsonl|db|sqlite)$/i.test(f));

  assert.equal(
    leaked.length,
    0,
    `exclude globs leaked ${leaked.length} data artifacts into the plan: ${JSON.stringify(leaked.slice(0, 5))}`
  );
});
