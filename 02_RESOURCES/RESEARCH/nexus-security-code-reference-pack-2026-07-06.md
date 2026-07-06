# Nexus Link — Security Code Reference Pack (Wave 2 builds from this)

**Date:** 2026-07-06
**Provenance:** 6-lane Workflow gather → 5 adversarial verifications → synthesis (11 agents, 800k tokens, 148 tool-uses, ~16 min). Run ID `wf_5fdd3afa-c89`. All code is permissively-licensed OSS (ISC/MIT/Apache-2.0/BSD/PostgreSQL-License) or official-doc examples; **no proprietary/leaked code.** Primary sources re-fetched verbatim where load-bearing: RFC 6962 §2.1 (rfc-editor.org), OWASP Password Storage Cheat Sheet (OWASP GitHub raw), PyNaCl/libsodium headers, Postgres libpq docs.
**Purpose:** the canonical *how* — Wave 2 builds from these verified patterns, not paraphrase. Companion to `nexus-security-hardening-deep-research-2026-07-06.md` (the *what*) and the plan §07 posture.

---

## 0. CRITICAL CORRECTION (verify pass earned its keep)

**Lane 3's audit hash-chain was REFUTED.** It shipped `prev_hash = sha256(prev_row_hash || canonical_json)` and labeled it "RFC 6962 Certificate Transparency." Wrong on two counts:
1. **RFC 6962 is a binary Merkle TREE** (`MTH(D[n]) = SHA-256(0x01 || MTH(D[0:k]) || MTH(D[k:n]))`), not a linked-list chain.
2. It **omitted the mandatory `0x00` leaf / `0x01` node domain-separation prefix** that RFC 6962 §2.1 requires for second-preimage resistance.

The pack ships BOTH corrected forms (L3a faithful Merkle tree, L3b honestly-labeled prefixed linear chain). *Note: the earlier `nexus-security-hardening-deep-research-2026-07-06.md` propagated the same mislabeling — that doc's "RFC 6962 applied at row granularity" line should read "RFC 6962-inspired linear chain with the mandated 0x00 prefix; the faithful Merkle tree is L3a."* Either form is defensible; mislabeling is not.

---

## L1 — Crypto primitives (libsodium via PyNaCl)

