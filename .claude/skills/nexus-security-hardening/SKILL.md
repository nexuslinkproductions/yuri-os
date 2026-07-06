---
name: nexus-security-hardening
description: Wave-2 security hardening for Nexus Link — runs the diagnostic tools, dispatches the MURE build, verifies the gates. Invoke for "wave 2", "security hardening", "nexus security", "pre-customer security", "rls audit", "audit chain verify", "antipattern scan".
triggers: [wave 2, security hardening, nexus security, pre-customer security, rls audit, audit chain verify, antipattern scan, wave2]
---

# Nexus Security Hardening (Wave 2)

Wave 2 is the **pre-customer security gate** (MASTER-PLAN §11): close the three load-bearing gaps (network perimeter, tamper-evident audit, real encryption) before any tenant PII lands on Hetzner. This skill orchestrates the diagnostic-verify-build-verify cycle, builds from the verified Code Reference Pack, and dispatches the MURE fleet on the codebase leaves.

**Hard truth from the research:** Nexus's breach risks are misconfigured boring infrastructure (Capital One = SSRF, Equifax = unpatched CVE, LastPass = dev-held-prod-keys, MOVEit = SQLi, 23andMe = no MFA, Colonial = legacy VPN, SolarWinds = build-pipeline), not exotic zero-days. The meta-failure across nearly every breach is *insufficient detection* (78-day dwell at Equifax). Detection + response is the real safety net.

## Source-of-record (read before building)

- `02_RESOURCES/RESEARCH/nexus-security-hardening-deep-research-2026-07-06.md` — the WHAT (3 gaps, 4 designs, 10 breach vectors, 30-line build spec).
- `02_RESOURCES/RESEARCH/nexus-security-code-reference-pack-2026-07-06.md` — the HOW (20 controls, verbatim code, sources, license, pitfalls, Nexus adaptation).
- `docs/NEXUS-LINK-WAVE2-SECURITY-VISUAL-PLAN-2026-07-06.html` — the legible plan (build sequence, gates, effort map).

## Diagnostic tools (verify — run BEFORE and AFTER each slice)

Bundled in `scripts/`. Heuristic — flags candidates for human review. Each finding points at the control that fixes it.

- **`antipattern-scan.mjs`** (this skill) — greps for the DO-NOT-USE anti-patterns (str(e) logging, bcrypt, AES-GCM random nonce, SMS 2FA, psycopg client-merge, global WAF rule removal, fast-hash passwords, pepper-in-env, TLS-verify-disabled, pg_hba trust). Exit 1 on critical → CI gate.
- **`rls-audit`** (TODO) — every Postgres table: RLS on? anon/authenticated readable without owner-scoping? Flags the silent anon-key bypass.
- **`audit-chain-verify`** (TODO) — runs the nightly hash-chain verification query; any BROKEN_LINK / ROW_HASH_MISMATCH = breach signal.
- **`network-perimeter-check`** (TODO) — no public DB/Studio ports, origin IP not in DNS, allowlist freshness < 25h.
- **`dep-scan`** (TODO) — wraps syft/grype across Python/Rust/Tauri-npm.

Run the suite: `node .claude/skills/nexus-security-hardening/scripts/antipattern-scan.mjs 03_NEXUS-LINK/nexus-app`.

## The build sequence (highest-leverage first — each ends in a gate)

1. **Network perimeter** (L4a/b) — ufw default-deny + Cloudflare-origin allowlist + bind 127.0.0.1 + Tunnel. *Cheapest, highest leverage.* GATE: no public DB/Studio ports.
2. **Audit hash-chain spine** (L3) — audit_log (NO UPDATE/DELETE) + 0x00-prefixed BEFORE-INSERT trigger + nightly verify + PII triggers + log sanitizer (fixes str(e)). GATE: nightly verify all-OK; deliberate tamper detected.
3. **Field-level encryption** (L1a) — XChaCha20-Poly1305-IETF for tokens + DM bodies; LUKS on hosts. GATE: ciphertext round-trips; AAD binds to (tenant,row).
4. **Envelope + Vault KEK** (L2) — self-hosted EU Vault, transit engine, per-tenant keys. GATE: cross-tenant wrapped_dek won't decrypt.
5. **App-layer** (L5) — SECURITY DEFINER public writes + psycopg3 binding + SSRF guard (reuse social-adapter) + log sanitizer. GATE: G1 tenant-isolation negative test green.
6. **Supply chain + WAF block-mode** (L6) — SBOM/grype + SLSA L3 + scoped deps + Tauri signing; WAF flips log→block after 2-week tuning.

