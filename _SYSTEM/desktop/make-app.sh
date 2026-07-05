#!/usr/bin/env bash
# @capability: yuri-desktop-app-builder
# @serves: package yuri as a desktop app | make yuri double-clickable | build Yuri.app | macOS app bundle for yuri
# @does: Zero-dependency phase-1 desktop packaging. Builds a bare macOS .app bundle (Info.plist +
#        a bash executable, no Xcode/osacompile/Tauri/Electron) that — when double-clicked in Finder —
#        opens Terminal.app and runs `node _SYSTEM/runtime/yuri-repl.mjs --start-brain` from the repo
#        root. Idempotent: re-running regenerates the bundle in place (rm -rf + rebuild), never appends.
#        Mirrors the proven bare-bundle pattern already in this repo at
#        03_NEXUS-LINK/nexus-app/launcher/Nexus.app (Info.plist + MacOS/<exe> shell script + PkgInfo,
#        gitignored, no build step) — see _SYSTEM/desktop/README.md GAP LIST / OPTIONS TABLE for the
#        full phase plan (Platypus / Tauri v2 / Electron / Swift menu-bar comparisons).
#        Icon (optional, additive): when assets/generated/Yuri.icns exists (run make-icon.sh first),
#        it is copied into Contents/Resources/ and CFBundleIconFile is set; the bundle still builds
#        cleanly with no icon at all when it hasn't been generated yet.
# @use: bash _SYSTEM/desktop/make-app.sh [-o /path/to/Yuri.app] [--name NAME]
#        Default output: _SYSTEM/desktop/.output/Yuri.app (gitignored — see _SYSTEM/desktop/.gitignore).
#        Then: open _SYSTEM/desktop/.output/Yuri.app   (not done by this script — no GUI side-effects here)
#        Uninstall: rm -rf _SYSTEM/desktop/.output/Yuri.app  (or your -o target)
# @exports: (builder script; no importable functions — pure bash CLI)
set -euo pipefail

# ---- resolve repo root from script location (works regardless of caller cwd) ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

APP_NAME="Yuri"
OUT_PATH=""            # resolved to a default AFTER arg parsing, so --name affects the default path
OUT_PATH_EXPLICIT=0     # set to 1 when -o/--output is passed
BUNDLE_ID="com.yuri-os.musubi.desktop"

usage() {
  cat <<EOF
Usage: $(basename "$0") [-o OUTPUT_PATH] [--name APP_NAME]

  -o, --output PATH   Where to write the .app bundle (default: $SCRIPT_DIR/.output/<APP_NAME>.app)
  --name NAME         Display/bundle name (default: Yuri)
  -h, --help          Show this help

Builds a zero-dependency macOS .app bundle that launches the Yuri REPL
(node _SYSTEM/runtime/yuri-repl.mjs --start-brain) in a new Terminal window,
from the repo root, regardless of where the .app is double-clicked from.

This script performs NO git mutations, installs NO dependencies, and does NOT
open/launch the resulting app (verify structure only; open it yourself when ready).
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    -o|--output)
      [ $# -ge 2 ] || { echo "error: $1 requires a value" >&2; exit 2; }
      OUT_PATH="$2"
      OUT_PATH_EXPLICIT=1
      shift 2
      ;;
    --name)
      [ $# -ge 2 ] || { echo "error: $1 requires a value" >&2; exit 2; }
      APP_NAME="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "error: unrecognized argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# Resolve the default output path AFTER parsing so --name (without -o) still
# lands at .output/<APP_NAME>.app instead of a stale "Yuri.app" default.
if [ "$OUT_PATH_EXPLICIT" -eq 0 ]; then
  OUT_PATH="$SCRIPT_DIR/.output/${APP_NAME}.app"
fi

# ---- defensive checks ----
if ! command -v node >/dev/null 2>&1; then
  echo "error: 'node' not found on PATH — Yuri.app's launcher needs node to run yuri-repl.mjs." >&2
  echo "       Install Node (e.g. via nvm/homebrew) and re-run this builder." >&2
  exit 1
fi

REPL_ENTRY="$REPO_ROOT/_SYSTEM/runtime/yuri-repl.mjs"
if [ ! -f "$REPL_ENTRY" ]; then
  echo "error: expected entrypoint missing: $REPL_ENTRY" >&2
  echo "       (repo root resolved to: $REPO_ROOT — is this script still under _SYSTEM/desktop/?)" >&2
  exit 1
fi

case "$OUT_PATH" in
  */Yuri.app|*/"${APP_NAME}.app") : ;; # fine, has a .app leaf already
  *) OUT_PATH="${OUT_PATH%/}/${APP_NAME}.app" ;;
esac

CONTENTS="$OUT_PATH/Contents"
MACOS_DIR="$CONTENTS/MacOS"
RESOURCES_DIR="$CONTENTS/Resources"

