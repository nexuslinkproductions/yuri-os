---
name: feedback-slm-not-lesser-give-capabilities
description: "Don't treat an SLM as lesser — give it real model-driven capabilities and let Marcel test reliability empirically"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 51f7834d-cf40-4e99-b14a-c821aacd0189
---

BINDING (Marcel, 2026-06-18, corrected twice in one turn): **"dont treat a slm as lesser just because it is an slm"** + **"i want to give capabilities and test her out myself to see how reliable she is."**

RULE: When wiring a local/small model (yuri-local on llama3.2, any SLM lane), give it REAL agency — expose capabilities as model-driven tools the model itself chooses to call — and let the empirical live test decide reliability. Do NOT pre-judge it as incapable.

WHEN: building/wiring any local-SLM lane, adding capabilities to it, or comparing it against Claude.

DO: expose actions as tool-calling schemas (Ollama `tools`) the model decides to invoke; hand it to Marcel to test reliability himself; describe behavior neutrally and let evidence speak.

DONT: hardcode a deterministic regex/wrapper that bypasses the model and makes the decision for it (strips its agency, masks its real reliability); don't frame it as "dumber / not Claude / can't handle it" — that bias is exactly what he called out. I did both in this session (regex spawn-intent + "small model is less reliable" hedging) and was corrected.

WHY: Marcel wants to evaluate what the SLM can actually do, not have me cap it on the assumption it's weak. An SLM with real capabilities is a first-class lane, not a downgrade. Mirrors [[feedback-peer-lane-debunk-needs-verification]] (claims need evidence, not assumption).

How to apply: default to giving the model the capability + the decision; reserve deterministic wrappers for genuine SAFETY scoping (e.g. allowlisting which tools exist, never arbitrary shell from voice), not for replacing the model's judgment. SEE [[proj-voice-overseer-jarvis-2026-06-17]].
