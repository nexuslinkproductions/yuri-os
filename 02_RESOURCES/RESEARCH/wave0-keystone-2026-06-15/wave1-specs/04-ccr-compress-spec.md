# Wave-1 Spec: `ccr-compress` into `buildContextPack` — Reversible Structural Compression

> Build-spec for S5: replace blind `body.slice(0, remaining)` head-truncation in `llm-lane.mjs` with reversible structural→semantic compression (LLMLingua-2-style). One function, zero deps, upgrades EVERY peer dispatch (mimo/deepseek/glm).

## Target Path

`_SYSTEM/Scripts/llm-lane.mjs` — specifically the `buildContextPack` function at line ~975.

## Ground Truth (read from real files)

- **`llm-lane.mjs:970-992`** — `buildContextPack(spec, opts)`: reads context files, concatenates them, applies a hard budget cap (`LLM_LANE_CONTEXT_BUDGET=240000`). The current truncation strategy is **blind head-slice**:
  ```js
  // line 983-988
  const remaining = BUDGET - used;
  if (remaining <= 0) { parts.push(`## ${f}\n[omitted — context budget reached]`); continue; }
  let truncated = false;
  if (body.length > remaining) { body = body.slice(0, remaining); truncated = true; }
  ```
  This is `body.slice(0, remaining)` — a raw character-count head truncation. It drops the END of each file, which is where implementation details, evidence, and critical nuance live. The front matter (headers, intros) survives; the load-bearing content gets silently dropped.

- **`llm-lane.mjs:881`** — `contextPack` is assembled once per dispatch, then injected as the `===== PRELOADED CONTEXT` block. Every peer lane (deepseek, mimo, ollama-cloud) receives the same truncated context.

- **`llm-lane.mjs:28`** — `--context <f1,f2,..|@manifest>` flag: front-loads must-read files. The budget is `LLM_LANE_CONTEXT_BUDGET=240k`.

- **`llm-lane.mjs:239`** — `clip(s, n = 12000)`: a utility that truncates long strings with `…[truncated N chars]` suffix. Used for tool output clipping, not context packing.

- **`prose-claim-extractor.mjs`** — Existing prose→claim extraction (advisory). The compression layer could reuse this to identify which parts of a file carry claim content vs boilerplate.

- **`_SYSTEM/Scripts/math/yuri-energy.mjs`** — `computeU` could theoretically score compressed-vs-original fidelity, but the spec says "one function, zero deps" — so the initial build is simpler.

## Interface

The change is a **single function replacement** inside `buildContextPack`. No new file.

```js
// Inside llm-lane.mjs, replace the blind slice at line 986:

/**
 * ccr-compress: reversible structural→semantic compression.
 * Replaces body.slice(0, remaining) with a strategy that preserves
 * load-bearing content and drops boilerplate first.
 *
 * Strategy (in order of priority):
 *   1. STRUCTURAL: drop trailing blank lines, repeated section headers,
 *      and "Related:" / "See also" footers first (cheap, reversible by
 *      re-reading the file).
 *   2. SEMANTIC: if still over budget, drop code blocks that are
 *      implementation details (not interface/export signatures).
 *      Detect by: starts with ```, contains no export/function/class keyword.
 *   3. FALLBACK: if still over budget, drop from the END of each
 *      non-critical section (preserves headers + first N lines of each
 *      section). This is still a slice, but section-aware instead of
 *      file-level blind.
 *
 * Returns { compressed, originalLength, compressedLength, strategy }.
 * Reversible: the original file is always available via read_file.
 */
function ccrCompress(body, remaining, opts = {}) {
  // opts.filePath — for section-aware compression
  // opts.strategy — 'structural' | 'semantic' | 'section-aware' | 'blind-fallback'
  // Returns string of length <= remaining
}
```

### Strategy Details

**Structural (cheapest, always applied first):**
- Strip trailing blank lines (multiple `\n\n\n` → `\n\n`)
- Strip `## Related` / `## See Also` / `---` footer sections (everything after the last `## ` header that is a known footer pattern)
- Strip repeated `# Module: X` / `# @capability:` header blocks when they appear more than once
- Typical savings: 5-15% of file length

**Semantic (applied when structural is insufficient):**
- Identify code blocks (``` delimited)
- Classify each as "interface" (contains `export`, `function`, `class`, `@exports`) or "implementation" (no export/function/class keyword)
- Drop implementation blocks first
- Typical savings: 20-50% of file length for code-heavy files

**Section-aware fallback (last resort):**
- Split file by `## ` headers
- For each section, keep the header + first N lines proportional to the section's share of the budget
- This is still a truncation, but section-proportional instead of file-level blind

**Reversibility guarantee:** The original file is always available via `read_file`. The compressed version is a dispatch-time artifact — it is never persisted. A lane that needs the full content can `read_file` it with its tools.

## Dependencies

| Dep | Path | Why |
|---|---|---|
| None (zero deps) | — | The function is self-contained. Uses only `String.prototype` methods and regex. |

Zero deps is a hard requirement: this function runs on EVERY peer dispatch. An import chain would add latency and failure surface.

## DISARMED Contract

- **NO change to the dispatch protocol.** `ccrCompress` is a drop-in replacement for `body.slice(0, remaining)` inside `buildContextPack`.
- **NO new files.** The function lives inside `llm-lane.mjs`.
- **NO env gate.** The compression is always active (it's strictly better than blind slice). The blind-slice fallback is the last resort strategy, not the default.
- **NO change to the `--context` flag interface.** The flag still accepts file paths; the compression is transparent.
- **Arming** (adding claim-cortex schema validation of compressed output) is a separate Wave-2 item.

## Test Plan

Tests live in `_SYSTEM/Scripts/llm-lane.test.mjs` (or a new `ccr-compress.test.mjs`).

1. **Structural compression:** a file with 50 trailing blank lines → stripped to 1.
2. **Footer stripping:** a file ending with `## Related\n- foo\n- bar` → footer removed.
3. **Semantic compression:** a file with 3 interface blocks + 5 implementation blocks → implementation blocks dropped first.
4. **Section-aware fallback:** a file with 4 sections, budget = 50% of total → each section gets ~50% of its content.
5. **Budget respect:** compressed length ≤ remaining in all cases.
6. **Reversibility:** `read_file` of the original returns the full content (tested by reading the file after compression).
7. **Regression:** `ccrCompress` with remaining = body.length returns the full body unchanged.
8. **Edge case:** empty body → empty string. body shorter than remaining → unchanged.

## Ordered-Roadmap Note

Wave-1 builds the compression as a drop-in replacement inside `buildContextPack`. This is the HIGHEST-IMPACT Wave-1 item: it upgrades EVERY peer dispatch (mimo/deepseek/ollama-cloud) with zero architectural change. Wave-2 adds schema-validate-and-gate peer outputs (claim-cortex schema validation of lane output before it enters the context pool). Wave-3 adds LLMLingua-2-style learned compression (requires a small model — gated on the SLM track).
