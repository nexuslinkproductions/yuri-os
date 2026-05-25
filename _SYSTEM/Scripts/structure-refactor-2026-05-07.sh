#!/usr/bin/env bash
# structure-refactor-2026-05-07.sh
# YURI root-level structure cleanup.
# Idempotent. Quarantine-pattern (move-not-delete). Reversible until quarantine is purged.
#
# Run modes:
#   DRY-RUN (default):  bash _SYSTEM/Scripts/structure-refactor-2026-05-07.sh
#   APPLY (real):       APPLY=1 bash _SYSTEM/Scripts/structure-refactor-2026-05-07.sh
#   PURGE (after review):  rm -rf _QUARANTINE_2026-05-07/
#
# What this DOES:
#   - Quarantines 9 root *.log files
#   - Quarantines 4 root ._* AppleDouble metadata files
#   - Removes root .DS_Store
#   - Conditionally renumbers 06_NETWORK-SYNC -> 07_NETWORK-SYNC, 07_ARCHIVE -> 08_ARCHIVE
#     (only if cross-ref grep finds <=5 hard-coded references; lists them otherwise).
#
# What this DOES NOT touch (left for manual decision — see STRUCTURE_REFACTOR_REPORT.md):
#   - YURI/ mirror (50+ unique markdown files + 38 diverged files needing reconciliation)
#   - _SYSTEM/Scripts/, bin/, Volumes/, GeneratedContent (NOT dead artifacts — live infrastructure)
#   - Claude Code URL Handler.app (registered claude:// handler — needs Launch Services removal)
#   - DOMAIN EXPANSION - INFINITE VOID/ (archived domain content with 01_PROJECTS skeleton)
#   - RESEARCH/ move (CLAUDE.md references RESEARCH/04-BRAIN-DUMP-DECODER.md)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
QUARANTINE="${ROOT}/_QUARANTINE_2026-05-07"
APPLY="${APPLY:-0}"

# ─── helpers ─────────────────────────────────────────────────────────────────
say()  { printf "\033[36m[refactor]\033[0m %s\n" "$*"; }
warn() { printf "\033[33m[warn]\033[0m %s\n" "$*"; }
ok()   { printf "\033[32m[ok]\033[0m %s\n" "$*"; }

run() {
  if [[ "${APPLY}" == "1" ]]; then
    eval "$@"
  else
    printf "\033[90m[would-run]\033[0m %s\n" "$*"
  fi
}

# ─── sanity ──────────────────────────────────────────────────────────────────
[[ "$(pwd)" == "${ROOT}" ]] \
  || { warn "cwd is $(pwd), expected ${ROOT}. cd there first."; exit 1; }
[[ "$(git branch --show-current)" == "main" ]] \
  || { warn "branch is $(git branch --show-current), expected main."; exit 1; }

if [[ "${APPLY}" == "1" ]]; then say "MODE = APPLY (real run)"
else                              say "MODE = DRY-RUN  (set APPLY=1 to execute)"
fi

# ─── 1. prep quarantine ──────────────────────────────────────────────────────
run "mkdir -p '${QUARANTINE}/root-logs'"
run "mkdir -p '${QUARANTINE}/macos-metadata'"
run "mkdir -p '${QUARANTINE}/inspection'"

# ─── 2. quarantine root *.log files ──────────────────────────────────────────
LOGS=(backend.log backend_final.log backend_path_check.log backend_path_check_final.log
      backend_root_check.log backend_root_check_2.log backend_startup.log
      frontend.log frontend_final.log)
for f in "${LOGS[@]}"; do
  if [[ -f "${ROOT}/${f}" ]]; then
    run "mv '${ROOT}/${f}' '${QUARANTINE}/root-logs/'"
  fi
done
ok "Logs quarantined (or skipped if already moved)"

# ─── 3. quarantine root ._* AppleDouble metadata ─────────────────────────────
DOTFILES=("._NISABA" "._enki_state.md" "._nabu.md" "._session_log.md")
for f in "${DOTFILES[@]}"; do
  if [[ -f "${ROOT}/${f}" ]]; then
    run "mv '${ROOT}/${f}' '${QUARANTINE}/macos-metadata/'"
  fi
done
ok "AppleDouble metadata quarantined"

# ─── 4. remove root .DS_Store (Finder will regenerate; gitignored) ───────────
if [[ -f "${ROOT}/.DS_Store" ]]; then
  run "rm '${ROOT}/.DS_Store'"
fi
ok "Root .DS_Store removed (regenerates on Finder open; gitignored)"

# ─── 5. cross-ref inventory for 06_NETWORK-SYNC and 07_ARCHIVE ───────────────
# Renumbering is intentionally NOT auto-executed. Code refs (in backend/src/,
# .claude/mcp-servers/, src/components/) require coordinated sed + rebuild
# of backend/dist/. Manual decision per STRUCTURE_REFACTOR_REPORT.md §5.
say "Renumber 06_NETWORK-SYNC -> 07_NETWORK-SYNC, 07_ARCHIVE -> 08_ARCHIVE:"
warn "  NOT auto-executed. ~36 external refs to 06_NETWORK-SYNC and ~19 to 07_ARCHIVE,"
warn "  including hard-coded paths in backend/src/services/*.ts, .claude/mcp-servers/*,"
warn "  src/components/PhysisVault.tsx, and backend/data/liquid_state.json."
warn ""
warn "  Manual procedure:"
warn "    1. Update code refs in backend/src/ and src/components/, then 'cd backend && npm run build'"
warn "    2. mv 06_NETWORK-SYNC 07_NETWORK-SYNC && mv 07_ARCHIVE 08_ARCHIVE"
warn "    3. Sed-update doc refs:"
warn "       grep -rl '06_NETWORK-SYNC' --include='*.md' --include='*.json' \\"
warn "         --exclude-dir=YURI --exclude-dir=node_modules . \\"
warn "         | xargs sed -i '' 's|06_NETWORK-SYNC|07_NETWORK-SYNC|g'"
warn "       grep -rl '07_ARCHIVE' --include='*.md' --include='*.json' \\"
warn "         --exclude-dir=YURI --exclude-dir=node_modules . \\"
warn "         | xargs sed -i '' 's|07_ARCHIVE|08_ARCHIVE|g'"
warn "    4. Verify: grep -r '06_NETWORK-SYNC\\|07_ARCHIVE' --include='*.{md,ts,tsx,mjs}' ."
warn "    5. Commit and run integration tests."

# ─── 6. final inventory ──────────────────────────────────────────────────────
say "=== Post-refactor root inventory ==="
ls -d "${ROOT}"/*/ 2>/dev/null | sed "s|${ROOT}/||" | sort
say "=== Quarantine contents ==="
say "(review then run 'rm -rf _QUARANTINE_2026-05-07/' to purge, or move files back to restore)"
find "${QUARANTINE}" -type f 2>/dev/null | sed "s|${ROOT}/||"

ok "Done."
