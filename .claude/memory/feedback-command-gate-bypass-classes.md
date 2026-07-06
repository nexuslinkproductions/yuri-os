---
name: feedback-command-gate-bypass-classes
description: "Hardening a shell-command denylist gate (llm-lane / bash-guard class): a glob token must be EXPANDED not literal-resolved, tokenization must split redirection operators, git mutation needs option-robust subcommand parsing, stash needs a read-only allowlist — and the gate's glob-expansion repoRoot MUST equal the cwd the command executes in"
metadata:
  node_type: memory
  type: feedback
  tier: hot
  scope: claude-behavioral
  trig:
    - command gate
    - bash gate
    - denylist
    - glob
    - protected surface
    - git mutation
    - llm-lane
    - shell injection
    - bypass
  refs:
    - feedback-posix-fs-concurrency-floor
    - feedback-agentic-red-team-finds-what-self-tests-miss
    - bash-guard-role-matcher-lexical-bypass
  type: feedback
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

RULE: hardening a shell-command denylist gate (the llm-lane advisory bash gate / bash-guard class) — five bypass classes a naive regex misses, all red-team-proven on the llm-lane gate (NANO SWARM G4, 2026-06-13):

1. **GLOB expansion (the severe one).** A gate that resolves the LITERAL glob token (`.e*`, `se?rets/x`) is bypassed: realpath can't resolve a wildcard, a basename regex misses the wildcarded name, a prefix check fails when the wildcard sits before/inside the protected segment — gate ALLOWS, bash expands to the real file and leaks it. FIX: EXPAND the glob (`fs.globSync(pattern,{cwd:repoRoot})`) and test every real match; PLUS a conservative block for any `.`+glob segment (`.e*`, `.claud?`) which aims at a protected dotfile even if absent; PLUS a literal-prefix-inside-protected belt (`secrets/k*`).
2. **Redirection-into-token.** `cat <.env` / `cat 0<.env` tokenize as ONE junk token — the path after `<`/`>` is never checked. FIX: split tokens on `<`/`>` so the redirect TARGET becomes its own path token (catches read-from AND write-to protected).
3. **git option-prefix.** `/git\s+(commit|...)/` is defeated by ANY global option (`git -C dir commit`, `git -c k=v push`). FIX: tokenize, locate `git`, skip global options (value-taking ones consume the next token), test the first bare token against a closed mutation set.
4. **stash denylist.** Blocking only `stash drop/clear/pop` misses `git stash push` / bare `git stash` (both mutate the tree). FIX: invert to a read-only ALLOWLIST `{list, show}`.
5. **quote/backslash evasion.** `gi""t commit`, `com\m\it` — FIX: strip `'"\` from every token before matching.

CRITICAL INVARIANT: the gate's glob-expansion `repoRoot` MUST equal the cwd the command will `exec` in. If you check the gate against repo A but bash runs in repo B, globSync sees a different filesystem view and the gate is meaningless. llm-lane passes REPO_ROOT for both — verify this for any new gate.
WHEN: building/auditing any command denylist (llm-lane lane gate, PreToolUse bash hook, CI shell allowlist). Capability-recall first — [[lane-command-gate]] already exists (`gitMutationHit`, `protectedPathHit`); extend it.
DONT: resolve a glob token literally; tokenize without splitting redirections; regex-match `git\s+sub`; ship a stash/branch denylist; trust green unit tests for a security gate — run an adversarial bypass agent that PROVES leaks with canaries ([[feedback-agentic-red-team-finds-what-self-tests-miss]]).
WHY (the floor): even hardened, a static string→verdict matcher is fail-OPEN — `$VAR`/`$(...)`/base64 runtime indirection produces the dangerous token at runtime and cannot be caught statically. Document it; the real boundary is dev-only execution + the audited safety core for destructive ops, not the lexical gate. Same lesson as [[bash-guard-role-matcher-lexical-bypass]].
SEE: _SYSTEM/Scripts/_lib/lane-command-gate.mjs · _SYSTEM/reports/nano-swarm-session-retro-2026-06-13.md (G4)
