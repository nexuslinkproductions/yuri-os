#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const EXECUTOR_VERSION = '0.1.0'
const PROTOCOL_VERSION = '1.0'
const DEFAULT_POLICY_REL = 'Scripts/policy/yuri-guarded-executor.readonly.json'
const DEFAULT_ARTIFACT_ROOT = path.join(os.homedir(), '.nudimmud/guarded-executor-runs')
const FALLBACK_ARTIFACT_ROOT = '/private/tmp/nudimmud-guarded-executor-runs'
const STRUCTURED_PLAN_VERSION = 'nudimmud.workhorse.x1'
const STRUCTURED_DEFAULT_MAX_LINES = 80
const STRUCTURED_HARD_MAX_LINES = 200
const STRUCTURED_FORBIDDEN_PATH_MARKERS = [
  '.git',
  '.env',
  '.npmrc',
  'node_modules',
  'backend/data',
  '.claude/history',
  '.claude/state',
]
const STRUCTURED_RUN_COMMANDS = new Set([
  'pwd',
  'git_branch_show_current',
  'git_rev_parse_short_head',
  'git_diff_cached_name_only',
  'git_status_scoped',
  'ls_path',
  'wc_l_file',
  'head_file',
  'tail_file',
  'grep_file',
])
const IMPLEMENTATION_FILES = [
  'Scripts/yuri-guarded-executor.mjs',
  DEFAULT_POLICY_REL,
]
const DB_SCOPE_FILES = [
  'backend/data/nudimmud.db',
  'backend/data/nudimmud.db-shm',
  'backend/data/nudimmud.db-wal',
]
const REQUIRED_REPORT_FIELDS = [
  'result_label',
  'local_truth_summary',
  'manifest_paths',
  'actions_requested',
  'actions_allowed',
  'actions_denied',
  'files_read',
  'commands_run',
  'validations',
  'model_claims_confirmed',
  'model_claims_downgraded',
  'risks_or_gaps',
  'artifact_paths',
  'non_claims',
  'next_gate',
  'gpt_5_5_review_required',
]
const ALLOWED_ACTIONS = new Set([
  'READ_MANIFEST_FILE',
  'SEARCH_MANIFEST_PATHS',
  'RUN_ALLOWED_CHECK',
  'SUMMARIZE_EVIDENCE',
  'FINAL_REPORT',
])
const DENIED_ACTIONS = new Set([
  'WRITE_FILE',
  'APPLY_PATCH',
  'STAGE_FILE',
  'COMMIT',
  'DELETE_FILE',
  'READ_SECRET',
  'READ_DB',
  'BROAD_SEARCH',
  'RUN_UNLISTED_COMMAND',
  'MCP_CALL',
  'SUBAGENT_CALL',
])

function main() {
  const cli = parseCli(process.argv.slice(2))
  if (cli.help) {
    printHelp()
    return
  }

  const artifactRootInfo = ensureArtifactRoot(cli.artifactRoot)
  if (!artifactRootInfo.ok) {
    console.error(artifactRootInfo.error)
    process.exitCode = 1
    return
  }

  if (cli.selftest) {
    const ok = runSelftest({
      artifactRoot: artifactRootInfo.path,
      policyRelPath: DEFAULT_POLICY_REL,
    })
    process.exitCode = ok ? 0 : 1
    return
  }

  if (cli.planPath) {
    try {
      const summary = executeStructuredPlan({
        planPath: cli.planPath,
        artifactRoot: artifactRootInfo.path,
        execute: cli.execute,
      })
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
      process.exitCode = 0
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`${message}\n`)
      process.exitCode = 1
      return
    }
  }

  const rawRequest = cli.requestPath
    ? fs.readFileSync(cli.requestPath, 'utf8')
    : readRequestFromStdin()
  const outcome = executeRequest({
    rawRequest,
    artifactRoot: artifactRootInfo.path,
    policyRelPath: DEFAULT_POLICY_REL,
  })

  process.stdout.write(`${outcome.finalReportPath}\n`)
  process.exitCode = outcome.success ? 0 : 1
}

function parseCli(argv) {
  const cli = {
    help: false,
    selftest: false,
    execute: false,
    requestPath: null,
    planPath: null,
    artifactRoot: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help') {
      cli.help = true
      continue
    }
    if (arg === '--selftest') {
      cli.selftest = true
      continue
    }
    if (arg === '--execute') {
      cli.execute = true
      continue
    }
    if (arg === '--request') {
      const next = argv[index + 1]
      if (!next) {
        throw new Error('--request requires a file path')
      }
      cli.requestPath = next
      index += 1
      continue
    }
    if (arg === '--plan') {
      const next = argv[index + 1]
      if (!next) {
        throw new Error('--plan requires a file path')
      }
      cli.planPath = next
      index += 1
      continue
    }
    if (arg === '--artifact-root') {
      const next = argv[index + 1]
      if (!next) {
        throw new Error('--artifact-root requires a directory path')
      }
      cli.artifactRoot = next
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return cli
}

function printHelp() {
  process.stdout.write(
    [
      'Yuri Guarded Executor',
      '',
      'Readonly read/search/check executor.',
      '',
      'Usage:',
      '  node Scripts/yuri-guarded-executor.mjs --request <file> [--artifact-root <dir>]',
      '  printf \'{...}\' | node Scripts/yuri-guarded-executor.mjs [--artifact-root <dir>]',
      '  node Scripts/yuri-guarded-executor.mjs --plan <file> [--execute] [--artifact-root <dir>]',
      '  node Scripts/yuri-guarded-executor.mjs --selftest [--artifact-root <dir>]',
      '  node Scripts/yuri-guarded-executor.mjs --help',
    ].join('\n') + '\n'
  )
}

function readRequestFromStdin() {
  if (process.stdin.isTTY) {
    throw new Error('Request JSON required via stdin or --request <file>')
  }
  return fs.readFileSync(0, 'utf8')
}

function ensureArtifactRoot(explicitRoot) {
  const tryRoots = explicitRoot
    ? [path.resolve(explicitRoot)]
    : [DEFAULT_ARTIFACT_ROOT, FALLBACK_ARTIFACT_ROOT]

  for (const root of tryRoots) {
    try {
      fs.mkdirSync(root, { recursive: true })
      fs.accessSync(root, fs.constants.W_OK)
      return { ok: true, path: root, explicit: Boolean(explicitRoot) }
    } catch (error) {
      if (explicitRoot) {
        return { ok: false, error: `Artifact root unavailable: ${root}` }
      }
    }
  }

  return { ok: false, error: 'Artifact root unavailable' }
}

function executeRequest({ rawRequest, artifactRoot, policyRelPath, preflightOptions = {} }) {
  const start = new Date().toISOString()
  const policyPath = path.resolve(policyRelPath)
  const runId = `run-${timestampId()}-${crypto.randomBytes(3).toString('hex')}`
  const runDir = path.join(artifactRoot, runId)
  fs.mkdirSync(runDir, { recursive: true })

  const artifactPaths = createArtifactPaths(runDir)
  const context = {
    executorVersion: EXECUTOR_VERSION,
    start,
    runId,
    runDir,
    artifactPaths,
    policyPath,
    actionLogs: [],
    evidence: {
      reads: [],
      searches: [],
      checks: [],
      summaries: [],
      truncation_flags: [],
    },
    verification: {
      preflight: {},
      policy_version: null,
      hard_stop: false,
      hard_stop_reasons: [],
      non_mutation_assertion: true,
      denied_action_count: 0,
      model_claim_downgrade_placeholder: 'No external model claims trusted. Operator request treated as advisory only.',
    },
    readLinesTotal: 0,
    commandsRun: [],
    filesRead: new Set(),
    deniedReasons: [],
    allowedActionTypes: [],
  }

  let request = null
  let policy = null
  let finalReport = null
  let success = false

  try {
    writeText(artifactPaths.request, buildRequestArtifact(rawRequest))
    request = parseStrictJson(rawRequest, 'Malformed request JSON')
    policy = loadPolicy(policyPath)
    context.verification.policy_version = policy.version
    writeText(artifactPaths.modelOutput, buildModelOutputArtifact(request))

    const preflight = runPreflight(policy, preflightOptions)
    context.verification.preflight = preflight
    if (preflight.hardStop) {
      context.verification.hard_stop = true
      context.verification.hard_stop_reasons = [...preflight.reasons]
      throw new Error(preflight.reasons.join(' | '))
    }

    validateRequestEnvelope(request, policy)
    processActions(request, policy, context)
    finalReport = generateFinalReport(request, policy, context)
    success = !context.verification.hard_stop
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!finalReport) {
      finalReport = generateFailureReport(request, policy, context, message)
    }
    context.verification.hard_stop = true
    if (!context.verification.hard_stop_reasons.includes(message)) {
      context.verification.hard_stop_reasons.push(message)
    }
  }

  writeJson(artifactPaths.actions, context.actionLogs, true)
  writeJson(artifactPaths.evidence, context.evidence)
  writeJson(artifactPaths.verification, context.verification)
  writeText(artifactPaths.finalReport, finalReport)
  writeJson(artifactPaths.meta, buildMeta({
    request,
    policy,
    context,
    artifactRoot,
    end: new Date().toISOString(),
  }))

  return {
    success,
    finalReportPath: artifactPaths.finalReport,
    runDir,
  }
}

