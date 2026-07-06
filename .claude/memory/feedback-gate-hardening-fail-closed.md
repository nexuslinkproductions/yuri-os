---
name: feedback-gate-hardening-fail-closed
description: Security gates fail CLOSED on bad input; realpath not lexical; closed-set not charset; attack your own hardening
metadata:
  type: feedback
  tier: semantic
  scope: claude
  trig: ["fail closed", "security gate", "validator", "guard", "realpath", "symlink", "privacy key", "closed set", "harden", "skip to accept"]
  refs: ["[[feedback-codex-engineering-lessons]]", "[[feedback-substrate-cert-loop]]", "[[feedback-adversarial-persona-attack-loop]]"]
---

RULE  Security/validation gates must fail CLOSED on malformed/adversarial input. Every "skip on invalid input" is a fail-OPEN that accepts the worst case. Three recurring bypass classes, each confirmed by self-attack: (1) skip-to-zero on out-of-range/NaN/length-mismatch → gate flips to ACCEPT; (2) LEXICAL path checks (path.resolve) are symlink-bypassable — a coworker reaches protected files through a symlink; (3) charset allow-lists for keys admit lowercase secrets AND are split-bypassable (chunk a long secret under the length cap).

WHEN  Building OR reviewing any gate, validator, guard, privacy projection, or "hardening" of prior work; before claiming a security fix done.

DO    On invalid/out-of-range/length-mismatch input → RAISE the penalty / DENY (fail closed; mirror the existing clamp-and-penalize pattern). realpath-canonicalize the target (and nearest existing ancestor for not-yet-created files) BEFORE a protected-path compare; check both lexical and canonical. Project privacy/label keys over a CLOSED canonical enum — iterate the allow-set, never the attacker-controlled keys. Treat first-pass hardening as a HYPOTHESIS: run a multi-agent refute-by-default attack and verify each finding live before "done".

DONT  Skip-to-zero / skip-to-accept on bad input. Compare lexical paths for a security decision. Use a charset allow-list for keys that can carry secrets. Trust a green suite that only covers the happy path — the 2026-05-30 "hardening" tests were ALL green while every hole remained.

STYLE  State the fail direction explicitly ("fails CLOSED") in code + commit; name the bypass class you closed.

WHY   The 2026-05-30 self-attack (15 verified findings) confirmed each: out-of-range outcome flipped gateProposal reject→accept; a lexical guard was symlink-bypassed to clobber guard files; an open charset admitted `ghp_...`/lowercase secrets and split chunks.

SEE   [[feedback-codex-engineering-lessons]] · [[feedback-substrate-cert-loop]] · [[feedback-adversarial-persona-attack-loop]]
