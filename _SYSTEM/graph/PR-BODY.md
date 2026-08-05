# YURI GRAPH-RECON LOOP — FINAL PR BUNDLE (read-only assembly, /tmp staging)

> Status: CONVERGENCE CANDIDATE CONFIRMED (3 consecutive clean cycles, cleanCycles=2 protocol met).
> Owner decisions pending: G1 (t-8cad4569 artifact placement), G2 (t-7c4a6c7e stop policy), G3 (t-e0434d9f backlog format + F-036 + gitnexus). No tracked writes until Marcel approves.

## What & why

One continuous, graph-engineered security recon loop over the entire YURI ecosystem, executed by Helios (walker) under Orion (planner/verifier) with owner-granted read-everything authorization (except Keychain values; no egress; no secret values in output). The loop mapped code, configs, services, ports, databases, launchd agents, MCP servers, harnesses, envs, secrets-as-nodes, git history, governance organs, and tests into a **unified graph** (walker security layer merged with the existing yuri-graph.json, circuitry machinery, and GitNexus code index), then walked it until deterministic convergence: full coverage + 3 clean cycles + zero drift.

Why: the owner was dissatisfied with existing graph systems. This produces one superior, merged, hash-pinned, deterministically regenerable graph artifact plus a verified vulnerability map as graph properties (unauthenticated edges, secret-bearing nodes, exec-edges, trust-boundary crossings).

## Merged-graph stats (fresh, hash-pinned)

| Source | Nodes | Edges | Notes |
|---|---|---|---|
| Walker security layer | 47 | 68 | ports, launchd agents, processes, files, mcp servers + findings links |
| GitNexus code index | 85,152 | 123,559 | **re-indexed at HEAD 0158a8f** (44.9s, status ✅); stale index had junk (89,109 was wrong) |
| yuri-graph.json | canonical | — | 392KB architecture graph (flowMeta/mechMeta); yuri-graph-state.json is generated from it (merge from canonical only) |
| graphify-out | — | — | absent on disk; SKIP (redundant with gitnexus + ast-js) |
| **merged.jsonl** | 115 records | — | **sha256 e461ad0c11110c482d39c729e2d73034b3bc7ad181db996a654cc3ddd41dc6a7** (records-only pin, determinism-tested: two runs → identical) |

Namespaces: `walker:` / `gitnexus:` / `yuri-graph:` (cross-linked by path where 1:1).

## Findings summary (38 ledger entries)

- **5 critical**: F-001 unauth WS shell bridge `/ws/shell` (browser-reachable RCE when SHELL_SERVICE_KEY set) · F-002 `/api/auth/bootstrap` key disclosure + chrome-extension origin bypass + non-constant-time compare · F-003 four LAN-exposed unauth servers (8471/8472/8777/11434, verified 200 from LAN) · F-004 51.8MB backend DB blob in git history (blob 2b4c602e, sha256 2bb96e5d, intro 8d006be6) · F-014 21MB `.claude/projects` session tool-results file in git history.
- **7 high**: F-005 Nexus app binds all interfaces + unauth data APIs · F-006 MCP/hook `sh -c $(git rev-parse --show-toplevel)` untrusted-repo code exec · F-007 PTY WS dev-mode no-auth · F-015 ~4.7GB runtime-state blobs in history + 43/41MB corpus jsonl tracked · F-023/F-024 npm audit (root 27 vulns 3 crit / backend 13 vulns 10 high: axios, multer, ws, vite, swiper) · F-025 whatsapp-mcp active in Cursor with send_message/send_file/send_audio (18 procs, prompt-injection → WhatsApp sends).
- **8 medium / 7 low**: voice/keychain surface (F-010/F-019), design-assistant WS surveillance (F-018), memory-bus metadata tracked (F-009u), launchd persistence surface (F-016), worktree abs-path MCP (F-022), etc.
- **11 clean/control records**: H1 history-secret CLEAN, S3/S8/S9 clean, F3 deny-by-default policy control, S5 secret-leak control green ×4, C2 auth-adequate, convergence records.

## Verification ledger summary

- 15 core findings independently re-verified by Orion (PASS, verification-verdicts.jsonl, no self-verification).
- 4 additional PASS-verified (F-004/F-012/F-013/F-025).
- 3 consecutive clean cycles logged (F-034 drift record, F-035 candidate, F-037 confirmed).
- Live evidence rule enforced: full path + pid + cwd on all process evidence.

## Regen + test instructions

1. `npx gitnexus analyze --skip-agents-md` (step #9 in PLAN.md — pre-merge, ~45s, untracked derived index)
2. `node /tmp/yuri-recon/merge/merge-prototype.mjs` → merged.jsonl + meta
3. Determinism test: run twice → identical `merged.jsonl.sha256` (currently e461ad0c…)
4. `node _SYSTEM/Scripts/security/ast-js.mjs <file>` / `ast-bash.mjs` for sink scans; `node _SYSTEM/Scripts/secret-leak-scan.mjs` for secrets (currently green)
5. On owner approval: promote per G1, commit scoped (schema, regen script, determinism test, ledger, verdicts, PLAN.md), never state/logs.

## Hardening backlog (open findings)

See `backlog-table.md` (38 rows, severity-sorted) — generated from findings.jsonl at assembly time.

## Promoted-file manifest

See `FILE-MANIFEST.md` — schema, regen script, determinism test, findings ledger, verdicts, evidence .out files, merge plan + research notes, master prompt + wayfinder map.