function createArtifactPaths(runDir) {
  return {
    request: path.join(runDir, 'request.md'),
    modelOutput: path.join(runDir, 'model_output.md'),
    actions: path.join(runDir, 'actions.jsonl'),
    evidence: path.join(runDir, 'evidence.json'),
    verification: path.join(runDir, 'verification.json'),
    finalReport: path.join(runDir, 'final_report.md'),
    meta: path.join(runDir, 'meta.json'),
  }
}

function buildRequestArtifact(rawRequest) {
  return [
    '# request',
    '',
    'Operator request payload.',
    '',
    '```json',
    safeBlock(rawRequest.trim()),
    '```',
    '',
  ].join('\n')
}

function buildModelOutputArtifact(request) {
  const actionTypes = Array.isArray(request.actions)
    ? request.actions.map((action) => normalizeActionType(action?.type))
    : []

  return [
    '# model_output',
    '',
    'No model call executed.',
    'Advisory source: operator request only.',
    '',
    `protocol_version: ${request.protocol_version ?? 'missing'}`,
    `request_id: ${request.request_id ?? 'missing'}`,
    `mode: ${request.mode ?? 'missing'}`,
    `actions: ${actionTypes.join(', ') || 'none'}`,
    '',
  ].join('\n')
}

function parseStrictJson(text, errorLabel) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(errorLabel)
  }
}

function loadPolicy(policyPath) {
  if (!fs.existsSync(policyPath)) {
    throw new Error('Missing policy file')
  }
  const policy = parseStrictJson(fs.readFileSync(policyPath, 'utf8'), 'Malformed policy JSON')
  if (!policy || typeof policy !== 'object') {
    throw new Error('Invalid policy object')
  }
  const allowedFiles = Array.isArray(policy.allowed_files)
    ? policy.allowed_files
    : Array.isArray(policy.allowed_files_read)
      ? policy.allowed_files_read
      : null
  if (!Array.isArray(allowedFiles) || allowedFiles.length === 0) {
    throw new Error('Invalid policy object: allowed_files missing')
  }
  policy.allowed_files = allowedFiles
  return policy
}

function runPreflight(policy, options = {}) {
  const expectedRoot = policy.repo_root
  const preflight = {
    cwd: process.cwd(),
    branch: '',
    head: '',
    staged_files: [],
    db_status: '',
    hardStop: false,
    reasons: [],
  }

  if (process.cwd() !== expectedRoot) {
    preflight.reasons.push(`Wrong repo root: ${process.cwd()}`)
  }

  preflight.branch = runCommand(['git', 'branch', '--show-current']).stdout
  if (preflight.branch !== 'main') {
    preflight.reasons.push(`Wrong branch: ${preflight.branch}`)
  }

  preflight.head = runCommand(['git', 'rev-parse', '--short', 'HEAD']).stdout
  preflight.staged_files = linesOf(runCommand(['git', 'diff', '--cached', '--name-only']).stdout)
  if (preflight.staged_files.length > 0 && options.allowStagedFiles !== true) {
    preflight.reasons.push('Staged files present')
  }

  const operatingDna = path.join(expectedRoot, '.claude/rules/nudimmud_operating_dna.md')
  if (!fs.existsSync(operatingDna)) {
    preflight.reasons.push('Missing Operating DNA')
  }

  const dbStatus = runCommand([
    'git',
    'status',
    '--short',
    '--',
    'backend/data/nudimmud.db',
    'backend/data/nudimmud.db-shm',
    'backend/data/nudimmud.db-wal',
  ]).stdout
  preflight.db_status = dbStatus
  const dbLines = linesOf(dbStatus)
  if (dbLines.some((line) => line.includes('backend/data/nudimmud.db') && !line.includes('.db-shm') && !line.includes('.db-wal'))) {
    preflight.reasons.push('backend/data/nudimmud.db is dirty')
  }

  preflight.hardStop = preflight.reasons.length > 0
  return preflight
}

function validateRequestEnvelope(request, policy) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('Request must be a JSON object')
  }

  const requiredFields = ['protocol_version', 'request_id', 'repo_root', 'mode', 'manifest_paths', 'actions']
  for (const field of requiredFields) {
    if (!(field in request)) {
      throw new Error(`Missing request field: ${field}`)
    }
  }

  if (request.protocol_version !== PROTOCOL_VERSION) {
    throw new Error(`Unsupported protocol_version: ${request.protocol_version}`)
  }
  if (request.repo_root !== policy.repo_root) {
    throw new Error('Request repo_root mismatch')
  }
  if (request.mode !== policy.mode) {
    throw new Error('Request mode mismatch')
  }
  if (!Array.isArray(request.manifest_paths) || request.manifest_paths.length === 0) {
    throw new Error('manifest_paths must be a non-empty array')
  }
  if (!Array.isArray(request.actions) || request.actions.length === 0) {
    throw new Error('actions must be a non-empty array')
  }

  const manifestSet = new Set()
  for (const manifestPath of request.manifest_paths) {
    if (typeof manifestPath !== 'string') {
      throw new Error('manifest_paths must contain strings')
    }
    assertRelativeRepoPath(manifestPath, policy.repo_root)
    if (!policy.allowed_files.includes(manifestPath)) {
      throw new Error(`manifest_path not allowed: ${manifestPath}`)
    }
    if (isDeniedPath(manifestPath, policy) && manifestPath !== '_SYSTEM/yuri-history-archive/session_boot_packet_2026-05-03.md') {
      throw new Error(`manifest_path denied: ${manifestPath}`)
    }
    manifestSet.add(manifestPath)
  }

  if (manifestSet.size !== request.manifest_paths.length) {
    throw new Error('manifest_paths must be unique')
  }
}

