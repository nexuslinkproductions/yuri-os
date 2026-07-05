# Nexus Link — Security Hardening Deep Research (Wave 2 build spec)

**Date:** 2026-07-06
**Provenance:** 4-angle Workflow fan-out → 3 adversarial verifications → synthesis (8 agents, 604k tokens, 109 tool-uses, ~11 min). Run ID `wf_2f71917f-26e`. Authoritative defensive sources only (OWASP, NIST SP 800-57/800-63B/800-92/800-207/800-41, CIS v8, MITRE ATT&CK, RFC 6962/5116/8452, libsodium docs, c2sp.org/age, named-breach post-mortems). Verify pass downgraded one overclaim (Cloudflare One Access mTLS is human/device-to-app, NOT workload-to-workload) and killed one unsourced attribution (no primary evidence for a "GitHub+OAuth SSRF breach"; Capital One remains the anchor).
**Feeds:** Wave 2 hardening (pre-customer, MASTER-PLAN §11). Output of `docs/NEXUS-LINK-SOCIAL-CONNECT-VISUAL-PLAN-2026-07-05.html` §07 posture.

---

## 0. The honest headline

**Nexus's biggest breach risks are not exotic zero-days — they are misconfigured boring infrastructure: an internet-reachable Postgres port, a flat Docker bridge, a mutable audit log, an unpatched dependency, a reused admin password.** Every named breach (Capital One, Equifax, LastPass, MOVEit, 23andMe, Colonial Pipeline, MGM, SolarWinds) traces to one of these. The L1–L6 posture is a labeled skeleton, not a hardened system. Three load-bearing gaps close before any tenant PII lands on Hetzner.

---

## 1. The three load-bearing gaps (close before first tenant)

1. **NETWORK PERIMETER (absent).** Kong/Postgres/Studio bind to all interfaces with no host firewall. **Highest-leverage Wave-2 fix:** host default-deny + Cloudflare-origin IP allowlist + bind-to-127.0.0.1. Collapses the gateway-secrets-surface + Studio-direct risk at L3/L4 instead of chasing it per-service.
2. **AUDIT TRAIL IS A STUB.** The `audit_log` table isn't migrated; covers only leads/contacts INSERT/UPDATE/DELETE (not exports/admin/token-vault); is **mutable** (forensically worthless — a compromised admin UPDATEs history undetected); has no redaction filter (`str(e)` in 500s leaks tokens, defeating L3.5); feeds no alerting. A breach runbook is dead without a detection layer.
3. **ENCRYPTION IS UNDER-SPECIFIED.** "Encrypted at rest" is meaningless without the primitive, nonce source, key hierarchy. Postgres has **no native TDE** on managed Supabase; Supabase **deprecated pgsodium TCE** and warns against **pgcrypto** (raw-key leakage in SQL logs). Defensible design: **LUKS on Hetzner hosts + app-level XChaCha20-Poly1305-IETF** (192-bit nonce sidesteps the AES-GCM nonce-reuse catastrophe) for tokens/message bodies, **envelope-wrapped per-tenant under a Vault-rooted KEK**.

---

## 2. Audit/logging architecture

**WHAT to log:** every auth event (login/refresh/logout success+fail, MFA step-up); every OAuth connect/disconnect/revoke + token-refresh failure; every RLS-guarded CRUD on leads/contacts/contracts/commission_ledger; every admin role change; every key rotation in the token vault; **every bulk export** (currently missed — real data-exfil blind spot); application errors; validation failures (OWASP: "can only be attack activity"); session failures.

**WHAT NEVER to log:** OAuth access/refresh tokens; DM message bodies; PII beyond a hashed user-id; the `service_role` key; Authorization headers; DB connection strings. **CRITICAL:** `server.py` uses `str(e)` in 500s → can echo tokens/stack into logs. Remediation = centralized log handler with a denylist sanitizer (token-shaped regexes, Bearer prefixes, refresh_token patterns) running BEFORE any line is written. CR/LF sanitization for log-injection.

