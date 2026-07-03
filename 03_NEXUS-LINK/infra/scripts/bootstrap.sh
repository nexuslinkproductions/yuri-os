#!/usr/bin/env bash
# Nexus Link — bootstrap local Supabase stack
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { printf "${GREEN}→${NC} %s\n" "$*"; }
warn()  { printf "${YELLOW}!${NC} %s\n" "$*"; }
fail()  { printf "${RED}✗${NC} %s\n" "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  fail "Docker CLI not found. Install Docker Desktop for Mac first — see README-SETUP.md §1"
fi

if ! docker info >/dev/null 2>&1; then
  fail "Docker daemon not running. Open Docker Desktop and retry."
fi

COMPOSE=(docker compose)
if ! docker compose version >/dev/null 2>&1; then
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  else
    fail "Neither 'docker compose' nor 'docker-compose' available."
  fi
fi

if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    warn ".env missing — copying from .env.example (edit secrets before shared use)"
    cp .env.example .env
  else
    fail ".env.example not found in $ROOT"
  fi
fi

# shellcheck disable=SC1091
set -a && source .env && set +a

if [[ "${POSTGRES_PASSWORD:-}" == *"change-me"* ]] || [[ "${JWT_SECRET:-}" == *"change-me"* ]]; then
  warn "Default placeholder secrets detected in .env — OK for solo local dev; rotate before sharing."
fi

# ---------------------------------------------------------------------------
# Pull & start
# ---------------------------------------------------------------------------
info "Pulling container images (first run may take several minutes)..."
"${COMPOSE[@]}" pull --quiet 2>/dev/null || "${COMPOSE[@]}" pull

info "Starting Nexus Link stack..."
"${COMPOSE[@]}" up -d

# ---------------------------------------------------------------------------
# Wait for Postgres
# ---------------------------------------------------------------------------
info "Waiting for Postgres..."
TRIES=0
MAX_TRIES=60
until "${COMPOSE[@]}" exec -T db pg_isready -U postgres -h localhost >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  [[ $TRIES -ge $MAX_TRIES ]] && fail "Postgres did not become ready in time."
  sleep 2
done

# Give GoTrue time to migrate auth schema on first boot
info "Waiting for Auth (GoTrue)..."
TRIES=0
until "${COMPOSE[@]}" exec -T auth wget -q -O /dev/null http://localhost:9999/health 2>/dev/null; do
  TRIES=$((TRIES + 1))
  [[ $TRIES -ge $MAX_TRIES ]] && warn "GoTrue health check slow — continuing anyway."
  [[ $TRIES -ge $MAX_TRIES ]] && break
  sleep 2
done

# ---------------------------------------------------------------------------
# Apply Nexus migrations (idempotent)
# ---------------------------------------------------------------------------
MIGRATION="$ROOT/supabase/migrations/00001_nexus_core_stub.sql"
if [[ -f "$MIGRATION" ]]; then
  info "Applying Nexus core stub migration..."
  "${COMPOSE[@]}" exec -T db psql -U postgres -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1 \
    -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now());"

  APPLIED=$("${COMPOSE[@]}" exec -T db psql -U postgres -d "${POSTGRES_DB:-postgres}" -tAc \
    "SELECT 1 FROM public.schema_migrations WHERE version = '00001_nexus_core_stub' LIMIT 1;" 2>/dev/null || echo "")

  if [[ "${APPLIED// /}" != "1" ]]; then
    "${COMPOSE[@]}" exec -T db psql -U postgres -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1 \
      -f - < "$MIGRATION"
    "${COMPOSE[@]}" exec -T db psql -U postgres -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO public.schema_migrations (version) VALUES ('00001_nexus_core_stub') ON CONFLICT DO NOTHING;"
    info "Migration 00001_nexus_core_stub applied."
  else
    info "Migration 00001_nexus_core_stub already applied — skipping."
  fi
fi

# ---------------------------------------------------------------------------
# Print URLs
# ---------------------------------------------------------------------------
API_URL="${SUPABASE_PUBLIC_URL:-http://127.0.0.1:54321}"
STUDIO_URL="http://127.0.0.1:${STUDIO_PORT:-54323}"
DB_HOST="${POSTGRES_HOST_PORT:-54322}"

echo ""
echo "══════════════════════════════════════════════════════════════"
echo " Nexus Link local stack is up"
echo "══════════════════════════════════════════════════════════════"
echo ""
echo "  API (Kong gateway)   ${API_URL}"
echo "  REST                 ${API_URL}/rest/v1/"
echo "  Auth                 ${API_URL}/auth/v1/"
echo "  Studio (direct)      ${STUDIO_URL}"
echo "  Studio (via Kong)    ${API_URL}/  (basic auth: \${DASHBOARD_USERNAME})"
echo "  Postgres             postgresql://postgres:\${POSTGRES_PASSWORD}@127.0.0.1:${DB_HOST}/${POSTGRES_DB:-postgres}"
echo ""
echo "  Keys (from .env):"
echo "    ANON_KEY           ${ANON_KEY:-<set in .env>}"
echo "    SERVICE_ROLE_KEY   ${SERVICE_ROLE_KEY:-<set in .env>}"
echo ""
echo "  Stop:    ${COMPOSE[*]} down"
echo "  Reset:   ${COMPOSE[*]} down -v   # destroys local DB volume"
echo "  Logs:    ${COMPOSE[*]} logs -f db auth rest studio kong"
echo ""
echo "══════════════════════════════════════════════════════════════"
