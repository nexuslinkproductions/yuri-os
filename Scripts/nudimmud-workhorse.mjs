#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const WORKHORSE_VERSION = '0.1.0'
const PLAN_VERSION = 'nudimmud.workhorse.x1'
const INTENT_SCHEMA_PATH = 'Scripts/intent-schema.json'
const ACTION_SCHEMA_PATH = 'Scripts/deepseek-action-schema.json'
const OFFLOAD_RUNNER_PATH = 'Scripts/offload-runner.mjs'
const EXECUTOR_PATH = 'Scripts/yuri-guarded-executor.mjs'
const LIVE_PRO_LANE = 'deepseek-v4-pro'
const LIVE_FLASH_LANE = 'deepseek-v4-flash'
const DEFAULT_ARTIFACT_ROOT = path.join(os.homedir(), '.nudimmud', 'workhorse-runs')
const FALLBACK_ARTIFACT_ROOT = '/private/tmp/nudimmud-workhorse-runs'
const DEFAULT_MAX_LINES = 80
const HARD_MAX_LINES = 200
const REPO_ROOT = process.cwd()
const ALLOWED_ACTIONS = new Set([
  'read_file',
  'list_directory',
  'file_diff',
  'git_log',
  'status_check',
  'run_command',
])
const RUN_COMMANDS = new Set([
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
const FORBIDDEN_PATH_MARKERS = [
  '.git',
  '.env',
  '.npmrc',
  'node_modules',
  'backend/data',
  '.claude/history',
  '.claude/state',
]

main()

function main() {
  try {
    const cli = parseCli(process.argv.slice(2))

    if (cli.help) {
      printHelp()
      return
    }

    const artifactRoot = ensureArtifactRoot(cli.artifactRoot)

    if (cli.selftest) {
      const ok = runSelftest({ artifactRoot })
      process.exitCode = ok ? 0 : 1
      return
    }

    if (cli.command === 'forge') {
      const outcome = forgePipeline({
        idea: cli.idea,
        execute: cli.execute,
        live: cli.live,
        noFlash: cli.noFlash,
        generatePlan: cli.generatePlan,
        artifactRoot,
      })
      process.stdout.write(`${formatSummary(outcome)}\n`)
      process.exitCode = outcome.ok ? 0 : 1
      return
    }

    if (cli.command === 'run') {
      const outcome = runPlanPipeline({
        planPath: cli.planPath,
        execute: cli.execute,
        artifactRoot,
      })
      process.stdout.write(`${formatSummary(outcome)}\n`)
      process.exitCode = outcome.ok ? 0 : 1
      return
    }

    throw new Error('Missing command: forge or run')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

function parseCli(argv) {
  const cli = {
    help: false,
    selftest: false,
    execute: false,
    live: false,
    noFlash: false,
    generatePlan: false,
    artifactRoot: '',
    command: '',
    ideaParts: [],
    planPath: '',
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
    if (arg === '--live') {
      cli.live = true
      continue
    }
    if (arg === '--no-flash') {
      cli.noFlash = true
      continue
    }
    if (arg === '--generate-plan') {
      cli.generatePlan = true
      continue
    }
    if (arg === '--artifact-root') {
      const next = argv[index + 1]
      if (!next) {
        throw new Error('--artifact-root requires a path')
      }
      cli.artifactRoot = next
      index += 1
      continue
    }
    if (arg === 'forge' || arg === 'run') {
      if (cli.command) {
        throw new Error('Only one command is allowed')
      }
      cli.command = arg
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
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`)
    }
    if (cli.command === 'forge') {
      cli.ideaParts.push(arg)
      continue
    }
    if (cli.command === 'run') {
      throw new Error(`Unexpected positional argument for run: ${arg}`)
    }
    cli.ideaParts.push(arg)
  }

  // Default idea trigger: bare "<rough idea>" acts as forge --generate-plan
  if (!cli.command && cli.ideaParts.length > 0) {
    cli.command = 'forge'
    cli.generatePlan = true
  }

  cli.idea = collapseWhitespace(cli.ideaParts.join(' ')).trim()
  if (cli.generatePlan) {
    cli.live = true
  }
  if (cli.noFlash && !cli.live) {
    throw new Error('--no-flash requires --live')
  }
  return cli
}

function printHelp() {
  process.stdout.write(
    [
      'NUDIMMUD Workhorse X1',
      '',
      'Usage:',
      '  node Scripts/nudimmud-workhorse.mjs "<rough idea>"',
      '  node Scripts/nudimmud-workhorse.mjs forge --execute "<rough idea>"',
      '  node Scripts/nudimmud-workhorse.mjs forge --live "<rough idea>"',
      '  node Scripts/nudimmud-workhorse.mjs forge --live --execute "<rough idea>"',
      '  node Scripts/nudimmud-workhorse.mjs forge --live --no-flash "<rough idea>"',
      '  node Scripts/nudimmud-workhorse.mjs forge --generate-plan "<rough idea>"',
      '  node Scripts/nudimmud-workhorse.mjs forge --generate-plan --execute "<rough idea>"',
      '  node Scripts/nudimmud-workhorse.mjs run --plan <path>',
      '  node Scripts/nudimmud-workhorse.mjs run --execute --plan <path>',
      '  node Scripts/nudimmud-workhorse.mjs --selftest',
      '  node Scripts/nudimmud-workhorse.mjs --help',
      '',
      `Default artifact root: ${DEFAULT_ARTIFACT_ROOT}`,
      `Fallback artifact root: ${FALLBACK_ARTIFACT_ROOT}`,
      'X1 tier-1 mutation is schema-visible but blocked.',
    ].join('\n') + '\n'
  )
}

function ensureArtifactRoot(explicitRoot) {
  const roots = explicitRoot ? [explicitRoot] : [DEFAULT_ARTIFACT_ROOT, FALLBACK_ARTIFACT_ROOT]

  for (const root of roots) {
    try {
      fs.mkdirSync(root, { recursive: true })
      fs.accessSync(root, fs.constants.W_OK)
      return path.resolve(root)
    } catch {
      if (explicitRoot) {
        throw new Error(`Artifact root unavailable: ${root}`)
      }
    }
  }

  throw new Error('Artifact root unavailable')
}

function forgePipeline({ idea, execute, live = false, noFlash = false, generatePlan = false, artifactRoot, transport = createDeepseekTransport(), executorRunner = runExecutorPlan }) {
  if (!idea) {
    throw new Error('forge requires a rough idea')
  }

  const run = createRunContext({ artifactRoot, mode: execute ? 'execute' : 'dry_run', source: live ? 'forge-live' : 'forge' })
  const request = buildRequestArtifact({ run, idea, execute, live, noFlash, generatePlan, sourcePath: 'forge' })
  const files = writeCoreArtifacts({ run, request, sourceLabel: live ? 'forge-live' : 'forge' })

  if (!live) {
    const intent = buildIntent({ idea, execute, artifactRoot, run })
    const plan = buildActionPlan({ intent, run })
    validateIntent(intent)
    validateActionPlan(plan)

    writeJson(files.intent, intent)
    writeJson(files.actionPlan, plan)
    const flashReview = buildFlashReview({ intent, plan, execute })
    writeJson(files.flashReview, flashReview)
    writeText(files.executorPrompt, buildExecutorPrompt({ run, intent, plan, flashReview, execute }))

    const executorSummary = executorRunner({
      planPath: files.actionPlan,
      execute,
      artifactRoot,
    })
    if (execute) {
      writeJson(files.executionSummary, executorSummary)
    }

    writeText(files.finalReport, buildFinalReport({
      run,
      intent,
      plan,
      flashReview,
      executorSummary,
      execute,
      live,
      liveSmokeStatus: 'not_run',
      beforeHead: run.beforeHead,
      afterHead: execute ? executorSummary.head_after ?? run.beforeHead : run.beforeHead,
      sourcePath: 'forge',
    }))

    return {
      ok: true,
      mode: execute ? 'EXECUTE' : 'DRY_RUN',
      runDir: run.runDir,
      planId: plan.id,
      finalReport: files.finalReport,
      executionSummary: execute ? files.executionSummary : '',
      marker: execute ? 'WORKHORSE_FORGE_EXECUTE_PASS' : 'WORKHORSE_FORGE_DRY_RUN_PASS',
    }
  }

  const liveOutcome = runLiveForgePipeline({
    idea,
    execute,
    noFlash,
    run,
    request,
    files,
    artifactRoot,
    transport,
    executorRunner,
  })
  return liveOutcome
}

function runPlanPipeline({ planPath, execute, artifactRoot }) {
  if (!planPath) {
    throw new Error('run requires --plan <path>')
  }

  const sourcePlanPath = path.resolve(planPath)
  const sourcePlan = readJsonFile(sourcePlanPath)
  validateActionPlan(sourcePlan)
  validateIntent(sourcePlan.intent)

  const run = createRunContext({ artifactRoot, mode: execute ? 'execute' : 'dry_run', source: 'run' })
  const intent = sourcePlan.intent
  const plan = sourcePlan
  const request = buildRequestArtifact({ run, planPath: sourcePlanPath, execute, live: false, noFlash: false, sourcePath: sourcePlanPath })
  const files = writeCoreArtifacts({ run, request, sourceLabel: 'run' })
  writeJson(files.intent, intent)
  writeJson(files.actionPlan, plan)
  const flashReview = buildFlashReview({ intent, plan, execute })
  writeJson(files.flashReview, flashReview)
  writeText(files.executorPrompt, buildExecutorPrompt({
    run,
    intent,
    plan,
    flashReview,
    execute,
    sourcePlanPath,
  }))

  const executorSummary = runExecutorPlan({
    planPath: files.actionPlan,
    execute,
    artifactRoot,
  })
  if (execute) {
    writeJson(files.executionSummary, executorSummary)
  }

  writeText(files.finalReport, buildFinalReport({
    run,
    intent,
    plan,
    flashReview,
    executorSummary,
    execute,
    live: false,
    liveSmokeStatus: 'not_run',
    beforeHead: run.beforeHead,
    afterHead: execute ? executorSummary.head_after ?? run.beforeHead : run.beforeHead,
    sourcePath: sourcePlanPath,
  }))

  return {
    ok: true,
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    runDir: run.runDir,
    planId: plan.id,
    finalReport: files.finalReport,
    executionSummary: execute ? files.executionSummary : '',
    marker: execute ? 'WORKHORSE_RUN_EXECUTE_PASS' : 'WORKHORSE_RUN_DRY_RUN_PASS',
  }
}

function createRunContext({ artifactRoot, mode, source }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const runId = `workhorse-${mode}-${stamp}-${randomId()}`
  const runDir = path.join(artifactRoot, runId)
  fs.mkdirSync(runDir, { recursive: true })
  return {
    runId,
    runDir,
    mode,
    source,
    beforeHead: gitShortHead(),
  }
}

function writeCoreArtifacts({ run, request, sourceLabel }) {
  const files = {
    request: path.join(run.runDir, 'request.json'),
    intent: path.join(run.runDir, 'intent.json'),
    actionPlan: path.join(run.runDir, 'action-plan.json'),
    proPrompt: path.join(run.runDir, 'pro-prompt.md'),
    proOutputRaw: path.join(run.runDir, 'pro-output.raw.txt'),
    flashReview: path.join(run.runDir, 'flash-review.json'),
    flashPrompt: path.join(run.runDir, 'flash-prompt.md'),
    flashOutputRaw: path.join(run.runDir, 'flash-output.raw.txt'),
    executorPrompt: path.join(run.runDir, 'final-executor-prompt.md'),
    executionSummary: path.join(run.runDir, 'execution-summary.json'),
    finalReport: path.join(run.runDir, 'final-report.md'),
  }

  writeJson(files.request, request)
  writeText(path.join(run.runDir, 'run-source.txt'), `${sourceLabel}\n`)

  return files
}

function buildIntent({ idea, execute, run }) {
  const collapsedIdea = collapseWhitespace(idea).trim()
  const keywords = extractKeywords(collapsedIdea)
  const riskLevel = inferRiskLevel(collapsedIdea)

  return {
    id: `intent-${hashShort(collapsedIdea)}`,
    intent_version: 'nudimmud.intent.x1',
    rough_idea: collapsedIdea,
    normalized_goal: `Turn the idea into a guarded readonly action plan: ${collapsedIdea}`,
    execution_mode: execute ? 'execute' : 'dry_run',
    tier_required: 'tier0_readonly',
    risk_level: riskLevel,
    mutation_policy: {
      default_mutation: false,
      tier1_blocked: true,
      repo_writes_allowed: false,
      source_writes_allowed: false,
    },
    artifact_policy: {
      artifact_root: path.dirname(run.runDir),
      keep_out_of_repo: true,
      write_git_tracked_source: false,
    },
    notes: [
      'X1 uses a deterministic local stub plan.',
      'No DeepSeek transport in X1.',
      'Tier-1 remains schema-visible but blocked.',
    ],
    keywords,
  }
}

function buildActionPlan({ intent, run }) {
  const steps = [
    {
      step_id: 'step-01',
      action: 'status_check',
      target: '.',
      params: {
        scope: 'working_tree',
      },
      tier: 0,
    },
    {
      step_id: 'step-02',
      action: 'run_command',
      target: '.',
      params: {
        command: 'git_branch_show_current',
      },
      tier: 0,
    },
    {
      step_id: 'step-03',
      action: 'run_command',
      target: '.',
      params: {
        command: 'git_rev_parse_short_head',
      },
      tier: 0,
    },
    {
      step_id: 'step-04',
      action: 'read_file',
      target: 'Scripts/yuri-guarded-executor.mjs',
      params: {
        start_line: 1,
        end_line: 80,
      },
      tier: 0,
    },
    {
      step_id: 'step-05',
      action: 'list_directory',
      target: 'Scripts',
      params: {
        max_entries: 80,
      },
      tier: 0,
    },
    {
      step_id: 'step-06',
      action: 'run_command',
      target: '.',
      params: {
        command: 'git_diff_cached_name_only',
      },
      tier: 0,
    },
  ]

  return {
    plan_version: PLAN_VERSION,
    id: `plan-${intent.id}-${run.runId.slice(-10)}`,
    intent,
    tier_required: 'tier0_readonly',
    steps,
  }
}

function validateIntent(intent) {
  if (!isPlainObject(intent)) {
    throw new Error('intent must be an object')
  }
  const required = ['id', 'intent_version', 'rough_idea', 'normalized_goal', 'execution_mode', 'tier_required', 'risk_level', 'mutation_policy', 'artifact_policy', 'notes', 'keywords']
  assertExactKeys(intent, required, 'intent')
  for (const key of required) {
    if (!(key in intent)) {
      throw new Error(`intent missing field: ${key}`)
    }
  }
  if (!['dry_run', 'execute'].includes(intent.execution_mode)) {
    throw new Error('intent.execution_mode invalid')
  }
  if (!['tier0_readonly', 'tier1_blocked'].includes(intent.tier_required)) {
    throw new Error('intent.tier_required invalid')
  }
  if (!['low', 'medium'].includes(intent.risk_level)) {
    throw new Error('intent.risk_level invalid')
  }
  if (!isPlainObject(intent.mutation_policy) || intent.mutation_policy.default_mutation !== false || intent.mutation_policy.tier1_blocked !== true || intent.mutation_policy.repo_writes_allowed !== false || intent.mutation_policy.source_writes_allowed !== false) {
    throw new Error('intent.mutation_policy invalid')
  }
  if (!isPlainObject(intent.mutation_policy) || !isPlainObject(intent.artifact_policy)) {
    throw new Error('intent policy objects invalid')
  }
  assertExactKeys(intent.mutation_policy, ['default_mutation', 'tier1_blocked', 'repo_writes_allowed', 'source_writes_allowed'], 'intent.mutation_policy')
  assertExactKeys(intent.artifact_policy, ['artifact_root', 'keep_out_of_repo', 'write_git_tracked_source'], 'intent.artifact_policy')
  if (intent.artifact_policy.keep_out_of_repo !== true || intent.artifact_policy.write_git_tracked_source !== false || typeof intent.artifact_policy.artifact_root !== 'string') {
    throw new Error('intent.artifact_policy invalid')
  }
  if (!Array.isArray(intent.notes) || intent.notes.some((item) => typeof item !== 'string')) {
    throw new Error('intent.notes invalid')
  }
  if (!Array.isArray(intent.keywords) || intent.keywords.some((item) => typeof item !== 'string')) {
    throw new Error('intent.keywords invalid')
  }
}

function validateActionPlan(plan) {
  if (!isPlainObject(plan)) {
    throw new Error('action plan must be an object')
  }
  const required = ['plan_version', 'id', 'intent', 'tier_required', 'steps']
  assertExactKeys(plan, required, 'action plan')
  for (const key of required) {
    if (!(key in plan)) {
      throw new Error(`action plan missing field: ${key}`)
    }
  }
  if (plan.plan_version !== PLAN_VERSION) {
    throw new Error('action plan plan_version mismatch')
  }
  if (!['tier0_readonly', 'tier1_blocked'].includes(plan.tier_required)) {
    throw new Error('action plan tier_required invalid')
  }
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error('action plan steps must be a non-empty array')
  }
  validateIntent(plan.intent)

  // Pre-clean malformed steps from DeepSeek drift before validation
  const cleanedSteps = []
  const rejectedSteps = []
  for (const step of plan.steps) {
    try {
      validateStep(step)
      cleanedSteps.push(step)
    } catch (err) {
      rejectedSteps.push({
        step_id: step.step_id || 'unknown',
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  if (rejectedSteps.length > 0) {
    process.stderr.write(`[WORKHORSE] Cleaned ${rejectedSteps.length} malformed step(s) from DeepSeek output:\n`)
    for (const rejected of rejectedSteps) {
      process.stderr.write(`  - ${rejected.step_id}: ${rejected.reason}\n`)
    }
  }

  if (cleanedSteps.length === 0) {
    throw new Error('action plan has no valid steps after schema cleanup')
  }

  plan.steps = cleanedSteps

  const seenIds = new Set()
  for (const step of plan.steps) {
    if (seenIds.has(step.step_id)) {
      throw new Error(`duplicate step_id: ${step.step_id}`)
    }
    seenIds.add(step.step_id)
  }
}

function validateStep(step) {
  if (!isPlainObject(step)) {
    throw new Error('step must be an object')
  }
  // Default tier to 0 (readonly) when DeepSeek omits it
  if (!Object.hasOwn(step, 'tier')) {
    step.tier = 0
  }
  const requiredKeys = ['step_id', 'action', 'target', 'tier']
  for (const key of requiredKeys) {
    if (!Object.hasOwn(step, key)) {
      throw new Error(`step missing required key: ${key}`)
    }
  }
  if (!step.step_id || typeof step.step_id !== 'string') {
    throw new Error('step_id must be a string')
  }
  if (!ALLOWED_ACTIONS.has(step.action)) {
    throw new Error(`unsupported step action: ${step.action}`)
  }
  if (typeof step.target !== 'string') {
    throw new Error('step target must be a string')
  }
  if (!Object.hasOwn(step, 'params')) {
    step.params = {}
  } else if (!isPlainObject(step.params)) {
    step.params = {}
  }
  if (!Number.isInteger(step.tier) || (step.tier !== 0 && step.tier !== 1)) {
    throw new Error('step tier must be 0 or 1')
  }

  if (step.action === 'read_file') {
    assertSafePlanPath(step.target)
    // Default line window when DeepSeek omits params
    if (!isPositiveInteger(step.params.start_line)) step.params.start_line = 1
    if (!isPositiveInteger(step.params.end_line)) step.params.end_line = 200
    if (step.params.start_line > step.params.end_line) step.params.end_line = step.params.start_line + 199

    // Clamp end_line to actual file length to prevent "line window exceeds file length"
    try {
      const filePath = path.resolve(REPO_ROOT, step.target)
      const stat = fs.statSync(filePath)
      if (stat.isFile()) {
        const content = fs.readFileSync(filePath, 'utf8')
        const actualLines = content.split('\n').length
        if (step.params.end_line > actualLines) {
          step.params.end_line = Math.max(actualLines, step.params.start_line)
        }
      }
    } catch (_) {
      // If we can't read file stats, proceed with defaults
    }

    requirePositiveLineWindow(step.params.start_line, step.params.end_line)
    return
  }
  if (step.action === 'list_directory') {
    assertSafePlanPath(step.target)
    if ('max_entries' in step.params && !isPositiveInteger(step.params.max_entries)) {
      throw new Error('list_directory.max_entries must be a positive integer')
    }
    return
  }
  if (step.action === 'file_diff') {
    assertSafePlanPath(step.target)
    assertSafePlanPath(step.params.other)
    return
  }
  if (step.action === 'git_log') {
    assertSafePlanPath(step.target)
    if ('max_count' in step.params && !isPositiveInteger(step.params.max_count)) {
      throw new Error('git_log.max_count must be a positive integer')
    }
    return
  }
  if (step.action === 'status_check') {
    assertSafePlanPath(step.target)
    return
  }
  if (step.action === 'run_command') {
    validateRunCommandStep(step)
  }
}

function validateRunCommandStep(step) {
  const command = step.params.command
  if (!command || typeof command !== 'string') {
    throw new Error(`run_command requires params.command to be a non-empty string; got: ${typeof command}`)
  }
  if (!RUN_COMMANDS.has(command)) {
    throw new Error(`forbidden command: ${command}`)
  }
  if (command === 'pwd' || command === 'git_branch_show_current' || command === 'git_rev_parse_short_head' || command === 'git_diff_cached_name_only') {
    return
  }
  assertSafePlanPath(step.target)
  if (command === 'grep_file') {
    if (typeof step.params.pattern !== 'string' || step.params.pattern.length === 0) {
      throw new Error('grep_file requires params.pattern')
    }
  }
}

function buildFlashReview({ intent, plan, execute }) {
  return {
    review_version: 'x1.0',
    verdict: 'approved',
    scope: 'readonly_tier0',
    risk_rating: intent.risk_level,
    execute_requested: execute,
    plan_id: plan.id,
    notes: [
      'Selftest-safe stub plan.',
      'Tier-1 mutation blocked in X1.',
      'No raw shell strings permitted.',
    ],
  }
}

function validateLiveProPayload(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: pro payload must be an object')
  }
  assertExactKeys(payload, ['intent', 'action_plan'], 'pro payload')
  if (!isPlainObject(payload.intent) || !isPlainObject(payload.action_plan)) {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: pro payload objects invalid')
  }
}

function validateLiveFlashReview(payload) {
  if (!isPlainObject(payload)) {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: flash review must be an object')
  }
  assertExactKeys(payload, ['flash_review_status', 'verdict', 'risk_level', 'notes', 'blocked_reason'], 'flash review')
  if (!['approved', 'blocked'].includes(payload.flash_review_status)) {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: flash_review_status invalid')
  }
  if (!['approved', 'blocked'].includes(payload.verdict)) {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: verdict invalid')
  }
  if (payload.flash_review_status !== payload.verdict) {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: flash_review_status/verdict mismatch')
  }
  if (!['low', 'medium', 'high'].includes(payload.risk_level)) {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: risk_level invalid')
  }
  if (payload.verdict === 'approved') {
    if (payload.blocked_reason !== null) {
      throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: blocked_reason invalid')
    }
  } else if (typeof payload.blocked_reason !== 'string') {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: blocked_reason invalid')
  }
  let notes = payload.notes
  if (Array.isArray(notes)) {
    if (notes.some((item) => typeof item !== 'string')) {
      throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: notes invalid')
    }
  } else if (typeof notes === 'string') {
    notes = [notes]
  } else {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: notes invalid')
  }
  return {
    ...payload,
    notes,
  }
}

function buildLiveRequestPrompt({ idea, execute, noFlash, sourcePath, artifactRoot }) {
  return [
    '# NUDIMMUD Workhorse Live Request',
    '',
    `rough_idea: ${idea}`,
    `execution_mode: ${execute ? 'execute' : 'dry_run'}`,
    `flash_mode: ${noFlash ? 'skipped_explicit' : 'required'}`,
    `source_path: ${sourcePath}`,
    `artifact_root: ${artifactRoot}`,
    '',
    'Constraints:',
    '- Strict JSON only.',
    '- No markdown.',
    '- No prose.',
    '- No code fences.',
    '- No shell output.',
    '- No raw commands outside the schema.',
    '- No Claude routing.',
    '- No Agent/subagent routing.',
    '- No source writes.',
    '- Tier-1 remains blocked.',
    '',
    'Return exactly one JSON object with exactly two top-level keys: intent, action_plan.',
    '',
    'intent must include exactly these keys:',
    'id',
    'intent_version',
    'rough_idea',
    'normalized_goal',
    'execution_mode',
    'tier_required',
    'risk_level',
    'mutation_policy',
    'artifact_policy',
    'notes',
    'keywords',
    '',
    'intent values:',
    'intent_version must be "nudimmud.intent.x1".',
    'execution_mode must be "dry_run" or "execute".',
    'tier_required must be "tier0_readonly".',
    'risk_level must be "low" or "medium".',
    'mutation_policy must be:',
    '{',
    '  "default_mutation": false,',
    '  "tier1_blocked": true,',
    '  "repo_writes_allowed": false,',
    '  "source_writes_allowed": false',
    '}',
    'artifact_policy must include:',
    '{',
    `  "artifact_root": "${artifactRoot}",`,
    '  "keep_out_of_repo": true,',
    '  "write_git_tracked_source": false',
    '}',
    'notes must be array of strings.',
    'keywords must be array of strings.',
    '',
    'action_plan must include exactly these keys:',
    'plan_version',
    'id',
    'intent',
    'tier_required',
    'steps',
    '',
    'action_plan.plan_version must be "nudimmud.workhorse.x1".',
    'action_plan.id must match or derive from intent.id.',
    'action_plan.intent must be the exact intent object.',
    'action_plan.tier_required must be "tier0_readonly".',
    'steps must be a non-empty array.',
    '',
    'Allowed step shape:',
    '{',
    '  "step_id": "step-1",',
    '  "action": "read_file",',
    '  "target": "package.json",',
    '  "params": { "start_line": 1, "end_line": 120 },',
    '  "tier": 0',
    '}',
    '',
    'Allowed actions only:',
    'read_file',
    'list_directory',
    'file_diff',
    'git_log',
    'status_check',
    'run_command',
    '',
    'Allowed run_command params.command only:',
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
    '',
    'Do not use:',
    'type',
    'parameters',
    'path',
    'output',
    'parse_json',
    'file_read',
    'raw_content',
    'script_object',
    'any action not in the enum',
    '',
    'For the rough idea "inspect package scripts without mutation", choose a valid safe action such as read_file package.json line window, or run_command grep_file on package.json with pattern "\\"scripts\\"".',
    'Do not invent parse_json because it is not an allowed X1 action.',
    'Never emit raw shell strings.',
    '',
  ].join('\n')
}

function buildLiveFlashPrompt({ idea, intent, plan, execute }) {
  return [
    '# NUDIMMUD Workhorse Flash Review',
    '',
    `rough_idea: ${idea}`,
    `execution_mode: ${execute ? 'execute' : 'dry_run'}`,
    `intent_id: ${intent.id}`,
    `plan_id: ${plan.id}`,
    '',
    'Task:',
    'Review the plan for overreach, hidden mutation, raw shell, path escapes, secret-path access, or tier1 mutation.',
    'Return strict JSON only.',
    'No markdown.',
    'No prose.',
    'No code fences.',
    '',
    'Return one JSON object with exactly these keys:',
    '- flash_review_status',
    '- verdict',
    '- risk_level',
    '- notes',
    '- blocked_reason',
    '',
    'flash_review_status must be approved or blocked.',
    'verdict must be approved or blocked.',
    'notes MUST be an array of strings.',
    'notes MUST NOT be a string.',
    'blocked_reason MUST be null when approved.',
    'blocked_reason MUST be a string when blocked.',
    'Return JSON only, no markdown, no prose.',
    '',
  ].join('\n')
}

function buildRequestArtifact({ run, idea = '', execute = false, live = false, noFlash = false, generatePlan = false, planPath = '', sourcePath = '' }) {
  return {
    request_id: `request-${run.runId}`,
    workhorse_version: WORKHORSE_VERSION,
    run_id: run.runId,
    source: sourcePath || run.source,
    rough_idea: collapseWhitespace(idea).trim(),
    execution_mode: execute ? 'execute' : 'dry_run',
    live_mode: !!live,
    flash_mode: noFlash ? 'skipped_explicit' : (live ? 'required' : 'stubbed'),
    generate_plan_mode: !!generatePlan,
    plan_path: planPath,
    artifact_root: path.dirname(run.runDir),
    created_at: new Date().toISOString(),
  }
}

function runLiveForgePipeline({ idea, execute, noFlash, run, request, files, artifactRoot, transport, executorRunner }) {
  const proPrompt = buildLiveRequestPrompt({
    idea,
    execute,
    noFlash,
    sourcePath: 'forge',
    artifactRoot,
  })
  writeText(files.proPrompt, proPrompt)

  const proRaw = transport.runLane(LIVE_PRO_LANE, proPrompt, {
    system: [
      'Return strict JSON only.',
      'No markdown.',
      'No prose.',
      'No code fences.',
      'No extra keys.',
    ].join('\n'),
  })
  writeText(files.proOutputRaw, proRaw)

  const proPayload = parseSingleJsonObject(proRaw, 'LIVE_PRO_JSON_CONTRACT_FAIL')
  validateLiveProPayload(proPayload)
  const intent = proPayload.intent
  const plan = proPayload.action_plan
  validateIntent(intent)
  validateActionPlan(plan)
  if (!deepEqualJson(plan.intent, intent)) {
    throw new Error('LIVE_SCHEMA_VALIDATION_BLOCKED: action_plan.intent mismatch')
  }

  writeJson(files.intent, intent)
  writeJson(files.actionPlan, plan)

  let flashReview
  let flashReviewStatus = 'approved'
  if (noFlash) {
    flashReviewStatus = 'skipped_explicit'
    writeText(files.flashPrompt, buildLiveFlashPrompt({ idea, intent, plan, execute }))
    flashReview = {
      flash_review_status: 'skipped_explicit',
      verdict: 'skipped_explicit',
      risk_level: intent.risk_level,
      notes: ['Flash review skipped explicitly by --no-flash.'],
      blocked_reason: '',
    }
    writeText(files.flashOutputRaw, 'skipped_explicit\n')
  } else {
    const flashPrompt = buildLiveFlashPrompt({ idea, intent, plan, execute })
    writeText(files.flashPrompt, flashPrompt)
    const flashRaw = transport.runLane(LIVE_FLASH_LANE, flashPrompt, {
      system: [
        'Return strict JSON only.',
        'No markdown.',
        'No prose.',
        'No code fences.',
        'No extra keys.',
      ].join('\n'),
    })
    writeText(files.flashOutputRaw, flashRaw)
    const flashPayload = parseSingleJsonObject(flashRaw, 'LIVE_FLASH_REVIEW_BLOCKED')
    flashReview = validateLiveFlashReview(flashPayload)
    flashReviewStatus = flashReview.flash_review_status
    if (flashReview.verdict !== 'approved') {
      throw new Error(`LIVE_FLASH_REVIEW_BLOCKED: ${collapseWhitespace(flashReview.blocked_reason || 'flash review blocked')}`)
    }
  }

  writeJson(files.flashReview, flashReview)
  writeText(files.executorPrompt, buildExecutorPrompt({
    run,
    intent,
    plan,
    flashReview,
    execute,
    sourcePlanPath: 'forge --live',
  }))

  const shouldExecute = execute
  const executorSummary = executorRunner({
    planPath: files.actionPlan,
    execute: shouldExecute,
    artifactRoot,
  })
  if (shouldExecute) {
    writeJson(files.executionSummary, executorSummary)
  }

  writeText(files.finalReport, buildFinalReport({
    run,
    intent,
    plan,
    flashReview,
    executorSummary,
    execute,
    live: true,
    liveSmokeStatus: noFlash ? 'degraded_no_flash' : 'passed',
    beforeHead: run.beforeHead,
    afterHead: shouldExecute ? executorSummary.head_after ?? run.beforeHead : run.beforeHead,
    sourcePath: 'forge --live',
  }))

  return {
    ok: true,
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    runDir: run.runDir,
    planId: plan.id,
    finalReport: files.finalReport,
    executionSummary: shouldExecute ? files.executionSummary : '',
    marker: 'WORKHORSE_LIVE_ARTIFACTS_PASS',
    flashReviewStatus,
  }
}

function createDeepseekTransport() {
  return {
    runLane(lane, prompt, options = {}) {
      const args = [OFFLOAD_RUNNER_PATH, lane]
      if (options.system) {
        args.push('--system', options.system)
      }
      args.push(prompt)
      const result = spawnSync(process.execPath, [
        ...args,
      ], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 1024 * 1024,
      })

      if (result.error) {
        throw classifyLiveTransportError(result.error.message)
      }
      if (result.status !== 0) {
        throw classifyLiveTransportError(result.stderr || result.stdout || 'offload runner failed')
      }

      return result.stdout || ''
    },
  }
}

function parseSingleJsonObject(text, failMarker) {
  const source = String(text ?? '')
  const span = findSingleJsonObjectSpan(source)
  if (!span) {
    throw new Error(`${failMarker}: no unambiguous JSON object found`)
  }
  try {
    return JSON.parse(source.slice(span.start, span.end))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${failMarker}: ${message}`)
  }
}

function findSingleJsonObjectSpan(text) {
  let start = -1
  let end = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      if (depth === 0) {
        if (start !== -1) {
          return null
        }
        start = index
      }
      depth += 1
      continue
    }
    if (char === '}') {
      if (depth === 0) {
        return null
      }
      depth -= 1
      if (depth === 0) {
        if (end !== -1) {
          return null
        }
        end = index + 1
      }
    }
  }

  if (start === -1 || end === -1 || depth !== 0) {
    return null
  }
  if (text.slice(end).trim().length > 0 && /[{}]/.test(text.slice(end))) {
    return null
  }
  return { start, end }
}

function deepEqualJson(left, right) {
  return JSON.stringify(normalizeJsonValue(left)) === JSON.stringify(normalizeJsonValue(right))
}

function normalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item))
  }
  if (isPlainObject(value)) {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalizeJsonValue(value[key])
      return acc
    }, {})
  }
  return value
}