**STRUCTURE:** one JSON schema across server.py / Fastify / Postgres trigger. WHEN (event_ts ISO-8601 UTC, interaction_id) · WHERE (host:port, route, method, code_location) · WHO (source_ip, actor_id, **workspace_id FIRST-CLASS** — multi-tenant correlation impossible without it) · WHAT (event_type per MITRE ATT&CK DC0002, severity, security_flag, action, object, result_status, http_status). One trace-id per request propagated Tauri→API→worker→DB-trigger. NTP across planes (CIS 8.4).

**IMMUTABILITY + TAMPER-EVIDENCE (RFC 6962):** (1) `audit_log` with NO UPDATE/DELETE policy — RLS deny-by-default on those verbs; (2) each row carries `prev_hash = sha256(prev_row_hash || canonical_json(this_row_fields))` — nightly verification job re-walks the chain (Certificate-Transparency append-only property at row granularity); (3) daily export to WORM/object-lock (Cloudflare R2 object-lock or Hetzner Storage Box append-only). A mutable audit log is forensically worthless — you can't prove the negative during incident response.

**RETENTION:** HOT (Postgres 90d, queryable) · WARM (R2 180–365d, IR lookup) · LEGAL-HOLD (indefinite per-case, Art. 17(3) legal-obligation exemption). **Carve `audit_log` OUT of the DSGVO erasure cascade** — right-to-be-forgotten ≠ delete the audit trail of one's own actions. Log the erasure event itself.

**ALERTING (L5.5 detection — currently absent):** scheduled job (pg_cron) scanning for: (1) failed-login spike >N per workspace_id per 5min; (2) impossible-travel geo-IP; (3) bulk-export exceeding tenant 30-day baseline; (4) new-IP/ASN admin action or token-vault access; (5) token-refresh-failure storm per connector. Without this, the DSGVO Art. 33 72-hour breach-notification clock starts when Marcel NOTICES, not when the breach happens — a direct regulatory liability.

---

## 3. Encryption design

**AT-REST — layered.** (a) **LUKS** volume encryption on Hetzner hosts = the bulk defense (physical-theft protection for ALL queryable PII — CRM rows, audit logs, indexed columns). (b) **App-level field encryption** ONLY for high-value secrets (OAuth tokens) + sensitive-not-queryable payloads (DM bodies, transcripts) — in the Python service BEFORE Postgres, storing opaque ciphertext + key_id. **Do NOT encrypt queryable columns** (kills indexing, adds blast radius for zero gain when LUKS covers at-rest). Do NOT use pgcrypto/pgcrypto; do NOT plan around PG18 TDE.

**PRIMITIVE — XChaCha20-Poly1305-IETF, NOT hand-managed AES-GCM.** AES-GCM nonce reuse is CATASTROPHIC (not graceful): reusing (key,nonce) reproduces the keystream, XOR of ciphertexts cancels it, and reuse exposes the GHASH auth key allowing forged tags — confidentiality AND integrity both fall (RFC 5116 forbids it). Random 96-bit nonces hit the 2^32 birthday bound. **XChaCha20-Poly1305-IETF's 192-bit nonce** makes random-nonce collision a non-issue at SaaS scale and removes the counter-state-to-persist footgun (no replica-divergence reuse). Via libsodium `crypto_aead_xchacha20poly1305_ietf`. AEGIS-256 only if AES-NI guaranteed + misuse-resistance required. The L3.5 token vault MUST wrap via libsodium, not a hand-instantiated Python AES-GCM.

**KEY HIERARCHY — envelope encryption:** KEK per tenant (rooted in KMS/Vault) → DEK per object-class-or-row → ciphertext. Generate DEK locally, encrypt data, wrap DEK with KEK (KMS never sees plaintext DEK; service holds KEK only for the unwrap call). Store `wrapped_dek` + `key_id` next to ciphertext. KEK/DEK stored separately. **Bonus: cryptographic shredding for DSGVO erasure** — delete the tenant KEK → all tenant data becomes unrecoverable ciphertext.

