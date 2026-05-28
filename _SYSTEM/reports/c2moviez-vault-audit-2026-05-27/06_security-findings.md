# Security Findings

Date: 2026-05-27
Target repo: `c2moviezfpv/c2moviez-vault`
Target commit: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`
Mode: read-only, redacted-sensitive, no target mutation

This file records only findings that are grounded in target repository evidence and safe to preserve in durable YURI artifacts. Raw secrets, passwords, private keys, customer data, and provider payloads must not be copied here.

## Handling Rules

- `use_status` must be `NOT_USED` for every discovered credential unless a later owner-provided procedure explicitly authorizes a separate read-only credential source.
- A credential finding can be confirmed by repository evidence alone. YURI must not authenticate with, replay, rotate, test, or validate discovered credentials.
- Severity remains provisional until the relevant entrypoint, binding, scope, and runtime reachability are validated or explicitly deferred.
- Suppressions require exact counterevidence, not absence of obvious exploitability.

## Findings Index

| ID | Status | Severity | Title | Evidence | Use status |
| --- | --- | --- | --- | --- | --- |
| `C2V-SEC-001` | `VALIDATED_REPO_EXPOSURE` | `HIGH_PROVISIONAL` | Tracked Obsidian Local REST API authentication key | `.obsidian/plugins/obsidian-local-rest-api/data.json:5` | `NOT_USED` |
| `C2V-SEC-002` | `VALIDATED_REPO_EXPOSURE` | `HIGH_PROVISIONAL` | Tracked TLS certificate and private-key material for Obsidian Local REST API | `.obsidian/plugins/obsidian-local-rest-api/data.json:7-9` | `NOT_USED` |

## C2V-SEC-001 - Tracked Obsidian Local REST API Authentication Key

Status: `VALIDATED_REPO_EXPOSURE`

Severity: `HIGH_PROVISIONAL`

Evidence:

- Path: `.obsidian/plugins/obsidian-local-rest-api/data.json:5`
- Secret class: `CONFIRMED_EXPOSED_SECRET`
- Fingerprint: `len=64 sha256=36d13ab8c1a08154`
- Use status: `NOT_USED`

Impact:

If this tracked key is real and active, anyone who can reach the Obsidian Local REST API endpoint may be able to authenticate to the local vault API. Impact depends on plugin binding, host exposure, local network reachability, and whether the key is still deployed.

Validation state:

- Repository evidence confirms that a secret value is tracked in source.
- Runtime reachability is not validated yet.
- No live call, token replay, or endpoint authentication attempt has been made.

Recommended remediation:

- Rotate the Obsidian Local REST API key.
- Remove the tracked config secret from repository history where feasible.
- Move the key to local secret storage excluded from Git.
- Confirm the plugin binds only to intended interfaces and requires authentication for all privileged routes.
- Review local/network firewall exposure and Obsidian plugin trust boundaries.

## C2V-SEC-002 - Tracked TLS Certificate And Private-Key Material For Obsidian Local REST API

Status: `VALIDATED_REPO_EXPOSURE`

Severity: `HIGH_PROVISIONAL`

Evidence:

- Path: `.obsidian/plugins/obsidian-local-rest-api/data.json:7-9`
- Secret class: `CONFIRMED_EXPOSED_PRIVATE_KEY`
- Fingerprints:
  - certificate: `len=1271 sha256=75f33acf51a6f96b`
  - private key: `len=1777 sha256=9ce2305f5081c551`
  - public key: `len=497 sha256=41a767cac96a5494`
- Use status: `NOT_USED`

Impact:

Tracked private-key material should be considered compromised if this config reflects a real runtime keypair. Practical impact depends on whether the keypair is still active, whether clients trust it, and whether the plugin endpoint is reachable beyond the intended local boundary.

Validation state:

- Repository evidence confirms that private-key material is tracked in source.
- Runtime use and network exposure are not validated yet.
- No live TLS connection or credential-based probe has been made.

Recommended remediation:

- Replace the certificate and private key.
- Remove the tracked key material from source and history where feasible.
- Store runtime TLS material outside Git with restrictive local permissions.
- Confirm that any local certificate trust entries are updated after rotation.

## Open Surgical Slices

These are queued as bounded follow-ups. They are not closed by the initial findings above.

| Slice ID | Scope | Purpose | Status |
| --- | --- | --- | --- |
| `CRED-SLICE-001` | `.obsidian/plugins/obsidian-local-rest-api/data.json` | Confirm secret exposure rows without raw value retention | `covered_initial` |
| `CRED-SLICE-002` | `.obsidian/plugins/obsidian-local-rest-api/` adjacent plugin config files | Check for additional local REST API auth, bind, CORS, TLS, or endpoint exposure config | `pending` |
| `CRED-SLICE-003` | `.obsidian/plugins/` one plugin at a time | Check plugin configs for hidden credentials, unsafe local services, sync tokens, or vault write authority | `pending` |

