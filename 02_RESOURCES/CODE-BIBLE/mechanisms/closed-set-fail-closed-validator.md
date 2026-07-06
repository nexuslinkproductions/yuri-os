# Mechanism Card — closed-set-fail-closed-validator

> Validate against a frozen allow-`Set`, not a charset or open predicate. Anything not explicitly admitted is rejected. The default is NO.

| field | value |
|---|---|
| **slug** | `closed-set-fail-closed-validator` |
| **source** | IN-REPO (YURI-native pattern) — `_SYSTEM/Scripts/math/math-adapters.mjs` |
| **anchor** | `validateMathAdapterManifest` @ `math-adapters.mjs:13` |
| **license** | internal (YURI-OS) — canonical YURI idiom, reuse freely in-tree |
| **lane** | js (port the discipline to Rust via a frozen `HashSet`/`match` on an enum) |
| **YURI use** | every manifest/config/envelope validator; the privacy-gate key guard; any boundary that admits a bounded vocabulary |

## Mechanism (one line)
Membership-test each field against a module-level frozen `Set` of the ONLY legal values (`new Set([...])`), push an error on any miss, and return `ok: errors.length === 0`. The accept-list is closed: a value the author never enumerated cannot pass. Pair it with a negative-default boolean guard — require the safe value EXPLICITLY (`x !== false`), never merely truthiness.

## Algorithm (the idiom, distilled)
1. **Declare the closed sets at module scope** — `const ALLOWED_SCHEMAS = new Set([...])`, `ALLOWED_RUN_MODES`, `ALLOWED_PROMOTION_STATES` (`math-adapters.mjs:3-11`). Hoisting them out of the function makes the legal vocabulary auditable in one place and impossible to mutate per-call.
2. **Reject non-object input first** — `if (!adapter || typeof adapter !== 'object') return { ok:false, ... }` (`:17-19`). Garbage in → clean fail, never a thrown `TypeError`.
3. **Membership-gate every enumerated field** — `if (!ALLOWED_SCHEMAS.has(adapter.schema)) errors.push(...)` (`:20`, `:26`, `:29`). `.has()` is the whole gate: not in the set ⇒ rejected.
4. **Negative-default the dangerous flag** — `if (adapter.writesRuntimeTruth !== false) errors.push(...)` (`:32`). The privilege (writing runtime truth) is denied unless the manifest sets it to the literal `false`; `undefined`, `0`, `''`, `null` all fail, so an omitted field cannot silently grant capability.
5. **Deny capability tokens by enumeration** — `runtime` mode is rejected even though it's a plausible string, because it's not in `ALLOWED_RUN_MODES` (`:35-37`) — the open-set escape hatch is closed.
6. **Aggregate, don't short-circuit** — collect ALL errors, then `ok: errors.length === 0` (`:42-46`). Caller sees every violation in one pass.

## When to apply
- Any input crossing a trust boundary where the set of legal values is **known and bounded** (schemas, run-modes, lanes, event names, promotion labels, edge kinds).
- Any boolean that gates a privilege or a mutation — use `!== false` / `=== true`, never bare truthiness.
- Any place tempted to use a regex charset (`[a-z0-9]+`) or `typeof`/`length` heuristic to "validate" — those are open sets and leak.

## The failure it prevents
- **Open-set leak.** A charset/`includes()`/`startsWith()` filter admits anything that *matches the shape* — a `runtime` mode, a lowercase secret, a novel enum value an attacker invents. The closed `Set` admits only what was enumerated, so an unknown value is structurally impossible to pass. (This exact failure mode is documented in the privacy-gate: a lowercase-charset key guard was defeated by splitting a long secret into two lowercase halves — see `closed-set-projection` discipline in `yuri-energy-trace.mjs:200-241`.)
- **Silent privilege grant.** `if (adapter.writesRuntimeTruth)` (truthy) would let a manifest omit the field and still be denied — fine — but `if (!adapter.writesRuntimeTruth)` style inversions and "default-on" flags grant capability by omission. `!== false` forces the safe value to be stated, so absence = denied.
- **Crash-on-garbage = fail-open.** A validator that throws on a non-object input often gets wrapped in a `try/catch` that swallows the throw and proceeds — turning a "reject" into an accidental "allow". Returning a structured `{ok:false}` keeps the rejection load-bearing.

## Clean-rewrite note
Permissive-by-construction (it's YURI's own pattern). When porting to Rust: model the closed set as an `enum` and let the type system + a `match` arm be the gate (a non-variant string can't even be constructed); model the negative-default flag as `Option<bool>` requiring `Some(false)`. Never re-derive the legal vocabulary from a charset or a runtime-built list — the value of the pattern is that the legal set is a frozen literal.

## Verification
Real source read (not from memory). Grep-verified path:line in this repo:
- `math-adapters.mjs:3` `const ALLOWED_SCHEMAS = new Set(['yuri.math.adapter.v0']);`
- `math-adapters.mjs:20` `if (!ALLOWED_SCHEMAS.has(adapter.schema)) errors.push(...)`
- `math-adapters.mjs:32` `if (adapter.writesRuntimeTruth !== false) errors.push(...)`
- `math-adapters.mjs:35-37` rejects `runMode === 'runtime'` (closed-set escape-hatch kill)
- `math-adapters.mjs:43` `ok: errors.length === 0`
