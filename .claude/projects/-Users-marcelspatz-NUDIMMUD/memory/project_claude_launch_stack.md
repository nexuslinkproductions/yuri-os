---
name: NUDIMMUD Claude launch stack
description: How Claude is launched in NUDIMMUD — boot HUD, wrapper, splash, VSCode terminal profile. Needed when debugging display or re-adding branding.
type: project
originSessionId: 55d263c0-600f-49d5-8b8b-40ecdc289835
---
Claude launch stack in NUDIMMUD has three layers:

1. **Shell boot** (`_SYSTEM/nudimmud-boot.zsh`, sourced from `~/.zshrc`)
   - Prints NLP sigil + NUDIMMUD wordmark + OPERATOR block + CTX bar prompt
   - Exports `~/NUDIMMUD/bin` to front of PATH (idempotent guard: `[[ ":$PATH:" != *":…:"* ]]`)

2. **Wrapper** (`~/NUDIMMUD/bin/claude`)
   - Intercepts every `claude` invocation regardless of how it was launched
   - Shows `◆ CLAUDE CODE / MODEL / WORKSPACE / SESSION` splash for interactive calls
   - Skips splash if `NUDIMMUD_SPLASH_SHOWN=1` (prevents double-fire when launched via `Scripts/ai`)
   - Strips itself from PATH before `exec claude` to avoid infinite recursion
   - Falls back to `~/.local/bin/claude` absolute path if stripping fails

3. **Scripts/ai launcher** (`Scripts/ai`, alias: `c`)
   - Shows the same styled splash (own copy), then sets `NUDIMMUD_SPLASH_SHOWN=1` before `exec claude`
   - Used for manual terminal launches; wrapper defers to it

**VSCode config** (`.vscode/settings.json`):
- `terminal.integrated.defaultProfile.osx: "zsh-nudimmud"`
- Profile uses `["-l", "-i"]` args → login+interactive shell → sources `~/.zshrc` → boot HUD runs
- PATH env prepends `~/NUDIMMUD/bin` and `~/.local/bin`

**Why:** `tui: fullscreen` was removed from `.claude/settings.json` because it clears the terminal on startup, destroying the boot HUD and wrapper splash. Inline mode keeps all pre-launch output visible.