function processActions(request, policy, context) {
  for (const action of request.actions) {
    const type = normalizeActionType(action?.type)
    const logBase = {
      timestamp: new Date().toISOString(),
      requested_action: action?.type ?? null,
      normalized_action: type,
    }

    if (typeof action !== 'object' || action === null || Array.isArray(action)) {
      denyAction(context, { ...logBase, decision: 'deny', reason: 'Action must be an object' })
      continue
    }
    if (DENIED_ACTIONS.has(type)) {
      denyAction(context, { ...logBase, decision: 'deny', reason: `Denied action type: ${type}` })
      continue
    }
    if (!ALLOWED_ACTIONS.has(type)) {
      denyAction(context, { ...logBase, decision: 'deny', reason: `Unrecognized action type: ${type}` })
      continue
    }

    if (type === 'READ_MANIFEST_FILE') {
      handleReadManifestFile(request, policy, context, action, logBase)
      continue
    }
    if (type === 'SEARCH_MANIFEST_PATHS') {
      handleSearchManifestPaths(request, policy, context, action, logBase)
      continue
    }
    if (type === 'RUN_ALLOWED_CHECK') {
      handleRunAllowedCheck(request, policy, context, action, logBase)
      continue
    }
    if (type === 'SUMMARIZE_EVIDENCE') {
      allowAction(context, {
        ...logBase,
        decision: 'allow',
        reason: 'Summarized collected evidence',
      })
      context.evidence.summaries.push(buildEvidenceSummary(context, policy))
      continue
    }
    if (type === 'FINAL_REPORT') {
      allowAction(context, {
        ...logBase,
        decision: 'allow',
        reason: 'Final report requested',
      })
    }
  }
}

function handleReadManifestFile(request, policy, context, action, logBase) {
  if ('command' in (action.args ?? {})) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Raw command strings forbidden' })
    return
  }

  const filePath = action.path
  const startLine = action.start_line
  const endLine = action.end_line
  const auth = authorizeManifestPath(filePath, request, policy)
  if (!auth.ok) {
    denyAction(context, { ...logBase, decision: 'deny', reason: auth.reason })
    return
  }
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Invalid line window' })
    return
  }
  const windowSize = endLine - startLine + 1
  if (windowSize > policy.caps.read_window_lines) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Read window cap exceeded' })
    return
  }
  if (context.readLinesTotal + windowSize > policy.caps.aggregate_read_lines) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Aggregate read cap exceeded' })
    return
  }

  const absolutePath = path.join(policy.repo_root, filePath)
  const lines = fs.readFileSync(absolutePath, 'utf8').split('\n')
  const totalLines = lines.length
  if (endLine > totalLines) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Line window exceeds file length' })
    return
  }

  const isFullFile = startLine === 1 && endLine === totalLines
  if (isFullFile) {
    const fullAllowed = policy.allow_full_small_file_paths.includes(filePath)
    if (!fullAllowed || totalLines > policy.caps.full_small_file_max_lines) {
      denyAction(context, { ...logBase, decision: 'deny', reason: 'Full file read not allowed for this path' })
      return
    }
  }

  const snippet = []
  for (let index = startLine; index <= endLine; index += 1) {
    snippet.push({ line: index, text: lines[index - 1] })
  }

  context.readLinesTotal += windowSize
  context.filesRead.add(filePath)
  context.evidence.reads.push({
    path: filePath,
    start_line: startLine,
    end_line: endLine,
    total_lines: totalLines,
    full_file: isFullFile,
    reason: typeof action.reason === 'string' ? action.reason : null,
    lines: snippet,
  })
  allowAction(context, { ...logBase, decision: 'allow', reason: `Read ${windowSize} lines from ${filePath}` })
}

function handleSearchManifestPaths(request, policy, context, action, logBase) {
  if ('command' in (action.args ?? {})) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Raw command strings forbidden' })
    return
  }
  if (typeof action.query !== 'string' || action.query.length === 0) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Search query required' })
    return
  }
  if (!Array.isArray(action.paths) || action.paths.length === 0) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Search paths required' })
    return
  }

  const contextLines = action.context_lines ?? 0
  if (!Number.isInteger(contextLines) || contextLines < 0) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Invalid context_lines' })
    return
  }
  const effectiveContext = Math.min(contextLines, policy.caps.search_context_lines_max)
  const caseSensitive = action.case_sensitive !== false
  const maxMatches = policy.caps.search_matches_per_action
  const hits = []
  let truncated = false

  for (const searchPath of action.paths) {
    const auth = authorizeManifestPath(searchPath, request, policy)
    if (!auth.ok) {
      denyAction(context, { ...logBase, decision: 'deny', reason: auth.reason })
      return
    }

    const absolutePath = path.join(policy.repo_root, searchPath)
    const lines = fs.readFileSync(absolutePath, 'utf8').split('\n')
    const needle = caseSensitive ? action.query : action.query.toLowerCase()
    for (let index = 0; index < lines.length; index += 1) {
      const hay = caseSensitive ? lines[index] : lines[index].toLowerCase()
      if (!hay.includes(needle)) {
        continue
      }
      if (hits.length >= maxMatches) {
        truncated = true
        break
      }
      const before = []
      const after = []
      for (let offset = effectiveContext; offset >= 1; offset -= 1) {
        const lineIndex = index - offset
        if (lineIndex >= 0) {
          before.push({ line: lineIndex + 1, text: lines[lineIndex] })
        }
      }
      for (let offset = 1; offset <= effectiveContext; offset += 1) {
        const lineIndex = index + offset
        if (lineIndex < lines.length) {
          after.push({ line: lineIndex + 1, text: lines[lineIndex] })
        }
      }
      hits.push({
        path: searchPath,
        line: index + 1,
        text: lines[index],
        before,
        after,
      })
    }
    if (truncated) {
      break
    }
  }

  if (truncated) {
    context.evidence.truncation_flags.push({
      type: 'SEARCH_MANIFEST_PATHS',
      reason: 'search_matches_per_action cap reached',
    })
  }
  context.evidence.searches.push({
    query: action.query,
    case_sensitive: caseSensitive,
    context_lines_requested: contextLines,
    context_lines_applied: effectiveContext,
    paths: [...action.paths],
    hits,
    truncated,
  })
  allowAction(context, { ...logBase, decision: 'allow', reason: `Search hits collected: ${hits.length}${truncated ? '+' : ''}` })
}

function handleRunAllowedCheck(request, policy, context, action, logBase) {
  if (typeof action.check_id !== 'string' || !policy.allowed_checks.includes(action.check_id)) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'check_id not in allowed_checks' })
    return
  }
  if (action.args && typeof action.args === 'object' && 'command' in action.args) {
    denyAction(context, { ...logBase, decision: 'deny', reason: 'Raw command strings forbidden' })
    return
  }

  const result = runMappedCheck({
    request,
    policy,
    checkId: action.check_id,
    pathValue: action.path,
    args: action.args ?? {},
  })
  context.evidence.checks.push(result.record)
  context.commandsRun.push(action.check_id)
  allowAction(context, { ...logBase, decision: 'allow', reason: `Check passed: ${action.check_id}` })
}

