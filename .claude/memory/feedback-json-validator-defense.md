---
name: feedback-json-validator-defense
description: JSON-serializing validators must gate toJSON, getters, functions, symbols; use serialize-then-re-validate as canary
metadata:
  type: feedback
  tier: semantic
  scope: all
  trig: ["validator", "validate", "json", "stringify", "serialization", "toJSON", "getter", "function", "symbol", "sanitizer", "privacy-gate"]
  refs: ["[[fb-codex-engineering-lessons]]"]
---

RULE  When building a validator that gates content destined for JSON.stringify, account for the four serialization-side smuggle vectors: `toJSON()` methods, getters/setters, function values, and symbol values. None of these are caught by naive "check string fields" structural validation.

WHEN  Writing any Privacy Gate, schema validator, sanitizer, or content gate where the validated object is later serialized via JSON.stringify (or fed to anything that may invoke toJSON).

DO    (1) Reject function values explicitly — `typeof value === 'function'` carries hidden behavior. (2) Reject objects with an own `toJSON` method — they override serialization unconditionally. (3) Reject symbols — they're unrepresentable in JSON but exploitable in adjacent serialization paths. (4) Reject non-plain-object containers (Map, Set, Date, custom classes) — they may have toJSON hooks or alternate enumeration semantics. (5) Defense in depth: serialize once, parse the result, re-validate. If the post-serialize validation catches something the pre-validation missed, the pre-validation has a gap to patch — the post-pass is the canary.

DONT  Trust that input validation alone covers what JSON.stringify produces. Don't assume "this validator iterates Object.entries, so it covers everything" — getters and toJSON sidestep that. Don't skip function/symbol type checks because they "obviously aren't valid data" — they're obvious until you forget them.

WHY   JSON.stringify has documented behavior of invoking toJSON, calling getters at enumeration time, and silently dropping functions and symbols. A validator that doesn't model these behaviors can be subverted by callers who construct adversarial objects. The pre-serialize + post-serialize sandwich pattern is the canonical defense in any system where input shape and output shape can differ.

SEE   FB:CODEX-ENGINEERING-LESSONS · _SYSTEM/Scripts/math/yuri-energy-trace.mjs (worked example of the sandwich pattern)
