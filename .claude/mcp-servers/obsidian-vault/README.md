# Obsidian Vault MCP Server

Production-grade MCP (Model Context Protocol) server for querying the NUDIMMUD Obsidian vault.

## Installation

Configured in `/Volumes/T7/.mcp.json` — automatically enabled for Claude Code on this device.

## Features

### Available Tools

1. **vault_structure** - Overview of vault folders, file counts, and key documents
2. **list_vault_files** - List markdown files, optionally filtered by folder
3. **search_notes** - Find notes by filename/path using regex patterns
4. **read_note** - Read full contents of any markdown note
5. **query_palace_index** - Search the palace-index.md for efficient navigation
6. **rebuild_index** - Force refresh of the cached file index

### Usage Examples

```
// Get vault overview
-> vault_structure

// List all projects
-> list_vault_files
   folder: "01_PROJECTS"
   limit: 50

// Find a client's files
-> search_notes
   pattern: "C2MOVIEZ|c2moviez"

// Read a specific note
-> read_note
   path: "00_COMMAND-CENTER/HOME.md"

// Search palace index
-> query_palace_index
   query: "FINANCE"
```

## Technical Details

- **Language**: TypeScript with @modelcontextprotocol/sdk v1.29.0
- **Transport**: stdio (local subprocess communication)
- **Vault Root**: `/Volumes/T7/NUDIMMUD/`
- **Index Caching**: Files indexed on startup; use rebuild_index if vault changes

## Configuration

- **Server Path**: `/Volumes/T7/.claude/mcp-servers/obsidian-vault/`
- **Config**: `/Volumes/T7/.mcp.json`
- **Built**: `dist/index.js` (compile with `npm run build`)

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode (auto-recompile)
npm run watch
```

## Security

- File access limited to NUDIMMUD vault root
- Directory traversal (`../`) prevented
- Obsidian system files (`.obsidian`) excluded from indexing
- Hidden files (`.`) excluded from indexing

## Vault Structure

The server recognizes these key folders:

- `00_COMMAND-CENTER/` — Dashboards, MOCs, daily notes
- `01_PROJECTS/` — All active projects by client
- `02_AREAS/` — Ongoing responsibilities
- `03_RESOURCES/` — Assets, LUTs, templates
- `04_FINANCE/` — Invoices, expenses, taxes
- `05_NEXUS-LINK/` — Brand, strategy, legal
- `06_NETWORK-SYNC/` — Client collaboration
- `07_ARCHIVE/` — Completed/inactive items
- `_SYSTEM/` — Scripts, automation, config
