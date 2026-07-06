# Mechanism Card — single-resolver-env-override-path

> One function owns the resolution of a value. Priority is explicit: env override → persisted-verbatim → derived → safe fallback. Nothing re-derives it ad hoc.

| field | value |
|---|---|
| **slug** | `single-resolver-env-override-path` |
| **source** | IN-REPO (YURI-native pattern) — `_SYSTEM/Scripts/yuri-user.mjs` |
| **anchor** | `currentUserHandle` @ `yuri-user.mjs:53` |
| **license** | internal (YURI-OS) — canonical YURI idiom, reuse freely in-tree |
| **lane** | js (Rust: a `fn resolve(env) -> T` with the same ordered fallback) |
| **YURI use** | stable user handle for telemetry attribution; the pattern generalizes to any path/config/identity that must be resolved once, identically, from anywhere |

## Mechanism (one line)
Expose ONE exported resolver. Inside it, walk a fixed priority ladder — environment override (normalized) → persisted value (read VERBATIM, never re-normalized) → derived-from-source (normalized) → a gate-safe empty fallback — returning the first hit. Readers are injectable so the resolver is pure-testable; no caller ever re-implements the ladder.

## Algorithm (the idiom, distilled)
1. **Env override wins, normalized** — `const envHandle = normalizeHandle(process.env.YURI_USER ?? ''); if (envHandle) return envHandle;` (`yuri-user.mjs:54-55`). A session can force the value without touching disk, and the override goes through the SAME normalizer as any fresh input.
2. **Persisted value is read VERBATIM** — `if (cfg && typeof cfg.handle === 'string' && cfg.handle) return cfg.handle;` (`:59`). Once a stable id is minted and persisted, it is returned byte-identical — **never re-normalized** — because re-normalizing a stored id risks drift if the normalizer ever changes. (Header doc `:7-10`: "derived from `githubId` ONCE at onboarding ... thereafter read VERBATIM".)
3. **Derive from a secondary source, normalized** — `return op && typeof op.name === 'string' ? normalizeHandle(op.name) : '';` (`:63`). Only when nothing is persisted does it derive from `operator.json`, and a derived value DOES get normalized (it's fresh input, not a stable id).
4. **Safe fallback last** — empty string `''` is the anonymous, always-gate-safe terminal (`:10`, `:63`). No path throws; the worst case is "anonymous", not a crash.
5. **One canonical resolver path-builds via `import.meta.url`** — `REPO_ROOT = path.resolve(_HERE, '..', '..')` (`:18-21`) so config paths resolve from the module location regardless of cwd (no bare-`cd` drift).
6. **Readers are injectable** — `currentUserHandle({ userConfigReader, operatorReader })` (`:53-62`); defaults read disk, tests inject stubs. The ladder logic is exercised without filesystem state.

## When to apply
- Any value that must be resolved IDENTICALLY from many call sites (user id, repo root, a config dir, a model name) — give it one resolver, never let callers each read the env/file.
- Any value with an env override AND a persisted form — codify the priority once.
- Any stable identifier that, once minted, must never drift — read it verbatim, normalize only fresh input.
- Anything that needs unit tests without touching disk — inject the readers.

## The failure it prevents
- **Identity drift / fuzzy-merge split.** If multiple call sites each normalize the stored handle, a later change to `normalizeHandle` silently re-keys the user → telemetry splits one person into two. Reading the persisted value VERBATIM (`:59`) pins it. (Enterprise rule cited in header `:6-12`: one stable id per user, never let it drift.)
- **Override that doesn't override.** Scattered readers mean an env override set in one place is ignored by another path. A single resolver guarantees the override is honored everywhere.
- **cwd-dependent path resolution.** Building config paths from `process.cwd()` breaks the moment a hook or subagent runs from a different directory. Anchoring on `import.meta.url` (`:18`) makes the resolver cwd-independent.
- **Untestable identity logic.** Hard-coded `fs.readFileSync` inside the resolver forces tests to stage real files. Injectable readers (`:57`, `:61`) make every rung of the ladder a pure unit test.

## Clean-rewrite note
YURI's own pattern, permissive. In Rust: `fn current_user_handle(env: &Env, cfg: impl ConfigReader) -> String` with the same ordered `env → persisted(verbatim) → derived(normalized) → String::new()` fallback; the verbatim/normalize split is the load-bearing distinction, keep it.

## Verification
Real source read (not from memory). Grep-verified path:line in this repo:
- `yuri-user.mjs:53` `export function currentUserHandle(opts = {}) {`
- `yuri-user.mjs:54-55` env override, normalized, wins first
- `yuri-user.mjs:59` persisted handle returned VERBATIM (no re-normalize)
- `yuri-user.mjs:63` derived-from-operator (normalized) → `''` safe fallback
- `yuri-user.mjs:18-21` `REPO_ROOT`/config paths anchored on `import.meta.url`
