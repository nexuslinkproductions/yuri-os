#!/usr/bin/env node

/**
 * yuri-skill-loader.mjs — Yuri skill/doctrine discovery prototype
 *
 * Discovers skill files from Yuri's doctrine surfaces and normalises
 * them into a structured in-memory registry.
 *
 * Reference pattern: external-agent ~/.agent/workspace/skills/<name>/SKILL.md
 * Substrate: YURI-native root skills/, provider reference skills, and local
 * Codex compatibility skill shims. Retired provider surfaces are not
 * authoritative.
 *
 * This is a discovery/normalisation/validation prototype only.
 * No runtime skill execution. No plugin API.
 *
 * Usage:
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --list
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --skill <name>
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --json
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate --json
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --recommend <task>
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --help
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stdout, stderr } from 'node:process'
import { buildActiveSkillRegistry } from './yuri-active-skill-registry.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')
const MANIFEST_PATH = path.join(REPO_ROOT, '_SYSTEM', 'skill-hash-registry.json')

// Discovery paths (order = precedence; first match wins for duplicate names)
const DISCOVERY_PATHS = [
  { prefix: 'skills', sourceType: 'yuri_skill', kind: 'skill_md' },
  { prefix: '.claude/skills-labgated', sourceType: 'yuri_labgated_skill', kind: 'skill_md' },
  { prefix: '.claude/skills', sourceType: 'claude_skill', kind: 'flat_md' },
  { prefix: '.claude/skills', sourceType: 'claude_skill', kind: 'skill_md' },
  { prefix: '.codex/skills', sourceType: 'codex_skill', kind: 'skill_md' },
  { prefix: '.codex/skills/.system', sourceType: 'codex_system_skill', kind: 'skill_md' },
  { prefix: '.codex/plugins/cache', sourceType: 'codex_plugin_cache_skill', kind: 'skill_md_recursive' },
]

const PREVIEW_LINES = 20
const RECURSIVE_SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.venv',
  '__pycache__',
  'dist',
  'build',
  '.next',
])
const SPARSE_DISCOVERY_CACHE = new Map()

// Body injection size limits (tunable)
const SKILL_BODY_MAX_PER_SKILL = 5000  // max chars per skill body
const SKILL_BODY_MAX_TOTAL = 15000      // max chars across all skill bodies

if (isCliEntrypoint()) {
  main()
}

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help') {
    printHelp()
    return
  }

  // --validate must be checked before other flags because it may have --json suffix
  if (args[0] === '--validate') {
    const useJson = args.includes('--json')
    const registry = buildRegistry()
    runValidate(registry, useJson)
    return
  }

  if (args[0] === '--write-manifest') {
    const registry = buildRegistry()
    writeManifest(registry)
    return
  }

  const registry = buildRegistry()

  if (args[0] === '--list') {
    printList(registry)
    return
  }

  if (args[0] === '--json') {
    stdout.write(JSON.stringify(registry, null, 2) + '\n')
    return
  }

  if (args[0] === '--recommend') {
    const query = args.slice(1).join(' ').trim()
    if (!query) {
      stderr.write('ERROR: --recommend requires a task/query\n')
      process.exit(1)
    }
    stdout.write(JSON.stringify(recommendSkills(query, registry), null, 2) + '\n')
    return
  }

  if (args[0] === '--skill') {
    const name = args[1]
    if (!name) {
      stderr.write('ERROR: --skill requires a skill name\n')
      process.exit(1)
    }
    printSkill(registry, name)
    return
  }

  stderr.write('Unknown flag: ' + args[0] + '\n')
  process.exit(1)
}

function printHelp() {
  stdout.write([
    'Yuri Skill Loader — doctrine discovery prototype',
    '',
    'Usage:',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --list',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --skill <name>',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --json',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --validate --json',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --recommend <task>',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --help',
    '',
    'Discovery paths:',
    '  skills/<name>/SKILL.md (YURI canonical)',
    '  .claude/skills/*.md (provider reference)',
    '  .claude/skills/<name>/SKILL.md (provider reference)',
    '  .codex/skills/<name>/SKILL.md (provider compatibility)',
    '  .codex/skills/.system/<name>/SKILL.md (provider compatibility)',
    '  .codex/plugins/cache/**/SKILL.md (provider/plugin reference)',
    '',
    'Archived external skill roots are harvest/reference material only.',
  ].join('\n') + '\n')
}

