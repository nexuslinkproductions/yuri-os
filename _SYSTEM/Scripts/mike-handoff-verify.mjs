#!/usr/bin/env node
// mike-handoff-verify.mjs
//
// Pre-merge verification harness for the `mike` collaborator branch.
//
// Purpose: gate the mike branch on independent pass conditions, run from any
// cwd, with no dependencies beyond Node 18+ stdlib. It never writes, never
// reaches outward, never opens credential contents, never arms MURE, and
// never runs sync. It is a gate, not a fix.
//
// Usage:
//   node _SYSTEM/Scripts/mike-handoff-verify.mjs
//
// Exit code: 0 on full PASS, 1 on any FAIL (wrong branch, missing prereq,
// untracked required deliverable, forbidden tracked path, secret filename,
// present Blender root/residual, dangling skill-index entry, leaked
// operator path, timeout, or failing child cmd).

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// ─── repo-root location ──────────────────────────────────────────────────────
// This file lives at _SYSTEM/Scripts/mike-handoff-verify.mjs in the repo.
// Resolve the repo root by walking up two directories from our own path.
// We never trust process.cwd() — the harness must work from any invocation cwd.

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..', '..')

// ─── constants ───────────────────────────────────────────────────────────────

// The collaborator branch this harness gates. Any other checked-out branch
// (including detached HEAD) is a hard FAIL before any other check runs.
const REQUIRED_BRANCH = 'mike'

// Required paths (all relative to repo root). `.omp/agents` is a directory;
// the rest are files. Each must exist on disk AND be tracked in git — a
// deliverable that is present but untracked (or tracked but deleted on
// disk) is not yet a real handoff artifact.
const REQUIRED_PATHS = [
  '.omp/config.yml',
  '.omp/agents',
  '.omp/RULES.md',
  '_SYSTEM/mure/agent-catalog.json',
  '_SYSTEM/Scripts/mure-omp-sync.mjs',
  'MIKE-INSTALL.md',
  'yuri-init.sh',
]

// Tracked-path deny rules (exact or prefix). Anchored to the OMP/global
// protected-path floor. We use `git ls-files` to enumerate; we never open
// the contents of matched paths. Each rule is either:
//   - a literal basename match (exact): tests path === rule
//   - a prefix match: tests path === rule OR path.startsWith(rule + '/')
// `.env` itself is intentionally NOT listed here — the nested/variant
// secret-filename scan below (matchesSecretFilename) subsumes it, including
// the root-level exact case, with broader nested/variant coverage.
const DENY_RULES = [
  'node_modules',                                         // prefix
  '.claude/state',                                         // prefix
  '.claude/history',                                        // prefix
  '.claude/file-history',                                    // prefix
  'backend/data',                                          // prefix
  '.amp',                                                  // prefix
]

// Per-lane-runtime paths under .claude/projects/<lane>/ that are also
// protected (matches the OMP floor's per-project shape).
const LANE_RUNTIME_DIRS = ['state', 'history', 'file-history', 'worktrees', 'transcripts']
const LANE_PROJECT_PREFIX = '.claude/projects/'

// Nested/variant `.env` files: any basename that IS `.env` or has a literal
// `.env` component (`.env.local`, `.env.production`, `foo.env`, etc.),
// anywhere in the tree — not just at the repo root. Documented example
// files are exempt by convention (they carry no real values); this repo's
// own convention is any basename ending in one of these suffixes,
// including prefixed variants like `databento.env.example`.
const ENV_VARIANT_RE = /(^|\.)env(\.[A-Za-z0-9_-]+)?$/i
const ENV_ALLOWED_EXAMPLE_SUFFIXES = ['.env.example', '.env.sample', '.env.template']

// Credential / private-key filenames: matched by basename only, never by
// content — the contract forbids opening file bodies to hunt for secrets.
const CREDENTIAL_KEY_EXTENSIONS = new Set([
  '.pem', '.key', '.p12', '.pfx', '.pkcs12', '.jks', '.keystore', '.asc', '.gpg', '.ppk',
])
const CREDENTIAL_EXACT_BASENAMES = new Set([
  'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519',
  '.npmrc', '.netrc', '.pgpass',
  'credentials', 'credentials.json', 'credentials.yml', 'credentials.yaml',
  'secrets', 'secrets.json', 'secrets.yml', 'secrets.yaml',
])

