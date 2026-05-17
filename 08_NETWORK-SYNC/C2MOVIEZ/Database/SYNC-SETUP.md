# c2moviez Vault — Shared Sync Setup

## Architecture: Obsidian Sync + GitHub

| Layer | Purpose | Speed |
|-------|---------|-------|
| **Obsidian Sync** | Real-time cross-device sync, automatic conflict resolution | Instant (seconds) |
| **GitHub** | Version history, rollback, code review, backup | Manual (commit & push) |

Both run in parallel. Obsidian Sync handles live collaboration; GitHub provides the safety net.

---

## Setup for New Collaborator (Marcel)

### Step 1: Accept Obsidian Sync Invite
1. Open **Obsidian** on your device
2. Go to **Settings > Sync** (requires Obsidian Sync subscription or shared vault access)
3. Claudio will share the vault from his Sync settings — accept the invite
4. The vault will download to your device automatically

### Step 2: Clone the GitHub Repo
```bash
# Clone the vault (same location as Obsidian Sync vault)
git clone https://github.com/c2moviezfpv/c2moviez-vault.git

# Open this folder as your Obsidian vault
# Obsidian > Open folder as vault > select c2moviez-vault/
```

### Step 3: Create Your Own `.mcp.json` (Machine-Specific)
This file is gitignored — each user creates their own:
```json
{
  "mcpServers": {
    "plane": {
      "command": "bash",
      "args": ["/path/to/your/plane-mcp.sh"]
    }
  }
}
```

---

## Daily Workflow

### Real-Time Editing (Obsidian Sync)
- Just edit notes normally in Obsidian
- Changes sync automatically between all connected devices
- If both edit the same note simultaneously, Obsidian Sync merges or creates a conflict file

### Version Control (GitHub)
When you've made meaningful changes:

```bash
# Pull latest changes first
git pull origin main

# Stage and commit
git add -A
git commit -m "describe what changed"

# Push
git push origin main
```

### Conflict Prevention
1. **Obsidian Sync** syncs `.md` files instantly — it handles most conflicts
2. **GitHub** may show merge conflicts if both pushed offline changes — resolve manually
3. Rule: **Obsidian Sync is the live layer, GitHub is the checkpoint layer**

---

## What's Excluded from GitHub (`.gitignore`)
- `.obsidian/workspace.json` — per-device layout
- `.mcp.json` — machine-specific MCP config  
- `Dashboard/` — separate git repo
- `Scripts/*.log`, snapshot files — runtime state
- `node_modules/` — dependencies
- `.claude/` — Claude Code local state

## What's Shared via Both Channels
- All markdown notes (clients, projects, work items, briefings)
- Templates, processes, resources
- Scripts (source code only, not logs/state)
- Obsidian plugins and settings (except workspace)