// The `## Session Notes` section of a SKILL.md is an auto-appended journal —
// session-reflect.js / token-session-init.js write to it mid-session. Hashing it makes
// benign session churn look like integrity drift, so any commit's --validate fails on
// skills the committing lane never touched, deadlocking parallel lanes (proven
// 2026-06-13, see 02_RESOURCES/RESEARCH/parallel-session-hardening-2026-06-13). Excise
// the volatile section from the integrity hash; real skill-logic changes (frontmatter,
// triggers, instructions, and any section AFTER Session Notes) still register as drift.
// @capability: skill-hash-volatile-exclusion
// @serves: skill hash drift | parallel lane commit deadlock | session notes churn | skill-registry false drift
// @does: returns the SKILL.md body with the auto-journaled Session Notes section removed, for a churn-stable integrity hash
// @use: inside buildRegistry hash computation; keeps --validate and --write-manifest consistent
// @exports: stableSkillBody
export function stableSkillBody(fullBody) {
  // Normalize line endings FIRST so the integrity hash is platform-invariant: a Windows
  // CRLF checkout (core.autocrlf=true) must hash identically to a Mac/Linux LF checkout,
  // else every committed skill shows false DRIFT on a Windows clone and blocks all its
  // commits (René onboarding, 2026-06-30). Inert on LF; only helps CRLF.
  const normalized = fullBody.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const start = lines.findIndex(l => /^#{2,3}\s+session notes\s*$/i.test(l.trim()))
  if (start === -1) return normalized
  // Excise from the Session Notes heading up to the next level-2 heading (or EOF),
  // so content placed after Session Notes stays covered by the hash.
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i]) && !/^#{2,3}\s+session notes\s*$/i.test(lines[i].trim())) { end = i; break }
  }
  return lines.slice(0, start).concat(lines.slice(end)).join('\n')
}

export function buildRegistry() {
  const skills = []
  const seen = new Map()
  const seenNormalized = new Map()

  for (const surface of DISCOVERY_PATHS) {
    const surfacePath = path.join(REPO_ROOT, surface.prefix)
    const discoveredFiles = [
      ...(existsSync(surfacePath) ? discoverSurfaceFiles(surface, surfacePath) : []),
      ...discoverSparseTrackedSurfaceFiles(surface),
    ]
    const uniqueDiscovered = [...new Map(discoveredFiles.map((entry) => [entry.sourcePath, entry])).values()]
    for (const discovered of uniqueDiscovered) {
      const { skillName, sourcePath } = discovered
      const normalizedSkillName = normalizeSkillId(skillName)
      if (discovered.content === undefined && !statSync(sourcePath).isFile()) continue
      if (normalizedSkillName && seenNormalized.has(normalizedSkillName) && !isCanonicalSurface(surface)) {
        continue
      }

      const fullBody = discovered.content ?? readFileSync(sourcePath, 'utf8')
      let body = fullBody
      let bodyTruncated = false
      if (body.length > SKILL_BODY_MAX_PER_SKILL) {
        body = body.slice(0, SKILL_BODY_MAX_PER_SKILL)
        bodyTruncated = true
      }
      const hash = createHash('sha256').update(stableSkillBody(fullBody)).digest('hex').slice(0, 16)
      const loadedAt = new Date().toISOString()

      const skill = {
        name: skillName,
        source_path: path.relative(REPO_ROOT, sourcePath).split(path.sep).join('/'),  // POSIX separators -> Windows-portable manifest (else .codex/plugins/cache reference-only detection breaks on Windows)
        source_type: surface.sourceType,
        materialization: discovered.sparseTracked ? 'git-index' : 'worktree',
        body,
        body_length: fullBody.length,
        bodyTruncated,
        hash,
        loaded_at: loadedAt,
      }

      if (seen.has(skillName)) {
        const existing = seen.get(skillName)
        skill.collision = true
        skill.collision_with = existing.source_path
        existing.collision = true
        existing.collision_with = skill.source_path
        continue
      }

      seen.set(skillName, skill)
      if (normalizedSkillName) seenNormalized.set(normalizedSkillName, skill)
      skills.push(skill)
    }
  }

  enforceTotalBodyCap(skills)
  return { skills, discovered_at: new Date().toISOString(), count: skills.length }
}

