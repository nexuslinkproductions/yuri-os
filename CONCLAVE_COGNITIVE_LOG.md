# ⬡ CONCLAVE_COGNITIVE_LOG ⬡
## System Learning & Error Prevention Repository

### [LESSON_001] :: JSX_STRUCTURAL_MISMATCH
*   **Timestamp:** 2026-04-20T18:35:00Z
*   **Error Signature:** `Unexpected closing "div" tag does not match opening "header" tag`
*   **Root Cause:** Redundant `</div>` tag nested inside a `<header>` block. This occurred during component refactoring where div-depth tracking was lost, causing the parent container to close prematurely.
*   **Diagnostic Signal:** [plugin:vite:esbuild] Transform failed.
*   **Prevention Strategy (Proactive):**
    1.  **Tag-Depth Verification:** Before committing any JSX edit, perform a manual or programmatic count of `<div` vs `</div>` within the affected scope.
    2.  **Breadcrumb Check:** Ensure that block elements like `<header>`, `<main>`, and `<section>` are closed *before* the parent container divs.
    3.  **Linter Validation:** Run `npm run lint` or `tsc` if available after structural UI changes.

### [PROACTIVE_RULE_001] :: THE_RESEARCH_MANDATE
*   Agents must execute `read_file` or `grep_search` to verify line numbers and indentation before every `replace_file_content` call to avoid context drift.
