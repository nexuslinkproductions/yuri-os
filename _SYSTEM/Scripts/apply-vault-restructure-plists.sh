#!/bin/bash
# Run ONCE on main after merging worktree-vault-restructure
# Unloads all com.yuri-os-musubi plists, updates _SYSTEM/Scripts/ paths, reloads

PLIST_DIR="$HOME/Library/LaunchAgents"

for plist in "$PLIST_DIR"/com.yuri-os-musubi.*.plist; do
  label=$(basename "$plist" .plist)
  launchctl unload "$plist" 2>/dev/null
  sed -i '' "s|YURI-OS-MUSUBI/_SYSTEM/Scripts/|YURI-OS-MUSUBI/_SYSTEM/Scripts/|g" "$plist"
  launchctl load "$plist" 2>/dev/null
  echo "✓ $label"
done
echo "All LaunchAgents reloaded with _SYSTEM/Scripts/ paths."