# ---- optional icon: copy in + reference from Info.plist only when it has been generated ----
# Icon is BUILD-NOW-optional, never a hard requirement: run _SYSTEM/desktop/make-icon.sh once to
# generate it (see README.md icon pipeline section). This builder still produces a fully valid,
# working bundle with no icon at all — icon presence is additive, never load-bearing.
ICNS_SOURCE="$SCRIPT_DIR/assets/generated/Yuri.icns"
ICON_FILE_NAME=""
if [ -f "$ICNS_SOURCE" ]; then
  ICON_FILE_NAME="${APP_NAME}.icns"
else
  echo "-> note: no icon found at $ICNS_SOURCE — building without one (run make-icon.sh to add it)"
fi

# ---- idempotent rebuild: wipe only the target bundle, nothing else ----
if [ -d "$OUT_PATH" ]; then
  echo "-> existing bundle found at $OUT_PATH — rebuilding in place"
  rm -rf "$OUT_PATH"
fi

mkdir -p "$MACOS_DIR" "$RESOURCES_DIR"

if [ -n "$ICON_FILE_NAME" ]; then
  cp "$ICNS_SOURCE" "$RESOURCES_DIR/$ICON_FILE_NAME"
  echo "-> embedded icon: $RESOURCES_DIR/$ICON_FILE_NAME"
fi

# ---- Info.plist ----
ICON_KEY_XML=""
if [ -n "$ICON_FILE_NAME" ]; then
  ICON_KEY_XML="  <key>CFBundleIconFile</key><string>${ICON_FILE_NAME}</string>
"
fi

cat > "$CONTENTS/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${APP_NAME}</string>
  <key>CFBundleDisplayName</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleSignature</key><string>YURI</string>
  <key>CFBundleExecutable</key><string>${APP_NAME}</string>
${ICON_KEY_XML}  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>NSHumanReadableCopyright</key><string>Local desktop launcher — not for distribution.</string>
</dict>
</plist>
PLIST

# ---- PkgInfo (classic 8-byte type+creator marker; harmless, matches bare-bundle convention) ----
printf 'APPLYURI' > "$CONTENTS/PkgInfo"

# ---- MacOS/<AppName> executable: opens Terminal.app running the Yuri REPL from repo root ----
# Terminal.app + `tell application "Terminal" to do script` is the zero-dependency way to get a
# real interactive TTY session (yuri-repl.mjs is a stdin/stdout REPL — it needs a terminal, not a
# detached background process). This mirrors CLAUDE.md's "Required Launch Shape": tmux/PTY-backed,
# interactive, never a headless/-p-style invocation.
cat > "$MACOS_DIR/$APP_NAME" <<LAUNCHER
#!/bin/bash
# ${APP_NAME}.app launcher — opens Terminal.app and runs the Yuri REPL from the repo root.
# Zero third-party deps: stock macOS Terminal + osascript + system node. No build step.

REPO_ROOT="${REPO_ROOT}"
ENTRY="\$REPO_ROOT/_SYSTEM/runtime/yuri-repl.mjs"
LOG_DIR="\$REPO_ROOT/_SYSTEM/state/desktop"
mkdir -p "\$LOG_DIR" 2>/dev/null || true

if [ ! -f "\$ENTRY" ]; then
  osascript -e 'display dialog "Yuri: runtime entrypoint not found at '"\$ENTRY"'. Keep this app alongside the YURI-OS-MUSUBI repo, or rebuild it with _SYSTEM/desktop/make-app.sh." with title "Yuri" buttons {"OK"} default button "OK"' >/dev/null 2>&1
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "Yuri needs Node.js on PATH. Install Node and relaunch." with title "Yuri" buttons {"OK"} default button "OK"' >/dev/null 2>&1
  exit 1
fi

# Build the shell command to run inside Terminal, then escape it for safe embedding inside the
# AppleScript 'do script "<...>"' double-quoted string (backslash + double-quote both escaped).
# This escaping happens at RUNTIME (inside the generated launcher), not at generator build time.
CMD="cd \\"\${REPO_ROOT}\\" && node \\"\${ENTRY}\\" --start-brain"
ESCAPED_CMD="\${CMD//\\\\/\\\\\\\\}"
ESCAPED_CMD="\${ESCAPED_CMD//\\"/\\\\\\"}"

osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "\${ESCAPED_CMD}"
end tell
APPLESCRIPT
LAUNCHER

chmod +x "$MACOS_DIR/$APP_NAME"

echo "-> built: $OUT_PATH"
echo "-> verify structure with: _SYSTEM/desktop/make-app.test.mjs (or: file \"$MACOS_DIR/$APP_NAME\"; plutil -lint \"$CONTENTS/Info.plist\")"
echo "-> this script did NOT open the app. Open it yourself: open \"$OUT_PATH\""