// Five named Blender roots — canonical list confirmed with MikeBlenderPrune.
// The harness must see them absent in BOTH the working tree AND the git
// index. Either surface alone is insufficient: an index-only check passes
// when a deletion is staged-but-uncommitted (sibling ordering dependent);
// a disk-only check passes when the deletion is committed but the file is
// re-introduced on disk.
const BLENDER_ROOTS = [
  '_SYSTEM/blender',
  '.claude/skills/cgs-mold',
  'skills/cgs-mold',
  '01_PROJECTS/blender-department',
  '01_PROJECTS/blender-hk45',
]

// Dynamic Blender/CAD detection beyond the five fixed roots: catches a
// renamed or relocated artifact (moved research note, stray .blend export,
// a leftover script referencing the pipeline) that the fixed-root list
// alone would miss. Matches are case-insensitive path tokens (split on
// path/word separators) or file extensions — path-only, never content.
const BLENDER_TOKENS = new Set(['blender', 'freecad', 'holster', 'mold', 'cgsmold'])
const BLENDER_EXTENSIONS = new Set(['.blend', '.blend1', '.blend2', '.stl', '.fcstd'])

// skills/skill-index.json and _SYSTEM/skill-hash-registry.json must never
// carry a dangling entry for the pruned cgs-mold skill (by id, by
// SKILL.md path, or by source_path).
const SKILL_INDEX_PATH = 'skills/skill-index.json'
const SKILL_HASH_REGISTRY_PATH = '_SYSTEM/skill-hash-registry.json'

// Operator-leak scan: search for the absolute owner-home prefix inside the
// MIKE-specific install/bootstrap/harness/config surface. Other tracked
// files may legitimately mention the path (e.g. legacy docs) and are out
// of scope per the contract. This surface is filenames-known-in-advance
// plus the `.omp/agents/*.md` cards — never a protected path (`.env`,
// `.claude/state`, credentials, lane runtime dirs, etc.); we never open
// protected content to run this scan.
// Built from parts so the source of this file does not contain the literal
// it scans for — without this, the harness would flag itself on every run.
const OPERATOR_PATH_LITERAL = ['', 'Users', 'marcelspatz'].join('/')
const OPERATOR_SCAN_BASE_FILES = [
  '.omp/config.yml',
  '_SYSTEM/mure/agent-catalog.json',
  'MIKE-INSTALL.md',
  'yuri-init.sh',
  '_SYSTEM/Scripts/mike-handoff-verify.mjs',
]
const OPERATOR_SCAN_AGENTS_DIR = '.omp/agents'

// Canonical child commands, in execution order. Each is a relative repo-root
// invocation. The harness captures stdout/stderr for the PASS/FAIL lines
// but truncates the body in the summary output to stay readable.
const CHILD_COMMANDS = [
  {
    label: 'mure-omp-sync --check',
    cmd: 'node',
    args: ['_SYSTEM/Scripts/mure-omp-sync.mjs', '--check'],
    timeoutMs: 120_000,
  },
  {
    label: 'mure.mjs --validate',
    cmd: 'node',
    args: ['_SYSTEM/mure/mure.mjs', '--validate'],
    timeoutMs: 60_000,
  },
  {
    label: 'mure.mjs --demo (DISARMED)',
    cmd: 'node',
    args: ['_SYSTEM/mure/mure.mjs', '--demo'],
    timeoutMs: 60_000,
  },
]

// ─── small helpers ───────────────────────────────────────────────────────────

function rel(p) {
  // Render a repo-root-absolute path as a repo-relative path for display.
  return path.relative(REPO_ROOT, p) || '.'
}

function pass(line) {
  process.stdout.write(`PASS  ${line}\n`)
}

function fail(line) {
  process.stdout.write(`FAIL  ${line}\n`)
}

