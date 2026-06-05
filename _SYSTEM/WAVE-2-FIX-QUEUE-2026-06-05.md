# WAVE 2 — Deep-Verify + Fix-Ready Queue (2026-06-05)

> Depth pass on the Wave-1 hot-spots. 3 of my own agents (fix-specs · gap-closure · drift-map) + 2 frontier lanes (codex on its own gate; deepseek attacking the proposed fixes). Every fix below is bypass-tested before it's called ready. Nothing applied yet — security mutations await owner go-ahead. Advisory until owner-approved.

## SHIP NOW — the one that's a live RCE

**`_SYSTEM/OS_KERNEL/openclaw-bridge.sh` + `_SYSTEM/Scripts/swarm-handoff.sh` — `python3 -c` injection → RCE. CRITICAL, attacker-reachable.**
- Confirmed by Agent A (working PoC: `task_id` with `'+__import__('os').system(...)+'` wrote `/tmp/PWNED3`) AND deepseek, which found MORE surfaces: `openclaw-bridge.sh:44` (`FROM_AGENT`, survives a JSON round-trip), `:113-120` (`TASK_ID`/`CHANNEL`/`SUMMARY` — SUMMARY is OpenClaw **agent output** = remote/attacker), and `swarm-handoff.sh:20-31` (every CLI arg). Plus a **compound** chain: swarm-handoff injects the JSON that openclaw-bridge then re-injects.
- **The fix, bypass-validated by deepseek:** pass every dynamic field via **argv under a QUOTED heredoc `<<'PY'`** (NOT `<<PY` — unquoted still expands `${VAR}` and backticks, leaving the RCE open — the exact trap to avoid):
  ```bash
  python3 <<'PY' - "$TASK_ID" "$CHANNEL" "$SUMMARY" "$CONTENT_JSON" "$META"
  import json, sys
  print(json.dumps({'task_id': sys.argv[1], 'channel': sys.argv[2],
    'summary': sys.argv[3], 'content': json.loads(sys.argv[4]), 'meta': json.loads(sys.argv[5])}))
  PY
  ```
- **Over-fix guard:** only the interpolated lines need it (openclaw `:40,:44,:113-120`; swarm `:20-31`). The six stdin-pipe extraction lines are already safe — leave them.
- Regression test: inject `os.system('touch $MARKER')` via task_id/summary → assert marker NOT created + payload round-trips as inert JSON. RED before / GREEN after.

## SHIP — high-value, simple, both-source-confirmed, low over-fix risk

- **`codex-offload-runner.mjs:211` sandbox fail-open (HIGH).** `'read-only '` (trailing space) silently → `danger-full-access`. Fix = `.trim().toLowerCase()` then **fail-closed** `exit(2)` on an unknown value. (Agent A + codex agree.)
- **`claude-memory-write.mjs:62` symlink escape (HIGH — codex rates it high).** Lexical `assertSafePath`, no realpath; a symlink planted in `memory/` escapes the root, and the wrapper is the trusted write-exception. Fix = `realpathSync(dirname)` + per-segment `lstat` / `O_NOFOLLOW`.
- **`gitnexus-mcp.mjs:19` silent `npx --yes` fallback (MED, latent — local binary present today).** Guard-path tool shouldn't implicitly install. Fix = fail-loud on missing binary / vendor / integrity-pin.
- **`llm-lane.mjs:243` fetch_url DNS-rebind SSRF (MED).** Checks the literal hostname, never resolves DNS. Fix = `dns.lookup({all:true})` + refuse if any resolved IP is private, before fetch.

## DON'T CHASE — the regex is a dead end (deepseek's verdict)