function runMappedCheck({ request, policy, checkId, pathValue, args }) {
  if (checkId === 'PWD') {
    const output = runCommand(['pwd']).stdout
    return { record: { check_id: checkId, output } }
  }
  if (checkId === 'GIT_BRANCH_SHOW_CURRENT') {
    const output = runCommand(['git', 'branch', '--show-current']).stdout
    return { record: { check_id: checkId, output } }
  }
  if (checkId === 'GIT_REV_PARSE_SHORT_HEAD') {
    const output = runCommand(['git', 'rev-parse', '--short', 'HEAD']).stdout
    return { record: { check_id: checkId, output } }
  }
  if (checkId === 'GIT_DIFF_CACHED_NAME_ONLY') {
    const output = runCommand(['git', 'diff', '--cached', '--name-only']).stdout
    return { record: { check_id: checkId, output: linesOf(output) } }
  }
  if (checkId === 'GIT_STATUS_SCOPED_MANIFEST_AND_DB_FILES') {
    const scope = uniquePaths([...IMPLEMENTATION_FILES, ...policy.allowed_files, ...DB_SCOPE_FILES])
    const output = runCommand(['git', 'status', '--short', '--', ...scope]).stdout
    return { record: { check_id: checkId, scope, output: linesOf(output) } }
  }
  if (checkId === 'NODE_CHECK_SCRIPT') {
    const auth = authorizeManifestPath(pathValue, request, policy)
    if (!auth.ok || !String(pathValue).endsWith('.mjs')) {
      throw new Error('NODE_CHECK_SCRIPT requires an allowed manifest .mjs path')
    }
    runCommand(['node', '--check', pathValue])
    return { record: { check_id: checkId, path: pathValue, output: 'PASS' } }
  }
  if (checkId === 'GREP_Q_MARKER') {
    const auth = authorizeManifestPath(pathValue, request, policy)
    if (!auth.ok) {
      throw new Error(auth.reason)
    }
    if (typeof args.marker !== 'string' || args.marker.length === 0) {
      throw new Error('GREP_Q_MARKER requires args.marker')
    }
    const result = runCommand(['grep', '-q', '--', args.marker, pathValue], true)
    return {
      record: {
        check_id: checkId,
        path: pathValue,
        marker: args.marker,
        output: result.code === 0 ? 'FOUND' : 'NOT_FOUND',
      },
    }
  }
  if (checkId === 'WC_L_FILE') {
    const auth = authorizeManifestPath(pathValue, request, policy)
    if (!auth.ok) {
      throw new Error(auth.reason)
    }
    const output = runCommand(['wc', '-l', pathValue]).stdout
    return { record: { check_id: checkId, path: pathValue, output: output.trim() } }
  }
  throw new Error(`Unhandled check_id: ${checkId}`)
}

function authorizeManifestPath(filePath, request, policy) {
  if (typeof filePath !== 'string') {
    return { ok: false, reason: 'Path must be a string' }
  }
  try {
    assertRelativeRepoPath(filePath, policy.repo_root)
  } catch (error) {
    return { ok: false, reason: error.message }
  }
  if (!request.manifest_paths.includes(filePath)) {
    return { ok: false, reason: `Path not in manifest_paths: ${filePath}` }
  }
  if (!policy.allowed_files.includes(filePath)) {
    return { ok: false, reason: `Path not in allowed_files: ${filePath}` }
  }
  if (isDeniedPath(filePath, policy) && filePath !== '_SYSTEM/yuri-history-archive/session_boot_packet_2026-05-03.md') {
    return { ok: false, reason: `Denied path: ${filePath}` }
  }
  const absolutePath = path.join(policy.repo_root, filePath)
  if (!fs.existsSync(absolutePath)) {
    return { ok: false, reason: `Missing file: ${filePath}` }
  }
  return { ok: true }
}

function assertRelativeRepoPath(filePath, repoRoot) {
  if (path.isAbsolute(filePath)) {
    throw new Error('Absolute paths forbidden')
  }
  const normalized = path.normalize(filePath)
  if (normalized.startsWith('..') || normalized.includes(`..${path.sep}`)) {
    throw new Error('Path escapes repo root')
  }
  const resolved = path.resolve(repoRoot, normalized)
  const relative = path.relative(repoRoot, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes repo root')
  }
}

function isDeniedPath(filePath, policy) {
  if (filePath !== '_SYSTEM/yuri-history-archive/session_boot_packet_2026-05-03.md' && filePath.startsWith('_SYSTEM/') && filePath.endsWith('.md')) {
    return true
  }
  const lowered = filePath.toLowerCase()
  if (policy.denied_path_markers.some((marker) => lowered.includes(String(marker).toLowerCase()))) {
    return true
  }
  const ext = path.extname(filePath).toLowerCase()
  if (policy.denied_extensions.includes(ext)) {
    return true
  }
  return policy.denied_globs.some((pattern) => globToRegex(pattern).test(filePath))
}

function globToRegex(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  const regex = escaped
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*')
  return new RegExp(`^${regex}$`)
}

function allowAction(context, logEntry) {
  context.actionLogs.push(logEntry)
  context.allowedActionTypes.push(logEntry.normalized_action)
}

function denyAction(context, logEntry) {
  context.actionLogs.push(logEntry)
  context.verification.denied_action_count += 1
  context.deniedReasons.push(logEntry.reason)
}

function buildEvidenceSummary(context, policy) {
  return {
    reads: context.evidence.reads.length,
    searches: context.evidence.searches.length,
    checks: context.evidence.checks.length,
    denied_actions: context.verification.denied_action_count,
    read_lines_total: context.readLinesTotal,
    read_cap: policy.caps.aggregate_read_lines,
  }
}

function generateFinalReport(request, policy, context) {
  const validations = [
    `cwd=${process.cwd()}`,
    `branch=${context.verification.preflight.branch}`,
    `head=${context.verification.preflight.head}`,
    `staged_files=${context.verification.preflight.staged_files.length}`,
    'backend/data/nudimmud.db clean',
    'readonly executor',
  ]

  const resultLabel = context.verification.denied_action_count > 0 ? 'PASS_WITH_DENIALS' : 'PASS'
  const localTruthSummary = [
    `policy=${policy.version}`,
    `mode=${policy.mode}`,
    `reads=${context.evidence.reads.length}`,
    `searches=${context.evidence.searches.length}`,
    `checks=${context.evidence.checks.length}`,
  ]
  const risksOrGaps = uniqueValues(context.deniedReasons).slice(0, policy.caps.summary_items)
  if (risksOrGaps.length === 0) {
    risksOrGaps.push('No additional local risks surfaced inside readonly scope.')
  }

  return reportLines({
    result_label: resultLabel,
    local_truth_summary: localTruthSummary,
    manifest_paths: request.manifest_paths,
    actions_requested: request.actions.map((action) => normalizeActionType(action?.type)),
    actions_allowed: context.allowedActionTypes,
    actions_denied: context.actionLogs.filter((entry) => entry.decision === 'deny').map((entry) => `${entry.normalized_action}:${entry.reason}`),
    files_read: [...context.filesRead],
    commands_run: uniqueValues(context.commandsRun),
    validations,
    model_claims_confirmed: [],
    model_claims_downgraded: [context.verification.model_claim_downgrade_placeholder],
    risks_or_gaps: risksOrGaps,
    artifact_paths: Object.values(context.artifactPaths),
    non_claims: [
      'No model call',
      'No DeepSeek transport',
      'No offload',
      'No MCP',
      'No repo writes',
      'No staging',
      'No commit',
    ],
    next_gate: 'GPT-5.5 review before any mutation lane.',
    gpt_5_5_review_required: true,
  })
}