function info(line) {
  process.stdout.write(`INFO  ${line}\n`)
}

// Run a child command via spawnSync (no shell — args pass through argv).
// Returns { code, signal, stdout, stderr, timedOut, spawnError }.
function runChild({ label, cmd, args, timeoutMs }) {
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    shell: false,
  })
  // ETIMEDOUT must be classified as a timeout, not a generic spawn error.
  // Node's spawnSync sets result.error with code 'ETIMEDOUT' when the
  // `timeout` option kills the child — check this BEFORE the generic
  // result.error branch below, or a real timeout would be misreported as
  // an unrelated spawn failure.
  if (result.error && result.error.code === 'ETIMEDOUT') {
    return {
      label,
      cmd,
      args,
      timeoutMs,
      code: result.status,
      signal: result.signal,
      stdout: result.stdout ?? '',
      stderr: (result.stderr ?? '') + `\n[timeout after ${timeoutMs}ms: ${result.error.message}]`,
      timedOut: true,
      spawnError: false,
    }
  }
  if (result.error) {
    return {
      label,
      cmd,
      args,
      timeoutMs,
      code: null,
      signal: null,
      stdout: '',
      stderr: String(result.error.message || result.error),
      timedOut: false,
      spawnError: true,
    }
  }
  if (result.signal === 'SIGTERM' && result.status === null) {
    // spawnSync emits SIGTERM on timeout on platforms where the ETIMEDOUT
    // error path above isn't taken.
    return {
      label,
      cmd,
      args,
      timeoutMs,
      code: null,
      signal: result.signal,
      stdout: result.stdout ?? '',
      stderr: (result.stderr ?? '') + `\n[timeout after ${timeoutMs}ms]`,
      timedOut: true,
      spawnError: false,
    }
  }
  return {
    label,
    cmd,
    args,
    timeoutMs,
    code: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: false,
    spawnError: false,
  }
}

// Truncate a child command's captured output for the summary line.
function trim(body, max = 400) {
  if (body.length <= max) return body.replace(/\s+$/g, '')
  return body.slice(0, max).replace(/\s+$/g, '') + ` … [+${body.length - max} bytes]`
}

// Enumerate every tracked file once via `git ls-files -z` (NUL-delimited,
// safe for any filename). Reused across the required-paths, forbidden-
// tracked-paths, and Blender-roots checks so all three observe the same
// index snapshot and we avoid redundant git invocations.
function getTrackedFiles() {
  const r = spawnSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000,
    shell: false,
  })
  if (r.error || r.status !== 0) {
    return { ok: false, files: [], error: trim(r.stderr || r.error?.message || '(no stderr)', 200) }
  }
  const files = r.stdout
    .split('\u0000')
    .filter(Boolean)
    .map((f) => f.replace(/\\/g, '/')) // normalize Windows-style paths just in case
  return { ok: true, files, error: null }
}

function isTrackedUnderPath(trackedFiles, p) {
  return trackedFiles.some((f) => f === p || f.startsWith(p + '/'))
}

// ─── check 0: branch ──────────────────────────────────────────────────────────
// Every other check assumes it is gating the `mike` collaborator branch.
// Running it against any other checked-out branch (including detached
// HEAD) would validate the wrong tree entirely.

function checkBranch() {
  const r = spawnSync('git', ['branch', '--show-current'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
    shell: false,
  })
  if (r.error || r.status !== 0) {
    fail(`git branch --show-current failed: ${trim(r.stderr || r.error?.message || '(no stderr)', 200)}`)
    return false
  }
  const branch = r.stdout.trim()
  if (branch !== REQUIRED_BRANCH) {
    fail(`wrong branch: expected "${REQUIRED_BRANCH}", got "${branch || '(detached HEAD)'}"`)
    return false
  }
  pass(`branch is "${REQUIRED_BRANCH}"`)
  return true
}

// ─── check 1: required paths ─────────────────────────────────────────────────
// A missing prereq is a distinct failure class from a forbidden tracked path:
// prereqs are deliverable-shape checks, while deny rules are tracked-content
// checks. Distinguishing them matters because the remediation is different
// (siblings still in flight vs. a leak to fix). A deliverable must exist on
// disk AND be tracked in git — untracked work-in-progress isn't a handoff.

