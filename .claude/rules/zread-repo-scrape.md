# ZREAD_REPO_SCRAPE — structure-first, no path-guessing, no 1015 loop

Sibling of `research_pipeline.md` (which mandates `raw.githubusercontent.com` over
rendered WebFetch). That one governs *web research cost*; this one governs
**file-by-path repo scraping via the zread MCP** (and any equivalent repo MCP).

## Failure this prevents

2026-07-06: a repo-scrape agent guessed `crates/model/src/data/orderbook.rs` in
`nautechsystems/nautilus_trader`, hit zread `code 1015 ... does not exist`, and
**looped** — re-guessing sibling paths instead of listing the repo structure. The
repo actually has two separate crates (`crates/model/` and `crates/data/`); the
agent conflated them and never recovered, burning the whole scrape. Root cause:
naming a path from memory/inference without confirming it against the tree, then
treating a permanent 404 as transient.

## MANDATE (non-negotiable — main session AND every dispatched agent)

1. **STRUCTURE FIRST.** Before any `mcp__zread__read_file`, call
   `mcp__zread__get_repo_structure` (root first, then `get_repo_structure` on the
   relevant subdirectory to the depth you need). You must hold the actual tree in
   hand before naming a path. No exceptions for "I'm pretty sure it's at …".

2. **NEVER GUESS A PATH.** Every `read_file` path must trace to a structure
   listing, a README link, or an import statement you have already read verbatim.
   If you do not know the path, LIST the parent directory first.

3. **1015 IS PERMANENT, NOT TRANSIENT.** `code 1015 ... does not exist` means the
   file is not there. On 1015: do NOT retry the same path, do NOT guess a sibling.
   Re-list the parent directory ONCE via `get_repo_structure`; if still absent,
   the file does not exist at that location — move on.

4. **1015 CAP.** At most 2 consecutive 1015s in one scrape → STOP using
   `read_file` for that repo and switch to the deterministic fallback (below).
   Looping on guessed paths is the exact failure this rule exists to kill.

5. **DETERMINISTIC FALLBACK (loop-proof, no MCP, no guessing).** When a path is
   uncertain, when zread misbehaves, or after the 1015 cap — fetch by exact path:
   - **one file:** `node _SYSTEM/Scripts/gh-raw.mjs <owner>/<repo> <path> [--branch main]`
     (or `curl -s "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>"`)
   - **list the tree:** `node _SYSTEM/Scripts/gh-raw.mjs <owner>/<repo> --tree [--branch main]`
     (or `curl -s "https://api.github.com/repos/<owner>/<repo>/git/trees/<branch>?recursive=1" | jq -r '.tree[].path'`)
   A missing path returns a clean 404 and exits non-zero — no loop is possible.

6. **PREFER THE FALLBACK FOR KNOWN READS.** For a file you can already name,
   `gh-raw.mjs` (raw fetch) is faster and structurally loop-free. Reserve zread
   `read_file` for interactive structure exploration; reach for it AFTER you have
   the tree, not to discover it.

## DISPATCH CONTRACT

Any agent prompt that scrapes a repo MUST include this rule's gist:
"Structure-first via `mcp__zread__get_repo_structure` before any `read_file`;
never guess a path; `code 1015` is permanent — re-list the parent once then stop;
cap 2 consecutive 1015s and fall back to `node _SYSTEM/Scripts/gh-raw.mjs`."

## SCOPE

All repo scrapes — `nautilus_trader`, `TradingAgents`, `worldmonitor`,
`daily_stock_analysis`, and any future repo, in the main session or a dispatched
agent. Honors `research_pipeline.md` STOP CONDITIONS (only `raw.githubusercontent.com`
and `api.github.com` — both pre-allowed, no hook gating).

<!-- @anchor: v1 | failure: zread 1015 path-guess loop on nautilus_trader 2026-07-06 | regression: .claude/rules/zread-repo-scrape.md §MANDATE + _SYSTEM/Scripts/gh-raw.mjs clean-404 -->
