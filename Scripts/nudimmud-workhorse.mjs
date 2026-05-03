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
const EXECUTOR_PATH = 'Scripts/yuri-guarded-executor.mjs'
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

  cli.idea = collapseWhitespace(cli.ideaParts.join(' ')).trim()
  return cli
}

function printHelp() {
  process.stdout.write(
    [
      'NUDIMMUD Workhorse X1',
      '',
      'Usage:',
      '  node Scripts/nudimmud-workhorse.mjs forge "<rough idea>"',
      '  node Scripts/nudimmud-workhorse.mjs forge --execute "<rough idea>"',
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

function forgePipeline({ idea, execute, artifactRoot }) {
  if (!idea) {
    throw new Error('forge requires a rough idea')
  }

  const run = createRunContext({ artifactRoot, mode: execute ? 'execute' : 'dry_run', source: 'forge' })
  const intent = buildIntent({ idea, execute, artifactRoot, run })
  const plan = buildActionPlan({ intent, run })
  validateIntent(intent)
  validateActionPlan(plan)

  const files = writeCoreArtifacts({ run, intent, plan, sourceLabel: 'forge' })
  const flashReview = buildFlashReview({ intent, plan, execute })
  writeJson(files.flashReview, flashReview)
  writeText(files.executorPrompt, buildExecutorPrompt({ run, intent, plan, flashReview, execute }))

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
  const files = writeCoreArtifacts({ run, intent, plan, sourceLabel: 'run' })
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

function writeCoreArtifacts({ run, intent, plan, sourceLabel }) {
  const files = {
    intent: path.join(run.runDir, 'intent.json'),
    actionPlan: path.join(run.runDir, 'action-plan.json'),
    flashReview: path.join(run.runDir, 'flash-review.json'),
    executorPrompt: path.join(run.runDir, 'final-executor-prompt.md'),
    executionSummary: path.join(run.runDir, 'execution-summary.json'),
    finalReport: path.join(run.runDir, 'final-report.md'),
  }

  writeJson(files.intent, intent)
  writeJson(files.actionPlan, plan)
  writeText(path.join(run.runDir, 'run-source.txt'), `${sourceLabel}\n`)

  return files
}

function buildIntent({ idea, execute, run }) {
  const collapsedIdea = collapseWhitespace(idea).trim()
  const keywords = extractKeywords(collapsedIdea)
  const riskLevel = inferRiskLevel(collapsedIdea)

  return {
    id: `intent-${hashShort(collapsedIdea)}`,
    intent_version: 'x1.0',
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
    id: `plan-${hashShort(intent.rough_idea)}-${run.runId.slice(-10)}`,
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
  if (!['low', 'medium', 'high'].includes(intent.risk_level)) {
    throw new Error('intent.risk_level invalid')
  }
  if (!isPlainObject(intent.mutation_policy) || intent.mutation_policy.default_mutation !== false || intent.mutation_policy.tier1_blocked !== true || intent.mutation_policy.repo_writes_allowed !== false || intent.mutation_policy.source_writes_allowed !== false) {
    throw new Error('intent.mutation_policy invalid')
  }
  if (!isPlainObject(intent.artifact_policy) || intent.artifact_policy.keep_out_of_repo !== true || intent.artifact_policy.write_git_tracked_source !== false || typeof intent.artifact_policy.artifact_root !== 'string') {
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

  const seenIds = new Set()
  for (const step of plan.steps) {
    validateStep(step)
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
  if (!step.step_id || typeof step.step_id !== 'string') {
    throw new Error('step_id must be a string')
  }
  if (!ALLOWED_ACTIONS.has(step.action)) {
    throw new Error(`unsupported step action: ${step.action}`)
  }
  if (typeof step.target !== 'string') {
    throw new Error('step target must be a string')
  }
  if (!isPlainObject(step.params)) {
    throw new Error('step params must be an object')
  }
  if (!Number.isInteger(step.tier) || (step.tier !== 0 && step.tier !== 1)) {
    throw new Error('step tier must be 0 or 1')
  }

  if (step.action === 'read_file') {
    assertSafePlanPath(step.target)
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
    '',
    'Rules:',
    '- Tier-0 readonly only in X1.',
    '- Tier-1 steps remain schema-visible but blocked.',
    '- No raw shell strings.',
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

function buildFinalReport({ run, intent, plan, flashReview, executorSummary, execute, beforeHead, afterHead, sourcePath }) {
  const lines = [
    '# NUDIMMUD Workhorse Final Report',
    '',
    `RESULT_LABEL: ${execute ? 'EXECUTE' : 'DRY_RUN'}`,
    `HEAD_BEFORE: ${beforeHead}`,
    `HEAD_AFTER: ${afterHead}`,
    `FILES_CHANGED: ${formatFileList(executorSummary?.files_changed ?? [])}`,
    `VALIDATION: ${formatValidation(executorSummary)}`,
    `SELFTEST_MARKERS: ${formatMarkers(executorSummary?.markers ?? [])}`,
    `ARTIFACT_SAMPLE: ${path.basename(path.join(run.runDir, 'intent.json'))}, ${path.basename(path.join(run.runDir, 'action-plan.json'))}, ${path.basename(path.join(run.runDir, 'flash-review.json'))}, ${path.basename(path.join(run.runDir, 'final-executor-prompt.md'))}`,
    'COMMIT: none',
    `RISKS: ${plan.tier_required === 'tier1_blocked' ? 'tier1 blocked in X1' : 'readonly only; no repo mutation'}`,
    'NON_CLAIMS: no DeepSeek transport | no source writes | no commit | no auto-commit | no shell plan strings',
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

  if (dryForge.ok && executeForge.ok && markers.includes('WORKHORSE_HELP_PASS') && markers.includes('WORKHORSE_DRY_FORGE_PASS') && markers.includes('WORKHORSE_EXECUTE_TIER0_PASS') && markers.includes('ACTION_SCHEMA_VALIDATION_PASS') && markers.includes('FORBIDDEN_COMMAND_BLOCK_PASS') && markers.includes('PATH_TRAVERSAL_BLOCK_PASS') && markers.includes('ABSOLUTE_PATH_BLOCK_PASS') && markers.includes('SECRET_PATH_BLOCK_PASS') && markers.includes('TIER1_BLOCKED_IN_X1_PASS') && markers.includes('ARTIFACT_PACK_PASS') && markers.includes('NO_REPO_MUTATION_FROM_RUNTIME_PASS') && markers.includes('GUARDED_EXECUTOR_COMPAT_PASS')) {
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
  const files = writeCoreArtifacts({ run, intent: plan.intent, plan, sourceLabel: 'selftest' })
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
      intent_version: 'x1.0',
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
    return 'high'
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
    '  node Scripts/nudimmud-workhorse.mjs forge "<rough idea>"',
    '  node Scripts/nudimmud-workhorse.mjs forge --execute "<rough idea>"',
    '  node Scripts/nudimmud-workhorse.mjs run --plan <path>',
    '  node Scripts/nudimmud-workhorse.mjs run --execute --plan <path>',
    '  node Scripts/nudimmud-workhorse.mjs --selftest',
    '  node Scripts/nudimmud-workhorse.mjs --help',
  ]
}

function helpText() {
  return `${helpTextLines().join('\n')}\n`
}
