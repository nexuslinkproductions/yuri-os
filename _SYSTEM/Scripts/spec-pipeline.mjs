#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '../..')
const PLAN_TEMPLATE = 'integrations/spec-kit/templates/plan-template.md'
const TASKS_TEMPLATE = 'integrations/spec-kit/templates/tasks-template.md'

function usage() {
  return `Usage: node _SYSTEM/Scripts/spec-pipeline.mjs [options]

Generate plan.md and tasks.md from a spec.md using Spec Kit templates.

Options:
  --spec <path>        Input spec markdown file (default: most recent in specs/active/)
  --output-dir <dir>  Directory for plan.md and tasks.md (default: same dir as spec)
  --json              Output structured JSON instead of text
  --help              Show this help
`
}

function parseArgs(argv) {
  const args = { json: false, help: false, spec: null, outputDir: null }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--spec') args.spec = argv[++i]
    else if (arg === '--output-dir') args.outputDir = argv[++i]
    else throw new Error(`Unknown option: ${arg}`)
  }
  if (args.spec === undefined) throw new Error('--spec requires a path')
  if (args.outputDir === undefined) throw new Error('--output-dir requires a directory')
  return args
}

function fail(message, json = false) {
  if (json) console.error(JSON.stringify({ ok: false, error: message }, null, 2))
  else console.error(`Error: ${message}`)
  process.exit(1)
}

function resolveExisting(filePath, label) {
  const resolved = path.resolve(ROOT, filePath)
  if (!fs.existsSync(resolved)) throw new Error(`${label} not found: ${filePath}`)
  if (!fs.statSync(resolved).isFile()) throw new Error(`${label} is not a file: ${filePath}`)
  return resolved
}

function newestActiveSpec() {
  const activeDir = path.resolve(ROOT, 'specs/active')
  if (!fs.existsSync(activeDir)) throw new Error('No --spec provided and specs/active/ does not exist')
  const candidates = fs.readdirSync(activeDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const file = path.join(activeDir, name)
      const stat = fs.statSync(file)
      return { file, isFile: stat.isFile(), mtimeMs: stat.mtimeMs }
    })
    .filter((entry) => entry.isFile)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  if (candidates.length === 0) throw new Error('No markdown specs found in specs/active/')
  return candidates[0].file
}

function section(markdown, names) {
  const lines = markdown.split(/\r?\n/)
  const wanted = names.map((name) => name.toLowerCase())
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match || !wanted.includes(cleanHeading(match[2]).toLowerCase())) continue
    const level = match[1].length
    const body = []
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j].match(/^(#{1,6})\s+/)
      if (next && next[1].length <= level) break
      body.push(lines[j])
    }
    return body.join('\n').trim()
  }
  return ''
}