**`yuri-safety-core.mjs` bash-redirect parser (HIGH impact, but unwinnable by regex).** Wave-1's "doesn't parse redirects" was wrong (it does) — but it misses `1>`, no-space `>>`, `exec {fd}>`, `>|`, `&>>`, multi-file `tee`… **and a regex can never be complete**: `python3 -c "open().write()"`, `node -e "fs.writeFileSync()"`, `sed -i`, `perl -i`, `eval`, `$VAR`/`$(...)`/base64 paths all bypass *any* redirect parser. The gate is **defense-in-depth, not a primary boundary** — the real boundaries are (a) the lane runs as the owner's user, (b) the main-session PreToolUse hook, (c) advisory output reviewed before apply.
- **Recommendation:** do NOT widen PROTECTED_TARGETS blindly — deepseek flagged real over-fix: `.git/hooks` blocks legit hook dev, `~/.zshrc` HOME-expansion fails silently, protecting `yuri-safety-core.mjs` causes update-paralysis. Make at most a **narrow** add (`.claude/hooks` dir as a WRITE target) + **document the structural limitation** in the gate. Optionally block lane `node -e`/`python -c` *that write files* — but even that's incomplete. Low ROI; don't sink time into a complete regex.

## OWNER DECISIONS — posture, not bugs

- **Codex gate, no propose/approve/apply (codex: med).** Matches the owner 2026-06-05 "fully equipped, NOT caged" directive — **intentional**. codex blessed an OPT-IN, non-default `--require-approved` that checks a content-hash-pinned `.approved` (`hashPayload({prompt,model,workspaceRoot,sandbox})` + HEAD) before `runCodex`, preserving the un-caged default. Add the lever or leave it — your call.
- **`codex-offload-runner.mjs:282` `--cd`/`CODEX_TARGET_WORKTREE` no repo clamp (LOW, operator-only).** Agent A flagged an over-fix trap: a hard `isInsideRepo` clamp BREAKS the runner's own test (uses `os.tmpdir()`) and sibling worktrees (`/Users/marcelspatz/YURI-BUSINESS`, confirmed via `git worktree list`). If anything, a configurable allowlist (`repoRoot + git-worktree roots + YURI_CODEX_ALLOWED_ROOTS`), not a clamp. Recommend accept-risk.

## DRIFT RECONCILIATION (architecture cleanup, separate from security)

- **Routing tables:** `models.json` + `llm-lane.mjs` are the **sole runtime routing authority** and already carry the new `nemotron-3-super-120b-a12b` id. The 5 "duplicate" files carry stale *descriptor/display* strings — only **`llm-compat.sh`** has live mis-route blast-radius (`:302-303,:403-404` build the NIM model POST string from the old id) → update it (HIGH-priority of the cleanup). `lane-kernel.mjs` / `llm-compat-contract.mjs` / `kagami-overseer.mjs` / `shintai-dispatch.mjs` = descriptor/health only → update for consistency. Two dead `dispatchArgs` → retired `offload` runner (`lane-kernel.mjs:201`, `shintai-dispatch.mjs:129`).
- **Graph self-model (hand-fix; engine is analysis-only):** `LANE_NEMOTRON` phantom `nemotron-dispatch.mjs` → `[llm-lane.mjs, models.json]`; `LANE_KIMI` → add `llm-lane.mjs` (adapter lives there).
- **Orphans:** `ENKI_*` and `ED_*` = pure graph-only (0 live consumers) → retire from graph or tag `status:planned`.
- **Command registry:** 77 live vs 50 in graph; dead nodes `deepseek-offload`, `llm`; missing `/domain`, `/edc`.

## CROSS-CHECK INTEGRITY

The lanes did their job: **codex corroborated** its-domain findings + blessed the fixes; **deepseek attacked the fixes** and stopped two mistakes before they shipped (unquoted-heredoc still-vulnerable; regex-can't-win + PROTECTED_TARGETS over-fix). Refuted/downgraded: SSRF-via-extra-hosts (operator-env-only), `--cd` clamp (operator + over-fix trap), redirect-as-simple-regex-fix (structurally incomplete).

SEE: `/tmp/wave2-fixspecs.md` (Agent A diffs+tests) · `/tmp/wave2-gaps.md` (Agent B verdicts) · `/tmp/wave2-drift.md` (Agent C map) · `/tmp/wave2-codex.txt` · `/tmp/wave2-deepseek.txt`.
