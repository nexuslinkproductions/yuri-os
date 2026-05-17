# Infomaniak × Yuri OS — Integration Brief

**Status:** PREPARED — NOT ACTIVE. Awaiting Claudio's instructions before switching over.
**Research date:** 2026-05-17 | 79 sources via Perplexity Deep Research
**Next step:** Share with Claudio, confirm account setup, then uncomment lane configs below.

---

## TL;DR

Infomaniak is a full-stack Swiss sovereign cloud (Geneva, ISO 27001, GDPR + nFADP, not subject to US CLOUD Act). Three components are production-ready drop-ins for Yuri OS today: Swiss AI lane (OpenAI-compatible), Object Storage (S3-compatible), and kDrive MCP server (native Claude integration). The critical gap is managed PostgreSQL/pgvector — not available yet, workaround is self-hosted pgvector on a VPS.

---

## 1. Product Map → Yuri OS Components

| Yuri OS Component | Infomaniak Product | Status | API/Protocol |
|---|---|---|---|
| Sovereign model inference lane | Swiss AI (Kimi-K2.6, Qwen3.5-122B) | ✅ Drop-in | OpenAI-compatible `/v1/chat/completions` |
| Free embeddings for RAG | All-MiniLM-L12-v2 | ✅ FREE | OpenAI embed API |
| Quality embeddings | BGE Multilingual Gemma2 | ✅ CHF 0.065/1M | OpenAI embed API |
| RAG reranking | BAAI bge-reranker-v2-m3 | ✅ CHF 0.0001/10k | — |
| Cross-device vault sync | kDrive WebDAV + rclone | ✅ | WebDAV |
| Memory/vault backup | Object Storage S3 | ✅ | S3 (AWS Sig V4) |
| Claude file access to vault | kDrive MCP server | ✅ Native | npm: `@infomaniak/mcp-server-kdrive` |
| Vector DB | pgvector on VPS | 🟡 Self-hosted | PostgreSQL wire protocol |
| Managed PostgreSQL | — | 🔴 Coming soon | — |

---

## 2. Swiss AI Lane — Config Template (INACTIVE)

```javascript
// scripts/offload-contract.mjs — COMMENTED TEMPLATE, DO NOT ACTIVATE YET
// Uncomment when Infomaniak account is ready

/*
"infomaniak-kimi": {
  provider: "openai-compatible",
  baseURL: "https://api.infomaniak.com/2/ai/{PRODUCT_ID}/openai/v1",
  apiKeyEnv: "INFOMANIAK_API_TOKEN",
  model: "kimi-k2.6",
  contextWindow: 256000,
  costPer1kIn: 0.0006,
  costPer1kOut: 0.003,
  useCases: ["long-context", "deep-analysis", "research"],
  sovereignty: "swiss",
  notes: "256k ctx — replace nvidia-kimi (dead). Get PRODUCT_ID via GET api.infomaniak.com/1/ai"
},
"infomaniak-qwen": {
  provider: "openai-compatible",
  baseURL: "https://api.infomaniak.com/2/ai/{PRODUCT_ID}/openai/v1",
  apiKeyEnv: "INFOMANIAK_API_TOKEN",
  model: "qwen3.5-122b-a10b-fp8",
  contextWindow: 200000,
  costPer1kIn: 0.0004,
  costPer1kOut: 0.0032,
  useCases: ["architecture", "planning", "deep-analysis"],
  sovereignty: "swiss"
},
"infomaniak-embed": {
  provider: "openai-compatible",
  baseURL: "https://api.infomaniak.com/2/ai/{PRODUCT_ID}/openai/v1",
  apiKeyEnv: "INFOMANIAK_API_TOKEN",
  model: "all-minilm-l12-v2",
  pricing: "FREE",
  useCases: ["embeddings", "memory-embed", "rag-index"],
  sovereignty: "swiss",
  notes: "512 token limit. Use for memory-embed.mjs. Free."
}
*/
```

**To activate:** Set `INFOMANIAK_API_TOKEN` in env, get `PRODUCT_ID` via `GET https://api.infomaniak.com/1/ai` with Bearer token, replace `{PRODUCT_ID}` in URLs.

---

## 3. kDrive MCP Server — Config Template (INACTIVE)

```json
// .claude/settings.json → mcpServers section — TEMPLATE, DO NOT ACTIVATE YET
// Uncomment when kDrive account credentials are ready

/*
"infomaniak-kdrive": {
  "command": "npx",
  "args": ["-y", "@infomaniak/mcp-server-kdrive"],
  "env": {
    "KDRIVE_TOKEN": "PLACEHOLDER_API_TOKEN",
    "KDRIVE_ID": "PLACEHOLDER_DRIVE_ID"
  }
}
*/
```

