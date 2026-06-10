---
name: bash-guard-role-matcher-lexical-bypass
description: "RESOLVED (2026-06-05): bash-security-guard.js isRolePathMutation lexical bypass — FIXED across 4 hardening rounds AND independently re-verified on main (Wave-1 truth-gate ran all 5 historical bypass forms in coworker role — every one DENIES now). A static command-string matcher is a fail-OPEN layer-2 conscience, not a sandbox — documented, not chased; the hard boundary is the deterministic PreToolUse hooks + deny-list + owner-role trust-root."
metadata: 
  node_type: memory
  type: project
  tier: working
  scope: main
  trig: 
    - bash-security-guard
    - role guard
    - protected path
    - bypass
    - realpath
    - gate hardening
    - pc-1
  refs: 
    - "[[feedback-gate-hardening-fail-closed]]"
    - "[[gitnexus-query-is-lexical-context-is-structural]]"
    - "[[delta-gate-severity-laundering]]"
  originSessionId: 2448e5f4-5e5f-4625-bfa9-db81dc67ab4c
---

GOAL: harden `bash-security-guard.js` `isRolePathMutation` (lines 294-300) — it gates role/trust-surface mutation LEXICALLY and is bypassable by any coworker-role operator. WHEN: found 2026-06-05 by the realpath-axis skeptic in the PC-1 verify; confirmed against live code. WHERE: `.claude/hooks/bash-security-guard.js:294-300`.

THE HOLE (verified live, byte-identical to committed HEAD — PC-1 only changed the path SOURCE, not the matcher):
`if (!PROTECTED_ROLE_PATHS.some(p => cmd.includes(p))) return false; const first = parts[0]; if (['rm','mv',...].includes(first)) ...; if (first==='git' && (parts[1]==='checkout'||parts[1]==='restore')) ...`
- `cmd.includes(p)` = contiguous substring → `cd .claude/hooks && rm tirith-url-guard.js` splits the path, never matches.
- `parts[0]`-only verb gate → `echo <path> | xargs rm` (parts[0]='echo'), `F=<path>; rm $F` (parts[0]='F=...') both slip the gate even though the substring matches.
- `find .claude/hooks -name <guard> -delete` → parts[0]='find', not in the verb set.
- `git reset --hard HEAD~N` reverts every enforcement hook; line 391 only emits an ADVISORY, not a deny (only checkout/restore are blocked).
5 confirmed full-chain bypasses, all in forced coworker role (passed ALL PreToolUse hooks). Owner role is unaffected (unrestricted by design); dev-credential.json exists on disk so coworker role resolution is LIVE.

FIX RECIPE (owner-gated GOV hardening, mirror operator-write-guard.js canonicalize()):
(a) resolve each command ARGUMENT to absolute realpath and compare against the canonical role surface (ROLE_TRUST_SURFACES) — not raw-string `includes`;
(b) detect the mutating verb ANYWHERE in the command (after cd / ; / && / | / xargs), not just parts[0];
(c) add `git reset --hard` and `git restore --source` to the blocked git ops alongside checkout/restore.

STATE: FIXED across 4 hardening rounds (uncommitted on feat/xref-propagation-scan-v1). R1-2 = realpath+basename+verb-anywhere + decode-exec-to-shell + glob/brace + lane-kernel self-protect; R3 = robust fail-closed posture `roleSignal AND (mutatingVerbAnywhere OR obfuscationOrExecConstruct)` closing cmd-subst/brace/decode-to-python-perl-node/inline-interpreter; R4 = fixed an over-block REGRESSION (read/print/commit parity restored — DENY gated on real mutation via interpScriptHasMutation, not bare basename presence) + here-string + newline-var-head + role-aware matrix. matrix+smoke+role-bypass GREEN in BOTH dev AND coworker (130/130). 

CONCLUSION (endorsed by Marcel + reached INDEPENDENTLY by Nemotron in the live red-team): a static command-string matcher is a fail-OPEN LAYER-2 conscience with an UNBOUNDED obfuscation tail — DOCUMENTED in the guard's own comment block, NOT chased. Known-residual tail: printf-\xNN-escaped payload to a non-shell interpreter; `source /tmp/payload.sh` (mutation in a separate file the matcher never opens — uncatchable at the string layer, Nemotron-found); runtime-computed paths; output proc-sub `>(rm x)`; nested interpreter inside a here-string body. The HARD boundary (ordered) = deterministic protected-path PreToolUse hooks (fail-CLOSED) + settings.json deny-list + fs perms + owner-role trust-root (scrypt passphrase; a coworker clone holds only the hash). STOP chasing — the matcher raises the bar against casual/scripted tampering, it is NOT a sandbox. The cleaner product framing: the coworker role is better as a self-toggle MODE (guardrail) than an unbypassable wall — see [[yuri-mode-toggle-idea]]. Still pre-existing/flagged: `claude-protocol-guard.mjs` imports CONTROL_FILE_PREFIXES with NO try/catch (fail-open on kernel-import throw).

NEXT: DONE — matcher hardened (4 rounds) + the fix is on main and RE-VERIFIED by the Wave-1 security red-team truth-gate (2026-06-05): all 5 historical bypass forms (redirect-to-hook, cd-split rm, var-indirection rm, find -delete, git reset --hard) DENY in true coworker role. This finding is CLOSED — do not re-flag it as open. The known-residual obfuscation tail (printf-escaped-to-interpreter, source-external-file, runtime-computed paths) is documented-and-accepted, not a regression. Negative-fixture tests landed (matrix 130/130).

SEE: [[feedback-gate-hardening-fail-closed]] (realpath not lexical, closed-set not charset — this is that lesson, confirmed exploitable live) · bash-security-guard.js:294-300