function discoverSparseTrackedSurfaceFiles(surface) {
  if (surface.kind === 'skill_md_recursive') return []
  const cacheKey = `${surface.prefix}\0${surface.kind}`
  if (SPARSE_DISCOVERY_CACHE.has(cacheKey)) return SPARSE_DISCOVERY_CACHE.get(cacheKey)
  let records = []
  try {
    records = execFileSync('git', ['ls-files', '-v', '-z', '--', surface.prefix], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    }).split('\0').filter(Boolean)
  } catch {
    SPARSE_DISCOVERY_CACHE.set(cacheKey, [])
    return []
  }
  const prefix = `${surface.prefix.replace(/\/+$/, '')}/`
  const discovered = []
  for (const record of records) {
    const match = record.match(/^(\S) (.+)$/)
    if (!match || match[1] !== 'S') continue
    const relativePath = match[2].split(path.sep).join('/')
    if (!relativePath.startsWith(prefix)) continue
    const remainder = relativePath.slice(prefix.length)
    let skillName = ''
    if (surface.kind === 'flat_md' && /^[^/]+\.md$/.test(remainder)) {
      skillName = remainder.replace(/\.md$/, '')
    } else if (surface.kind === 'skill_md' && /^[^/]+\/SKILL\.md$/.test(remainder)) {
      skillName = remainder.split('/')[0]
    } else {
      continue
    }
    const sourcePath = path.join(REPO_ROOT, ...relativePath.split('/'))
    if (existsSync(sourcePath)) continue
    try {
      const content = execFileSync('git', ['show', `:${relativePath}`], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
      })
      discovered.push({ skillName, sourcePath, content, sparseTracked: true })
    } catch {
      // A tracked-but-unreadable blob is left absent so validation reports the
      // manifest entry missing rather than silently accepting incomplete data.
    }
  }
  SPARSE_DISCOVERY_CACHE.set(cacheKey, discovered)
  return discovered
}

export function enforceTotalBodyCap(skills, maxTotal = SKILL_BODY_MAX_TOTAL) {
  let total = skills.reduce((sum, skill) => sum + String(skill.body || '').length, 0)
  if (total <= maxTotal) return

  // wave-3 S.10: canonical-skill priority — prune plugin-cache bodies FIRST so the
  // cap can never silently strip a canonical yuri_skill while cache entries survive.
  // Sort a prune-order view (cache entries last → reverse loop hits them first);
  // the skills array itself keeps its original order for callers.
  const pruneOrder = [...skills].sort((a, b) => {
    const aCanonical = isCanonicalSkillType(a.source_type) ? 0 : 1
    const bCanonical = isCanonicalSkillType(b.source_type) ? 0 : 1
    return aCanonical - bCanonical
  })
  for (let index = pruneOrder.length - 1; index >= 0 && total > maxTotal; index--) {
    const skill = pruneOrder[index]
    const bodyLength = String(skill.body || '').length
    if (!bodyLength) continue
    skill.body = ''
    skill.bodyPruned = true
    skill.bodyPruneReason = `total skill body cap ${maxTotal} exceeded`
    total -= bodyLength
  }
}

function discoverSurfaceFiles(surface, surfacePath) {
  const discovered = []

  if (surface.kind === 'flat_md') {
    const entries = readdirSync(surfacePath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      discovered.push({
        skillName: entry.name.replace(/\.md$/, ''),
        sourcePath: path.join(surfacePath, entry.name),
      })
    }
    return discovered
  }

  if (surface.kind === 'skill_md') {
    const entries = readdirSync(surfacePath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const sourcePath = path.join(surfacePath, entry.name, 'SKILL.md')
      if (!existsSync(sourcePath)) continue
      discovered.push({
        skillName: entry.name,
        sourcePath,
      })
    }
    return discovered
  }

  if (surface.kind === 'skill_md_recursive') {
    walkSkillDirs(surfacePath, discovered)
    return discovered
  }

  return discovered
}

function walkSkillDirs(dir, discovered) {
  const entries = readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === 'SKILL.md') {
      discovered.push({
        skillName: path.basename(path.dirname(entryPath)),
        sourcePath: entryPath,
      })
      continue
    }
    if (entry.isDirectory()) {
      if (RECURSIVE_SKIP_DIRS.has(entry.name)) continue
      walkSkillDirs(entryPath, discovered)
    }
  }
}