function generateFailureReport(request, policy, context, failureMessage) {
  return reportLines({
    result_label: 'FAIL_CLOSED',
    local_truth_summary: [
      failureMessage,
      `policy=${policy?.version ?? 'missing'}`,
      `cwd=${process.cwd()}`,
    ],
    manifest_paths: request?.manifest_paths ?? [],
    actions_requested: Array.isArray(request?.actions) ? request.actions.map((action) => normalizeActionType(action?.type)) : [],
    actions_allowed: context.allowedActionTypes,
    actions_denied: context.actionLogs.filter((entry) => entry.decision === 'deny').map((entry) => `${entry.normalized_action}:${entry.reason}`),
    files_read: [...context.filesRead],
    commands_run: uniqueValues(context.commandsRun),
    validations: context.verification.hard_stop_reasons.length > 0 ? context.verification.hard_stop_reasons : [failureMessage],
    model_claims_confirmed: [],
    model_claims_downgraded: [context.verification.model_claim_downgrade_placeholder],
    risks_or_gaps: [failureMessage],
    artifact_paths: Object.values(context.artifactPaths),
    non_claims: [
      'No model call',
      'No DeepSeek transport',
      'No offload',
      'No MCP',
      'No repo writes',
      'No staging',
      'No commit',
    ],
    next_gate: 'Fix hard-stop condition, rerun readonly executor, require GPT-5.5 review.',
    gpt_5_5_review_required: true,
  })
}

function reportLines(fields) {
  const lines = []
  for (const field of REQUIRED_REPORT_FIELDS) {
    lines.push(`${field}: ${formatReportValue(fields[field])}`)
  }
  return `${lines.join('\n')}\n`
}