function cleanText(text) {
  return text
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/^`+|`+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanHeading(text) {
  return cleanText(text)
    .replace(/^\d+(?:\.\d+)*\.\s*/, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .trim()
}

function cleanCriterionText(text) {
  return text.replace(/\s+/g, ' ').trim()
}

function extractScope(markdown) {
  const explicit = markdown.match(/^scope\s*:\s*(.+)$/im)
  if (explicit) return cleanText(explicit[1])
  const paragraph = section(markdown, ['Scope']).split(/\n\s*\n/).find((block) => cleanText(block))
  return paragraph ? cleanText(paragraph) : 'To be determined from spec during planning.'
}

function extractAcceptanceCriteria(markdown) {
  const source = section(markdown, ['Acceptance Criteria'])
  const criteria = []
  if (!source) return { foundSection: false, criteria }
  for (const line of source.split(/\r?\n/)) {
    const bullet = line.match(/^- \[ \] (.+)$/)
    const text = cleanCriterionText((bullet && bullet[1]) || '')
    if (text) criteria.push(text)
  }
  return { foundSection: true, criteria: [...new Set(criteria)] }
}

function metadataFor(specPath, markdown) {
  const title = cleanText(markdown.match(/^#\s+(.+?)\s*$/m)?.[1] || path.basename(specPath, path.extname(specPath)))
  return {
    title,
    scope: extractScope(markdown),
    specPath,
    specDir: path.dirname(specPath),
    date: new Date().toISOString().slice(0, 10),
  }
}

function applyTemplate(template, metadata) {
  const slug = path.basename(metadata.specDir)
  const replacements = {
    '[SPEC_TITLE]': metadata.title,
    '[FEATURE NAME]': metadata.title,
    '[FEATURE]': metadata.title,
    '{{title}}': metadata.title,
    '{{scope}}': metadata.scope,
    '[SCOPE]': metadata.scope,
    '[DATE]': metadata.date,
    '[link]': metadata.specPath,
    '[###-feature-name]': slug,
    '[###-feature]': slug,
  }
  return Object.entries(replacements)
    .reduce((content, [token, value]) => content.replaceAll(token, value), template)
}

const COMMON_SYMBOL_WORDS = new Set([
  'about',
  'acceptance',
  'after',
  'before',
  'class',
  'code',
  'data',
  'file',
  'from',
  'function',
  'given',
  'goal',
  'have',
  'into',
  'must',
  'only',
  'path',
  'plan',
  'risk',
  'scope',
  'spec',
  'task',
  'test',
  'that',
  'then',
  'this',
  'when',
  'with',
  'work',
])

function isGenericSymbol(value) {
  const normalized = value.trim()
  if (normalized.length < 4) return true
  if (COMMON_SYMBOL_WORDS.has(normalized.toLowerCase())) return true
  return false
}

function warnGitNexusSkipped(symbol, reason) {
  console.error(`[spec-pipeline] GitNexus impact skipped for symbol "${symbol}" (reason: ${reason})`)
}

function detectCodeReferences(markdown) {
  const references = []
  const add = (value) => {
    const cleaned = cleanText(value)
    if (!cleaned) return
    if (isGenericSymbol(cleaned)) {
      warnGitNexusSkipped(cleaned, 'generic identifier')
      return
    }
    references.push(cleaned)
  }

  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) add(match[1])
  for (const match of markdown.matchAll(/\bsrc\/[^\s`),]+?\.(?:ts|tsx|mjs|js|py)\b/g)) add(match[0])
  for (const match of markdown.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(\s*\)/g)) add(match[1])

  return [...new Set(references)]
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function parseImpact(symbol, output) {
  const impact = JSON.parse(output)
  if (impact.status === 'ambiguous' || impact.error) return null
  const directDependents = Number.isFinite(impact.summary?.direct)
    ? impact.summary.direct
    : (impact.byDepth?.['1'] || []).length
  const affectedProcesses = Number.isFinite(impact.summary?.processes_affected)
    ? impact.summary.processes_affected
    : (impact.affected_processes || []).length
  const risk = impact.risk || 'UNKNOWN'
  return { symbol, directDependents, affectedProcesses, risk }
}

function gitnexusImpact(symbol) {
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }
  const targets = symbol.includes('/') ? [symbol, path.basename(symbol)] : [symbol]
  let lastReason = 'no matching impact returned'
  for (const target of targets) {
    try {
      const impact = parseImpact(symbol, execSync(`npx gitnexus impact ${shellQuote(target)} --json`, options))
      if (impact) return impact
      lastReason = 'ambiguous or empty impact response'
    } catch (error) {
      const stderr = String(error.stderr || '').trim()
      if (!stderr.includes("unknown option '--json'")) {
        lastReason = stderr || error.message || 'gitnexus impact failed'
        continue
      }
      lastReason = stderr
    }

    try {
      const impact = parseImpact(symbol, execSync(`npx gitnexus impact ${shellQuote(target)} --repo yuri-os-musubi`, options))
      if (impact) return impact
      lastReason = 'ambiguous or empty impact response'
    } catch (error) {
      lastReason = String(error.stderr || '').trim() || error.message || 'gitnexus impact failed'
      continue
    }
  }
  warnGitNexusSkipped(symbol, lastReason)
  return null
}

function gitnexusImpacts(markdown) {
  return detectCodeReferences(markdown)
    .map((symbol) => gitnexusImpact(symbol))
    .filter(Boolean)
}

function impactSection(impacts) {
  if (impacts.length === 0) return ''
  const lines = ['GITNEXUS IMPACT (auto-generated):']
  for (const impact of impacts) {
    lines.push(`  symbol: ${impact.symbol}`)
    lines.push(`  direct dependents: ${impact.directDependents}`)
    lines.push(`  affected processes: ${impact.affectedProcesses}`)
    lines.push(`  risk: ${impact.risk}`)
  }
  return `${lines.join('\n')}\n`
}

function taskScaffolds(criteria, impacts = []) {
  const impact = impactSection(impacts)
  const impactBlock = impact ? `${impact}\n` : ''
  const blocks = criteria.map((criterion, index) => `### Task ${index + 1}: ${criterion}

${impactBlock}CODEX TASK SPEC SCAFFOLD:
  Goal: ${criterion}
  Target files: <to be determined during implementation>
  Constraints: anime DNA gates apply; respect protected surfaces
  Acceptance criteria: ${criterion}
  Test command: <to be defined>
  Rollback boundary: git checkout <files>`)
  return `\n## Generated CODEX Task Scaffolds\n\n${blocks.join('\n\n')}\n`
}

function taskTemplateHeader(template) {
  const marker = '\n## Phase 1: Setup (Shared Infrastructure)'
  const index = template.indexOf(marker)
  if (index === -1) return template.trimEnd()
  return template.slice(0, index).trimEnd()
}

function buildTasks(template, metadata, criteria, impacts) {
  const applied = applyTemplate(template, metadata)
  if (criteria.length === 0) return applied
  return `${taskTemplateHeader(applied)}\n${taskScaffolds(criteria, impacts)}`
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`)
  fs.writeFileSync(tmp, content)
  fs.renameSync(tmp, filePath)
}

function printTextSummary(summary) {
  console.log('| Field | Value |')
  console.log('|---|---|')
  console.log(`| Spec input | ${summary.spec} |`)
  console.log(`| plan.md | ${summary.outputs.plan} |`)
  console.log(`| tasks.md | ${summary.outputs.tasks} |`)
  console.log(`| Task count | ${summary.taskCount} |`)
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    fail(error.message)
  }
  if (args.help) {
    console.log(usage())
    return
  }

  try {
    const specPath = args.spec ? resolveExisting(args.spec, 'Spec') : newestActiveSpec()
    const outputDir = path.resolve(ROOT, args.outputDir || path.dirname(specPath))
    const planTemplatePath = resolveExisting(PLAN_TEMPLATE, 'Plan template')
    const tasksTemplatePath = resolveExisting(TASKS_TEMPLATE, 'Tasks template')

    const specMarkdown = fs.readFileSync(specPath, 'utf8')
    const metadata = metadataFor(specPath, specMarkdown)
    const { foundSection, criteria } = extractAcceptanceCriteria(specMarkdown)
    if (!foundSection) {
      console.error('[spec-pipeline] No Acceptance criteria section found; keeping template task defaults')
    } else if (criteria.length === 0) {
      console.error('[spec-pipeline] No unchecked acceptance criteria found; keeping template task defaults')
    }
    const impacts = gitnexusImpacts(specMarkdown)
    const plan = applyTemplate(fs.readFileSync(planTemplatePath, 'utf8'), metadata)
    const tasks = buildTasks(fs.readFileSync(tasksTemplatePath, 'utf8'), metadata, criteria, impacts)
    const planPath = path.join(outputDir, 'plan.md')
    const tasksPath = path.join(outputDir, 'tasks.md')

    atomicWrite(planPath, plan)
    atomicWrite(tasksPath, tasks)

    const summary = {
      ok: true,
      spec: specPath,
      outputs: { plan: planPath, tasks: tasksPath },
      taskCount: criteria.length,
    }
    if (args.json) console.log(JSON.stringify(summary, null, 2))
    else printTextSummary(summary)
  } catch (error) {
    fail(error.message, args?.json)
  }
}

main()