function runValidate(registry, useJson) {
  // Load manifest
  let manifest = {}
  const manifestExists = existsSync(MANIFEST_PATH)
  if (manifestExists) {
    try {
      manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    } catch {}
  }

  // Check for shadowed duplicate names. These are expected across compatibility
  // roots when a higher-priority YURI skill overrides a provider mirror.
  const hasCollision = registry.skills.some(s => s.collision)

  // Check each discovered skill
  const results = []
  let driftCount = 0
  let missingCount = 0
  let unregisteredCount = 0
  let okCount = 0

  for (const skill of registry.skills) {
    const entry = manifest[skill.name]
    let status = 'OK'
    let detail = ''

    const referenceOnly = isReferenceOnlySkill(skill)

    if (!entry) {
      status = 'UNREGISTERED'
      detail = 'not in manifest'
      if (referenceOnly) {
        status = 'REFERENCE_UNREGISTERED'
        detail = 'reference-only provider/plugin skill not in manifest'
      } else {
        unregisteredCount++
      }
    } else if (entry.hash !== skill.hash) {
      status = 'DRIFT'
      detail = 'manifest=' + entry.hash + ' disk=' + skill.hash
      if (referenceOnly) {
        status = 'REFERENCE_DRIFT'
        detail = 'reference-only ' + detail
      } else {
        driftCount++
      }
    } else {
      okCount++
      detail = 'hash match'
    }

    if (skill.collision) {
      detail += ' COLLISION_WITH=' + skill.collision_with
    }

    results.push({ name: skill.name, source_path: skill.source_path, hash: skill.hash, status, detail })
  }

  // Check for skills in manifest but missing from disk
  for (const [name, entry] of Object.entries(manifest)) {
    if (!registry.skills.some(s => s.name === name)) {
      const referenceOnly = isReferenceOnlySourcePath(entry.source_path)
      results.push({
        name,
        source_path: entry.source_path || 'unknown',
        hash: entry.hash,
        status: referenceOnly ? 'REFERENCE_MISSING' : 'MISSING',
        detail: referenceOnly
          ? 'reference-only manifest entry not found on disk'
          : 'in manifest but not found on disk',
      })
      if (!referenceOnly) missingCount++
    }
  }

  // Sort results by name
  results.sort((a, b) => a.name.localeCompare(b.name))

  if (useJson) {
    stdout.write(JSON.stringify({
      manifest_exists: manifestExists,
      skills_checked: registry.skills.length,
      results,
      summary: { ok: okCount, drift: driftCount, missing: missingCount, unregistered: unregisteredCount },
      collisions_detected: hasCollision,
    }, null, 2) + '\n')
  } else {
    for (const r of results) {
      const label = '[' + r.status + ']'
      stdout.write(label + ' ' + r.name + ' ' + r.detail + '\n')
    }
    stdout.write('---\n')
    stdout.write('manifest_exists=' + manifestExists + ' checked=' + registry.skills.length + ' ok=' + okCount + ' drift=' + driftCount + ' missing=' + missingCount + ' unregistered=' + unregisteredCount + ' collisions=' + hasCollision + '\n')
  }

  // Exit non-zero only on registry drift/missing files. Shadowed duplicates are
  // reported for review, but first-match precedence is deterministic.
  if (driftCount > 0 || missingCount > 0) {
    process.exit(1)
  }
}