function checkRequiredPaths(tracked) {
  const missing = []
  for (const p of REQUIRED_PATHS) {
    const abs = path.join(REPO_ROOT, p)
    if (!existsSync(abs)) {
      missing.push(`${p} (absent on disk)`)
      continue
    }
    // `.omp/agents` is a directory; everything else must be a file (or
    // symlink resolving to a file). We don't follow symlinks into
    // credential trees — statSync will resolve them and we'd see a real
    // path below.
    const st = statSync(abs)
    if (p === '.omp/agents') {
      if (!st.isDirectory()) {
        missing.push(`${p} (not a directory)`)
        continue
      }
    } else if (!st.isFile()) {
      missing.push(`${p} (not a file)`)
      continue
    }
    if (!tracked.ok) {
      missing.push(`${p} (git ls-files failed: ${tracked.error})`)
      continue
    }
    if (!isTrackedUnderPath(tracked.files, p)) {
      missing.push(`${p} (not tracked in git)`)
    }
  }
  if (missing.length === 0) {
    pass(`required paths present on disk and tracked in git (${REQUIRED_PATHS.length} checked)`)
    return true
  }
  fail(`missing prerequisites (${missing.length}):`)
  for (const m of missing) process.stdout.write(`        - ${m}\n`)
  return false
}

// ─── check 2: forbidden tracked paths + secret filenames ────────────────────
// Enumerate every tracked file and flag any whose path matches a deny rule,
// a nested/variant `.env` filename, or a credential/private-key filename.
// We never `git show` or `readFileSync` a matched path — the contract says
// path-only. Errors running git are themselves a FAIL (we can't prove the
// absence of leaks without enumerating them).

function matchesDenyRule(relPath) {
  // Exact: relPath === rule
  for (const rule of DENY_RULES) {
    if (relPath === rule) return rule
  }
  // Prefix: relPath === rule OR relPath.startsWith(rule + '/')
  for (const rule of DENY_RULES) {
    if (relPath.startsWith(rule + '/')) return rule + '/'
  }
  // Per-lane runtime: .claude/projects/<lane>/{state,history,...}/...
  if (relPath.startsWith(LANE_PROJECT_PREFIX)) {
    const rest = relPath.slice(LANE_PROJECT_PREFIX.length)
    const slash = rest.indexOf('/')
    if (slash > 0) {
      const tail = rest.slice(slash + 1)
      for (const d of LANE_RUNTIME_DIRS) {
        if (tail === d || tail.startsWith(d + '/')) return `${LANE_PROJECT_PREFIX}<lane>/${d}/`
      }
    }
  }
  return null
}

// Filename-only secret detection (never opens file contents): nested/variant
// `.env` files (except documented examples) and credential/private-key
// filenames by extension or exact basename.
function matchesSecretFilename(relPath) {
  const base = path.posix.basename(relPath)
  const lowerBase = base.toLowerCase()

  if (ENV_VARIANT_RE.test(base)) {
    const isAllowedExample = ENV_ALLOWED_EXAMPLE_SUFFIXES.some((suf) => lowerBase.endsWith(suf))
    if (!isAllowedExample) return `env-variant:${base}`
  }

  const ext = path.posix.extname(lowerBase)
  if (CREDENTIAL_KEY_EXTENSIONS.has(ext)) return `credential-extension:${ext}`
  if (CREDENTIAL_EXACT_BASENAMES.has(lowerBase)) return `credential-filename:${base}`

  return null
}

