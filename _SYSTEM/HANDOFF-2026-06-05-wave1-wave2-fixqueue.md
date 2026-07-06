# HANDOFF — Wave 1 + Wave 2 done · fix-queue ready (2026-06-05, session 2)

> **Top-loaded** (newest/current first). Jump in at §1. This session ran the breadth-first moat-capstone red-team (Wave 1), the depth pass (Wave 2), revived the kimi lane, diagnosed + reconfigured nemotron, and shipped it all to `main`. The next session APPLIES the fixes.

## 1. ⏭️ NEXT SESSION — FIRST ACTIONS

1. **APPLY THE RCE FIX (CRITICAL, attacker-reachable).** `_SYSTEM/OS_KERNEL/openclaw-bridge.sh` + `_SYSTEM/Scripts/swarm-handoff.sh` interpolate shell fields into a `python3 -c` source string; `SUMMARY` derives from OpenClaw **agent output** = remote/attacker. Working PoC confirmed. **Fix (bypass-validated by deepseek — use the QUOTED heredoc `<<'PY'`, never `<<PY` which still expands `${VAR}`+backticks):** pass every dynamic field via `sys.argv`. Only the interpolated lines need it (openclaw `:40,:44,:113-120`; swarm `:20-31`); the stdin-pipe lines are already safe. Add a RED→GREEN regression test (inject `os.system('touch $MARKER')`, assert marker NOT created + payload round-trips as inert JSON). Full spec: [`WAVE-2-FIX-QUEUE-2026-06-05.md`](WAVE-2-FIX-QUEUE-2026-06-05.md) §"SHIP NOW" + `/tmp/wave2-fixspecs.md` (may be gone — regenerate from the queue doc).
2. **THEN the fix pack** (high, simple, both-source-confirmed): `codex-offload-runner.mjs:211` sandbox fail-open (`trim`+fail-closed `exit(2)`) · `claude-memory-write.mjs:62` symlink escape (`realpathSync`/`O_NOFOLLOW`) · `gitnexus-mcp.mjs:19` silent `npx --yes` (fail-loud) · `llm-lane.mjs:243` fetch_url DNS-rebind (resolve+recheck IP). Each with a regression test, on the branch, owner-review before commit.
3. **Do NOT chase the redirect regex** — deepseek proved it's structurally unwinnable (`python3 -c`/`node -e`/`sed -i`/`eval`/base64 paths bypass any parser) and the `PROTECTED_TARGETS` widening over-fixes (`.git/hooks`, `~/.zshrc`, self-paralysis). It's defense-in-depth; document the limit, narrow-add `.claude/hooks` at most.
4. **Owner decisions (posture, not bugs):** codex-gate opt-in `--require-approved` (content-hash-pinned `.approved`, preserves the un-caged default) · `--cd` clamp (leave — operator-only + breaks sibling worktrees).
5. **Drift cleanup** (separate from security): update `llm-compat.sh` to the new nemotron id (the one live mis-route, `:302-303,:403-404`) · graph hand-fix (`LANE_NEMOTRON` phantom → llm-lane.mjs+models.json; `LANE_KIMI` → add llm-lane.mjs) · retire `ENKI_*`/`ED_*` graph orphans · command-registry 77-vs-50.

## 2. ✅ SHIPPED THIS SESSION (merged to `main` @ `c44a54e1`)

- **kimi lane REVIVED.** kimi-k2.6/NIM emits Moonshot native `<|tool_call_*|>` tokens that the OpenAI-shaped tool loop didn't parse → built a translation adapter in `llm-lane.mjs` (`parseKimiToolCalls`/`stripKimiToolTokens` + arg-key inference, self-scoping on the token signature). **20/20 unit** (`llm-lane-kimi-adapter.test.mjs`), live-proven (14 findings / 40 tool execs / 0 leak). It found a real fail-open the other lanes missed (sandbox-override trailing-space).
- **nemotron reconfigured.** The 550b-ultra can't emit a first token within NVIDIA's free-endpoint **~40s no-output gateway wall** under load — proven by removing every client-side timeout (shell → AbortController → undici headers → socket) and still hitting it; a bare zero-dep probe fails too, so it's NVIDIA's wall, not ours. Lane renamed `nemotron-3-ultra-550b-a55b` → **`nemotron-3-super-120b-a12b`** (old id kept as back-compat alias). New **`raw_https` streaming `node:https` transport** (zero timeout, own connection) for slow reasoning lanes — deepseek/kimi keep their fetch path untouched (regression PONG verified). **Caveat:** the free-endpoint wall caps prefill (~50KB) and throttles after a request burst → dispatch nemotron with **tool-read files, not big `--context`**; nemotron's NIM tool format parses cleanly (no adapter, unlike kimi). See [`LANE-MANUAL.md`](LANE-MANUAL.md) §nemotron footnote.
- **Wave-1 coverage map** ([`WAVE-1-COVERAGE-MAP-2026-06-05.md`](WAVE-1-COVERAGE-MAP-2026-06-05.md)): 7 slices / 127 nodes, 137 raw → 101 deduped → 9 verified / 9 partial / 6 refuted. The two loudest crits refuted by live truth-gate.
- GitNexus reindexed at HEAD (43,454 nodes) — the adapter is in the code-intelligence graph.

## 3. 🧭 THE RESULT (what the operation proved)

The moat-capstone thesis holds: **breadth from the lanes, truth from local verification.** 4 frontier lanes (deepseek/codex workhorses; kimi revived; nemotron endpoint-limited) swept the full surface; the truth-gate refuted ~⅓ of confident crits — including a 3-lane "corroborated" TOCTOU that was **reachability-dead** (stale GitNexus index pointed at archived code) and a "CONFIRMED CRITICAL" bash-guard bypass that was **already fixed** (all 5 historical forms DENY now). Net real defects: **one attacker-reachable RCE** (openclaw) + a small high/med fix pack. Cross-lane review (Wave 2) caught a fix that would've shipped still-vulnerable (unquoted heredoc). Nothing climbed to "real" without live evidence.

## 4. MEMORY (durable, this session)

- [[nemotron-nim-prefill-wall]] — the NVIDIA free-endpoint 40s gateway wall + 120b/streaming resolution (NEW).
- [[bash-guard-role-matcher-lexical-bypass]] — CORRECTED: now FIXED (was "CONFIRMED CRITICAL").
- [[kimi-nim-toolcall-adapter]] — NIM models can emit native tool-call tokens; translate at the lane boundary (NEW).
- Method confirmed: [[feedback-substrate-cert-loop]] + [[feedback-adversarial-persona-attack-loop]] — lanes-cover / my-agents-verify / truth-gate-vs-live is the proven shape.

SEE: `WAVE-1-COVERAGE-MAP-2026-06-05.md` · `WAVE-2-FIX-QUEUE-2026-06-05.md` · `LANE-MANUAL.md` · prior `HANDOFF-2026-06-05-lane-hardening-fanout-ready.md` (Wave-0 setup).