### L1a — Field-level AEAD: `crypto_aead_xchacha20poly1305_ietf` (Python)
```python
import nacl.secret, nacl.utils
key = nacl.utils.random(nacl.secret.Aead.KEY_SIZE)   # 32 bytes; per-tenant via KMS+HKDF in prod
box = nacl.secret.Aead(key)
message = b"field-level plaintext"
aad = b"tenant_id=42::field=iban"                      # authenticated, NOT encrypted (binds ctxt to row)
encrypted = box.encrypt(message, aad)                  # nonce(24)||ciphertext||tag(16), auto
plaintext = box.decrypt(encrypted, aad)                # raises CryptoError on tamper/wrong AAD
```
- **Sources:** [PyNaCl secret.rst](https://raw.githubusercontent.com/pyca/pynacl/main/docs/secret.rst) · [libsodium crypto_aead_xchacha20poly1305.h](https://raw.githubusercontent.com/jedisct1/libsodium/master/src/libsodium/include/sodium/crypto_aead_xchacha20poly1305.h) · [draft-irtf-cfrg-xchacha](https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-xchacha-03) · [NIST SP 800-38D](https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf)
- **License:** PyNaCl Apache-2.0, libsodium ISC. Nexus MAY ship.
- **Nexus adaptation:** per-tenant key derived from KMS master via HKDF (never hardcoded). Store `nonce||ciphertext||tag` as one BYTEA column. Put `tenant_id + column + row_id` in AAD so a copied ciphertext can't replay into another row/tenant.
- **Pitfalls:** AES-GCM nonce reuse is catastrophic (96-bit); XChaCha20's 192-bit random nonce makes collision negligible (~2^96). Never swap to AES-GCM without a deterministic-counter strategy. Random source MUST be `nacl.utils.random`, never Python `random`. Storing the key next to the ciphertext defeats the control.

### L1b — Argon2id password hashing (OWASP m=19456/t=2/p=1)
```python
import nacl.pwhash
ops_limit = nacl.pwhash.argon2id.OPSLIMIT_INTERACTIVE        # = 2 (OWASP t=2)
mem_limit = 19456 * 1024                                      # m=19456 KiB = 19 MiB (BYTES in PyNaCl)
hash_str = nacl.pwhash.argon2id.str(password, opslimit=ops_limit, memlimit=mem_limit)
# stores b'$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>'  (self-describing)
try:
    nacl.pwhash.argon2id.verify(hash_str, password)          # True; raises InvalidkeyError on miss
except nacl.exceptions.InvalidkeyError:
    raise AuthRejected("invalid credentials")
```
- **Sources:** [PyNaCl password_hashing.rst](https://raw.githubusercontent.com/pyca/pynacl/main/docs/password_hashing.rst) · [OWASP Password Storage Cheat Sheet](https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Password_Storage_Cheat_Sheet.md) · [RFC 9106](https://www.rfc-editor.org/rfc/rfc9106.txt)
- **License:** PyNaCl Apache-2.0, libsodium ISC, Argon2 ref impl CC0. OWASP CC BY-SA 3.0 (attribution only if redistributed verbatim).
- **Pitfalls:** NEVER bcrypt for new code (legacy-only, truncates at 72 bytes). NEVER fast hashes. `str()` generates the salt internally — don't pass your own. `memlimit` is BYTES (19456*1024); passing 19456 gives 19 KiB = catastrophically weak. `verify()` is already timing-safe — don't wrap in `==`. Cap incoming password length server-side (~1024 bytes) to bound KDF cost.

### L1c — PEPPER (post-hashing HMAC-SHA-256, key OUT OF BAND)
```python
import hmac, hashlib, nacl.pwhash
PEPPER = kms.get_secret('nexus/auth/argon2id-pepper')        # 32 bytes, from KMS/Vault/HSM
argon2id_str = nacl.pwhash.argon2id.str(password, opslimit=..., memlimit=19456*1024)
stored_argon2 = argon2id_str                                 # TEXT column
stored_hmac   = hmac.new(PEPPER, argon2id_str, hashlib.sha256).digest()   # BYTEA
# verify:
ok = (hmac.compare_digest(hmac.new(PEPPER, stored_argon2_from_db, hashlib.sha256).digest(),
                          stored_hmac_from_db)
      and nacl.pwhash.argon2id.verify(stored_argon2_from_db, provided))
```
- **Sources:** [OWASP Password Storage — Peppering](https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Password_Storage_Cheat_Sheet.md) · [RFC 2104 HMAC](https://www.rfc-editor.org/rfc/rfc2104.txt)
- **Nexus adaptation:** pepper fetched at service boot from Hetzner-side KMS, held in memory only, never disk/Postgres/logs. Rotation = forced password reset (document in the breach runbook BEFORE arming). Versioning byte prefix on the stored HMAC so rotation is detectable.
- **Pitfalls:** storing pepper in DB/.env/repo defeats it (OWASP-forbidden; #1 breach of this pattern). PRE-hashing pepper (concat) is weaker + has null-byte/password-shucking hazards — post-hashing HMAC is correct. Pepper is the HMAC KEY, not the message. `==` leaks timing — use `compare_digest`.

---

## L2 — Envelope encryption + KMS + age backups

### L2a — Vault transit envelope encryption
```python
import base64, secrets, ctypes
from nacl.bindings import crypto_aead_xchacha20poly1305_ietf_encrypt, crypto_aead_xchacha20poly1305_ietf_decrypt
# POST /transit/datakey/plaintext/:name -> {plaintext (DEK), ciphertext (wrapped_dek)}
# POST /transit/decrypt/:name  body {ciphertext} -> {plaintext (DEK)}   (KEK never leaves Vault)
def envelope_encrypt(plaintext, tenant_ctx):
    r = requests.post(f"{VAULT}/transit/datakey/plaintext/{KEK_NAME}",
                      headers={"X-Vault-Token": _vault_token()},
                      json={"bits": 256, "context": base64.b64encode(tenant_ctx).decode()}).json()["data"]
    dek = base64.b64decode(r["plaintext"]); wrapped_dek = r["ciphertext"]
    nonce = secrets.token_bytes(24)
    ciphertext = crypto_aead_xchacha20poly1305_ietf_encrypt(plaintext, tenant_ctx, nonce, dek)
    ctypes.memset(dek, 0, len(dek))                           # zeroise ASAP
    return {"ciphertext": ciphertext, "nonce": nonce, "wrapped_dek": wrapped_dek,
            "key_id": f"vault:{KEK_NAME}:v1", "context_b64": ...}
```
- **Sources:** [Vault transit API](https://developer.hashicorp.com/vault/api-docs/secret/transit) · [Vault transit docs](https://developer.hashicorp.com/vault/docs/secrets/transit)
- **Nexus adaptation:** self-hosted Vault on Hetzner (EU sovereignty); one transit key per tenant (`nexus-tenant-<id>-kek`); reuse Postgres tenant_id as derivation context → per-tenant isolation enforced at the KEK layer. mTLS service↔Vault inside the mesh.
- **Pitfalls:** zeroise the DEK with `ctypes.memset`, scope to one function, never cache. `secrets.token_bytes(24)` per encryption (nonce reuse catastrophic). Keep Vault EU-hosted (US KMS breaks DSGVO/Schrems II). Per-tenant context mandatory or wrapped_dek cross-decrypts under wrong policy.

### L2b — age (rage/pyrage) for R2 backups + DSGVO exports
```shell
$ rage-keygen -o key.txt                                        # X25519 identity (crown jewel)
$ rage -o backup.tar.zst.age -r age1...recipient backup.tar.zst # unique 128-bit file key per file
$ rage -d -i key.txt backup.tar.zst.age > backup.tar.zst
```
```python
from pyrage import x25519, encrypt, decrypt
ident = x25519.Identity.generate()                              # once per tenant, wrap under Vault KEK
recipient = ident.to_public()                                   # age1... safe to store plaintext
encrypted = encrypt(blob, [recipient])                          # age v1, unique file key auto
restored = decrypt(encrypted, [ident])
```
- **Sources:** [rage README](https://raw.githubusercontent.com/str4d/rage/main/README.md) · [pyrage README](https://raw.githubusercontent.com/woodruffw/pyrage/main/README.md) · [c2sp.org/age](https://c2sp.org/age)
- **License:** rage MIT/Apache-2.0, pyrage MIT, age spec BSD-3-Clause.
- **Nexus adaptation:** per-tenant age identity, `str(ident)` wrapped under Vault KEK. Multi-recipient (`-r tenant -r ops-break-glass`) for legitimate-key-access compliance. `tar ... | rage -r recipient > r2://bucket/backup.age` for R2.
- **Pitfalls:** the AGE-SECRET-KEY identity is the crown jewel — never plaintext at rest. age has no native revocation (rotate identity + re-encrypt for forward secrecy). No native KMS — KMS wraps the age identity, not vice-versa.

---

## L3 — Tamper-evident audit log (corrected)

### L3a — Faithful RFC 6962 Merkle TREE (off-host root publication)
```python
import hashlib, json, math
LEAF, NODE = b'\x00', b'\x01'                                  # MANDATORY domain separation (RFC 6962 §2.1)
def canonical_bytes(row): return json.dumps(row, sort_keys=True, separators=(',',':'), ensure_ascii=False).encode()
def leaf_hash(rb): return hashlib.sha256(LEAF + rb).digest()
def mth(leaf_hashes):                                           # Merkle Tree Hash, shape by len
    if not leaf_hashes: return hashlib.sha256(b'').digest()
    if len(leaf_hashes) == 1: return leaf_hashes[0]
    k = 1 << (len(leaf_hashes).bit_length() - 1)               # largest pow2 < n
    return hashlib.sha256(NODE + mth(leaf_hashes[:k]) + mth(leaf_hashes[k:])).digest()
# Build nightly over ordered rows; publish root to immutable off-host (R2 object-lock).
```
- **Sources:** [RFC 6962](https://www.rfc-editor.org/rfc/rfc6962.txt) · [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- **Pitfalls:** OMITTING the 0x00/0x01 prefix loses second-preimage resistance — the load-bearing defect. Deterministic canonicalization (sort_keys + UTC ISO-8601 + separators) is mandatory or recomputation breaks. A superuser can recompute+rewrite the in-DB chain consistently — only the OFF-HOST root defeats that.

### L3b — In-DB linear hash chain (honestly labeled, 0x00 prefix)
```sql
CREATE TABLE audit.audit_log (
    seq BIGSERIAL PRIMARY KEY, workspace_id UUID NOT NULL, actor_id UUID,
    table_name TEXT NOT NULL, action CHAR(1) NOT NULL CHECK (action IN ('I','U','D')),
    row_pk TEXT, row_payload JSONB NOT NULL,
    happened_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    prev_hash TEXT NOT NULL, row_hash TEXT NOT NULL
);
REVOKE ALL ON audit.audit_log FROM public; GRANT INSERT, SELECT TO nexus_app;  -- no UPDATE/DELETE
CREATE OR REPLACE FUNCTION audit.tg_audit_chain() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
DECLARE v_prev audit.audit_log%ROWTYPE; v_blob text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain'));     -- serialize concurrent writers
  SELECT * INTO v_prev FROM audit.audit_log ORDER BY seq DESC LIMIT 1;
  NEW.prev_hash := CASE WHEN FOUND THEN v_prev.row_hash ELSE encode(digest('','sha256'),'hex') END;
  v_blob := jsonb_build_object('seq',NEW.seq,'workspace_id',NEW.workspace_id,'actor_id',NEW.actor_id,
    'table_name',NEW.table_name,'action',NEW.action,'row_pk',NEW.row_pk,'row_payload',NEW.row_payload,
    'happened_at',to_char(NEW.happened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'prev_hash',NEW.prev_hash)::text;
  NEW.row_hash := encode(digest(E'\\x00' || v_blob::bytea, 'sha256'), 'hex');  -- 0x00 prefix MANDATORY
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_audit_chain BEFORE INSERT ON audit.audit_log
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_chain();
```
- **Pitfalls:** the 0x00 prefix is the corrected Lane-3 defect. MUST be BEFORE INSERT + NOT NULL (an AFTER trigger or Python-side hash leaves a NULL-hash window). `pg_advisory_xact_lock` prevents concurrent-writer chain races. JSONB + fixed UTC formatting for deterministic recompute. This is a CHAIN, not RFC 6962 — don't relabel.

### L3c — Append-only enforcement (REVOKE + defense-in-depth trigger + DDL guard)
```sql
REVOKE UPDATE, DELETE, TRUNCATE ON audit.audit_log FROM PUBLIC, audit_owner, nexus_app;  -- owner self-revoke
CREATE OR REPLACE FUNCTION audit.tg_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit.audit_log is append-only: % (seq=%)', TG_OP, COALESCE(OLD.seq,NEW.seq)
      USING ERRCODE = 'check_violation'; END; $$;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON audit.audit_log FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_immutable();
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON audit.audit_log FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_immutable();
CREATE OR REPLACE FUNCTION audit.tg_block_audit_ddl() RETURNS event_trigger LANGUAGE plpgsql AS $$
BEGIN IF EXISTS (SELECT 1 FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('DROP TABLE','ALTER TABLE','DROP SCHEMA') AND COALESCE(schema_name,'')='audit')
    THEN RAISE EXCEPTION 'DDL on audit.* forbidden' USING ERRCODE='insufficient_privilege'; END IF; END; $$;
CREATE EVENT TRIGGER trg_audit_ddl_guard ON ddl_command_end
  WHEN TAG IN ('DROP TABLE','ALTER TABLE','DROP SCHEMA') EXECUTE FUNCTION audit.tg_block_audit_ddl();
```
- **Pitfalls:** a SUPERUSER bypasses ALL privilege checks — never let the app connect as superuser. TRUNCATE doesn't fire row-level DELETE triggers → revoke explicitly + statement trigger. Owner self-revoke alone insufficient if app runs AS owner.

### L3d — Nightly chain-verification query
```sql
WITH ordered AS (
  SELECT seq, prev_hash, row_hash, row_payload, happened_at, workspace_id, actor_id, table_name, action, row_pk,
         LAG(row_hash) OVER (ORDER BY seq) AS expected_prev_hash FROM audit.audit_log
), recomputed AS (
  SELECT seq, prev_hash, row_hash, expected_prev_hash,
    encode(digest(E'\\x00' || jsonb_build_object('seq',seq,'workspace_id',workspace_id,'actor_id',actor_id,
      'table_name',table_name,'action',action,'row_pk',row_pk,'row_payload',row_payload,
      'happened_at',to_char(happened_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'prev_hash',prev_hash)::text::bytea,'sha256'),'hex') AS expected_row_hash FROM ordered
)
SELECT seq, CASE
  WHEN seq=(SELECT MIN(seq) FROM audit.audit_log) AND prev_hash<>encode(digest('','sha256'),'hex') THEN 'GENESIS_HASH_MISMATCH'
  WHEN prev_hash IS DISTINCT FROM expected_prev_hash THEN 'BROKEN_LINK'
  WHEN row_hash  IS DISTINCT FROM expected_row_hash  THEN 'ROW_HASH_MISMATCH'
  ELSE 'OK' END AS verdict
FROM recomputed WHERE prev_hash IS DISTINCT FROM expected_prev_hash
   OR row_hash IS DISTINCT FROM expected_row_hash
   OR (seq=(SELECT MIN(seq) FROM audit.audit_log) AND prev_hash<>encode(digest('','sha256'),'hex'))
ORDER BY seq;  -- run via pg_cron nightly; any non-OK = breach signal (DSGVO Art. 33)
```
- **Pitfalls:** recomputation MUST be byte-identical to the trigger (shared canonicalization helper, never copy-paste). Persist `(last_verified_seq, root_hash)` to walk only the suffix + overlap (LAG is O(N)). Also check for seq gaps (a deleted latest row is invisible to LAG).

### L3e — SECURITY DEFINER PII-audit trigger (leads/contacts/connector_tokens)
```sql
CREATE OR REPLACE FUNCTION audit.append_event(p_workspace_id uuid, p_actor_id uuid, p_table_name text,
  p_action char, p_row_pk text, p_row_payload jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
BEGIN INSERT INTO audit.audit_log(workspace_id,actor_id,table_name,action,row_pk,row_payload)
      VALUES (p_workspace_id,p_actor_id,p_table_name,p_action,p_row_pk,p_row_payload); END; $$;
CREATE OR REPLACE FUNCTION audit.tg_pii_audit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, public AS $$
DECLARE v_ws uuid;
BEGIN v_ws := current_setting('app.workspace_id', true)::uuid;  -- app sets SET LOCAL per txn
  IF TG_OP='DELETE' THEN PERFORM audit.append_event(v_ws,NULL,TG_TABLE_NAME,'D',OLD.id::text,to_jsonb(OLD)-'id'); RETURN OLD;
  ELSIF TG_OP='UPDATE' THEN PERFORM audit.append_event(v_ws,NULL,TG_TABLE_NAME,'U',NEW.id::text,jsonb_build_object('old',to_jsonb(OLD)-'id','new',to_jsonb(NEW)-'id')); RETURN NEW;
  ELSIF TG_OP='INSERT' THEN PERFORM audit.append_event(v_ws,NULL,TG_TABLE_NAME,'I',NEW.id::text,to_jsonb(NEW)-'id'); RETURN NEW; END IF; RETURN NULL; END; $$;
CREATE TRIGGER leads_audit AFTER INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION audit.tg_pii_audit();
-- + contacts, connector_tokens (NEVER log raw token — hash or redact)
```
- **Pitfalls:** `SET search_path = pg_catalog, audit` MANDATORY inside SECURITY DEFINER (shadow-search_path escalation). AFTER trigger (logs final row state); the chain trigger (L3b) is BEFORE — both coexist. Capture app user via `current_setting('app.actor_id')` (session_user returns DEFINER). connector_tokens holds live OAuth secrets — log only a hash.

---

## L4 — Network perimeter + WAF + zero-trust

### L4a — ufw default-deny + Cloudflare-origin allow + non-standard SSH
```shell
ufw default deny incoming; ufw default allow outgoing
ufw allow 22022/tcp comment 'SSH admin'                        # /etc/ssh/sshd_config: Port 22022, PasswordAuth no, PubkeyAuth yes
for ip in $(cat /tmp/cf_ips); do ufw allow from "$ip" to any port 80,443 proto tcp comment 'Cloudflare'; done
ufw --force enable; ufw reload
```
- **Sources:** [cloudflare-ufw-updater (MIT)](https://github.com/jakejarvis/cloudflare-ufw-updater/blob/master/cf-ufw.sh) · [Cloudflare IPs](https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/)
- **Pitfalls:** LOCKOUT — allow SSH BEFORE `default deny`. Include ips-v6 or v6 bypasses. Keep origin IP OUT of public DNS (orange-cloud proxied only).

### L4b — Cloudflare origin-allowlist sync (idempotent diff-and-apply)
```shell
set -eu
curl -fsS "https://www.cloudflare.com/ips-v4" >> "$NEW"; echo >> "$NEW"; curl -fsS ".../ips-v6" >> "$NEW"; sort "$NEW" -o "$NEW"
cmp -s "$NEW" "$CURRENT" && exit 0                              # no change
# delete old CF-tagged rules, re-add from new set, swap, reload
```
- **Pitfalls:** ADD-then-SWAP beats delete-then-add (avoids transient 443 close). `curl -fsS` or a 5xx writes garbage. Sync both ufw AND hcloud firewall or split-brain. Never >24h staleness.

### L4c — OWASP CRS WAF (PL1) + parameter-scoped exclusion
```apache
# PL1 default. Parameter-scoped exclusion (REQUEST-900 BEFORE-CRS file):
SecRule REQUEST_URI "@beginsWith /api/v1/contact" "id:10001,phase:1,pass,nolog,ctl:ruleRemoveTargetById=942100;ARGS:message"
# DO NOT: SecRuleRemoveById 942100   (global removal re-opens the whole surface)
```
- **Sources:** [CRS REQUEST-900 example](https://raw.githubusercontent.com/coreruleset/coreruleset/v4.28.0/rules/REQUEST-900-EXCLUSION-RULES-BEFORE-CRS.conf.example) · [Cloudflare managed OWASP CRS](https://developers.cloudflare.com/waf/managed-rules/reference/owasp-core-ruleset/)
- **License:** OWASP CRS Apache-2.0.
- **Pitfalls:** WAF in BLOCK mode day 1 = the most common Wave-2 outage (German umlauts, JSON-with-SQL-keywords trip 942100/932100). LOG mode 7 days → tune → flip. `ctl:ruleRemoveTargetById` is ModSecurity/CRS syntax; Cloudflare-managed WAF uses Custom Rules + Skip actions (different surface, semantically equivalent).

### L4d — Cloudflare Tunnel (admin/Studio/pgAdmin, zero public ports)
```yaml
tunnel: <UUID>
credentials-file: /etc/cloudflared/<UUID>.json
ingress:
  - hostname: admin.nexus.example.eu; service: http://localhost:8001
  - hostname: db.nexus.example.eu;   service: http://localhost:5050      # pgAdmin loopback
  - hostname: pg.nexus.example.eu;    service: tcp://localhost:5432
  - service: http_status:404                                          # catch-all MANDATORY (must be last)
# Each hostname gated by Cloudflare Access (Zero Trust > Applications, SSO + @nexus allow-policy).
```
- **Pitfalls:** catch-all `http_status:404` mandatory or cloudflared refuses to start. Origin MUST bind 127.0.0.1 (verify `ss -tlnp | grep -v 127.0.0.1`). Cloudflare One Access mTLS is human/device-to-app, NOT workload auth.

### L4e — Cloudflare edge rate-limit rules
```yaml
# Rule 1: /auth/login — 50 req / 5 min, NAT-aware (ip.src + cf.colo.id), action: managed_challenge
# Rule 2: /api/v1/contact — 60 req / min per IP, action: block
# Characteristics counting key MUST include cf.colo.id or CGNAT pools miscount.
```
- **Pitfalls:** sliding window (not fixed) — tune for abuse profile, not avg user. Start login on `managed_challenge`, flip to `block` only if abuse persists (or shared-NAT legit users locked out).

### L4f — Tailscale/WireGuard east-west mesh + Postgres mTLS
```
postgresql://nexus:<secret>@pg.tail-<tailnet>.ts.net:5432/nexus?sslmode=verify-full&sslrootcert=...&sslcert=...&sslkey=...
# Tailscale ACL: tagOwners tag:nexus-app/db/admin -> autogroup:admin; acls app->db:5432 only.
```
- **Pitfalls:** `sslmode=verify-full` (not verify-ca — that skips hostname, MITM-open). Set `tagOwners` BEFORE bringing tagged nodes up. Push deny-by-default ACL first (fresh tailnet defaults to allow-all). pg_hba must require `cert` + `scram-sha-256`, not `trust`.

---

## L5 — App-layer defense

### L5a — SQLi: SECURITY DEFINER Postgres function (public writes)
```sql
CREATE FUNCTION nexus.submit_form(p_tenant uuid, p_payload jsonb) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = nexus, pg_temp AS $$
DECLARE v_id bigint;
BEGIN INSERT INTO nexus.form_submission(tenant_id,payload,created_at) VALUES (p_tenant,p_payload,now()) RETURNING id INTO v_id; RETURN v_id; END; $$;
BEGIN;
REVOKE ALL ON FUNCTION nexus.submit_form(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nexus.submit_form(uuid,jsonb) TO nexus_app_role;   -- app has EXECUTE only, NOT INSERT
COMMIT;
```
- **Sources:** [Postgres CREATE FUNCTION — SECURITY DEFINER safely](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECUR)
- **Pitfalls:** `SET search_path = nexus, pg_temp` MANDATORY (pg_temp shadowing attack; pg_temp LAST). CREATE FUNCTION defaults to PUBLIC execute — REVOKE+GRANT in ONE txn or there's a window. Never dynamic SQL with `||`/`format('%s')` in a definer; `format('%I')` for identifiers only. Own by least-privilege role, NEVER superuser.

### L5b — SQLi: psycopg3 caller (server-side binding, LiteralString lint gate)
```python
import psycopg
from psycopg import sql
SQL_SUBMIT = "SELECT nexus.submit_form(%s, %s)"                # LiteralString constant — mypy rejects concat at CI
with psycopg.connect(NEXUS_DSN) as conn, conn.cursor() as cur:
    cur.execute(SQL_SUBMIT, (tenant_id, payload_json))         # tuple, even for one arg
    new_id = cur.fetchone()[0]
# Dynamic identifiers: sql.SQL("INSERT INTO {} VALUES (%s)").format(sql.Identifier('numbers'))
```
- **Sources:** [psycopg3 params docs](https://www.psycopg.org/psycopg3/docs/basic/params.html)
- **Pitfalls:** `'%s'` quoted placeholder is treated as the literal string '%s' (not escaped) — always bare `%s`. `("bar")` is a string, not a tuple — use `("bar",)`. NEVER ClientCursor/mogrify/`sql.SQL(str)` (client-side merge re-enables SQLi). Logging `str(e)` can echo failing SQL WITH bound values (see L5d).

### L5c — SSRF guard (egress allowlist + metadata-IP deny + resolve-then-reverify)
```python
import ipaddress, socket
from urllib.parse import urlparse
ALLOWED_EGRESS = {"api.deepseek.com", "ollama.com"}            # curated-source allowlist FIRST
def _is_safe_ip(ip):
    ip_obj = ipaddress.ip_address(ip)
    if not ip_obj.is_global: return False                       # rejects loopback, link-local, fc00::/7
    for net in ("169.254.169.254/32","169.254.0.0/16","127.0.0.0/8","0.0.0.0/8","100.64.0.0/10"):
        if ip_obj in ipaddress.ip_network(net): return False
    return True
def safe_fetch(url, *, follow_redirects=False, timeout=10.0):
    host = (urlparse(url).hostname or "").lower()
    if host not in ALLOWED_EGRESS: raise SsrfError(host)
    addrs = {i[4][0] for i in socket.getaddrinfo(host, urlparse(url).port or 443, type=socket.SOCK_STREAM)}
    for ip in addrs:
        if not _is_safe_ip(ip): raise SsrfError(f"{host}->{ip}")
    # pin the verified IP into the transport (defeat DNS-rebinding); revalidate each redirect
```
- **Sources:** [OWASP SSRF Prevention Cheat Sheet](https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.md) · **reuses the in-repo YURI social-adapter `guardHost()` pattern** (capability-first — port the existing guard to Python).
- **Pitfalls:** DNS-rebinding — pin the verified IP into the transport, don't let httpx re-resolve. Redirect-to-metadata — revalidate each hop or disable redirects. `is_global` misses 100.64.0.0/10 (CGNAT) — keep the explicit denylist belt-and-braces. Exact-hostname equality (not substring).

### L5d — Centralized log denylist-sanitizer (Python logging Filter)
```python
import logging, re
_SECRET_PATTERNS = [
    (re.compile(r"((?:postgres(?:ql)?|mongodb|mysql|redis|amqp)://[^\s:/@]+:)[^@\s]+(@)"), r"\1***\2"),
    (re.compile(r"(Authorization\s*[:=]?\s*(?:Bearer|Basic|Token)\s+)[A-Za-z0-9._\-]+", re.I), r"\1***"),
    (re.compile(r"\bBearer\s+[A-Za-z0-9._\-]+", re.I), "Bearer ***"),
    (re.compile(r"(\"?(?:refresh_token|access_token|id_token|api[_-]?key|secret)\"?\s*[:=]\s*[\"']?)[^\s,\"']{8,}", re.I), r"\1***"),
    (re.compile(r"\b(AKIA[0-9A-Z]{16})\b"), "AKIA***"),
    (re.compile(r"\b(sk-[A-Za-z0-9]{20,}|gh[ops]_[A-Za-z0-9]{36})\b"), "***"),
    (re.compile(r"((?:password|passwd|pwd)\s*[=:]\s*)\S+", re.I), r"\1***"),
]
class NexusSanitizeFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        for rx, repl in _SECRET_PATTERNS: msg = rx.sub(repl, msg)
        record.msg = msg.replace("\r","\\r").replace("\n","\\n"); record.args = None  # + CR/LF neutralization
        return True
logging.getLogger().addFilter(NexusSanitizeFilter())           # ROOT logger, before any handler
```
- **Sources:** [OWASP Logging Cheat Sheet](https://raw.githubusercontent.com/OWASP/CheatSheetSeries/master/cheatsheets/Logging_Cheat_Sheet.md) · [OWASP Log Injection](https://raw.githubusercontent.com/OWASP/www-community/master/pages/attacks/Log_Injection.md)
- **Nexus adaptation:** installs on the ROOT logger at boot, before any handler — fixes the `server.py str(e)` token-leak path. Secret-regex table is a TOML asset (config push, not redeploy). Re-process traceback text too (`exc_info`).
- **Pitfalls:** the f-string `log.error(f"failed: {e}")` bypasses placeholder protection (driver exceptions embed failing SQL+values). Override `Formatter.format` to re-sanitize post-format. Order: DSN → Bearer → generic key shapes.

---

## L6 — Supply chain

### L6a — SBOM (syft) + CVE scan (grype)
```yaml
# .github/workflows/supply-chain.yml
- run: syft ./service -o cyclonedx-json=./service.cdx.json   # + ./engine, ./src-tauri
- run: grype sbom:./service.cdx.json --fail-on high          # tune → critical after 2 weeks
```
- **Sources:** [syft README](https://raw.githubusercontent.com/anchore/syft/main/README.md) · [grype README](https://raw.githubusercontent.com/anchore/grype/main/README.md)
- **Pitfalls:** `grype db update` first or false-clean. Cargo.lock committed for transitive Rust. Exclude /target, node_modules. Use VEX/allowlist for known-issues.

### L6b — SLSA L3 build provenance (slsa-github-generator, pinned @vX.Y.Z)
```yaml
provenance:
  needs: [build]
  permissions: { actions: read, id-token: write, contents: write }
  uses: slsa-framework/slsa-github-generator/.github/workflows/generator_generic_slsa3.yml@v2.1.0
  with: { base64-subjects: "${{ needs.build.outputs.hashes }}", upload-assets: true }
```
- **Sources:** [slsa-github-generator generic README](https://raw.githubusercontent.com/slsa-framework/slsa-github-generator/main/internal/builders/generic/README.md) · [slsa.dev](https://slsa.dev/)
- **Pitfalls:** generator MUST be pinned @vX.Y.Z (upstream rejects @vX/SHA — anti-rollback). `id-token: write` mandatory. Same sha256 digests the SBOM + Tauri updater cover → one digest, three controls.

### L6c — Dependency-confusion defense (scoped namespaces + lockfile hashes + collision guard)
```toml
# .npmrc: @nexus:registry=https://npm.pkg.github.com   (committed); token via ${ENV_VAR}
# pip-compile --generate-hashes requirements.in        (pip install --require-hashes)
# .cargo/config.toml: [registries] nexus = { index = "..." }; Cargo.toml dep declares registry = "nexus"
# CI guard:
for pkg in "@nexus/core" "nexus-engine"; do
  npm view "$pkg" --registry=https://registry.npmjs.org >/dev/null 2>&1 && { echo "::error::collision"; exit 1; }
done
```
- **Sources:** [npm scope docs](https://docs.npmjs.com/cli/v10/using-npm/scope) · [pip-tools README](https://raw.githubusercontent.com/jazzband/pip-tools/main/README.md) · [cargo registries](https://doc.rust-lang.org/cargo/reference/registries.html)
- **Pitfalls:** .npmrc _authToken MUST be gitignored or `${ENV_VAR}`. One scope → one registry (no public fallback or shadowing attack survives). crates.io refuses packages depending on alternate registries.

### L6d — Tauri desktop binary signing (updater key + macOS codesign)
```shell
tauri signer generate -w ~/.tauri/nexus.key
export TAURI_SIGNING_PRIVATE_KEY="..."; export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
# + macOS codesign via tauri-action (Apple cert import → keychain → APPLE_SIGNING_IDENTITY)
```
- **Sources:** [tauri-action signing example (MIT)](https://raw.githubusercontent.com/tauri-apps/tauri-action/dev/examples/publish-to-auto-release-universal-macos-app-with-signing-certificate.yml) · [Tauri updater](https://v2.tauri.app/plugin/updater/)
- **Nexus adaptation:** updater key in an ISOLATED `release` GH environment (manual approval + branch protection); dev CI holds NO signing secrets (LastPass 2022 lesson). SLSA provenance attests the same digests the updater signs (SolarWinds had valid sigs on a tampered build — provenance catches it).
- **Pitfalls:** dev creds NEVER in release CI. macOS notarization is SEPARATE from codesign + from the updater key (three secrets). Unsigned builds lose updater integrity (silent tampering path).

---

## DO NOT USE (the anti-patterns Wave 2 must NOT ship)

- Hand-rolled AES-GCM / random-96-bit-nonce field crypto (single reuse = catastrophic). Use XChaCha20-Poly1305-IETF.
- bcrypt for new code (legacy-only, truncates 72 bytes). Use Argon2id.
- Fast hashes (SHA-256/MD5) for passwords.
- pgcrypto PGP for NEW field crypto (use only where it exists); `digest()` stays in the audit chain only.
- A linear hash chain mislabeled "RFC 6962 Merkle tree" — RFC 6962 is a binary tree with mandatory 0x00/0x01 prefixes.
- An audit chain WITHOUT the 0x00 domain-separation prefix (loses second-preimage resistance).
- Global WAF rule removal (`SecRuleRemoveById`) instead of `ruleRemoveTargetById=...;ARGS:<param>`.
- WAF in BLOCK mode day 1 — always LOG → tune → flip.
- SMS-based 2FA — TOTP/WebAuthn only.
- PEPPER in DB/.env/repo/with-hashes.
- DEK cached in a module-global/pool — zeroise, scope to one function.
- US-region KMS for KEK unwrap (DSGVO/Schrems II).
- Cloudflare One Access mTLS as workload identity (human/device-to-app only).
- psycopg ClientCursor/mogrify/`sql.SQL(str)` (re-enables SQLi).
- Pre-hashing pepper (concat) — weaker, null-byte/password-shucking hazards.

---

## Integration order (highest-leverage first)

1. **L4a/L4b network perimeter** — ufw default-deny + Cloudflare-origin allowlist + bind 127.0.0.1. Cheapest, collapses the most risk.
2. **L3 audit hash-chain** (L3b + L3c + L3d) — the breach-detection spine; without it, dwell is 100+ days.
3. **L1a field crypto** (XChaCha20) for tokens + message bodies — data-at-rest.
4. **L2a envelope + Vault KEK** — per-tenant key isolation.
5. **L5 app-layer** (L5a/L5b SQLi, L5c SSRF, L5d log sanitizer) — fixes the `str(e)` token leak + public-write SQLi.
6. **L6 supply chain** — SBOM/SLSA/signing (Tauri = SolarWinds-analogue surface).
7. **L3a off-host Merkle root** + L3e PII triggers + L4c–L4f WAF/tunnel/rate-limit/mTLS — the hardening polish before first paying customer.

---

*Companion: `nexus-security-hardening-deep-research-2026-07-06.md` (the WHAT — breach vectors, posture) · `docs/NEXUS-LINK-SOCIAL-CONNECT-VISUAL-PLAN-2026-07-05.html` §07. Run wf_5fdd3afa-c89 (11 agents, 800k tok).*