**KMS — self-hosted on Hetzner** (Vault or Infisical, transit engine as KEK root). Routing Nexus tokens through a US-cloud KMS undermines the DSGVO data-sovereignty positioning. KEK rotation 90 days (NIST SP 800-57 §5.3); DEK per-tenant-quarterly.

**PASSWORD HASHING — Argon2id, NEVER bcrypt for new code.** OWASP verbatim: Argon2id m=19456 (19MiB), t=2, p=1. scrypt fallback N=2^17,r=8,p=1. bcrypt = legacy only. PBKDF2 only if FIPS-140 (HMAC-SHA-256, 600,000 iterations). **Add a PEPPER** (HMAC-SHA-256 post-hash, key in Vault) for defense-in-depth against DB-only SQLi exfil. Verify Supabase Auth uses Argon2id; if bcrypt, migration ticket. Hash <1 second.

**IN-TRANSIT:** TLS 1.3 + HSTS `max-age=63072000; includeSubDomains; preload` at Cloudflare edge (submit hstspreload.org once eligible). Internal east-west = Zero Trust (NIST SP 800-207) — mTLS between services, **Postgres `sslmode=verify-full` + client cert** beats a full service mesh at Nexus scale. **Tauri client pins the backend cert/SPKI** (defeats Cloudflare-intercepted MITM on hostile networks).

**FILE/BACKUP — age, not GPG** (c2sp.org/age, X25519 + ChaCha20-Poly1305 AEAD, 128-bit file key, no reuse). For R2 backups + DSGVO export archives.

**NEVER roll your own.** Never hand-roll AES-GCM, never your own KDF, never reuse (key,nonce), never reversibly encrypt passwords.

---

## 4. Firewall / WAF stack

- **HOST FIREWALL — default-deny (absent, highest-leverage):** ufw/iptables deny all inbound except 443 (Cloudflare origin) + SSH non-standard port (key-only). Bind Postgres/Studio/internal to 127.0.0.1.
- **CLOUDFLARE ORIGIN ALLOWLIST:** Hetzner Cloud Firewall 80/443 restricted to Cloudflare IP ranges (cloudflare.com/ips, hourly sync). Origin IP NEVER in public DNS/MX/SSL-SAN. Orange-cloud proxied only.
- **DDoS:** mostly free if everything is orange-cloud (Cloudflare L3/L4/L7 always-on for proxied records). Hetzner gives baseline L3/L4. No extra spend pre-customer.
- **WAF — OWASP CRS PL1, anomaly-scoring, LOG-THEN-BLOCK:** Cloudflare Managed Ruleset + OWASP CRS, PL1, sensitivity default. Do NOT chase PL3/PL4 (false-positive cost on CRM/API traffic, German umlauts, JSON-with-SQL-keywords > marginal gain). Never skip rule 949110.
- **WAF TUNING DISCIPLINE:** targeted parameter-scoped exclusions (`ctl:ruleRemoveTargetById=<id>;ARGS:<param>`), NEVER global rule removal. **LOG mode 2 weeks → daily Events review → targeted exceptions → GATE: flip to BLOCK only after.** A WAF that blocks paying tenants is its own outage.
- **RATE-LIMITING — edge first, in-app second:** (a) `/auth/login` ~50 req/5min per IP, NAT-aware (closes 23andMe credential-stuffing); (b) `/api/public/leads/:slug` ~60/min per IP; (c) `/api/ai/chat` RPM + concurrent cap tied to credit budget.
- **ZERO-TRUST INTERNAL — remove the flat Docker bridge:** Cloudflare Tunnel for admin/Studio/pgAdmin (ZERO public ports); per-pair Docker networks; Postgres ONLY from app subnet; **Tailscale/WireGuard mesh for east-west workload identity + mTLS**. NOTE (corrected): Cloudflare One Access mTLS is human/device-to-app, NOT workload-to-workload — don't wire it as service-to-service auth.