function assertExactKeys(value, expectedKeys, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object`)
  }
  const actual = Object.keys(value).sort()
  const expected = [...expectedKeys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} keys invalid`)
  }
}

function classifyLiveTransportError(message) {
  const text = collapseWhitespace(message)
  if (/(Missing API key|Missing endpoint|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout|TLS|CERT|401|403|CREDIT_EXHAUSTED|RATE_LIMITED)/i.test(text)) {
    return new Error(`LIVE_SMOKE_BLOCKED_NETWORK_OR_KEY: ${text}`)
  }
  return new Error(`LIVE_TRANSPORT_FAILED: ${text}`)
}

function buildExecutorPrompt({ run, intent, plan, flashReview, execute, sourcePlanPath = 'forge' }) {
  return [
    '# NUDIMMUD Workhorse Executor Prompt',
    '',
    `run_id: ${run.runId}`,
    `source: ${sourcePlanPath}`,
    `mode: ${execute ? 'execute' : 'dry_run'}`,
    `tier_required: ${plan.tier_required}`,
    `risk_level: ${intent.risk_level}`,
    `review_verdict: ${flashReview.verdict}`,
    `flash_review_status: ${flashReview.flash_review_status || flashReview.verdict}`,
    '',
    'Rules:',
    '- Tier-0 readonly only in X1.',
    '- Tier-1 steps remain schema-visible but blocked.',
    '- No raw shell strings.',
    '- No Claude routing.',
    '- No Agent/subagent routing.',
    '- No writes outside artifact root.',
    '- No .claude, backend, DB, or source mutations.',
    '',
    'Action plan:',
    '```json',
    JSON.stringify(plan, null, 2),
    '```',
    '',
  ].join('\n')
}

