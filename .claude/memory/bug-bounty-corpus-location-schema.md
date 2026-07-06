---
name: bug-bounty-corpus-location-schema
description: "Where the disclosed bug-bounty corpus lives + that it's METADATA-ONLY (no report bodies/code) — query pattern for cross-ref hardening"
metadata: 
  node_type: memory
  type: reference
  tier: working
  scope: main
  trig: 
    - bug bounty corpus
    - hackerone reports
    - disclosed reports
    - weakness class
    - cross-reference hardening
    - attack our own code
  refs: 
    - "[[bug-bounty-corpus-cross-ref-hardening]]"
    - "[[project-bug-bounty-money-push]]"
  originSessionId: ac838f3b-aa39-4793-9049-6c32b65bdb31
---

FACTS:
- corpus_db = `03_NEXUS-LINK/bug-bounty/corpus/bugbounty.db` (SQLite, FTS5). 9,487 rows in table `reports`; also `programs` table.
- `reports` schema (FTS5): `report_id, program, title, weakness, severity, asset_type, bounty, votes, url, disclosed_at`. **METADATA-ONLY — there is NO report body/PoC/code stored.** Use it for weakness-class distribution + the specific high-signal report titles+URLs; fetch the hackerone.com/reports/<id> URL if a writeup body is actually needed.
- `weakness` + `severity` populated on most rows; `votes`/`bounty` UNINDEXED (CAST AS INT to sort).
- Query: `sqlite3 bugbounty.db "SELECT CAST(votes AS INT) v,severity,title,url FROM reports WHERE reports MATCH 'title:\"DOM XSS\"' ORDER BY v DESC LIMIT N;"`.
- Top weakness classes overall: Information Disclosure 902 · XSS-Generic 630 · Secure-Design-Violation 586 · Improper-Auth 523 · Improper-Access 512 · Resource-Consumption 401 · XSS-Reflected 358 · XSS-Stored 354 · CSRF 328.

IMPLICATION: when the ask is "useful code in the reports," correct the assumption — the corpus is a searchable INDEX, not a code store. The win is real-world weighting (which classes actually get paid/upvoted) to prioritize attacking our own code. Proven same-category exploits for a graph/diagram renderer: prototype-pollution→stored-XSS in Mermaid (H1 #1106238, #1280002) + Kroki (#1731349); DOM-clobbering bypassing sanitization (#308158); SVG-as-XSS (#1276742); CSP-bypass via label color (#1665658).

SEE: [[bug-bounty-corpus-cross-ref-hardening]] (the standing method) · [[project-bug-bounty-money-push]]
