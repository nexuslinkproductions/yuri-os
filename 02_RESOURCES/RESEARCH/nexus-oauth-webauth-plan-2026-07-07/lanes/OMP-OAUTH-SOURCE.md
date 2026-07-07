# OMP OAuth Architecture — Reverse-Engineering Report

**Lane:** OmpOauthSource (explore) · **Date:** 2026-07-07
**Source:** `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/dist/` (bundled) + `~/.omp/agent/` structure (no secret values read)

## Summary
OMP authenticates to model providers via **OAuth 2.1 + PKCE (S256)** with a **loopback callback**, storing credentials in a **SQLite DB** (`~/.omp/agent/agent.db`, table `auth_credentials_v3`). Provider-specific loopback ports: **Anthropic 54545, OpenAI 1455, Google 8085, GitLab 8080**. Token model is **operator-centric (single user)**; access + refresh co-stored; **in-process auto-refresh** at ≤1 min to expiry, auto-rotate on 401. Ollama / Mimo are **keyless / API-key** (no OAuth). Desktop-only assumptions throughout.

## Verified findings
| Provider | Mechanism | Storage | Refresh | Redirect/callback |
|---|---|---|---|---|
| Anthropic | OAuth 2.1 + PKCE S256 | SQLite `auth_credentials_v3` | in-process, ≤1min pre-expiry, rotate on 401 | loopback `127.0.0.1:54545` |
| OpenAI | OAuth 2.1 + PKCE S256 | SQLite | in-process | loopback `127.0.0.1:1455` |
| Google | OAuth 2.1 + PKCE S256 | SQLite | in-process | loopback `127.0.0.1:8085` |
| GitLab | OAuth 2.1 + PKCE S256 | SQLite | in-process | loopback `127.0.0.1:8080` |
| Ollama / Mimo | API key / keyless | config/env | n/a | n/a |

- Credential record shape (no secrets): `{access, refresh, expires, accountId, ...}` in `auth_credentials_v3`.
- RFCs in play: **RFC 7636 (PKCE)**, **RFC 8414 (OAuth server metadata discovery)**.
- One `~/.omp/agent/agent.db` per machine = one operator identity.

## Desktop-vs-hosted-web gap
**Transferable to a hosted app:** the DB-backed token store (schema pattern), the OAuth 2.1 + PKCE flow, the per-provider config/registry pattern.
**Blocked (desktop-only):**
- **Loopback ports** → hosted needs a **public HTTPS redirect URI** (loopback unavailable to web users; ports can't be pre-registered/collide).
- **In-process refresh** → hosted needs an **async/queued refresh worker** (not per-process, thread-safe).
- **Single-operator model** → hosted needs **per-user + per-tenant partitioning** and isolation.
- (No macOS Keychain here — OMP uses SQLite, unlike the NEXUS desktop connectors which use Keychain — but same single-machine trust assumption.)

## Open questions
- Anthropic consumer-token restrictions for programmatic/third-party use (see CHAT-MODEL-DECISION — confirmed prohibited).
- Multi-user port binding / thread-safe refresh under concurrency.
- Session stickiness for a hosted multi-tenant broker.

## Verdict
OMP's OAuth is a clean single-operator desktop broker. Its **flow and storage patterns inform** the NEXUS hosted design, but its loopback + in-process + single-operator core **cannot be lifted directly** into a multi-tenant web app.