function formatReportValue(value) {
  if (Array.isArray(value)) {
    return value.length === 0 ? '[]' : value.join(' | ')
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return String(value ?? '')
}

function buildMeta({ request, policy, context, artifactRoot, end }) {
  return {
    run_id: context.runId,
    executor_version: context.executorVersion,
    cwd: process.cwd(),
    branch: context.verification.preflight.branch ?? null,
    head: context.verification.preflight.head ?? null,
    manifest_hash: hashValue(JSON.stringify(request?.manifest_paths ?? [])),
    token_cap_metadata: {
      read_window_lines: policy?.caps?.read_window_lines ?? null,
      aggregate_read_lines: policy?.caps?.aggregate_read_lines ?? null,
      search_matches_per_action: policy?.caps?.search_matches_per_action ?? null,
    },
    start_timestamp: context.start,
    end_timestamp: end,
    artifact_root: artifactRoot,
    artifact_paths: context.artifactPaths,
  }
}

function runSelftest({ artifactRoot, policyRelPath }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nudimmud-guarded-executor-selftest-'))
  const scopedStatusBefore = scopedStatus()
  const markers = []
  const policy = loadPolicy(path.resolve(policyRelPath))

  const baseRequest = {
    protocol_version: PROTOCOL_VERSION,
    request_id: 'selftest-base',
    repo_root: '/Users/marcelspatz/NUDIMMUD',
    mode: policy.mode,
    manifest_paths: [
      'package.json',
      '.claude/rules/nudimmud_operating_dna.md',
      '.claude/config/models.json',
      'Scripts/ai',
      'Scripts/offload-runner.mjs',
    ],
    actions: [
      { type: 'READ_MANIFEST_FILE', path: 'package.json', start_line: 1, end_line: 30, reason: 'small file full read test' },
      { type: 'SEARCH_MANIFEST_PATHS', query: '"name"', paths: ['package.json'], case_sensitive: true, context_lines: 0 },
      { type: 'RUN_ALLOWED_CHECK', check_id: 'PWD' },
      { type: 'RUN_ALLOWED_CHECK', check_id: 'GIT_BRANCH_SHOW_CURRENT' },
      { type: 'RUN_ALLOWED_CHECK', check_id: 'GIT_REV_PARSE_SHORT_HEAD' },
      { type: 'RUN_ALLOWED_CHECK', check_id: 'GIT_DIFF_CACHED_NAME_ONLY' },
      { type: 'RUN_ALLOWED_CHECK', check_id: 'GIT_STATUS_SCOPED_MANIFEST_AND_DB_FILES' },
      { type: 'RUN_ALLOWED_CHECK', check_id: 'GREP_Q_MARKER', path: '.claude/rules/nudimmud_operating_dna.md', args: { marker: 'Caveman Protocol' } },
      { type: 'RUN_ALLOWED_CHECK', check_id: 'WC_L_FILE', path: 'package.json' },
      { type: 'RUN_ALLOWED_CHECK', check_id: 'NODE_CHECK_SCRIPT', path: 'Scripts/offload-runner.mjs' },
      { type: 'SUMMARIZE_EVIDENCE' },
      { type: 'FINAL_REPORT' },
    ],
  }
  const baseOutcome = executeRequest({
    rawRequest: JSON.stringify(baseRequest, null, 2),
    artifactRoot,
    policyRelPath,
    preflightOptions: { allowStagedFiles: true },
  })
  const baseRun = loadRunArtifacts(baseOutcome.runDir)
  if (!baseRun.verification.hard_stop) {
    markers.push('PREFLIGHT_PASS')
  }
  if (hasRequiredArtifacts(baseOutcome.runDir)) {
    markers.push('ARTIFACT_PACK_PASS')
  }
  if (finalReportHasSchema(baseRun.finalReport)) {
    markers.push('FINAL_REPORT_SCHEMA_PASS')
  }
  if (
    baseRun.verification.model_claim_downgrade_placeholder &&
    fs.readFileSync(path.join(baseOutcome.runDir, 'request.md'), 'utf8') !== fs.readFileSync(path.join(baseOutcome.runDir, 'model_output.md'), 'utf8')
  ) {
    markers.push('MODEL_TRUTH_SEPARATION_PASS')
  }

  const manifestOnlyOutcome = executeRequest({
    rawRequest: JSON.stringify({
      ...baseRequest,
      request_id: 'selftest-manifest-only',
      manifest_paths: ['package.json'],
      actions: [
        { type: 'READ_MANIFEST_FILE', path: '.claude/config/models.json', start_line: 1, end_line: 1 },
        { type: 'FINAL_REPORT' },
      ],
    }, null, 2),
    artifactRoot,
    policyRelPath,
    preflightOptions: { allowStagedFiles: true },
  })
  const manifestOnlyRun = loadRunArtifacts(manifestOnlyOutcome.runDir)
  if (actionDeniedForReason(manifestOnlyRun.actions, 'Path not in manifest_paths')) {
    markers.push('MANIFEST_ONLY_PASS')
  }

  const readCapOutcome = executeRequest({
    rawRequest: JSON.stringify({
      ...baseRequest,
      request_id: 'selftest-read-cap',
      actions: [
        { type: 'READ_MANIFEST_FILE', path: 'Scripts/ai', start_line: 1, end_line: 81 },
        { type: 'FINAL_REPORT' },
      ],
    }, null, 2),
    artifactRoot,
    policyRelPath,
    preflightOptions: { allowStagedFiles: true },
  })
  const readCapRun = loadRunArtifacts(readCapOutcome.runDir)
  if (actionDeniedForReason(readCapRun.actions, 'Read window cap exceeded')) {
    markers.push('READ_WINDOW_CAP_PASS')
  }

  const searchCapOutcome = executeRequest({
    rawRequest: JSON.stringify({
      ...baseRequest,
      request_id: 'selftest-search-cap',
      actions: [
        { type: 'SEARCH_MANIFEST_PATHS', query: ' ', paths: ['Scripts/ai'], case_sensitive: true, context_lines: 5 },
        { type: 'FINAL_REPORT' },
      ],
    }, null, 2),
    artifactRoot,
    policyRelPath,
    preflightOptions: { allowStagedFiles: true },
  })
  const searchCapRun = loadRunArtifacts(searchCapOutcome.runDir)
  const searchRecord = searchCapRun.evidence.searches[0]
  if (
    searchRecord &&
    searchRecord.truncated === true &&
    searchRecord.hits.length <= 12 &&
    searchRecord.context_lines_applied === 1
  ) {
    markers.push('SEARCH_SCOPE_CAP_PASS')
  }

  const enumOutcome = executeRequest({
    rawRequest: JSON.stringify({
      ...baseRequest,
      request_id: 'selftest-enum',
      actions: [
        { type: 'RUN_ALLOWED_CHECK', check_id: 'UNLISTED' },
        { type: 'FINAL_REPORT' },
      ],
    }, null, 2),
    artifactRoot,
    policyRelPath,
    preflightOptions: { allowStagedFiles: true },
  })
  const enumRun = loadRunArtifacts(enumOutcome.runDir)
  if (actionDeniedForReason(enumRun.actions, 'check_id not in allowed_checks')) {
    markers.push('CHECK_ENUM_ONLY_PASS')
  }

  const secretDbOutcome = executeRequest({
    rawRequest: JSON.stringify({
      ...baseRequest,
      request_id: 'selftest-secret-db',
      actions: [
        { type: 'READ_SECRET', path: '.env' },
        { type: 'READ_DB', path: 'backend/data/nudimmud.db' },
        { type: 'FINAL_REPORT' },
      ],
    }, null, 2),
    artifactRoot,
    policyRelPath,
    preflightOptions: { allowStagedFiles: true },
  })
  const secretDbRun = loadRunArtifacts(secretDbOutcome.runDir)
  if (
    actionDeniedForReason(secretDbRun.actions, 'Denied action type: READ_SECRET') &&
    actionDeniedForReason(secretDbRun.actions, 'Denied action type: READ_DB')
  ) {
    markers.push('SECRET_DB_DENIAL_PASS')
  }

  const rawCommandOutcome = executeRequest({
    rawRequest: JSON.stringify({
      ...baseRequest,
      request_id: 'selftest-raw-command',
      actions: [
        { type: 'RUN_ALLOWED_CHECK', check_id: 'PWD', args: { command: 'pwd' } },
        { type: 'FINAL_REPORT' },
      ],
    }, null, 2),
    artifactRoot,
    policyRelPath,
    preflightOptions: { allowStagedFiles: true },
  })
  const rawCommandRun = loadRunArtifacts(rawCommandOutcome.runDir)
  if (actionDeniedForReason(rawCommandRun.actions, 'Raw command strings forbidden')) {
    markers.push('NO_RAW_COMMAND_PASS')
  }

  const scopedStatusAfter = scopedStatus()
  if (scopedStatusBefore === scopedStatusAfter) {
    markers.push('NO_REPO_MUTATION_PASS')
  }

  const requiredMarkers = [
    'PREFLIGHT_PASS',
    'MANIFEST_ONLY_PASS',
    'READ_WINDOW_CAP_PASS',
    'SEARCH_SCOPE_CAP_PASS',
    'CHECK_ENUM_ONLY_PASS',
    'SECRET_DB_DENIAL_PASS',
    'NO_RAW_COMMAND_PASS',
    'MODEL_TRUTH_SEPARATION_PASS',
    'ARTIFACT_PACK_PASS',
    'FINAL_REPORT_SCHEMA_PASS',
    'NO_REPO_MUTATION_PASS',
  ]
  if (requiredMarkers.every((marker) => markers.includes(marker))) {
    markers.push('YURI_GUARDED_EXECUTOR_SELFTEST_PASS')
  }

  for (const marker of markers) {
    process.stdout.write(`${marker}\n`)
  }

  fs.rmSync(tempRoot, { recursive: true, force: true })
  return markers.includes('YURI_GUARDED_EXECUTOR_SELFTEST_PASS')
}

function scopedStatus() {
  return runCommand([
    'git',
    'status',
    '--short',
    '--',
    ...IMPLEMENTATION_FILES,
    ...DB_SCOPE_FILES,
  ]).stdout
}

function loadRunArtifacts(runDir) {
  return {
    actions: parseJsonl(path.join(runDir, 'actions.jsonl')),
    evidence: parseStrictJson(fs.readFileSync(path.join(runDir, 'evidence.json'), 'utf8'), 'Malformed evidence.json'),
    verification: parseStrictJson(fs.readFileSync(path.join(runDir, 'verification.json'), 'utf8'), 'Malformed verification.json'),
    finalReport: fs.readFileSync(path.join(runDir, 'final_report.md'), 'utf8'),
  }
}

function hasRequiredArtifacts(runDir) {
  return [
    'request.md',
    'model_output.md',
    'actions.jsonl',
    'evidence.json',
    'verification.json',
    'final_report.md',
    'meta.json',
  ].every((fileName) => fs.existsSync(path.join(runDir, fileName)))
}

function finalReportHasSchema(content) {
  return REQUIRED_REPORT_FIELDS.every((field) => content.includes(`${field}:`))
}

function actionDeniedForReason(actions, reasonFragment) {
  return actions.some((entry) => entry.decision === 'deny' && String(entry.reason).includes(reasonFragment))
}

function parseJsonl(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').trim()
  if (!text) {
    return []
  }
  return text.split('\n').map((line) => parseStrictJson(line, `Malformed JSONL line in ${filePath}`))
}

function runCommand(argv, allowFailure = false) {
  const [command, ...args] = argv
  try {
    const stdout = execFileSync(command, args, {
      cwd: '/Users/marcelspatz/NUDIMMUD',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { stdout: capText(stdout.trimEnd()), code: 0 }
  } catch (error) {
    if (allowFailure) {
      return {
        stdout: capText(String(error.stdout ?? '').trimEnd()),
        code: Number.isInteger(error.status) ? error.status : 1,
      }
    }
    const stderr = capText(String(error.stderr ?? '').trim())
    throw new Error(stderr || `Command failed: ${argv.join(' ')}`)
  }
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8')
}

function writeJson(filePath, value, jsonl = false) {
  if (jsonl) {
    const text = value.map((entry) => JSON.stringify(entry)).join('\n')
    fs.writeFileSync(filePath, text.length > 0 ? `${text}\n` : '', 'utf8')
    return
  }
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function normalizeActionType(type) {
  return typeof type === 'string' ? type.trim().toUpperCase() : ''
}

function linesOf(text) {
  return text.trim() === '' ? [] : text.trim().split('\n')
}

function uniquePaths(values) {
  return [...new Set(values)]
}

function uniqueValues(values) {
  return [...new Set(values)]
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)
}

function capText(text) {
  if (text.length <= 400) {
    return text
  }
  return `${text.slice(0, 400)}...[truncated]`
}

function safeBlock(text) {
  return text.replace(/```/g, '``` ')
}

function timestampId() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function executeStructuredPlan({ planPath, artifactRoot, execute }) {
  const plan = readStructuredJsonFile(planPath)
  validateStructuredPlan(plan)
  if (hasTier1Step(plan) || plan.tier_required === 'tier1_blocked') {
    throw new Error('tier1 blocked in X1')
  }

  const headBefore = structuredGitShortHead()
  const summary = {
    plan_id: plan.id,
    plan_version: plan.plan_version,
    mode: execute ? 'execute' : 'dry_run',
    validated: true,
    executed: execute,
    readonly: true,
    blocked: false,
    head_before: headBefore,
    head_after: headBefore,
    artifact_root: artifactRoot,
    plan_path: path.resolve(planPath),
    command_count: plan.steps.length,
    step_results: [],
    files_changed: [],
  }

  if (!execute) {
    summary.step_results = plan.steps.map((step) => ({
      step_id: step.step_id,
      action: step.action,
      tier: step.tier,
      target: step.target,
      status: 'validated',
    }))
    return summary
  }

  for (const step of plan.steps) {
    const result = runStructuredStep(step)
    summary.step_results.push(result)
  }

  summary.head_after = structuredGitShortHead()
  return summary
}

function runStructuredStep(step) {
  if (step.action === 'read_file') {
    return {
      step_id: step.step_id,
      action: step.action,
      tier: step.tier,
      target: step.target,
      status: 'executed',
      output: readStructuredFile(step.target, step.params.start_line, step.params.end_line),
    }
  }
  if (step.action === 'list_directory') {
    return {
      step_id: step.step_id,
      action: step.action,
      tier: step.tier,
      target: step.target,
      status: 'executed',
      output: listStructuredDirectory(step.target, step.params.max_entries),
    }
  }
  if (step.action === 'file_diff') {
    return {
      step_id: step.step_id,
      action: step.action,
      tier: step.tier,
      target: step.target,
      status: 'executed',
      output: diffStructuredFiles(step.target, step.params.other),
    }
  }
  if (step.action === 'git_log') {
    return {
      step_id: step.step_id,
      action: step.action,
      tier: step.tier,
      target: step.target,
      status: 'executed',
      output: gitLogStructured(step.target, step.params.max_count),
    }
  }
  if (step.action === 'status_check') {
    return {
      step_id: step.step_id,
      action: step.action,
      tier: step.tier,
      target: step.target,
      status: 'executed',
      output: statusCheckStructured(step.target),
    }
  }
  if (step.action === 'run_command') {
    return {
      step_id: step.step_id,
      action: step.action,
      tier: step.tier,
      target: step.target,
      command: step.params.command,
      status: 'executed',
      output: runStructuredCommand(step.params.command, step.target, step.params),
    }
  }
  throw new Error(`Unhandled structured action: ${step.action}`)
}

function validateStructuredPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('action plan must be an object')
  }
  const required = ['plan_version', 'id', 'intent', 'tier_required', 'steps']
  for (const key of required) {
    if (!(key in plan)) {
      throw new Error(`action plan missing field: ${key}`)
    }
  }
  if (plan.plan_version !== STRUCTURED_PLAN_VERSION) {
    throw new Error(`unsupported plan_version: ${plan.plan_version}`)
  }
  if (!['tier0_readonly', 'tier1_blocked'].includes(plan.tier_required)) {
    throw new Error('invalid tier_required')
  }
  validateStructuredIntent(plan.intent)
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error('steps must be a non-empty array')
  }

  const seen = new Set()
  for (const step of plan.steps) {
    validateStructuredStep(step)
    if (seen.has(step.step_id)) {
      throw new Error(`duplicate step_id: ${step.step_id}`)
    }
    seen.add(step.step_id)
  }
}

function validateStructuredIntent(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) {
    throw new Error('intent must be an object')
  }
  const required = ['id', 'intent_version', 'rough_idea', 'normalized_goal', 'execution_mode', 'tier_required', 'risk_level', 'mutation_policy', 'artifact_policy', 'notes', 'keywords']
  for (const key of required) {
    if (!(key in intent)) {
      throw new Error(`intent missing field: ${key}`)
    }
  }
  if (!['dry_run', 'execute'].includes(intent.execution_mode)) {
    throw new Error('invalid execution_mode')
  }
  if (!['tier0_readonly', 'tier1_blocked'].includes(intent.tier_required)) {
    throw new Error('invalid intent tier_required')
  }
  if (!['low', 'medium', 'high'].includes(intent.risk_level)) {
    throw new Error('invalid risk_level')
  }
  if (!intent.mutation_policy || intent.mutation_policy.default_mutation !== false || intent.mutation_policy.tier1_blocked !== true || intent.mutation_policy.repo_writes_allowed !== false || intent.mutation_policy.source_writes_allowed !== false) {
    throw new Error('invalid mutation_policy')
  }
  if (!intent.artifact_policy || intent.artifact_policy.keep_out_of_repo !== true || intent.artifact_policy.write_git_tracked_source !== false || typeof intent.artifact_policy.artifact_root !== 'string' || intent.artifact_policy.artifact_root.length === 0) {
    throw new Error('invalid artifact_policy')
  }
  if (!Array.isArray(intent.notes) || intent.notes.some((item) => typeof item !== 'string')) {
    throw new Error('invalid notes')
  }
  if (!Array.isArray(intent.keywords) || intent.keywords.some((item) => typeof item !== 'string')) {
    throw new Error('invalid keywords')
  }
}

