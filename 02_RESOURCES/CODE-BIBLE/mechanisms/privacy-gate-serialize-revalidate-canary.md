# Mechanism Card — privacy-gate-serialize-revalidate-canary

> Validate, then serialize, then re-parse and re-validate the OUTPUT. The second pass is a canary: if it ever throws, your first pass has a hole.

| field | value |
|---|---|
| **slug** | `privacy-gate-serialize-revalidate-canary` |
| **source** | IN-REPO (YURI-native pattern) — `_SYSTEM/Scripts/math/yuri-energy-trace.mjs` |
| **anchor** | `appendTrace` @ `yuri-energy-trace.mjs:360`; `validateRecord` @ `:84` (file is under concurrent edit — anchor by symbol NAME; line numbers verified at time of writing, re-grep if drifted) |
| **license** | internal (YURI-OS) — canonical YURI idiom, reuse freely in-tree |
| **lane** | js (the serialize→re-validate canary ports to any serializer boundary) |
| **YURI use** | the Layer-7 privacy gate on every energy-trace JSONL record — no free text, no prompt content, no secret can reach disk |

## Mechanism (one line)
Before writing serialized data to a sink, run a structural validator over the object, serialize it, then **re-parse and re-validate the serialized result** — because validation-time and serialization-time can disagree (getters, `toJSON`, prototype tricks), and the second pass catches anything the first missed. Combined with a structural full-path allow-list for strings and a closed-set projection for object KEYS, nothing un-enumerated reaches disk.

## Algorithm (the idiom, distilled)
1. **Structural full-path string allow-list** — strings are legal ONLY at exact paths in `ALLOWED_STRING_PATHS` (`yuri-energy-trace.mjs:48`; the per-path throw at `:97`). A string anywhere else throws. This is a closed set keyed on POSITION, not key-name, so a forbidden string can't ride in under an allowed key name nested elsewhere.
2. **Reject every smuggle vector explicitly** in `validateRecord`:
   - **functions** (`:97-102`) — a function can hijack `JSON.stringify` via `toJSON`.
   - **own `toJSON` on plain objects** (`:144`) — would override serialization and emit arbitrary content.
   - **non-plain-object containers** (Map/Set/Date/class) — only plain objects + arrays + primitives are valid record material; `isPlainObject` (`:59-64`) checks the prototype.
   - **symbol** and **BigInt** — ungateable / serializer-incompatible, rejected at validation so the failure is loud and early.
3. **Closed-set KEY projection** — object KEYS land verbatim in the JSONL and the value-validator never gates keys. So `summarizeState` iterates the CANONICAL label `Set`, NEVER the attacker-controlled keys (`:275`): `for (const label of CANONICAL_PROMOTION_LABEL_SET) if (Object.hasOwn(rawDist, label)) ...`. An out-of-enum key (a secret, a `ghp_…` token, a length-split chunk) is never read and cannot reach disk.
4. **The canary — serialize then re-validate** (`appendTrace`, lines 363/369/370/371):
   ```
   validateRecord(record);                 // pre-serialization pass
   const serialized = JSON.stringify(record);
   const parsed = JSON.parse(serialized);
   validateRecord(parsed);                  // OUTPUT pass — the canary
   ```
   The header comment (`:368`) states it: "If this throws, the pre-validation has a gap that should be patched — this is the canary." A getter that returns forbidden content only at serialization time survives pass 1 but is caught in pass 2 on the materialized output.
5. **Single write surface** — `appendTrace` (`:360`) is the only file-write; all record construction (`buildTraceRecord`, `:300`) is pure and I/O-free. One choke point means one place to gate.

## When to apply
- Any object that gets serialized to a durable/observable sink (JSONL, telemetry, logs, an outbound payload) where the content must be provably bounded — privacy, secret-leak, or PII gates.
- Any validator/serializer pair where the two could disagree (getters, custom `toJSON`, proxies) — add the re-validate-the-output canary.
- Any place where object KEYS (not just values) are attacker-influenced and land in output — project through a closed enum, never iterate the raw keys.

## The failure it prevents
- **Serialization-time smuggling.** A pre-validation that inspects the live object misses a getter or `toJSON` that injects forbidden content only when `JSON.stringify` runs. Re-validating the parsed output (`:371`) catches it on the actual bytes — the validator and the serializer are forced to agree.
- **KEY-channel secret leak.** Value-only gating ignores object keys, which serialize verbatim. The documented defeat (in-file comment): an earlier lowercase-charset key guard admitted a secret by splitting it into two lowercase halves. The closed-set projection (`:275`) reads ONLY canonical keys, so a smuggled key is never even looked at.
- **`toJSON` / non-plain-container bypass.** Without explicit rejection of functions, own-`toJSON` (`:144`), Map/Set/Date/class, an object can carry an arbitrary string payload past a naive key/value check. Each is rejected by class inside `validateRecord` (`:84`).
- **Crash-at-write instead of fail-at-validate.** A BigInt makes `JSON.stringify` throw at write time, possibly mid-append (partial line on disk). Rejecting it at validation (in `validateRecord`, `:84`) keeps the failure clean and pre-I/O.

## Clean-rewrite note
YURI's own pattern, permissive. In Rust the canary is cheaper structurally (no `toJSON`/getter surface), but keep the closed-set string-path allow-list and the closed-enum KEY projection — those defend the content channel regardless of language. Never gate values while iterating untrusted keys.

## Verification
Real source read (not from memory). Grep-verified path:line in this repo (file is under concurrent edit — these were the live lines at writing; the symbol names are the durable anchor, re-grep if numbers drift):
- `yuri-energy-trace.mjs:48` `const ALLOWED_STRING_PATHS = new Set([` structural string allow-list
- `yuri-energy-trace.mjs:97` `if (!ALLOWED_STRING_PATHS.has(fieldPath))` string-at-non-allowed-path → throw
- `yuri-energy-trace.mjs:144` `if (Object.prototype.hasOwnProperty.call(node, 'toJSON'))` → throw
- `yuri-energy-trace.mjs:275` `for (const label of CANONICAL_PROMOTION_LABEL_SET)` closed-key projection
- `yuri-energy-trace.mjs:363` pre-validate · `:369` serialize · `:370` re-parse · `:371` re-validate (the canary; `appendTrace` @ `:360`)
