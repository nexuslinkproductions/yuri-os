# Nexus Link — Local Dev Stack Setup

Production-shaped **Supabase-compatible** stack for Nexus Link Phase 0: Postgres 17, GoTrue auth, PostgREST, Kong gateway, Studio.

**Status:** Local dev only — not production. Same SQL/RLS migrates to Hetzner Postgres + Better Auth later.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| **macOS** (Apple Silicon or Intel) | Tested path: Mac Studio |
| **Docker Desktop** | Required for Option B (this folder) |
| **Homebrew** | Required for Option A (Supabase CLI) |
| **~4 GB RAM free** | Full stack footprint |

---

## 1. Install Docker Desktop (Mac)

Docker CLI is **not** installed automatically. Owner must install manually:

1. Download [Docker Desktop for Mac](https://www.docker.com/products/docker-desktop/)
2. Install and launch Docker Desktop
3. Wait until the whale icon shows **Running**
4. Verify:

```bash
docker --version
docker compose version
```

**Do not** proceed with `./scripts/bootstrap.sh` until both commands succeed.

### Resource tips

- Docker Desktop → Settings → Resources: allocate **≥ 4 GB RAM**, **≥ 2 CPUs**
- First image pull: ~2–5 GB download

---

## 2. Choose your local path

| Option | Best for | Command |
|--------|----------|---------|
| **A — Supabase CLI** (recommended) | Fastest start, full Auth/RLS/Studio parity | `supabase start` |
| **B — This docker-compose** | Hetzner-shaped self-host, no CLI dependency | `./scripts/bootstrap.sh` |

Both paths use the **same migration files** in `supabase/migrations/`.

---

## Option A — Supabase CLI (recommended)

### Install CLI

```bash
brew install supabase/tap/supabase
supabase --version
```

### Init & start

From `03_NEXUS-LINK/infra/` (or link migrations into your app folder):

```bash
cd 03_NEXUS-LINK/infra
supabase init          # creates supabase/config.toml if missing
supabase start         # first run pulls images (~5–10 min)
```

Default local URLs (Supabase CLI):

| Service | URL |
|---------|-----|
| API | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Mailpit (Inbucket) | http://127.0.0.1:54324 |

Apply Nexus schema:

```bash
supabase db reset      # applies supabase/migrations/*.sql
# or
supabase migration up
```

Stop / reset:

```bash
supabase stop
supabase stop --no-backup   # wipe local data
```

Docs: [Supabase local development](https://supabase.com/docs/guides/local-development)

---

## Option B — Docker Compose (this repo)

### Quick start

```bash
cd 03_NEXUS-LINK/infra
cp .env.example .env        # edit secrets — never commit .env
chmod +x scripts/bootstrap.sh
./scripts/bootstrap.sh
```

`bootstrap.sh` will:

1. Verify Docker is installed and running
2. Copy `.env.example` → `.env` if missing
3. Pull images and start the stack
4. Apply `00001_nexus_core_stub.sql` (idempotent)
5. Print local URLs and connection strings

### Services in this stack

| Container | Image | Role |
|-----------|-------|------|
| `nexus-db` | `supabase/postgres:17.4.1.072` | Postgres 17 + Supabase extensions |
| `nexus-auth` | `supabase/gotrue:v2.189.0` | JWT signup/login |
| `nexus-rest` | `postgrest/postgrest:v14.1` | Auto REST from schema |
| `nexus-meta` | `supabase/postgres-meta:v0.96.6` | Schema introspection |
| `nexus-studio` | `supabase/studio` | Admin UI |
| `nexus-kong` | `kong/kong:3.9.1` | API gateway |

**Not included** (add later if needed): Realtime, Storage, Edge Functions, Logflare.

### Local URLs (defaults)

| Service | URL |
|---------|-----|
| API (Kong) | http://127.0.0.1:54321 |
| REST | http://127.0.0.1:54321/rest/v1/ |
| Auth | http://127.0.0.1:54321/auth/v1/ |
| Studio (direct) | http://127.0.0.1:54323 |
| Studio (via Kong) | http://127.0.0.1:54321/ (basic auth) |
| Postgres | `127.0.0.1:54322` |

### Environment variables

Copy `.env.example` → `.env`. **Required changes before any shared environment:**

| Variable | Purpose |
|----------|---------|
| `POSTGRES_PASSWORD` | Database superuser password |
| `JWT_SECRET` | Signs auth tokens (≥ 32 chars) |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | JWT API keys — generate with [Supabase key script](https://supabase.com/docs/guides/self-hosting/docker#configuring-and-securing-supabase) |
| `DASHBOARD_PASSWORD` | Kong basic-auth for Studio |
| `PG_META_CRYPTO_KEY` | Studio ↔ postgres-meta encryption |

**Never commit `.env`.** It is gitignored.

### Manual compose commands

```bash
docker compose up -d          # start
docker compose ps             # status
docker compose logs -f db     # tail logs
docker compose down           # stop
docker compose down -v        # stop + wipe volume (destructive)
docker compose config         # validate compose file
```

---

## 3. Schema & migrations

Migrations live in `supabase/migrations/`:

| File | Contents |
|------|----------|
| `00001_nexus_core_stub.sql` | `workspaces`, `profiles`, `workspace_members`, `ai_workspace_config`, `ai_usage_events`, RLS stubs |

Aligns with `business/research/phase0-docker-supabase/UNIFIED-SCHEMA-DRAFT-2026-07-01.md` (46-table target; Phase 0 stubs only).

Seed workspace: `nexus-dev` (slug) for local smoke tests.

---

## 4. Local → Hetzner migration path

| Step | Action |
|------|--------|
| 1 | Keep all schema in `supabase/migrations/` |
| 2 | `pg_dump` local → restore on Hetzner Postgres 17 |
| 3 | Swap Auth: GoTrue → Better Auth (same `profiles` / `workspace_members`) |
| 4 | Deploy Fastify API on Coolify; set `DATABASE_URL` |
| 5 | RLS policies unchanged |

---

## 5. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `docker: command not found` | Install Docker Desktop (§1) |
| `Cannot connect to Docker daemon` | Launch Docker Desktop |
| Port 54321/54322/54323 in use | Change ports in `.env` or stop conflicting Supabase CLI stack |
| GoTrue fails on first boot | Wait 30s; check `docker compose logs auth` |
| Migration already partially applied | `docker compose exec db psql -U postgres -c '\dt public.*'` |
| Reset everything | `docker compose down -v && ./scripts/bootstrap.sh` |

---

## 6. Security notes

- Placeholder secrets in `.env.example` are **not** production-safe
- Self-hosted stack keeps data on your machine (DSGVO-friendly local dev)
- Production: Hetzner EU + Better Auth — see phase0 research index

---

## Related docs

- [Phase 0 research index](../business/research/phase0-docker-supabase/00-INDEX.md)
- [Unified schema draft](../business/research/phase0-docker-supabase/UNIFIED-SCHEMA-DRAFT-2026-07-01.md)
- [Supabase self-hosting docker](https://supabase.com/docs/guides/self-hosting/docker)