---

## 5. Top breach vectors → control → Nexus layer

| Vector (OWASP) | Named breach + failure | Control that stops it | Layer |
|---|---|---|---|
| Broken Access Control / IDOR (A01:2025) | Capital One 2019 — SSRF→IMDS→over-permissive IAM role→S3, ~106M | RLS `workspace_id=app_current_workspace_id()` on every table + G1 negative-test (tenant A JWT can't touch tenant B) + never `service_role` in API paths | L2 |
| Cryptographic Failures (A02) | LastPass 2022 — stolen dev creds→repos→vaults; 500–1k PBKDF2 rounds vs 600k min | XChaCha20-Poly1305-IETF + Argon2id, per-tenant key separation, **dev Keychain NEVER holds prod tenant tokens** | L3.5 |
| Injection / SQLi (A03) | MOVEit CVE-2023-34362 — unauth SQLi, mass Cl0p exploitation | Public writes via `SECURITY DEFINER` PG functions + bound params; no string SQL; RLS backstop | L3 |
| Security Misconfig / unpatched CVE (A05) — DBIR 2025 #1 initial-access | Equifax 2017 — Apache Struts CVE-2017-5638 patched Mar, unpatched May–Jul, ~147M | Patch SLA (critical RCE ≤72h) + SBOM + automated CVE scan across Python/Rust/Tauri/Postgres | L4 |
| Supply-chain build-pipeline (A10:2025, new) | SolarWinds SUNBURST 2020 — backdoored signed Orion update, ~18k customers | Isolated CI, signed builds w/ provenance (SLSA L3+), SBOM. **Tauri binary = signed-code-delivery surface** | L6 |
| Credential stuffing / no MFA / SMS bypass (A07) | 23andMe 2023 (~6.9M); Reddit 2018 (SMS-2FA SS7 bypass) | Breached-password rejection (HIBP k-anon) + MFA mandatory (TOTP/WebAuthn, NEVER SMS) + login rate-limit | L1 |
| Stolen creds → ransomware (A07) | Colonial Pipeline 2021 (legacy VPN, no MFA); MGM 2023 (helpdesk vishing) | MFA on EVERY admin path + auto-deprovision inactive accounts + out-of-band verified-callback reset | L1 |
| SSRF (A10:2021) | Capital One (SSRF→IMDSv1→IAM→S3) — the anchor | Egress allowlist + block link-local/loopback/metadata IPs + resolve-then-re-verify + disable redirects on fetch | L3 |
| Insufficient Logging (A09) — the meta-failure | Equifax 78 days; MOVEit weeks; LastPass multi-month — dwell median 100+ days | Structured audit log on every PII mutation + detection rules + tested G12 runbook with Art. 33 72h clock | L5 |
| Dependency confusion (CICD-SEC-3) | Alex Birsan 2021 — public package shadowed internal names at Apple/Microsoft/Tesla | Pin internal names to scoped namespaces (@nexus/, .npmrc, pip-tools, Cargo) + commit lockfiles + CI fails on collision | L6 |

---

## 6. Wave-2 build spec (the actionable list)

**Network (highest leverage):** ufw default-deny (443 Cloudflare-origin-only + SSH non-standard key-only) · bind Postgres/Studio/internal to 127.0.0.1 · Cloudflare-IP allowlist sync script (hourly) · orange-cloud every public hostname + HTTP DDoS ruleset · Cloudflare Tunnel for admin/Studio/pgAdmin (zero public ports) · per-pair Docker networks · Tailscale/WireGuard mesh mTLS · Postgres `sslmode=verify-full` + client cert.
**WAF:** OWASP CRS PL1 log-mode → 2-week tuning → parameter-scoped exclusions → GATE to block-mode.
**Rate-limit (edge):** login 50/5min NAT-aware · public-form 60/min · AI-chat RPM+concurrent.
**At-rest:** LUKS on every Hetzner host · app-level XChaCha20-Poly1305-IETF for tokens + message bodies · envelope encryption (KEK per tenant in Vault/Infisical transit → DEK per row) · KEK rotation 90d.
**L1:** Argon2id m=19456/t=2/p=1 + PEPPER · HIBP breached-password rejection · MFA mandatory TOTP/WebAuthn (never SMS) for owner/admin/support · auto-deprovision inactive accounts · TLS 1.3 + HSTS preload · Tauri cert/SPKI pinning.
**L5 audit:** migrate `audit_log` NO UPDATE/DELETE (RLS deny) · triggers on every PII table + admin role changes + key rotations + bulk exports · single JSON schema (workspace_id first-class, trace-id) · centralized denylist-sanitizer log handler (fix `str(e)` token leak) · hash-chain `prev_hash` + nightly verify · daily WORM export to R2 object-lock · HOT/WARM/LEGAL-HOLD retention with audit_log carved OUT of erasure cascade.
**L5.5 detection:** pg_cron job for the 5 patterns (failed-login spike, impossible-travel, bulk-export anomaly, new-IP admin, token-refresh storm) + tested G12 breach runbook (Art. 33 72h + Art. 34).
**L2/L3:** G1 negative-test gate (tenant A can't touch tenant B) in CI before any PII on Hetzner · SECURITY DEFINER public writes (ship P0-05) · SSRF egress allowlist + metadata-IP block + redirect re-validation.
**L6:** SBOM + CVE scan (syft/grype) + patch SLA · isolated CI signing the Tauri build (SLSA L3) · scoped-namespace package pinning · age for backups/exports.

---

## 7. Authoritative OSS to adopt

libsodium (XChaCha20-Poly1305-IETF field crypto + Argon2id pwhash + secretbox) · age (file/backup crypto, replaces GPG) · HashiCorp Vault OR Infisical (self-hosted KMS, transit engine KEK root) · Cloudflare WAF + OWASP CRS · Cloudflare Tunnel + Tailscale/WireGuard (zero-public-origin + workload mTLS) · HaveIBeenPwned k-anonymity API · PostgreSQL pg_cron (detection-job runner) · Trillian (if hash-chain needs to scale to independent transparency logs) · fail2ban (SSH) · SLSA + syft/grype (SBOM + CVE scan).

---

## 8. Open questions

1. Does Supabase Auth use Argon2id or bcrypt? Migration path if bcrypt?
2. Confirm the L3.5 token vault replaces dev-Keychain with per-tenant envelope encryption BEFORE any real OAuth connector lands (LastPass lesson).
3. Vault vs Infisical on Hetzner — maturity vs DX vs ops budget (no platform team)?
4. Patch-SLA policy owner + on-call for critical CVEs (Equifax lesson — policy gap, not technical)?
5. Tauri HTTP plugin cert/SPKI pinning — which strategy survives Cloudflare edge-cert rotation?
6. Confirm `audit_log` retention is platform/legal-controlled, NOT tenant-self-service (G10 carve-out enforced server-side).
7. L5.5 detection thresholds — tuned against real traffic in first 2 weeks (same discipline as WAF)?
8. Helpdesk identity-reset out-of-band verified-callback procedure (MGM vector)?
9. Tauri build-pipeline integrity — who holds the signing key, is release CI isolated from dev creds, SLSA L3 in Wave-2 or deferred (SolarWinds surface)?
10. Cloudflare R2 object-lock vs Hetzner Storage Box append-only for WORM — which satisfies a future auditor's chain-of-custody?

---

*Companion: `docs/NEXUS-LINK-SOCIAL-CONNECT-VISUAL-PLAN-2026-07-05.html` §07 (posture) · `nexus-social-connect-deep-research-2026-07-05.md` + `nexus-analytics-ad-api-read-first-2026-07-05.md` (the token/OAuth layer this hardens).*