export function recommendSkills(query, registry = buildRegistry()) {
  const text = String(query || '').toLowerCase()
  const pulseSeed = {
    capabilityHints: deriveCapabilityHints(text),
    workPackets: deriveWorkPackets(text),
  }
  const context = {
    signals: deriveSignals(text),
    code: /\b(code|test|refactor|script|kernel|loader|mjs|js|ts)\b/.test(text),
    risk: /\b(risk|guard|protected|security|audit|failure|critical|production)\b/.test(text),
    memory: /\b(memory|rag|recall|retrieval|context|eot|neuron)\b/.test(text),
    research: /\b(research|source|citation|paper|msa|web|browser)\b/.test(text),
    skillRecall: /\b(skill|skills|capability|trigger|routing|recall)\b/.test(text),
    persona: /\b(neuro|persona|preference|interaction|marcel|rick|soul)\b/.test(text),
    requiresHighReasoning: /\b(critical|supercharge|forensic|architecture|system|symbiotic)\b/.test(text),
  }
  const routePlan = {
    lane: context.requiresHighReasoning ? 'shintai' : 'codex-main',
    scenario: context.requiresHighReasoning ? 'high-stakes-review' : 'focused-recall',
  }
  const activeRegistry = buildActiveSkillRegistry({
    pulseSeed,
    context,
    routePlan,
    rawSkillRegistry: registry,
  })
  return {
    ok: true,
    query,
    policy: {
      advisoryOnly: true,
      explainSelection: true,
      noSkillBodies: true,
    },
    input: {
      capabilityHints: pulseSeed.capabilityHints,
      signals: context.signals,
    },
    active: activeRegistry.active,
    stageBindings: activeRegistry.stageBindings,
    capabilityIndex: activeRegistry.capabilityIndex,
    suppressed: activeRegistry.suppressed.slice(0, 25),
    trace: activeRegistry.trace,
  }
}

function deriveCapabilityHints(text) {
  const hints = ['intent-normalization', 'deterministic-verification']
  if (isProseEditingRequest(text)) hints.push('formatting', 'persona-alignment', 'summarization')
  if (/\b(memory|rag|recall|retrieval|context|eot|neuron)\b/.test(text)) hints.push('memory-navigation', 'retrieval', 'reduce-and-learn')
  if (/\b(skill|skills|capability|trigger|routing|recall)\b/.test(text)) hints.push('skill-recall', 'orchestration')
  if (/\b(claude output lane|output lane|sublane|sublanes|plans?|ideas?|findings?|draft[- ]?artifacts?|diff[- ]?proposals?|reviews?|questions?|decisions?|evidence|raw[- ]?captures?)\b/.test(text)) hints.push('output-organization', 'skill-recall')
  if (/\b(attack|stress[- ]?test|double[- ]?check|first[- ]?run|first run|completion|complete|claim|commit|push|relaunch|ready|agent[- ]?output|claude[- ]?output)\b/.test(text)) hints.push('risk-review', 'mutation-guard', 'failure-learning')
  if (/\b(neuro|persona|preference|interaction|marcel|rick|soul)\b/.test(text)) hints.push('persona-alignment')
  if (/\b(research|source|citation|paper|msa|web|browser)\b/.test(text)) hints.push('research', 'summarization')
  if (/\b(code|test|refactor|script|kernel|loader|mjs|js|ts)\b/.test(text)) hints.push('code')
  if (/\b(risk|guard|protected|security|audit|failure|critical|production)\b/.test(text)) hints.push('risk-review', 'mutation-guard')
  if (/\b(campaign|supercharge|forensic|symbiotic|shintai)\b/.test(text)) hints.push('deep-decomposition', 'orchestration')
  return unique(hints)
}

function deriveWorkPackets(text) {
  return deriveCapabilityHints(text).map((capability, index) => ({
    id: `task-${String(index + 1).padStart(2, '0')}`,
    capability,
  }))
}

function deriveSignals(text) {
  const signals = []
  if (isProseEditingRequest(text)) signals.push('prose-editing')
  if (/\b(code|test|refactor|script|kernel|loader|mjs|js|ts)\b/.test(text)) signals.push('code')
  if (/\b(risk|guard|protected|security|audit|failure|critical|production)\b/.test(text)) signals.push('risk')
  if (/\b(memory|rag|recall|retrieval|context|eot|neuron)\b/.test(text)) signals.push('memory')
  if (/\b(research|source|citation|paper|msa|web|browser)\b/.test(text)) signals.push('research', 'docs')
  if (/\b(claude output lane|output lane|sublane|sublanes|plans?|ideas?|findings?|draft[- ]?artifacts?|diff[- ]?proposals?|reviews?|questions?|decisions?|evidence|raw[- ]?captures?)\b/.test(text)) signals.push('docs', 'campaign')
  if (/\b(attack|stress[- ]?test|double[- ]?check|first[- ]?run|first run|completion|complete|claim|commit|push|relaunch|ready|agent[- ]?output|claude[- ]?output)\b/.test(text)) signals.push('risk')
  if (/\b(design|visual|presentation|html|ui|ux)\b/.test(text)) signals.push('design')
  if (/\b(campaign|supercharge|forensic|symbiotic|shintai)\b/.test(text)) signals.push('campaign')
  return unique(signals)
}

