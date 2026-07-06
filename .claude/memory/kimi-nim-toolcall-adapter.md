---
name: kimi-nim-toolcall-adapter
description: "kimi-k2.6 on NVIDIA NIM emits Moonshot-native <|tool_call_*|> tokens in content, not OpenAI tool_calls; llm-lane translates them at the lane boundary (don't abandon the model)"
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: project
  trig: 
    - kimi
    - nim
    - tool_call
    - token leak
    - lane adapter
    - parseKimiToolCalls
  refs: 
    - nemotron-nim-prefill-wall
    - lane-simplification-and-full-equip
  originSessionId: 181862b0-0556-4bc5-aac9-41ba2f9250b1
---

FACTS: kimi-k2.6 served via NVIDIA NIM serializes tool calls as Moonshot control tokens INSIDE message.content (`<|tool_call_begin|> functions.<name>:<idx> <|tool_call_argument_begin|> {json} <|tool_call_end|>`), NOT the OpenAI message.tool_calls array → the standard tool loop never runs them and the raw tokens leak as the "final answer". · FIX shipped in llm-lane.mjs: parseKimiToolCalls()/stripKimiToolTokens() translate the tokens → OpenAI tool_calls; self-scoping on the `<|tool_call_begin|>` signature so it's inert for deepseek/nemotron. · Two non-obvious traps solved: (1) the synthesized id MUST carry the resolved tool name (`kimi-tc-N-<name>`) because kimi MIRRORS the assistant tool_call id into the name slot of its NEXT call — an opaque id echoes back unresolvable; (2) arg-key inference (cmd→bash, path→read_file, url→fetch_url, pattern→grep) is the mimicry-independent fallback. · 20/20 unit (`llm-lane-kimi-adapter.test.mjs`), live 14 findings / 40 tool execs / 0 leak. It found a real fail-open the other lanes missed.
IMPLICATION: NIM serves different models with different tool-call WIRE formats — when a NIM lane leaks raw tool tokens, TRANSLATE at the lane boundary; don't write the model off (the model reasons fine; the integration was wrong). Marcel's instinct ("there has to be a way") was right. SEE [[nemotron-nim-prefill-wall]] · LANE-MANUAL.md §nemotron footnote.