function validateStructuredStep(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    throw new Error('step must be an object')
  }
  if (typeof step.step_id !== 'string' || step.step_id.length === 0) {
    throw new Error('step_id must be a string')
  }
  if (typeof step.action !== 'string') {
    throw new Error('action must be a string')
  }
  if (typeof step.target !== 'string') {
    throw new Error('target must be a string')
  }
  if (!step.params || typeof step.params !== 'object' || Array.isArray(step.params)) {
    throw new Error('params must be an object')
  }
  if (!Number.isInteger(step.tier) || (step.tier !== 0 && step.tier !== 1)) {
    throw new Error('tier must be 0 or 1')
  }
  if (step.tier === 1) {
    throw new Error('tier1 blocked in X1')
  }

  if (step.action === 'read_file') {
    assertStructuredPath(step.target)
    assertLineWindow(step.params.start_line, step.params.end_line)
    return
  }
  if (step.action === 'list_directory') {
    assertStructuredPath(step.target)
    assertOptionalPositiveInteger(step.params.max_entries, 'max_entries')
    return
  }
  if (step.action === 'file_diff') {
    assertStructuredPath(step.target)
    assertStructuredPath(step.params.other)
    return
  }
  if (step.action === 'git_log') {
    assertStructuredPath(step.target)
    assertOptionalPositiveInteger(step.params.max_count, 'max_count')
    return
  }
  if (step.action === 'status_check') {
    assertStructuredPath(step.target)
    return
  }
  if (step.action === 'run_command') {
    validateStructuredRunCommand(step)
    return
  }

  throw new Error(`unsupported action: ${step.action}`)
}

function validateStructuredRunCommand(step) {
  const command = step.params.command
  if (!STRUCTURED_RUN_COMMANDS.has(command)) {
    throw new Error('forbidden command')
  }

  if (command === 'pwd' || command === 'git_branch_show_current' || command === 'git_rev_parse_short_head' || command === 'git_diff_cached_name_only') {
    return
  }

  assertStructuredPath(step.target)
  if (command === 'grep_file') {
    if (typeof step.params.pattern !== 'string' || step.params.pattern.length === 0) {
      throw new Error('grep_file requires pattern')
    }
  }
}