function buildFinalReport({ run, intent, plan, flashReview, executorSummary, execute, live = false, liveSmokeStatus = 'not_run', beforeHead, afterHead, sourcePath }) {
  const lines = [
    '# NUDIMMUD Workhorse Final Report',
    '',
    `RESULT_LABEL: ${live ? `LIVE_${execute ? 'EXECUTE' : 'DRY_RUN'}` : (execute ? 'EXECUTE' : 'DRY_RUN')}`,
    `HEAD_BEFORE: ${beforeHead}`,
    `HEAD_AFTER: ${afterHead}`,
    `FILES_CHANGED: ${formatFileList(executorSummary?.files_changed ?? [])}`,
    `VALIDATION: ${formatValidation(executorSummary)}`,
    `SELFTEST_MARKERS: ${formatMarkers(executorSummary?.markers ?? [])}`,
    `LIVE_SMOKE: ${liveSmokeStatus}`,
    `ARTIFACT_SAMPLE: ${path.basename(path.join(run.runDir, 'request.json'))}, ${path.basename(path.join(run.runDir, 'intent.json'))}, ${path.basename(path.join(run.runDir, 'action-plan.json'))}, ${path.basename(path.join(run.runDir, 'flash-review.json'))}, ${path.basename(path.join(run.runDir, 'final-executor-prompt.md'))}`,
    'COMMIT: none',
    `RISKS: ${plan.tier_required === 'tier1_blocked' ? 'tier1 blocked in X1' : 'readonly only; no repo mutation'}`,
    'NON_CLAIMS: no Claude routing | no Agent/subagent routing | no raw shell from model | no source writes | no commit | no auto-commit',
    '',
    `intent_id: ${intent.id}`,
    `plan_id: ${plan.id}`,
    `review_verdict: ${flashReview.verdict}`,
    `artifact_root: ${path.dirname(run.runDir)}`,
    `source_plan: ${sourcePath}`,
    '',
  ]
  return lines.join('\n')
}