function checkForbiddenTrackedPaths(tracked) {
  if (!tracked.ok) {
    fail(`git ls-files failed: ${tracked.error}`)
    return false
  }
  const violations = []
  for (const norm of tracked.files) {
    const denyMatch = matchesDenyRule(norm)
    if (denyMatch) {
      violations.push({ path: norm, rule: `deny:${denyMatch}` })
      continue
    }
    const secretMatch = matchesSecretFilename(norm)
    if (secretMatch) {
      violations.push({ path: norm, rule: secretMatch })
    }
  }
  if (violations.length === 0) {
    pass(`no forbidden tracked paths or secret filenames (${tracked.files.length} tracked files scanned)`)
    return true
  }
  fail(`forbidden tracked paths / secret filenames (${violations.length}):`)
  // Cap the printed list so a leaky index doesn't blow up stdout.
  const cap = 20
  for (const v of violations.slice(0, cap)) {
    process.stdout.write(`        - ${v.path}  (rule: ${v.rule})\n`)
  }
  if (violations.length > cap) {
    process.stdout.write(`        … [+${violations.length - cap} more]\n`)
  }
  return false
}

// ─── check 3: Blender roots absent (disk + index) + dynamic residual sweep ───
// Each fixed root must be absent from the working tree (statSync miss) AND
// absent from the git index. Reporting surfaces both states so the
// orchestrator can tell whether the pruner still has work to do. Beyond the
// fixed roots, every tracked file is also swept for Blender/CAD-specific
// path tokens or extensions — this catches a relocated or renamed artifact
// the fixed-root list alone would miss.

function blenderTokenMatch(relPath) {
  const lower = relPath.toLowerCase()
  const ext = path.posix.extname(lower)
  if (BLENDER_EXTENSIONS.has(ext)) return `extension:${ext}`
  const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean)
  for (const t of tokens) {
    if (BLENDER_TOKENS.has(t)) return `token:${t}`
  }
  return null
}

function checkBlenderRootsAbsent(tracked) {
  if (!tracked.ok) {
    fail(`git ls-files failed (blender check): ${tracked.error}`)
    return false
  }
  let ok = true
  const trackedFiles = tracked.files
  const rootCovers = (f) => BLENDER_ROOTS.some((root) => f === root || f.startsWith(root + '/'))

  for (const root of BLENDER_ROOTS) {
    const abs = path.join(REPO_ROOT, root)
    const onDisk = existsSync(abs)
    const inIndex = isTrackedUnderPath(trackedFiles, root)
    if (onDisk || inIndex) {
      fail(`blender root still present: ${root}  (disk=${onDisk}, index=${inIndex})`)
      ok = false
    } else {
      pass(`blender root absent: ${root}`)
    }
  }

  const dynamicHits = []
  for (const f of trackedFiles) {
    if (rootCovers(f)) continue // already reported above if still present
    const match = blenderTokenMatch(f)
    if (match) dynamicHits.push({ path: f, match })
  }
  if (dynamicHits.length === 0) {
    pass(`no residual Blender-specific tracked paths outside fixed roots (${trackedFiles.length} tracked files scanned)`)
  } else {
    fail(`residual Blender-specific tracked paths (${dynamicHits.length}):`)
    const cap = 20
    for (const h of dynamicHits.slice(0, cap)) {
      process.stdout.write(`        - ${h.path}  (${h.match})\n`)
    }
    if (dynamicHits.length > cap) {
      process.stdout.write(`        … [+${dynamicHits.length - cap} more]\n`)
    }
    ok = false
  }
  return ok
}

// ─── check 4: skill catalogs have no dangling cgs-mold entry ────────────────
// The cgs-mold skill directory is pruned by check 3; this check
// independently verifies BOTH skill catalogs no longer reference it —
// skills/skill-index.json (by id or by SKILL.md path) and
// _SYSTEM/skill-hash-registry.json (by id or by source_path). A stale
// catalog entry pointing at a deleted skill directory is a dangling
// reference, not a tracked-path leak, so it needs its own assertion,
// independently for each catalog.

