# S5 — Memory, Context & Peer-Lane Orchestration: SLM research → SYSTEM upgrades

The slm-build corpus was for YURI THE SYSTEM, not just a future 7B. This maps prompt-compression / context-management / constrained-decoding / retrieval research onto concrete zero-GPU upgrades to the LIVE memory + peer-lane substrate. SLM = downstream consumer only. arXiv IDs were API-verified by the corpus (12/13 verification notes; 6122.36676 was caught fabricated & dropped).

## The subsystem as it actually is (read the code, not the README)
- Peer-lane prompt assembly = `_SYSTEM/Scripts/llm-lane.mjs`: spine (~675 lines yuri-origin+SOUL+persona) as `system` (767-836), recall block appended (837), preloaded files via `buildContextPack` (930-952), user turn = `contextPack + TASK` (841). Budget `LLM_LANE_CONTEXT_BUDGET`=240k chars.
- **`buildContextPack` truncation is DUMB**: line 944 = `body.slice(0, remaining)` — pure head-truncation, drops the tail wholesale, no selection.
- **`ccr-compress.mjs` already exists**: content-typed (json/code/prose) REVERSIBLE compaction, byte-exact cache + retrieval sentinel, `isProtectedPath`-guarded. 1/1 test green. Structural only — no learned token selection.
- Recall = `coreOnDispatch` (`lane-core-hooks.mjs:54-56`) → `yuri-recall.mjs` (lexical FTS). `coreOnResult` (73) is where every peer output lands — the natural schema-check seam.
- **`spreading-activation-memory.mjs` ALREADY EXISTS** (PPR + Hebbian + decay, pure linear algebra, no embeddings), gated behind `spreading-activation-gate.mjs` (must beat FTS5@5 on 5 pre-judged queries). NOT yet wired live.
- `memory-canonical-store.mjs` + `canonical-recall.mjs`: per-lane-shard → drainer → peer-open read; `freeText` ranks via `weightedFeatureJaccard`.
- **`constrained.py` (needle) is logit-masking** — works ONLY where you own logits. Remote peers (mimo/deepseek/glm over HTTPS) expose NO logits. This splits the constrained-decoding angle into two non-equal halves.

## Real leverage vs cargo-cult
| Idea (source) | Verdict | Why |
|---|---|---|
| LLMLingua-2 compress peer context (2403.12968) | REAL | head-truncation is provably lossy at the tail |
| Logit-mask decoding on peer lanes (2411.15100) | CARGO-CULT for peers | no logit access over HTTPS; binds to needle only |
| Schema-validate-then-repair peer JSON (2605.26128, 2501.10868) | REAL | the actual remote-lane lever: post-hoc validate + gate-repair |
| Spreading-activation hybrid recall (existing organ) | REAL, half-built | organ+gate exist, just unwired; closes linked-no-shared-words gap |
| "Bracketing" XML context (G3) | CARGO-CULT | two sweeps found no paper/mechanism |
| KV-quant / `--keep 4` / attention-sink flags (2309.17453, 2402.02750) | SLM-only | llama.cpp serve flags, irrelevant to JS substrate + remote peers |
| Prefix-cache reuse of the 675-line spine (PR#16391) | REAL but SLM-leg | big for a LOCAL yuri-slm verifier loop; remote = provider's cache, not ours |

## topMove
**Wire `ccr-compress` into `buildContextPack` (llm-lane.mjs:944).** One change turns a proven, already-built, protected-path-safe reversible compressor onto a proven-lossy seam, upgrades every peer dispatch at once, zero GPU/deps. The SLM inherits it free as just another lane.

## The SLM is downstream, not the point
When yuri-slm serves locally it wires into `llm-compat-contract.mjs` like any lane — inheriting compressed context, schema-gated output, hybrid recall with no extra work. The constrained-decoding moat (`constrained.py` logit-masking) is real ONLY for that local model; for remote peers it stays validate-and-repair. Don't conflate them — that's the cargo-cult trap.

RESULT: `05MC_MEMORY_CONTEXT_PEER_ORCHESTRATION_SLM_INTEGRATION_X_PASS_COMMITTED`