function runExecutorPlan({ planPath, execute, artifactRoot }) {
  const result = spawnSync(process.execPath, [
    EXECUTOR_PATH,
    '--plan',
    planPath,
    '--artifact-root',
    artifactRoot,
    ...(execute ? ['--execute'] : []),
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 1024 * 1024,
  })

  if (result.error) {
    throw new Error(result.error.message)
  }
  if (result.status !== 0) {
    throw new Error(collapseWhitespace(result.stderr || result.stdout || 'executor failed'))
  }

  const output = collapseWhitespace(result.stdout.trim())
  const summary = output ? JSON.parse(result.stdout) : {}
  if (!isPlainObject(summary)) {
    throw new Error('executor summary must be a JSON object')
  }
  return summary
}

function runSelftest({ artifactRoot }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nudimmud-workhorse-selftest-'))
  const markers = []
  const scopedBefore = scopedRepoStatus()

  if (helpText().includes('forge "<rough idea>"') && helpText().includes('run --plan <path>')) {
    markers.push('WORKHORSE_HELP_PASS')
  }

  const dryForge = forgePipeline({
    idea: 'review guarded executor readonly pipeline',
    execute: false,
    artifactRoot: tempRoot,
  })
  if (dryForge.ok && dryForge.mode === 'DRY_RUN' && fileExists(dryForge.finalReport)) {
    markers.push('WORKHORSE_DRY_FORGE_PASS')
  }
  if (artifactPackExists(dryForge.runDir, false)) {
    markers.push('ARTIFACT_PACK_PASS')
  }

  const dryPlan = readJsonFile(path.join(dryForge.runDir, 'action-plan.json'))
  validateActionPlan(dryPlan)
  markers.push('ACTION_SCHEMA_VALIDATION_PASS')

  const executeForge = forgePipeline({
    idea: 'inspect readonly execution lane',
    execute: true,
    artifactRoot: tempRoot,
  })
  if (executeForge.ok && executeForge.mode === 'EXECUTE') {
    const execSummaryPath = path.join(executeForge.runDir, 'execution-summary.json')
    if (fileExists(execSummaryPath)) {
      const execSummary = readJsonFile(execSummaryPath)
      if (execSummary.executed === true && execSummary.readonly === true) {
        markers.push('WORKHORSE_EXECUTE_TIER0_PASS')
      }
    }
  }
  if (artifactPackExists(executeForge.runDir, true)) {
    markers.push('ARTIFACT_PACK_PASS')
  }

  assertThrows(() => validateActionPlan({
    plan_version: PLAN_VERSION,
    id: 'blocked',
    intent: dryPlan.intent,
    tier_required: 'tier1_blocked',
    steps: [
      {
        step_id: 'tier1-01',
        action: 'run_command',
        target: '.',
        params: { command: 'curl' },
        tier: 1,
      },
    ],
  }), 'forbidden command')
  markers.push('FORBIDDEN_COMMAND_BLOCK_PASS')

  assertThrows(() => validateActionPlan(makeBlockedPlan('../escape')), 'Path escapes repo root')
  markers.push('PATH_TRAVERSAL_BLOCK_PASS')

  assertThrows(() => validateActionPlan(makeBlockedPlan('/tmp/escape')), 'Absolute paths forbidden')
  markers.push('ABSOLUTE_PATH_BLOCK_PASS')

  assertThrows(() => validateActionPlan(makeBlockedPlan('.env')), 'Forbidden path')
  markers.push('SECRET_PATH_BLOCK_PASS')

  assertThrows(() => executePlanDryRun({
    plan: {
      plan_version: PLAN_VERSION,
      id: 'tier1-blocked',
      intent: dryPlan.intent,
      tier_required: 'tier1_blocked',
      steps: [
        {
          step_id: 'tier1-01',
          action: 'run_command',
          target: '.',
          params: { command: 'pwd' },
          tier: 1,
        },
      ],
    },
    artifactRoot: tempRoot,
  }), 'tier1 blocked')
  markers.push('TIER1_BLOCKED_IN_X1_PASS')

  const liveIdea = 'inspect package scripts without mutation'
  const liveIntent = {
    id: `intent-${hashShort(liveIdea)}`,
    intent_version: 'nudimmud.intent.x1',
    rough_idea: liveIdea,
    normalized_goal: `Turn the idea into a guarded readonly action plan: ${liveIdea}`,
    execution_mode: 'dry_run',
    tier_required: 'tier0_readonly',
    risk_level: 'low',
    mutation_policy: {
      default_mutation: false,
      tier1_blocked: true,
      repo_writes_allowed: false,
      source_writes_allowed: false,
    },
    artifact_policy: {
      artifact_root: tempRoot,
      keep_out_of_repo: true,
      write_git_tracked_source: false,
    },
    notes: ['live stub intent'],
    keywords: extractKeywords(liveIdea),
  }
  const livePlan = {
    plan_version: PLAN_VERSION,
    id: `plan-${liveIntent.id}-fixture`,
    intent: liveIntent,
    tier_required: 'tier0_readonly',
    steps: [
      {
        step_id: 'step-1',
        action: 'read_file',
        target: 'package.json',
        params: { start_line: 1, end_line: 120 },
        tier: 0,
      },
    ],
  }
  const approvedLiveTransport = {
    runLane(lane) {
      if (lane === LIVE_PRO_LANE) {
        return JSON.stringify({ intent: liveIntent, action_plan: livePlan })
      }
      if (lane === LIVE_FLASH_LANE) {
        return JSON.stringify({
          flash_review_status: 'approved',
          verdict: 'approved',
          risk_level: 'low',
          notes: ['approved'],
          blocked_reason: null,
        })
      }
      throw new Error(`unexpected lane: ${lane}`)
    },
  }
  const approvedLiveRun = forgePipeline({
    idea: liveIdea,
    execute: false,
    live: true,
    noFlash: false,
    artifactRoot: tempRoot,
    transport: approvedLiveTransport,
    executorRunner: () => ({ validated: true, readonly: true, markers: [], files_changed: [], executed: false }),
  })
  if (approvedLiveRun.ok && approvedLiveRun.flashReviewStatus === 'approved') {
    const proPrompt = readTextFile(path.join(approvedLiveRun.runDir, 'pro-prompt.md'))
    if (
      proPrompt.includes('Return exactly one JSON object with exactly two top-level keys: intent, action_plan.') &&
      proPrompt.includes('intent must include exactly these keys:') &&
      proPrompt.includes('action_plan must include exactly these keys:') &&
      proPrompt.includes('Allowed step shape:') &&
      proPrompt.includes('Allowed actions only:') &&
      proPrompt.includes('Allowed run_command params.command only:')
    ) {
      markers.push('LIVE_PRO_SCHEMA_PROMPT_EXACT_KEYS_PASS')
    }
    const flashPrompt = readTextFile(path.join(approvedLiveRun.runDir, 'flash-prompt.md'))
    if (
      flashPrompt.includes('Return one JSON object with exactly these keys:') &&
      flashPrompt.includes('notes MUST be an array of strings.') &&
      flashPrompt.includes('notes MUST NOT be a string.') &&
      flashPrompt.includes('blocked_reason MUST be null when approved.') &&
      flashPrompt.includes('blocked_reason MUST be a string when blocked.') &&
      flashPrompt.includes('Return JSON only, no markdown, no prose.')
    ) {
      markers.push('LIVE_FLASH_REVIEW_SCHEMA_ALIGNMENT_PASS')
    }
    const parsedIntent = readJsonFile(path.join(approvedLiveRun.runDir, 'intent.json'))
    const parsedPlan = readJsonFile(path.join(approvedLiveRun.runDir, 'action-plan.json'))
    if (
      deepEqualJson(parsedPlan.intent, parsedIntent) &&
      parsedPlan.plan_version === PLAN_VERSION &&
      parsedPlan.steps.length > 0 &&
      parsedIntent.intent_version === 'nudimmud.intent.x1' &&
      parsedIntent.tier_required === 'tier0_readonly' &&
      parsedPlan.tier_required === 'tier0_readonly'
    ) {
      markers.push('LIVE_INTENT_SCHEMA_ALIGNMENT_PASS')
    }
    const parsedFlashReview = readJsonFile(path.join(approvedLiveRun.runDir, 'flash-review.json'))
    if (
      parsedFlashReview.flash_review_status === 'approved' &&
      parsedFlashReview.verdict === 'approved' &&
      parsedFlashReview.blocked_reason === null &&
      Array.isArray(parsedFlashReview.notes) &&
      parsedFlashReview.notes.length > 0 &&
      parsedFlashReview.notes.every((item) => typeof item === 'string')
    ) {
      markers.push('LIVE_FLASH_NOTES_ARRAY_CONTRACT_PASS')
    }
    if (liveArtifactPackExists(approvedLiveRun.runDir, false)) {
      markers.push('WORKHORSE_LIVE_ARTIFACTS_PASS')
    }
  }

  const generatePlanRun = forgePipeline({
    idea: 'inspect package scripts without mutation',
    execute: false,
    live: true,
    generatePlan: true,
    noFlash: false,
    artifactRoot: tempRoot,
    transport: approvedLiveTransport,
    executorRunner: () => ({ validated: true, readonly: true, markers: [], files_changed: [], executed: false }),
  })
  if (generatePlanRun.ok && generatePlanRun.flashReviewStatus === 'approved') {
    if (liveArtifactPackExists(generatePlanRun.runDir, false)) {
      markers.push('GENERATE_PLAN_ALIAS_PASS')
      markers.push('GENERATE_PLAN_USES_LIVE_PIPELINE_PASS')
    }
  }
  if (!generatePlanRun.marker.includes('EXECUTE')) {
    markers.push('GENERATE_PLAN_NO_EXECUTE_BY_DEFAULT_PASS')
  }
  if (generatePlanRun.ok && markers.includes('GENERATE_PLAN_USES_LIVE_PIPELINE_PASS') && markers.includes('GENERATE_PLAN_NO_EXECUTE_BY_DEFAULT_PASS')) {
    const genRequest = readJsonFile(path.join(generatePlanRun.runDir, 'request.json'))
    if (genRequest.generate_plan_mode === true) {
      markers.push('GENERATE_PLAN_ARTIFACT_MARKER_PASS')
    }
  }

  // Default idea trigger: bare "<rough idea>" acts as forge --generate-plan
  const defaultIdea = 'inspect package scripts without mutation'
  const defaultCli = parseCli([defaultIdea])
  if (defaultCli.command === 'forge' && defaultCli.generatePlan === true && defaultCli.execute === false && defaultCli.idea === defaultIdea) {
    markers.push('WORKHORSE_DEFAULT_IDEA_TRIGGER_PASS')
  }
  const defaultIdeaRun = forgePipeline({
    idea: defaultIdea,
    execute: false,
    live: true,
    generatePlan: true,
    noFlash: false,
    artifactRoot: tempRoot,
    transport: approvedLiveTransport,
    executorRunner: () => ({ validated: true, readonly: true, markers: [], files_changed: [], executed: false }),
  })
  if (defaultIdeaRun.ok && defaultIdeaRun.flashReviewStatus === 'approved' && liveArtifactPackExists(defaultIdeaRun.runDir, false)) {
    markers.push('DEFAULT_IDEA_USES_GENERATE_PLAN_PASS')
  }
  if (!defaultIdeaRun.marker.includes('EXECUTE')) {
    markers.push('DEFAULT_IDEA_DRY_RUN_PASS')
  }

  const normalizedFlashTransport = {
    runLane(lane) {
      if (lane === LIVE_PRO_LANE) {
        return JSON.stringify({ intent: liveIntent, action_plan: livePlan })
      }
      if (lane === LIVE_FLASH_LANE) {
        return JSON.stringify({
          flash_review_status: 'approved',
          verdict: 'approved',
          risk_level: 'low',
          notes: 'normalized string note',
          blocked_reason: null,
        })
      }
      throw new Error(`unexpected lane: ${lane}`)
    },
  }
  const normalizedFlashRun = forgePipeline({
    idea: liveIdea,
    execute: false,
    live: true,
    noFlash: false,
    artifactRoot: tempRoot,
    transport: normalizedFlashTransport,
    executorRunner: () => ({ validated: true, readonly: true, markers: [], files_changed: [], executed: false }),
  })
  if (normalizedFlashRun.ok && normalizedFlashRun.flashReviewStatus === 'approved') {
    const parsedNormalizedFlashReview = readJsonFile(path.join(normalizedFlashRun.runDir, 'flash-review.json'))
    if (
      Array.isArray(parsedNormalizedFlashReview.notes) &&
      parsedNormalizedFlashReview.notes.length === 1 &&
      parsedNormalizedFlashReview.notes[0] === 'normalized string note'
    ) {
      markers.push('LIVE_FLASH_NOTES_STRING_NORMALIZER_PASS')
    }
  }

  const noFlashTransport = {
    runLane(lane) {
      if (lane === LIVE_PRO_LANE) {
        return JSON.stringify({ intent: liveIntent, action_plan: livePlan })
      }
      throw new Error(`unexpected lane: ${lane}`)
    },
  }
  const noFlashRun = forgePipeline({
    idea: liveIdea,
    execute: false,
    live: true,
    noFlash: true,
    artifactRoot: tempRoot,
    transport: noFlashTransport,
    executorRunner: () => ({ validated: true, readonly: true, markers: [], files_changed: [], executed: false }),
  })
  if (noFlashRun.ok && noFlashRun.flashReviewStatus === 'skipped_explicit' && liveArtifactPackExists(noFlashRun.runDir, false)) {
    if (!markers.includes('WORKHORSE_LIVE_ARTIFACTS_PASS')) {
      markers.push('WORKHORSE_LIVE_ARTIFACTS_PASS')
    }
  }

  let executorTouched = false
  const blockedTransport = {
    runLane(lane) {
      if (lane === LIVE_PRO_LANE) {
        return JSON.stringify({ intent: liveIntent, action_plan: livePlan })
      }
      if (lane === LIVE_FLASH_LANE) {
        return JSON.stringify({
          flash_review_status: 'blocked',
          verdict: 'blocked',
          risk_level: 'high',
          notes: ['overreach'],
          blocked_reason: 'tier1 blocked',
        })
      }
      throw new Error(`unexpected lane: ${lane}`)
    },
  }
  assertThrows(() => forgePipeline({
    idea: liveIdea,
    execute: true,
    live: true,
    noFlash: false,
    artifactRoot: tempRoot,
    transport: blockedTransport,
    executorRunner: () => {
      executorTouched = true
      return { validated: true, readonly: true, markers: [], files_changed: [], executed: true }
    },
  }), 'LIVE_FLASH_REVIEW_BLOCKED')
  if (!executorTouched) {
    markers.push('WORKHORSE_LIVE_NO_EXECUTE_ON_BLOCK_PASS')
  }

  assertThrows(() => forgePipeline({
    idea: liveIdea,
    execute: false,
    live: true,
    noFlash: false,
    artifactRoot: tempRoot,
    transport: {
      runLane(lane) {
        if (lane === LIVE_PRO_LANE) {
          return 'not-json'
        }
        throw new Error(`unexpected lane: ${lane}`)
      },
    },
    executorRunner: () => ({ validated: true, readonly: true, markers: [], files_changed: [], executed: false }),
  }), 'LIVE_PRO_JSON_CONTRACT_FAIL')
  assertThrows(() => forgePipeline({
    idea: liveIdea,
    execute: false,
    live: true,
    noFlash: false,
    artifactRoot: tempRoot,
    transport: {
      runLane(lane) {
        if (lane === LIVE_PRO_LANE) {
          return JSON.stringify({ intent: liveIntent, action_plan: livePlan })
        }
        return JSON.stringify({
          flash_review_status: 'blocked',
          verdict: 'blocked',
          risk_level: 'high',
          notes: ['blocked'],
          blocked_reason: 'blocked',
        })
      },
    },
    executorRunner: () => ({ validated: true, readonly: true, markers: [], files_changed: [], executed: false }),
  }), 'LIVE_FLASH_REVIEW_BLOCKED')
  markers.push('LIVE_SCHEMA_FAIL_CLOSED_PASS')

  const compat = spawnSync(process.execPath, [EXECUTOR_PATH, '--selftest', '--artifact-root', tempRoot], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 1024 * 1024,
  })
  if (compat.status === 0) {
    markers.push('GUARDED_EXECUTOR_COMPAT_PASS')
  }

  const afterScoped = scopedRepoStatus()
  if (scopedBefore === afterScoped) {
    markers.push('NO_REPO_MUTATION_FROM_RUNTIME_PASS')
  }

  if (dryForge.ok && executeForge.ok && markers.includes('WORKHORSE_HELP_PASS') && markers.includes('WORKHORSE_DRY_FORGE_PASS') && markers.includes('WORKHORSE_EXECUTE_TIER0_PASS') && markers.includes('ACTION_SCHEMA_VALIDATION_PASS') && markers.includes('FORBIDDEN_COMMAND_BLOCK_PASS') && markers.includes('PATH_TRAVERSAL_BLOCK_PASS') && markers.includes('ABSOLUTE_PATH_BLOCK_PASS') && markers.includes('SECRET_PATH_BLOCK_PASS') && markers.includes('TIER1_BLOCKED_IN_X1_PASS') && markers.includes('ARTIFACT_PACK_PASS') && markers.includes('LIVE_PRO_SCHEMA_PROMPT_EXACT_KEYS_PASS') && markers.includes('LIVE_FLASH_REVIEW_SCHEMA_ALIGNMENT_PASS') && markers.includes('LIVE_INTENT_SCHEMA_ALIGNMENT_PASS') && markers.includes('LIVE_FLASH_NOTES_ARRAY_CONTRACT_PASS') && markers.includes('LIVE_FLASH_NOTES_STRING_NORMALIZER_PASS') && markers.includes('LIVE_SCHEMA_FAIL_CLOSED_PASS') && markers.includes('WORKHORSE_LIVE_ARTIFACTS_PASS') && markers.includes('WORKHORSE_LIVE_NO_EXECUTE_ON_BLOCK_PASS') && markers.includes('NO_REPO_MUTATION_FROM_RUNTIME_PASS') && markers.includes('GUARDED_EXECUTOR_COMPAT_PASS') && markers.includes('GENERATE_PLAN_ALIAS_PASS') && markers.includes('GENERATE_PLAN_USES_LIVE_PIPELINE_PASS') && markers.includes('GENERATE_PLAN_NO_EXECUTE_BY_DEFAULT_PASS') && markers.includes('GENERATE_PLAN_ARTIFACT_MARKER_PASS') && markers.includes('WORKHORSE_DEFAULT_IDEA_TRIGGER_PASS') && markers.includes('DEFAULT_IDEA_USES_GENERATE_PLAN_PASS') && markers.includes('DEFAULT_IDEA_DRY_RUN_PASS')) {
    markers.push('WORKHORSE_SELFTEST_PASS')
  }

  for (const marker of markers) {
    process.stdout.write(`${marker}\n`)
  }

  fs.rmSync(tempRoot, { recursive: true, force: true })
  return markers.includes('WORKHORSE_SELFTEST_PASS')
}