function runStructuredCommand(command, target, params) {
  if (command === 'pwd') {
    return capStructuredLines(runStructuredExecFile('pwd', []).stdout)
  }
  if (command === 'git_branch_show_current') {
    return capStructuredLines(runStructuredExecFile('git', ['branch', '--show-current']).stdout)
  }
  if (command === 'git_rev_parse_short_head') {
    return capStructuredLines(runStructuredExecFile('git', ['rev-parse', '--short', 'HEAD']).stdout)
  }
  if (command === 'git_diff_cached_name_only') {
    return capStructuredLines(runStructuredExecFile('git', ['diff', '--cached', '--name-only']).stdout)
  }
  if (command === 'git_status_scoped') {
    return capStructuredLines(runStructuredExecFile('git', ['status', '--short', '--', target]).stdout)
  }
  if (command === 'ls_path') {
    return capStructuredLines(runStructuredExecFile('ls', ['-1A', target]).stdout)
  }
  if (command === 'wc_l_file') {
    return capStructuredLines(runStructuredExecFile('wc', ['-l', target]).stdout)
  }
  if (command === 'head_file') {
    const lines = assertOutputLimit(params.lines)
    return capStructuredLines(runStructuredExecFile('head', ['-n', String(lines), target]).stdout)
  }
  if (command === 'tail_file') {
    const lines = assertOutputLimit(params.lines)
    return capStructuredLines(runStructuredExecFile('tail', ['-n', String(lines), target]).stdout)
  }
  if (command === 'grep_file') {
    const args = ['-nF', '--', params.pattern, target]
    const result = runStructuredExecFile('grep', args, true)
    if (result.code === 1) {
      return []
    }
    return capStructuredLines(result.stdout)
  }

  throw new Error(`unsupported command: ${command}`)
}

function readStructuredFile(filePath, startLine, endLine) {
  assertStructuredPath(filePath)
  const absolutePath = path.resolve(process.cwd(), filePath)
  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Missing file: ${filePath}`)
  }
  const lines = fs.readFileSync(absolutePath, 'utf8').split('\n')
  assertLineWindow(startLine, endLine)
  if (endLine > lines.length) {
    throw new Error('line window exceeds file length')
  }
  return {
    path: filePath,
    start_line: startLine,
    end_line: endLine,
    line_count: lines.length,
    truncated: false,
    lines: lines.slice(startLine - 1, endLine).map((line, index) => ({
      line: startLine + index,
      text: line,
    })),
  }
}

function listStructuredDirectory(dirPath, maxEntries) {
  assertStructuredPath(dirPath)
  const absolutePath = path.resolve(process.cwd(), dirPath)
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isDirectory()) {
    throw new Error(`Missing directory: ${dirPath}`)
  }
  const limit = assertOutputLimit(maxEntries)
  const entries = fs.readdirSync(absolutePath).sort()
  return {
    path: dirPath,
    entry_count: entries.length,
    truncated: entries.length > limit,
    entries: entries.slice(0, limit),
  }
}

function diffStructuredFiles(leftPath, rightPath) {
  assertStructuredPath(leftPath)
  assertStructuredPath(rightPath)
  const result = runStructuredExecFile('git', ['diff', '--no-index', '--', leftPath, rightPath], true)
  return {
    left: leftPath,
    right: rightPath,
    exit_code: result.code,
    truncated: false,
    lines: capStructuredLines(result.stdout),
  }
}

function gitLogStructured(targetPath, maxCount) {
  assertStructuredPath(targetPath)
  const limit = assertOutputLimit(maxCount)
  const result = runStructuredExecFile('git', ['log', '--oneline', '--max-count', String(limit), '--', targetPath], true)
  return {
    path: targetPath,
    max_count: limit,
    truncated: false,
    lines: capStructuredLines(result.stdout),
  }
}

function statusCheckStructured(targetPath) {
  assertStructuredPath(targetPath)
  const result = runStructuredExecFile('git', ['status', '--short', '--', targetPath], true)
  return {
    path: targetPath,
    truncated: false,
    lines: capStructuredLines(result.stdout),
  }
}

function runStructuredExecFile(command, args, allowFailure = false) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { stdout: String(stdout).replace(/\r\n/g, '\n').trimEnd(), code: 0 }
  } catch (error) {
    if (allowFailure) {
      return {
        stdout: String(error.stdout ?? '').replace(/\r\n/g, '\n').trimEnd(),
        code: Number.isInteger(error.status) ? error.status : 1,
      }
    }
    const stderr = String(error.stderr ?? '').trim()
    throw new Error(stderr || `Command failed: ${command} ${args.join(' ')}`)
  }
}

function capStructuredLines(text, requestedLimit = STRUCTURED_DEFAULT_MAX_LINES) {
  const limit = assertOutputLimit(requestedLimit)
  const lines = String(text ?? '').trimEnd() === '' ? [] : String(text ?? '').trimEnd().split('\n')
  if (lines.length <= limit) {
    return lines
  }
  return [
    ...lines.slice(0, limit),
    `...[truncated ${lines.length - limit} lines]`,
  ]
}

function assertStructuredPath(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Path must be a non-empty string')
  }
  if (path.isAbsolute(value)) {
    throw new Error('Absolute paths forbidden')
  }
  const normalized = path.normalize(value)
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`) || normalized.includes(`${path.sep}..${path.sep}`) || normalized.endsWith(`${path.sep}..`)) {
    throw new Error('Path escapes repo root')
  }
  const lowered = normalized.toLowerCase()
  for (const marker of STRUCTURED_FORBIDDEN_PATH_MARKERS) {
    if (lowered.includes(marker.toLowerCase())) {
      throw new Error(`Forbidden path marker: ${marker}`)
    }
  }
}

function hasTier1Step(plan) {
  return Array.isArray(plan.steps) && plan.steps.some((step) => step && typeof step === 'object' && step.tier === 1)
}

function assertLineWindow(startLine, endLine) {
  if (!Number.isInteger(startLine) || !Number.isInteger(endLine) || startLine < 1 || endLine < startLine) {
    throw new Error('Invalid line window')
  }
  const width = endLine - startLine + 1
  if (width > STRUCTURED_HARD_MAX_LINES) {
    throw new Error('Line window exceeds hard cap')
  }
}

function assertOptionalPositiveInteger(value, label) {
  if (value === undefined) {
    return STRUCTURED_DEFAULT_MAX_LINES
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`)
  }
  return Math.min(value, STRUCTURED_HARD_MAX_LINES)
}

function assertOutputLimit(value) {
  if (value === undefined) {
    return STRUCTURED_DEFAULT_MAX_LINES
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('Invalid output limit')
  }
  return Math.min(value, STRUCTURED_HARD_MAX_LINES)
}

function readStructuredJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing plan file: ${filePath}`)
  }
  const parsed = parseStrictJson(fs.readFileSync(filePath, 'utf8'), 'Malformed plan JSON')
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Plan must be an object')
  }
  return parsed
}

function structuredGitShortHead() {
  const result = runStructuredExecFile('git', ['rev-parse', '--short', 'HEAD'], true)
  if (result.code !== 0 || !result.stdout) {
    throw new Error('git rev-parse failed')
  }
  return result.stdout.trim()
}

main()