**To activate:** Generate API token at `manager.infomaniak.com/v3/infomaniak-api` (scope: `drive`). Get `KDRIVE_ID` from the kDrive URL. Claude Desktop will then have native read/write access to kDrive files.

---

## 4. Object Storage rclone Template (INACTIVE)

```ini
# docs/infomaniak-rclone-template.conf — TEMPLATE, NOT ACTIVE
# Copy to ~/.config/rclone/rclone.conf and fill in credentials

[infomaniak-s3]
type = s3
provider = Other
access_key_id = PLACEHOLDER_ACCESS_KEY
secret_access_key = PLACEHOLDER_SECRET_KEY
endpoint = s3.pub1.infomaniak.cloud
force_path_style = true
region = dc3-a

# Usage after setup:
# rclone sync .claude/projects/memory/ infomaniak-s3:yuri-os-memory/
# rclone sync _SYSTEM/ infomaniak-s3:yuri-os-system/
# rclone sync .claude/yuri-sentinel/ infomaniak-s3:yuri-os-sentinel/
```

**To activate:** Create Object Storage bucket via Infomaniak console → generate EC2 credentials via `openstack ec2 credentials create` → fill in template.

---

## 5. Embeddings Migration — memory-embed.mjs (INACTIVE)

Current: local Ollama embeddings (needle).
Target: Infomaniak All-MiniLM-L12-v2 (FREE, 512 tok) or BGE Multilingual Gemma2 (CHF 0.065/1M, 8192 tok).

```javascript
// Scripts/memory-embed.mjs — MIGRATION NOTE (do not apply yet)
// Replace the Ollama embed call with:

/*
const response = await fetch(
  `https://api.infomaniak.com/2/ai/${PRODUCT_ID}/openai/v1/embeddings`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.INFOMANIAK_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "all-minilm-l12-v2",  // FREE — use for memory files
      // model: "bge-multilingual-gemma2",  // Better quality, CHF 0.065/1M
      input: textChunk
    })
  }
);
*/
```

---

## 6. API Reference

| Surface | Endpoint | Auth |
|---|---|---|
| AI inference | `https://api.infomaniak.com/2/ai/{PRODUCT_ID}/openai/v1` | Bearer token, scope: `ai-tools` |
| Get PRODUCT_ID | `GET https://api.infomaniak.com/1/ai` | Bearer token |
| kDrive REST | `https://api.infomaniak.com/3/drive/{drive_id}/` | Bearer token, scope: `drive` |
| kDrive WebDAV | `https://{drive_id}.connect.kdrive.infomaniak.com` | App password |
| Object Storage S3 | `s3.pub1.infomaniak.cloud` / `s3.pub2.infomaniak.cloud` | EC2 credentials |
| Token management | `manager.infomaniak.com/v3/infomaniak-api` | Web UI |
| Rate limit | 60 req/min hard cap (general API) | — |

---

## 7. Risks & Gaps

| Risk | Severity | Notes |
|---|---|---|
| No managed pgvector | 🔴 High | Self-host on VPS ~CHF 0.03/hr until managed PG ships |
| 60 req/min API rate limit | 🟡 Medium | Hard cap, cannot increase. Fine for current use, bottleneck at high-volume RAG |
| No frontier models (GPT-5 / Claude Opus equiv) | 🟡 Medium | Kimi-K2.6 covers most scenarios; keep Claude/DeepSeek for critical reasoning |
| Swiss-only data residency | 🟢 Low risk | Feature for us, not a bug — data stays in Switzerland |
| No realtime DB | 🟡 Medium | Not needed for current Yuri OS architecture |
| API maturity vs AWS/GCP | 🟡 Medium | Missing official Python/Node SDK — use raw Bearer calls |

---

## 8. Pricing Snapshot (CHF, May 2026)

| Product | Cost |
|---|---|
| kDrive Solo 3TB | CHF 4.99/mo |
| kSuite Business (3TB + email + chat) | CHF 3.67/user/mo |
| Object Storage | Per GB (check console) |
| Kimi-K2.6 inference | CHF 0.60/1M in · 3.00/1M out |
| Qwen3.5-122B inference | CHF 0.40/1M in · 3.20/1M out |
| All-MiniLM embeddings | **FREE** |
| BGE Multilingual embeddings | CHF 0.065/1M tokens |
| BAAI reranker | CHF 0.0001/10k pairs |
| 1M free credits on signup | — |

---

*Brief prepared 2026-05-17. Activate only after Claudio confirms shared account setup and architecture alignment.*