function executePlanDryRun({ plan, artifactRoot }) {
  validateActionPlan(plan)
  const run = createRunContext({ artifactRoot, mode: 'dry_run', source: 'selftest' })
  const request = buildRequestArtifact({ run, planPath: 'selftest', live: false, noFlash: false, sourcePath: 'selftest' })
  const files = writeCoreArtifacts({ run, request, sourceLabel: 'selftest' })
  writeJson(files.intent, plan.intent)
  writeJson(files.actionPlan, plan)
  writeJson(files.flashReview, buildFlashReview({ intent: plan.intent, plan, execute: false }))
  const summary = runExecutorPlan({ planPath: files.actionPlan, execute: false, artifactRoot })
  writeText(files.finalReport, buildFinalReport({
    run,
    intent: plan.intent,
    plan,
    flashReview: readJsonFile(files.flashReview),
    executorSummary: summary,
    execute: false,
    beforeHead: run.beforeHead,
    afterHead: run.beforeHead,
    sourcePath: 'selftest',
  }))
  return summary
}

function makeBlockedPlan(target) {
  return {
    plan_version: PLAN_VERSION,
    id: `blocked-${hashShort(target)}`,
    intent: {
      id: `intent-${hashShort(target)}`,
      intent_version: 'nudimmud.intent.x1',
      rough_idea: 'blocked path test',
      normalized_goal: 'blocked path test',
      execution_mode: 'dry_run',
      tier_required: 'tier0_readonly',
      risk_level: 'low',
      mutation_policy: {
        default_mutation: false,
        tier1_blocked: true,
        repo_writes_allowed: false,
        source_writes_allowed: false,
      },
      artifact_policy: {
        artifact_root: '/private/tmp',
        keep_out_of_repo: true,
        write_git_tracked_source: false,
      },
      notes: ['blocked path test'],
      keywords: ['blocked'],
    },
    tier_required: 'tier0_readonly',
    steps: [
      {
        step_id: 'step-01',
        action: 'read_file',
        target,
        params: {
          start_line: 1,
          end_line: 1,
        },
        tier: 0,
      },
    ],
  }
}