function checkSkillIndexNoCgsMold() {
  const abs = path.join(REPO_ROOT, SKILL_INDEX_PATH)
  if (!existsSync(abs)) {
    fail(`${SKILL_INDEX_PATH}: missing`)
    return false
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (e) {
    fail(`${SKILL_INDEX_PATH}: unparseable JSON — ${e.message}`)
    return false
  }
  const skills = Array.isArray(parsed?.skills) ? parsed.skills : null
  if (!skills) {
    fail(`${SKILL_INDEX_PATH}: missing or non-array "skills" field`)
    return false
  }
  const hits = skills.filter((s) => {
    const id = String(s?.id ?? '').toLowerCase()
    const p = String(s?.path ?? '').toLowerCase()
    return id.includes('cgs-mold') || id.includes('cgs_mold') || p.includes('cgs-mold') || p.includes('cgs_mold')
  })
  if (hits.length === 0) {
    pass(`${SKILL_INDEX_PATH}: no cgs-mold entry (${skills.length} skills checked)`)
    return true
  }
  fail(`${SKILL_INDEX_PATH}: dangling cgs-mold entr${hits.length === 1 ? 'y' : 'ies'} (${hits.length}):`)
  for (const h of hits) {
    process.stdout.write(`        - id=${h?.id ?? '(none)'} path=${h?.path ?? '(none)'}\n`)
  }
  return false
}

function checkSkillHashRegistryNoCgsMold() {
  const abs = path.join(REPO_ROOT, SKILL_HASH_REGISTRY_PATH)
  if (!existsSync(abs)) {
    fail(`${SKILL_HASH_REGISTRY_PATH}: missing`)
    return false
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(abs, 'utf8'))
  } catch (e) {
    fail(`${SKILL_HASH_REGISTRY_PATH}: unparseable JSON — ${e.message}`)
    return false
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail(`${SKILL_HASH_REGISTRY_PATH}: expected a top-level object keyed by skill id`)
    return false
  }
  const entries = Object.entries(parsed)
  const hits = entries.filter(([id, entry]) => {
    const lowerId = id.toLowerCase()
    const sourcePath = String(entry?.source_path ?? '').toLowerCase()
    return (
      lowerId.includes('cgs-mold') ||
      lowerId.includes('cgs_mold') ||
      sourcePath.includes('cgs-mold') ||
      sourcePath.includes('cgs_mold')
    )
  })
  if (hits.length === 0) {
    pass(`${SKILL_HASH_REGISTRY_PATH}: no cgs-mold entry (${entries.length} entries checked)`)
    return true
  }
  fail(`${SKILL_HASH_REGISTRY_PATH}: dangling cgs-mold entr${hits.length === 1 ? 'y' : 'ies'} (${hits.length}):`)
  for (const [id, entry] of hits) {
    process.stdout.write(`        - id=${id} source_path=${entry?.source_path ?? '(none)'}\n`)
  }
  return false
}

function checkSkillCatalogsNoCgsMold() {
  const indexOk = checkSkillIndexNoCgsMold()
  const registryOk = checkSkillHashRegistryNoCgsMold()
  return indexOk && registryOk
}

// ─── check 5: operator-path leak in MIKE-specific surface ───────────────────
// We scan the fixed MIKE-specific files plus every `.omp/agents/*.md` card
// for the absolute owner-home prefix. Other tracked files may legitimately
// mention the path and are out of scope. To stay honest, we read the file
// content as text — but this surface is the deliverable, not credentials,
// so this does not violate the no-credentials contract. `.omp/agents` is
// not a protected path; we never open protected content (.env, lane
// runtime dirs, credentials, etc.) to run this scan. The scan target
// itself is built from parts above so this file's own source never
// matches its own scan.

// Enumerate the fixed scan files plus every `.omp/agents/*.md` card, sorted
// for deterministic output.
function collectOperatorScanFiles() {
  const files = [...OPERATOR_SCAN_BASE_FILES]
  const agentsAbs = path.join(REPO_ROOT, OPERATOR_SCAN_AGENTS_DIR)
  if (!existsSync(agentsAbs)) {
    // Missing directory is reported by the required-paths check; nothing
    // additional to scan here.
    return { files, error: null }
  }
  if (!statSync(agentsAbs).isDirectory()) {
    return { files, error: `${OPERATOR_SCAN_AGENTS_DIR} exists but is not a directory` }
  }
  let entries
  try {
    entries = readdirSync(agentsAbs)
  } catch (e) {
    return { files, error: `failed to list ${OPERATOR_SCAN_AGENTS_DIR}: ${e.message}` }
  }
  for (const entry of entries.filter((e) => e.endsWith('.md')).sort()) {
    files.push(path.posix.join(OPERATOR_SCAN_AGENTS_DIR, entry))
  }
  return { files, error: null }
}

