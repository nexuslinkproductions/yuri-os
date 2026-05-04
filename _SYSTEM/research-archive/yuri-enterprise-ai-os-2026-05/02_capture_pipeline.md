# Capture Pipeline — Zero-Install Research Workflow

## Design

All research capture uses built-in macOS tools: Node.js, curl, osascript. No installs, no Playwright, no Chromium, no paid services.

## Capture Order (Cheapest First)

### Tier 0–2: curl / raw source (curl, Node fetch)
- Public docs, standards, raw GitHub files
- Tool: `node Scripts/yuri-research-capture.mjs --fetch-url <url> --out <file>`
- Captures: URL, HTTP status, content-type, content hash, cleaned excerpt
- Output: compact Markdown evidence pack with provenance
- Cost: free, ~0–5000 tokens per source

### Tier 3: osascript browser text (Safari / Chrome)
- Rendered pages needing JavaScript execution
- Tool: `node Scripts/yuri-research-capture.mjs --capture-browser-text --browser safari --out <file>`
- Captures: URL, title, visible text via AppleScript/JXA
- No cookies, no profile files, no login bypass
- Cost: free, ~1000 tokens per capture

### Tier 4: Manual bookmarklet / copy-paste
- Selective capture of specific page regions
- No tool needed
- Cost: free

### Tier 5+: NotebookLM synthesis
- Optional synthesis over curated evidence packs
- NotebookLM output is `advisory_only=true` and `local_truth_claim=false`
- Never treat NotebookLM output as local truth

### Fallback: Browser automation
- Only if JS-heavy sources require it and osascript is insufficient
- Requires Chrome MCP install or Playwright chromium download
- Not default

## Token-Cost Rationale

- Raw source fetch: ~0–5000 tokens per page (curl, grep, head)
- Browser text capture: ~1000 tokens per page (osascript text extraction)
- Archive Markdown: ~1000 tokens per file (compact, structured)
- NotebookLM synthesis: ~10000–50000 tokens per briefing session
- Total per research sprint: <$0.50 in model API costs

## Security Gates

- No scraping private accounts by default
- No banking/health/personal browser sessions
- No cookie export
- No hidden credential capture
- No bypassing paywalls or access controls
- No source requiring login unless owner explicitly approves
- No raw HTML into RAG
- All captures tagged: URL, timestamp, tool, source type, license hint, confidence