function artifactPackExists(runDir, expectExecutionSummary) {
  const required = [
    'request.json',
    'intent.json',
    'action-plan.json',
    'flash-review.json',
    'final-executor-prompt.md',
    'final-report.md',
  ]
  if (expectExecutionSummary) {
    required.push('execution-summary.json')
  }
  return required.every((name) => fileExists(path.join(runDir, name)))
}

function liveArtifactPackExists(runDir, expectExecutionSummary) {
  const required = [
    'request.json',
    'pro-prompt.md',
    'pro-output.raw.txt',
    'intent.json',
    'action-plan.json',
    'flash-prompt.md',
    'flash-output.raw.txt',
    'flash-review.json',
    'final-executor-prompt.md',
    'final-report.md',
  ]
  if (expectExecutionSummary) {
    required.push('execution-summary.json')
  }
  return required.every((name) => fileExists(path.join(runDir, name)))
}

function scopedRepoStatus() {
  return runGit(['status', '--short', '--', 'Scripts/nudimmud-workhorse.mjs', 'Scripts/yuri-guarded-executor.mjs', 'Scripts/deepseek-action-schema.json', 'Scripts/intent-schema.json'])
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(collapseWhitespace(result.stderr || 'git command failed'))
  }
  return collapseWhitespace(result.stdout.trim())
}