function isProseEditingRequest(text) {
  const negatedAction = /\b(?:do not|don['’]t|dont|never|without|avoid|no|refrain from)\b[\s\S]{0,48}\b(?:humaniz(?:e|ed|ing)|humanizer|de[- ]?slop(?:ped|ping)?|naturaliz(?:e|ed|ing)|voice[- ]?match(?:ing)?|polish|rewrite|edit)\b/
  if (negatedAction.test(text)) return false

  const transformationAction = '(?:humanize|de[- ]?slop|naturalize|voice[- ]?match|match (?:my|the|this) voice)'
  const requestLead = '(?:(?:can|could|would|will) you(?: please)?|please|kindly|i (?:want|need) you to|help me(?: to)?)'
  const directAction = new RegExp(`^(?:please\\s+|kindly\\s+)?${transformationAction}\\b|\\b${requestLead}\\s+${transformationAction}\\b`)
  const explicitInvocation = /(?:^|\s)\/humanizer\b|\b(?:use|invoke|apply|run)\s+(?:the\s+)?humanizer\b/
  const proseObject = '(?:prose|copy|cover letter|letter|essay|article|email|writing|draft|paragraph|text|manuscript|statement)'
  const suppliedProseEdit = new RegExp(`^(?:please\\s+|kindly\\s+)?(?:polish|rewrite|edit)\\b[\\s\\S]{0,80}\\b${proseObject}\\b|\\b${requestLead}\\s+(?:polish|rewrite|edit)\\b[\\s\\S]{0,80}\\b${proseObject}\\b`)
  return directAction.test(text) || explicitInvocation.test(text) || suppliedProseEdit.test(text)
}

function writeManifest(registry) {
  const manifest = {}
  for (const skill of registry.skills) {
    // Provider plugin-cache skills (.codex/plugins/cache/**) are machine-specific,
    // version-pinned, and regenerable — they are never committed. Baking them into the
    // manifest made every fresh clone report ~130 phantom REFERENCE_MISSING rows (already
    // non-blocking, but pure noise; René onboarding 2026-06-30). Keep the committed
    // manifest to canonical/committed skills only.
    if (isReferenceOnlySkill(skill)) continue
    manifest[skill.name] = {
      source_path: skill.source_path,
      hash: skill.hash,
    }
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  stdout.write('Wrote manifest: ' + MANIFEST_PATH + ' (' + Object.keys(manifest).length + ' entries)\n')
}

function printList(registry) {
  for (const skill of registry.skills) {
    const parts = [skill.name, skill.source_type, skill.source_path]
    if (skill.collision) parts.push('COLLISION_WITH=' + skill.collision_with)
    stdout.write(parts.join(' | ') + '\n')
  }
}

function printSkill(registry, name) {
  const skill = registry.skills.find(s => s.name === name)
  if (!skill) {
    stderr.write('SKILL_NOT_FOUND: ' + name + '\n')
    process.exit(1)
  }

  const preview = {
    name: skill.name,
    source_path: skill.source_path,
    source_type: skill.source_type,
    hash: skill.hash,
    loaded_at: skill.loaded_at,
    body_preview: skill.body.split('\n').slice(0, PREVIEW_LINES).join('\n'),
  }
  if (skill.collision) preview.collision = skill.collision_with

  stdout.write(JSON.stringify(preview, null, 2) + '\n')
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean))]
}

function isCanonicalSurface(surface) {
  return isCanonicalSkillType(surface?.sourceType)
}

function isReferenceOnlySkill(skill) {
  return skill?.source_type === 'codex_plugin_cache_skill' ||
    isReferenceOnlySourcePath(skill?.source_path)
}

function isReferenceOnlySourcePath(sourcePath = '') {
  const source = String(sourcePath || '')
  if (source.startsWith('.codex/plugins/cache/') || source.startsWith('.codex/skills/')) return true
  if (source.startsWith('.claude/skills/') && !source.startsWith('.claude/skills/cyber-')) return true
  return false
}

function isCanonicalSkillType(sourceType) {
  return sourceType === 'yuri_skill' || sourceType === 'yuri_labgated_skill'
}

function normalizeSkillId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isCliEntrypoint() {
  return path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)
}
