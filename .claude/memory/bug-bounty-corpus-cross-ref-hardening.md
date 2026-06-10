---
name: bug-bounty-corpus-cross-ref-hardening
description: "When building/hardening YURI security code, cross-reference our LOCAL disclosed bug-bounty corpus (9,487 HackerOne reports, FTS5) for real-world weakness patterns and attack our own code with the top-weighted applicable classes. Standing method (Marcel 2026-06-03)."
metadata: 
  node_type: memory
  type: feedback
  tier: semantic
  scope: all
  trig: 
    - bug bounty
    - disclosed report
    - vuln pattern
    - harden
    - security review
    - cross reference
    - hackerone
    - weakness class
  refs: 
    - "[[study-competition-for-code-excellence]]"
    - "[[cross-domain-transfer-engine]]"
    - "[[moat-activation-4track-2026-06-03]]"
  originSessionId: 62cbcdd7-53e0-468e-aaa1-932bb064ad2e
---

RULE: when building or reviewing YURI security code (guards, hooks, enforcement, auth, path/role/credential handling), cross-reference our LOCAL disclosed bug-bounty corpus for the weakness patterns that actually matter in real code, then attack our own code with the top-weighted APPLICABLE classes.

CORPUS: `03_NEXUS-LINK/bug-bounty/corpus/bugbounty.db` — FTS5 `reports` table, 9,487 disclosed HackerOne reports. Fields: report_id, program, title, weakness, severity, asset_type, bounty, votes, url, disclosed_at. Query weighted by COUNT and by SUM(bounty). Top real-money classes (2026-06-03): Information Disclosure, Uncontrolled Resource Consumption ($255k), Improper Access Control ($206k), Improper Authentication, Command/Code Injection, IDOR, Path Traversal, Privilege Escalation, Business Logic Errors. (Also: `h1-reports-index.json` = JSON form.)

DO: query by weakness class; map ONLY the applicable classes to the target (skip web-only XSS/CSRF/SSRF/Open-Redirect for local hooks unless URL-handling); attack our code with each; VERIFY findings against the actual code (not speculative); fix + regression-test. The corpus is a LOCAL hardening lens.

DONT: treat it as a generic checklist; report speculative (unverified-against-code) issues; ever exfiltrate or SHIP corpus / report content (IP + privacy — the disclosed corpus stays out of the naked-repo ship per corpus-curation).

WHY: real disclosed vulns reveal the failure modes that actually cost systems money; cross-referencing surfaces bugs the happy-path unit tests miss. Proof (2026-06-03): cross-referencing the Business-Logic class against the new T1 energy-breaker surfaced a permanent-block bug — OPEN with a FUTURE openedAt (clock skew/tamper) -> elapsed negative -> denies forever, never auto-decays. Fixed (future/untrustworthy timestamp -> fail toward recovery) + regression test. The 23 happy-path tests had missed it. Marcel directive 2026-06-03.

SEE: [[study-competition-for-code-excellence]] · [[cross-domain-transfer-engine]] · [[moat-activation-4track-2026-06-03]]
