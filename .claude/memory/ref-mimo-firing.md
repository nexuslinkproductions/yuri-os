---
name: ref-mimo-firing
description: "THE way to fire the Mimo v2.5 pro lane — direct helper, never sandboxed; llm-lane.mjs mimo path is broken"
metadata: 
  node_type: memory
  tier: hot
  scope: claude-behavioral
  trig: 
    - mimo
    - fire mimo
    - mimo v2.5
    - work with mimo
    - llm lane
    - mimo lane
  refs: 
    - ref-mimo-integration
    - feedback-research-via-mimo-lane
  type: reference
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

FACTS:
- FIRE_MIMO via `node _SYSTEM/Scripts/mimo.mjs "<prompt>"` (built 2026-06-13, Marcel's direct order). Self-contained: resolves key from $MIMO_API_KEY → keychain `yuri-mimo-api-key` → ~/.config/yuri/env.sh. Prints final text only (strips thinking). Flags: --system, --max (default 131072 = full model ceiling), --think. Pipe via stdin too.
- DO NOT CAP MIMO (Marcel order "we do not put a cap on mimo", 2026-06-13). mimo-v2.5-pro is a REASONING model — max_tokens covers thinking + answer, so a low --max (the old 8192 default) gets consumed entirely by the thinking block and emits ZERO output (stderr "[truncated: max_tokens]", empty stdout, exit still 0 — silent failure). Endpoint supported range is (0, 131072] (probed: 262144 + 1000000 both http_400 "out of supported range"). Default is now 131072 = the model's FULL output ceiling, i.e. no artificial cap. Never lower it for real work. Mimo is an Opus-4.7/4.8-parity peer lane — see [[feedback-mimo-peer-lane]] and [[ref-mimo-integration]].
- ALWAYS run mimo unsandboxed → Bash tool with dangerouslyDisableSandbox:true. Marcel order: "dont sandbox mimo… youre breaking our own vision by limiting it." The lane has its own host-allowlist + SSRF + protected-path guards; the outer bash sandbox is redundant and chokes it.
- WIRE FACTS: host `token-plan-ams.xiaomimimo.com`, path `/anthropic/v1/messages`, model `mimo-v2.5-pro` (NOT the `[1m]` alias — endpoint 400s on it), Anthropic Messages protocol, x-api-key header, stream:true. Response = thinking block THEN text block; keep only text_delta.
- BROKEN: `llm-lane.mjs mimo` / `ai llm mimo` returns empty stdout + a detached red "AggregateError" (dies in dispatch before ANTHROPIC_REQ_START, likely coreOnDispatch telemetry). Do NOT use it for mimo. DeepSeek path may still be fine.
- `curl` to ANY host (incl. localhost + allowlisted raw.githubusercontent) is intercepted by a profile wrapper and returns bare "AggregateError" — use node fetch/https for egress, not curl.
- keychain `YURI_OS_MUSUBI:MIMO_API_KEY` is EMPTY (len 0); the real 51-char key is in `yuri-mimo-api-key` + env.sh. llm-compat.sh primary hydration loop is missing MIMO_API_KEY (only zshrc-grep fallback covers it; env.sh saves it).

- CLAUDE-P EXEMPTION (Marcel 2026-06-13): the "no claude -p / --print / SDK headless" ban is scoped to the ANTHROPIC lane (expensive no-session-persistence paid call). Firing Mimo headless/one-shot — mimo.mjs, or the `claude` wrapper pointed at the Mimo endpoint — is the INTENDED pattern and is exempt. Encoded in .claude/directives/no-anthropic-headless.md.

IMPLICATION: any "work with mimo" → call mimo.mjs unsandboxed, as an EQUAL peer (dispatch real heavy work). Cheap, 1M context, strong. See [[feedback-mimo-peer-lane]], [[feedback-research-via-mimo-lane]].
