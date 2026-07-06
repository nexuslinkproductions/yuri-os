#!/usr/bin/env bash
#
# yuri-init — dock YURI into your Claude Code setup, non-destructively.
#
# YURI is a governance + continuity exoskeleton for a coding AI. This script
# attaches it to your EXISTING Claude Code config without clobbering anything:
# it backs up your settings, merges YURI's hooks (tagged + reversible), makes
# YURI's skills + commands globally available, sets YURI_ROOT, and seeds a
# generic persona. Re-running updates cleanly. `--remove` fully detaches it.
#
# SAFE BY DEFAULT: prints a plan and changes nothing. Pass --apply to act.
#
# Usage:
#   ./yuri-init.sh            # dry run — show the plan, change nothing
#   ./yuri-init.sh --apply    # perform the install
#   ./yuri-init.sh --remove   # detach YURI (restores your hooks; keeps backups)
#
# The cleaner alternative, if you prefer it: install YURI as a Claude Code
# plugin instead (see INSTALL.md) — `claude plugin add <git-url>`.
set -euo pipefail

YURI_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_HOME="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
TS="$(date +%Y%m%d-%H%M%S)"
MODE="dryrun"
REMOVE=0

for a in "$@"; do
  case "$a" in
    --apply)   MODE="apply" ;;
    --remove)  REMOVE=1; MODE="apply" ;;
    --dry-run) MODE="dryrun" ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown arg: $a (try --help)"; exit 2 ;;
  esac
done

c_dim=$'\033[2m'; c_grn=$'\033[32m'; c_yel=$'\033[33m'; c_rst=$'\033[0m'
say(){ printf '  %s\n' "$*"; }
plan(){ printf '  %s%s%s\n' "$c_dim" "$* (dry-run)" "$c_rst"; }
act(){ if [[ "$MODE" == "apply" ]]; then eval "$@"; else plan "$*"; fi; }

printf '\n%s▌ YURI init%s — %s\n\n' "$c_grn" "$c_rst" \
  "$([[ "$REMOVE" == 1 ]] && echo 'DETACH' || echo "$([[ "$MODE" == apply ]] && echo INSTALL || echo 'PLAN (no changes)')")"
say "YURI_ROOT  = $YURI_ROOT"
say "Claude home = $CLAUDE_HOME"
echo

# ── preflight ────────────────────────────────────────────────────────────────
for bin in node git; do command -v "$bin" >/dev/null || { echo "$c_yel✗ '$bin' is required and not on PATH$c_rst"; exit 1; }; done

# ── dev-author guard ─────────────────────────────────────────────────────────
# If ~/.claude already resolves INTO this repo, you are the YURI author running
# from the symlinked dev setup — docking would merge the repo into itself. Refuse.
if [[ -e "$CLAUDE_HOME" ]]; then
  resolved="$(cd "$CLAUDE_HOME" 2>/dev/null && pwd -P || true)"
  case "$resolved" in
    "$YURI_ROOT"/*|"$YURI_ROOT")
      echo "$c_yel✗ $CLAUDE_HOME already resolves inside $YURI_ROOT.$c_rst"
      echo "  This looks like the author's in-repo dev setup. yuri-init is for docking"
      echo "  YURI into a SEPARATE Claude Code config. Nothing to do — exiting."
      exit 0 ;;
  esac
fi

if [[ "$REMOVE" == 1 ]]; then
  SETTINGS="$CLAUDE_HOME/settings.json"
  [[ -f "$SETTINGS" ]] && act "cp '$SETTINGS' '$SETTINGS.backup-$TS'" && say "backed up settings → settings.json.backup-$TS"
  act "node '$YURI_ROOT/_SYSTEM/Scripts/yuri-merge-settings.mjs' '$SETTINGS' '$YURI_ROOT' --remove"
  # remove YURI skill/command symlinks (only symlinks pointing into YURI_ROOT)
  for kind in skills commands; do
    d="$CLAUDE_HOME/$kind"; [[ -d "$d" ]] || continue
    for link in "$d"/*; do
      [[ -L "$link" ]] || continue
      tgt="$(readlink "$link")"; case "$tgt" in "$YURI_ROOT"/*) act "rm '$link'" && say "unlinked $kind/$(basename "$link")" ;; esac
    done
  done
  echo; say "$c_grn YURI detached.$c_rst Your own hooks/skills are untouched; YURI_ROOT export remains in your shell rc (remove by hand if you like)."
  exit 0
fi

# ── 1. dependencies ──────────────────────────────────────────────────────────
say "1. install dependencies"
act "cd '$YURI_ROOT' && npm install --no-audit --no-fund --silent"

# ── 2. persona seed ──────────────────────────────────────────────────────────
say "2. seed persona (generic; you customize it)"
if [[ -f "$YURI_ROOT/_SYSTEM/persona.md" ]]; then
  say "   _SYSTEM/persona.md already exists — leaving it."
elif [[ -f "$YURI_ROOT/persona.template.md" ]]; then
  act "cp '$YURI_ROOT/persona.template.md' '$YURI_ROOT/_SYSTEM/persona.md'"
  say "   created _SYSTEM/persona.md from template — edit it to set your operator persona."
else
  say "   no persona.template.md found — skipping."
fi

# ── 3. YURI_ROOT in shell rc (idempotent) ────────────────────────────────────
say "3. persist YURI_ROOT to your shell"
RC="$HOME/.zshrc"; [[ "${SHELL:-}" == *bash* ]] && RC="$HOME/.bashrc"
if grep -qs "export YURI_ROOT=" "$RC"; then
  say "   YURI_ROOT export already in $(basename "$RC")."
else
  act "printf '\n# YURI exoskeleton\nexport YURI_ROOT=%q\n' '$YURI_ROOT' >> '$RC'"
  say "   appended 'export YURI_ROOT' to $(basename "$RC") — open a new shell, or: export YURI_ROOT='$YURI_ROOT'"
fi

# ── 4. merge hooks into Claude settings (backup first) ───────────────────────
say "4. merge YURI hooks into Claude settings (additive + reversible)"
act "mkdir -p '$CLAUDE_HOME'"
SETTINGS="$CLAUDE_HOME/settings.json"
[[ -f "$SETTINGS" ]] && act "cp '$SETTINGS' '$SETTINGS.backup-$TS'" && say "   backed up settings → settings.json.backup-$TS"
act "node '$YURI_ROOT/_SYSTEM/Scripts/yuri-merge-settings.mjs' '$SETTINGS' '$YURI_ROOT'"

# ── 5. skills + commands globally discoverable (merge, never clobber) ─────────
say "5. link YURI skills + commands (yours are never overwritten)"
for kind in skills commands; do
  src="$YURI_ROOT/.claude/$kind"; dst="$CLAUDE_HOME/$kind"
  [[ -d "$src" ]] || continue
  act "mkdir -p '$dst'"
  linked=0; skipped=0
  for entry in "$src"/*; do
    [[ -e "$entry" ]] || continue
    name="$(basename "$entry")"; target="$dst/$name"
    if [[ -e "$target" || -L "$target" ]]; then skipped=$((skipped+1)); continue; fi
    act "ln -s '$entry' '$target'"; linked=$((linked+1))
  done
  say "   $kind: linked $linked, skipped $skipped pre-existing"
done

echo
printf '  %s✓ %s%s\n' "$c_grn" "$([[ "$MODE" == apply ]] && echo 'YURI docked.' || echo 'Plan complete — re-run with --apply to install.')" "$c_rst"
say "Verify: open a new Claude Code session in any project; the YURI brain block should appear at SessionStart."
say "Detach anytime: ./yuri-init.sh --remove"
echo
