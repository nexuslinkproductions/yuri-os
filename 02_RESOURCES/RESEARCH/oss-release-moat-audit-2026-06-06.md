---
name: oss-release-moat-audit-2026-06-06
description: Pre-OSS-release audit (DeepSeek moat lane, 2026-06-06) — release-blocking gaps before YURI goes public on GitHub (~1.5–2 wk). Hardening-first ordering. The headline risk: the C3 ./-prefix protected-path bypass fix may NOT have propagated beyond the Nexus Guard → still live at the bash gate. Plus git-history secrets, dependency/license, README/SECURITY, watermark fragility.
metadata: { node_type: research, date: 2026-06-06, status: audit-actionable, source: deepseek-moat-lane, priority: release-blocking }
tags: oss_release, moat, security_hardening, protected_path, secret_scan, licensing, pre_release_audit
---

# YURI OSS Pre-Release Moat Audit (what we missed)

Ordering verdict: **HARDENING-FIRST** (LICENSE + protected-path consolidation + secret scan + dep audit) → **NEXUS CORE rename second** → **watermark parallel/post-release**. The moat (math/science corpus) is solid; the GATES around it have structural duplication to fix before the drawbridge drops.

## RELEASE-BLOCKING (must precede a public push)

### 1. Protected-path duplication → ./-bypass may be LIVE at other gates  ⚠ HIGHEST LEVERAGE
`PROTECTED_PREFIXES` lives in 4 unsynced places:
- `regenerative-nexus-guard.mjs` — own `PROTECTED_PREFIXES` + `isProtectedRel` + `normalizeRel` (C3-HARDENED: ./-collapse, ../-escape, absolute fail-closed — the battle-tested one)
- `bash-security-guard.js` — own `PROTECTED_ROLE_PATHS_FALLBACK` + `ROLE_TRUST_SURFACES`
- `operator-write-guard.js` — own `PROTECTED_ROLE_FILES` / `PROTECTED_ROLE_DIRS`
- `.claude/settings.json` deny-list — a 4th source of truth
**The C3 `./`-prefix fail-open fix landed ONLY in the Nexus Guard. If bash/operator guards still do lexical `startsWith` without normalization, the bypass is STILL LIVE at the bash gate.** → consolidate into `_SYSTEM/Scripts/yuri-protected-paths.mjs` (promote the Nexus Guard's normalizeRel/isProtectedRel), refactor all guards to import it, verify settings deny-list ⊆ canonical. (Wave-B lane building this now.)

### 2. Secret/credential leakage in git HISTORY
Pre-commit scans the STAGED diff only. A public push exposes EVERY historical commit — any API key / token / `.env` content in ANY past commit is irreversible exposure. → full-history scan (`git filter-repo`/`bfg` or `trufflehog`/`gitleaks --log-opts`) + a pre-PUSH hook that scans the diff. (Ties to the queued "secret-scan concatenation/base64" infra item.)

### 3. Tracked-protected + .gitignore audit
Verify `.env`, `backend/data/`, `.claude/{state,history,file-history,projects}`, the memory dbs, and the 9,487-report bug-bounty corpus are NOT tracked (pre-commit shows `tracked_protected:0` for STAGED — verify HISTORY + the full tree). `03_NEXUS-LINK/bug-bounty/` is currently untracked (good) — keep it out.

### 4. Dependency / supply-chain + license compatibility
`node_modules/` + `_SYSTEM/tools/needle/.venv/` vendored deps unchecked for CVEs + COPYLEFT licenses that would infect the OSS release. + a root `LICENSE` (the watermark is provenance, NOT the legal license).

## RELEASE-HYGIENE (should precede, not strictly blocking)
- **README.md / SECURITY.md / CONTRIBUTING.md ABSENT** — `_SYSTEM/INDEX.md` is internal nav, not public-facing. Need install + architecture + vuln-disclosure policy.
- **Watermark fragility** — a `prettier --write .` / `eslint --fix .` pass can normalize whitespace + reorder imports, disturbing structural (Type-E) mark sites. The mark-site map MUST verify survival under both before trusting it.
- **Corpus/handoff exposure** — `02_RESOURCES/RESEARCH/` session handoffs reveal lane orchestration + fleet config + dev velocity (competitive-intel leak, not a security risk). Decide whether handoffs ship public.

## Canonical protected-path module — recommended shape
```
_SYSTEM/Scripts/yuri-protected-paths.mjs   (single source of truth)
  exports: PROTECTED_PREFIXES, isProtectedRel(rel), normalizeRel(rel),
           assertContained(abs,root,label), PROTECTED_ROLE_PATHS
```
nexus-guard / bash-security-guard / operator-write-guard → import it, drop local lists. `math-register-guard` stays scoped (different concern). settings.json deny-list ⊆ the canonical list (audit step).

SEE: [[feedback-infra-gate-posture-stress-test-2026-06-06]], [[oss-watermark-2026-06-06]], [[delta-gate-severity-laundering]].