function assertThrows(fn, fragment) {
  try {
    fn()
  } catch (error) {
    if (fragment && String(error instanceof Error ? error.message : error).includes(fragment)) {
      return
    }
    throw error
  }
  throw new Error(`Expected failure containing: ${fragment}`)
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function formatSummary(outcome) {
  const lines = [
    `RESULT=${outcome.mode}`,
    `PLAN_ID=${outcome.planId}`,
    `RUN_DIR=${outcome.runDir}`,
    `FINAL_REPORT=${outcome.finalReport}`,
  ]
  if (outcome.executionSummary) {
    lines.push(`EXECUTION_SUMMARY=${outcome.executionSummary}`)
  }
  // Human-useful context (preserves all machine-readable keys above)
  if (outcome.flashReviewStatus) {
    lines.push(`FLASH_REVIEW=${outcome.flashReviewStatus}`)
  }
  if (outcome.planTitle || outcome.planSummary || outcome.intent) {
    lines.push(`PLAN_CONTEXT=${outcome.planTitle || outcome.planSummary || outcome.intent}`)
  }
  if (outcome.mode === 'DRY_RUN') {
    lines.push(`NEXT_COMMAND=cat ${outcome.finalReport}`)
  }
  lines.push(`MARKER=${outcome.marker}`)
  return lines.join('\n')
}

function formatFileList(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return 'none'
  }
  return files.map((file) => String(file)).join(' | ')
}