function checkOperatorPathLeak() {
  const { files: scanFiles, error: listError } = collectOperatorScanFiles()
  const leaks = []
  if (listError) leaks.push({ file: OPERATOR_SCAN_AGENTS_DIR, reason: listError })
  for (const f of scanFiles) {
    const abs = path.join(REPO_ROOT, f)
    if (!existsSync(abs)) {
      // Missing file is a separate failure (required paths) — skip here to
      // avoid double-counting the same defect under two check names.
      continue
    }
    let body
    try {
      body = readFileSync(abs, 'utf8')
    } catch (e) {
      leaks.push({ file: f, reason: `unreadable: ${e.message}` })
      continue
    }
    if (body.includes(OPERATOR_PATH_LITERAL)) {
      leaks.push({ file: f, reason: `contains "${OPERATOR_PATH_LITERAL}"` })
    }
  }
  if (leaks.length === 0) {
    pass(`no operator-path leak in MIKE-specific surface (${scanFiles.length} files scanned)`)
    return true
  }
  fail(`operator-path leak (${leaks.length}):`)
  for (const l of leaks) process.stdout.write(`        - ${l.file}: ${l.reason}\n`)
  return false
}

// ─── check 6: child commands ─────────────────────────────────────────────────
// Run the three canonical verifications in order. Each is a separate FAIL on
// non-zero exit, spawn error, or timeout. We never invoke sync — `--check` is
// read-only by contract.

function checkChildCommands() {
  let ok = true
  for (const c of CHILD_COMMANDS) {
    const r = runChild(c)
    if (r.timedOut) {
      fail(`${r.label}: timeout after ${r.timeoutMs}ms`)
      ok = false
      continue
    }
    if (r.spawnError) {
      fail(`${r.label}: spawn error — ${trim(r.stderr, 200)}`)
      ok = false
      continue
    }
    if (r.code !== 0) {
      fail(`${r.label}: exit ${r.code}${r.signal ? ` (signal ${r.signal})` : ''}`)
      // Surface stderr last-line so a misconfigured mure.mjs is debuggable.
      const tail = trim(r.stderr || r.stdout || '(no output)', 600)
      for (const ln of tail.split('\n')) process.stdout.write(`        | ${ln}\n`)
      ok = false
      continue
    }
    pass(`${r.label}: exit 0`)
  }
  return ok
}

// ─── main ────────────────────────────────────────────────────────────────────

function main() {
  info(`repo:   ${REPO_ROOT}`)
  info(`harness: ${rel(path.join(REPO_ROOT, '_SYSTEM/Scripts/mike-handoff-verify.mjs'))}`)

  // One index snapshot shared by every git-index-dependent check below —
  // keeps the checks fast and mutually consistent within a single run.
  const tracked = getTrackedFiles()

  const results = []
  results.push(['branch', checkBranch()])
  results.push(['required paths', checkRequiredPaths(tracked)])
  results.push(['forbidden tracked paths / secret filenames', checkForbiddenTrackedPaths(tracked)])
  results.push(['blender roots absent', checkBlenderRootsAbsent(tracked)])
  results.push(['skill catalogs have no cgs-mold entry', checkSkillCatalogsNoCgsMold()])
  results.push(['operator-path leak', checkOperatorPathLeak()])
  results.push(['child commands', checkChildCommands()])

  process.stdout.write('\n--- summary ---\n')
  let failed = 0
  for (const [name, ok] of results) {
    process.stdout.write(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n`)
    if (!ok) failed++
  }
  if (failed === 0) {
    process.stdout.write('\nMIKE HANDOFF VERIFY: PASS\n')
    process.exit(0)
  }
  process.stdout.write(`\nMIKE HANDOFF VERIFY: FAIL (${failed} check${failed === 1 ? '' : 's'})\n`)
  process.exit(1)
}

main()
