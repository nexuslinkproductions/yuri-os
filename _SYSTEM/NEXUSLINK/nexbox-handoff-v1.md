# NEXUSLINK · Nexbox Handoff Packet v1

Date: 2026-05-16
Status: draft — to be ratified by Marcel before first client ship
Sibling artifact: `_SYSTEM/audit-archive/2026-05-16-anthropic-independence/`

## Promise

> A client receives NEXUSLINK / nexbox bundled with a YURI-grade Symbiotic Pulse runtime that requires **zero Anthropic credentials** to operate, runs on a Mac Mini M4 Pro 16 GB (or upward), and proves its independence through a verifier the client themselves can run.

Sovereignty is not just an internal Yuri OS property — it is the product wrap. Clients inherit it by default.

---

## 1 · Bundle Contents

### 1.1 Local runtime layer
- Ollama bootstrap script (`bin/bootstrap-ollama.sh`) — installs Ollama if absent, pulls pinned models.
- Pinned model set (≤ 9 GB per model, fits 16 GB unified memory floor):
  - `qwen2.5:7b` — general primary
  - `qwen2.5-coder:7b` — code primary
  - `qwen3.5:4b` — lightweight triage
  - `deepseek-r1:8b` — deep reasoning (conditional: stable on M4 Pro per Packet #9 re-test)
  - `nomic-embed-text:latest` — embeddings
- `models.json` template that mirrors `.claude/config/models.json` shape; client can override via `OLLAMA_DEFAULT_MODEL`.

### 1.2 Symbiotic Pulse engine
- `_SYSTEM/Scripts/yuri-symbiotic-pulse.mjs` ported to standalone client lib (`nexbox/symbiotic-pulse.mjs`).
- De-Claude'd per Packet #1 — default cortex routes to `@deepseek-v4-pro` (or local `deepseek-r1:8b` if client declines cloud).
- Pulse contract: `docs/SYMBIOTIC_PULSE_V1.md` shipped verbatim.

### 1.3 Canonical memory shim
- `_SYSTEM/Scripts/yuri-canonical-memory-import.mjs` adapted to client-owned `nexbox/memory.db`.
- Memory schema versioned (per DeepSeek advisory layer §3.2 below).
- Client owns the SQLite file; no upstream sync unless explicitly enabled.

### 1.4 Routing contract (slim)
- `nexbox/offload-contract.mjs` — minimal lane table exposing only client-allowed lanes:
  - `@deepseek` (cloud, opt-in with client's own DeepSeek key)
  - `@kimi` (cloud, opt-in)
  - `@nvidia` (cloud, opt-in with client's own NVIDIA NIM key)
  - `@ollama-local` (always available)
  - `@codex-spark` (optional; client opts into Codex license)
- **No `@claude` lane unless client explicitly adds their own Anthropic key** and re-enables it via `nexbox config add-lane claude`.

### 1.5 Verification harness
- `_SYSTEM/Scripts/independence-check.mjs` (same file as Packet #13) shipped with bundle.
- Client runs `nexbox verify` → asserts zero Anthropic dependency in their installation.
- Reports written to `nexbox/reports/independence-<ISO-DATE>.md`.

### 1.6 NEXUSLINK landing extension
- New "Symbiotic Independence" section on the landing surface.
- Live status widget polling `nexbox verify` results.
- Marketing copy: "Sovereign by default. Cloud by consent."

### 1.7 Hardware spec sheet
- **Floor:** Mac Mini M4 Pro 16 GB unified memory.
- **Recommended:** M4 Pro 24 GB / 32 GB for parallel workloads.
- **Heavy:** Mac Studio M3 / M4 Ultra (64 GB+) for 70 B-class models.
- **Desktop alt:** x86 + RTX 4090 (24 GB VRAM) / RTX 5090 (32 GB) for clients who prefer non-Apple.
- **Network:** offline-first; cloud lanes optional and per-call.

### 1.8 Operating runbook
- `nexbox/RUNBOOK.md` — install → bootstrap → first-pulse smoke test → optional cloud-key add-on → kill-switch drill.

---

## 2 · Identity Attestation (DeepSeek advisory layer §1)

Each nexbox install carries a **node fingerprint + capability attestation**. Before a sender accepts pulse state from a receiver (or vice versa), the receiver's authority is verified.

### Shape
```json
{
  "nodeId": "<uuid-v4>",
  "fingerprint": "<sha256(public-runtime-config + hardware-class + arsenal-hash)>",
  "capabilities": {
    "modelArsenal": ["qwen2.5:7b", "qwen2.5-coder:7b", "deepseek-r1:8b"],
    "ctxWindow": 128000,
    "toolUseSupported": true,
    "privacyClass": "standard|elevated|sealed",
    "cloudOptIn": ["deepseek", "nvidia"]
  },
  "issuedAt": "<ISO>",
  "ttlSeconds": 86400
}
```

### Use
- Receiver checks fingerprint matches expected client install.
- Capabilities tell sender which workloads the receiver can actually handle vs which must offload back.

---

## 3 · Schema Version + Trust Chain (DeepSeek advisory layers §2 + §3)

### 3.1 Schema versioning
Every pulse packet carries `schema_version: "<semver>"`. Symbiotic Pulse runtime evolves; without explicit versioning, deserialization breaks silently. Receivers refuse packets with major-version mismatch.

### 3.2 Trust chain
- Each pulse handoff carries a `nonce` chained from prior handoff (HMAC).
- Tie into existing CASSANDRA nonce tracking (already deterministic JS hook).
- Prevents replay of stale pulse state from a compromised or stale node.

---

## 4 · Model Catalog (DeepSeek advisory layer §4)

Each nexbox install exposes a locally-available **model manifest** describing what it can offload *to you*, not just what it runs itself.

```json
{
  "manifestVersion": "1.0",
  "node": "<nodeId>",
  "models": [
    {
      "id": "qwen2.5:7b",
      "runtime": "ollama-local",
      "ctxWindow": 32768,
      "toolUse": "structured",
      "quantization": "Q4_K_M",
      "throughputTokSec": 35,
      "costTier": "free",
      "privacyTier": "local"
    },
    {
      "id": "deepseek-v4-pro",
      "runtime": "cloud",
      "endpoint": "https://api.deepseek.com",
      "ctxWindow": 1000000,
      "toolUse": "native",
      "costTier": "cloud-low",
      "privacyTier": "third-party"
    }
  ]
}
```

Sender uses this to route work appropriate to the receiver's actual capacity rather than a hardcoded assumption.

---

## 5 · Fallback Policy (DeepSeek advisory layer §5)

Each node declares its degradation path. Without this, nexbox becomes a hard dependency — the same lock-in pattern this whole packet is built to avoid.

```yaml
fallback:
  primary: ollama-local:qwen2.5:7b
  if_local_saturated:
    - ollama-local:qwen3.5:4b
    - cloud:deepseek-v4-flash    # only if cloudOptIn includes deepseek
  if_unreachable:
    - skip-and-log
    - alert-via-cassandra
  never:
    - any-anthropic-lane         # explicit deny unless client overrides
```

---

## 6 · Liveness Window (DeepSeek advisory layer §6)

Every node publishes a `ttl` and an expected heartbeat interval. Distinguishes "node down" from "node slow" — critical for swarm routing under mixed `offload.sh` versions across heterogeneous client deployments.

```json
{
  "ttl": 3600,
  "heartbeatExpectedSec": 60,
  "lastHeartbeat": "<ISO>",
  "status": "alive|degraded|stale|down"
}
```

Cassandra-derived (lite hook) emits heartbeats. Receivers escalate to alternative nodes when status ≠ `alive`.

---

## 7 · Bundle Manifest (what ships)

```
nexbox/
├── RUNBOOK.md
├── symbiotic-pulse.mjs          # de-Claude'd pulse engine
├── memory.db                    # client-owned canonical memory
├── offload-contract.mjs         # slim lane table (no @claude default)
├── models.json                  # local model registry
├── bin/
│   ├── bootstrap-ollama.sh
│   └── nexbox                   # CLI entrypoint
├── docs/
│   └── SYMBIOTIC_PULSE_V1.md
├── verify/
│   ├── independence-check.mjs
│   └── reports/                 # populated on each verify run
└── attestation/
    ├── node-identity.json       # fingerprint + capabilities
    ├── model-manifest.json
    ├── fallback-policy.yaml
    └── liveness.json
```

---

## 8 · Client CLI surface

```
nexbox install        # bootstrap Ollama + pull models
nexbox verify         # run independence-check
nexbox pulse <input>  # fire a Symbiotic Pulse on raw input
nexbox status         # print node identity + liveness + recent verify results
nexbox config add-lane <name> --key=<env-var-name>   # opt-in cloud
nexbox config remove-lane <name>
nexbox handoff <peer-node-id>   # exchange pulse state with another nexbox
```

---

## 9 · Acceptance criteria for v1 ship

- [ ] All 8 bundle contents (§1.1–§1.8) present in `nexbox/` skeleton.
- [ ] `nexbox verify` returns exit 0 on a fresh client install with no Anthropic key.
- [ ] Identity attestation, schema-versioned pulse, trust-chain nonces, model catalog, fallback policy, liveness — all implemented per §2–§6.
- [ ] NEXUSLINK landing page renders the "Symbiotic Independence" section with live verify status.
- [ ] First client install completes in < 30 min on a fresh Mac Mini M4 Pro.

## 10 · Out of scope (v1)

- Multi-tenant nexbox clusters.
- Cross-org handoff governance (deferred to v2).
- Anthropic-lane re-enablement UI (clients add via CLI, no GUI yet).
- Fine-tuning of local models (clients use stock Ollama models).

---

## 11 · Authority chain (per Yuri origin)

This packet is bound by `_SYSTEM/yuri-origin.md`:
- Codex is the only implementation authority for the runtime code.
- Marcel is the product authority for client packaging.
- DeepSeek advisor input shaped §2–§6; classified `advisory_only=true · local_truth_claim=false`.
- All client-side `nexbox verify` results are the only authoritative signal of independence.