function formatValidation(summary) {
  if (!isPlainObject(summary)) {
    return 'executor not run'
  }
  return summary.validated === true ? 'passed' : 'failed'
}

function formatMarkers(markers) {
  if (!Array.isArray(markers) || markers.length === 0) {
    return '[]'
  }
  return markers.join(' | ')
}

function fileExists(filePath) {
  return fs.existsSync(filePath)
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8')
}

function readJsonFile(filePath) {
  return readJsonString(fs.readFileSync(filePath, 'utf8'))
}

function readJsonString(text) {
  const parsed = JSON.parse(text)
  if (!isPlainObject(parsed)) {
    throw new Error('JSON payload must be an object')
  }
  return parsed
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

function collapseWhitespace(value) {
  return String(value ?? '').replace(/\s+/g, ' ')
}

function hashShort(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 12)
}

function randomId() {
  return crypto.randomBytes(3).toString('hex')
}

function gitShortHead() {
  const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 1024 * 1024,
  })
  if (result.status !== 0) {
    throw new Error(collapseWhitespace(result.stderr || 'git rev-parse failed'))
  }
  return result.stdout.trim()
}

function extractKeywords(text) {
  return [...new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [])].slice(0, 12)
}

function inferRiskLevel(text) {
  const lowered = String(text).toLowerCase()
  if (/(write|edit|change|delete|commit|push|install|mutat)/.test(lowered)) {
    return 'medium'
  }
  if (/(inspect|validate|check|review|read|dry)/.test(lowered)) {
    return 'low'
  }
  return 'medium'
}

function assertSafePlanPath(value) {
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
  for (const marker of FORBIDDEN_PATH_MARKERS) {
    if (lowered.includes(marker.toLowerCase())) {
      throw new Error(`Forbidden path marker: ${marker}`)
    }
  }
  if (lowered.includes('.git')) {
    throw new Error('Forbidden path marker: .git')
  }
}

function requirePositiveLineWindow(start, end) {
  if (!isPositiveInteger(start) || !isPositiveInteger(end) || start > end) {
    throw new Error('Invalid line window')
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function helpTextLines() {
  return [
    'NUDIMMUD Workhorse X1',
    'Usage:',
    '  node Scripts/nudimmud-workhorse.mjs "<rough idea>"',
    '  node Scripts/nudimmud-workhorse.mjs forge "<rough idea>"',
    '  node Scripts/nudimmud-workhorse.mjs forge --execute "<rough idea>"',
    '  node Scripts/nudimmud-workhorse.mjs forge --generate-plan "<rough idea>"',
    '  node Scripts/nudimmud-workhorse.mjs forge --generate-plan --execute "<rough idea>"',
    '  node Scripts/nudimmud-workhorse.mjs run --plan <path>',
    '  node Scripts/nudimmud-workhorse.mjs run --execute --plan <path>',
    '  node Scripts/nudimmud-workhorse.mjs --selftest',
    '  node Scripts/nudimmud-workhorse.mjs --help',
  ]
}

function helpText() {
  return `${helpTextLines().join('\n')}\n`
}