## MURE dispatch (the fleet executes the codebase leaves)

Wave 2 → role-assigned leaves. MURE is **owner-armed** (spend) — prep the packet at zero cost, owner arms. **Infra pieces** (real Hetzner ufw, Cloudflare dashboard, Vault cluster) need the owner's hands — MURE builds the config/scripts.

| Role | Leaves |
|------|--------|
| **architect** | audit_log schema + RLS policies + SECURITY DEFINER functions (the SQL design) |
| **engineer** | Python modules (log sanitizer, SSRF guard, Argon2id/PEPPER, envelope calls) + migrations |
| **mechanic** | infra plumbing (ufw script, Cloudflare allowlist sync, Tunnel config, Tailscale, Vault standup script) |
| **sentinel** | runs the diagnostic tools (antipattern-scan, rls-audit, chain-verify), writes the posture report |
| **adjudicator** | attacks each slice: G1 tenant-isolation negative test, hash-chain tamper detection, SSRF redirect-to-metadata, WAF false-positive review |
| **chronicler** | the G12 incident runbook (DSGVO Art. 33 72h clock) + the build record |
| **oracle/calibrator** | gate evidence (each control's verification ledger) |

## DO NOT USE (the verify-pass-killed anti-patterns — antipattern-scan enforces)

Hand-rolled AES-GCM · bcrypt for new code · a linear hash chain labeled "RFC 6962" (it's a Merkle tree with mandatory 0x00/0x01 prefixes) · global WAF rule removal · SMS 2FA · pepper in DB/.env/repo · US-region KMS · psycopg ClientCursor/mogrify · Cloudflare One Access mTLS as workload auth · WAF in block-mode day 1.

## The two trap doors (do not skip)

<!-- @anchor: v1 | failure: research wf_5fdd3afa verify-pass refuted the audit hash-chain RFC 6962 mislabel + the omitted 0x00 prefix | regression: scripts/antipattern-scan.mjs + audit-chain-verify + the L3a/L3b controls in the Code Reference Pack -->
- **The 0x00 prefix is mandatory.** RFC 6962 §2.1 requires `0x00` leaf / `0x01` node domain-separation or second-preimage resistance is lost. The audit chain MUST include `E'\\x00'` before the canonical bytes.
<!-- @anchor: v1 | failure: OWASP CRS false-positive storms block paying tenants when WAF ships in block-mode day 1 (German umlauts, JSON-with-SQL-keywords trip 942100/932100) | regression: the 2-week log-mode cadence gate in the visual plan §03 -->
- **WAF block-mode is a GATE, not a default.** Log-mode 2 weeks → targeted `ctl:ruleRemoveTargetById=<id>;ARGS:<param>` exclusions → only then flip to block.

## "Done" = the pre-customer gate

Network default-deny live · audit hash-chain + nightly verify green · tokens/bodies field-encrypted under per-tenant Vault keys · G1 tenant-isolation negative tests in CI · SBOM + signed Tauri releases · WAF in block-mode · L5.5 detection wired to the G12 runbook. **No paying tenant PII on Hetzner until those are green.**

## Session Notes
### 2026-07-06
- session: first build | tools: Write×2, Bash (scan run)
- built: master skill + `antipattern-scan.mjs` (10 patterns, CI gate). TODO: rls-audit, audit-chain-verify, network-perimeter-check, dep-scan.
- corrections: none (the RFC 6962 correction was caught upstream in the code-pack verify pass + folded into the L3a/L3b controls)
- errors: none
- notes: skill + tool travel together under `.claude/skills/nexus-security-hardening/`; the tool is `@capability`-tagged for recall. Infra pieces + MURE arming are owner-gated.
