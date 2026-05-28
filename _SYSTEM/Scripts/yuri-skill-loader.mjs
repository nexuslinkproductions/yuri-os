#!/usr/bin/env node

/**
 * yuri-skill-loader.mjs — Yuri skill/doctrine discovery prototype
 *
 * Discovers skill files from Yuri's doctrine surfaces and normalises
 * them into a structured in-memory registry.
 *
 * Reference pattern: OpenClaw ~/.openclaw/workspace/skills/<name>/SKILL.md
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

export function buildRegistry() {
  const skills = []
  const seen = new Map()
  const seenNormalized = new Map()

  for (const surface of DISCOVERY_PATHS) {
    const surfacePath = path.join(REPO_ROOT, surface.prefix)
    if (!existsSync(surfacePath)) continue

    for (const discovered of discoverSurfaceFiles(surface, surfacePath)) {
      const { skillName, sourcePath } = discovered
      const normalizedSkillName = normalizeSkillId(skillName)
      const stat = statSync(sourcePath)

      if (!stat.isFile()) continue
      if (normalizedSkillName && seenNormalized.has(normalizedSkillName) && !isCanonicalSurface(surface)) {
        continue
      }

      const fullBody = readFileSync(sourcePath, 'utf8')
      let body = fullBody
      let bodyTruncated = false
      if (body.length > SKILL_BODY_MAX_PER_SKILL) {
        body = body.slice(0, SKILL_BODY_MAX_PER_SKILL)
        bodyTruncated = true
      }
      const hash = createHash('sha256').update(fullBody).digest('hex').slice(0, 16)
      const loadedAt = new Date().toISOString()

      const skill = {
        name: skillName,
        source_path: path.relative(REPO_ROOT, sourcePath),
        source_type: surface.sourceType,
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

function enforceTotalBodyCap(skills) {
  let total = skills.reduce((sum, skill) => sum + String(skill.body || '').length, 0)
  if (total <= SKILL_BODY_MAX_TOTAL) return

  for (let index = skills.length - 1; index >= 0 && total > SKILL_BODY_MAX_TOTAL; index--) {
    const skill = skills[index]
    const bodyLength = String(skill.body || '').length
    if (!bodyLength) continue
    skill.body = ''
    skill.bodyPruned = true
    skill.bodyPruneReason = `total skill body cap ${SKILL_BODY_MAX_TOTAL} exceeded`
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
  if (/\b(memory|rag|recall|retrieval|context|eot|neuron)\b/.test(text)) hints.push('memory-navigation', 'retrieval', 'reduce-and-learn')
  if (/\b(skill|skills|capability|trigger|routing|recall)\b/.test(text)) hints.push('skill-recall', 'orchestration')
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
  if (/\b(code|test|refactor|script|kernel|loader|mjs|js|ts)\b/.test(text)) signals.push('code')
  if (/\b(risk|guard|protected|security|audit|failure|critical|production)\b/.test(text)) signals.push('risk')
  if (/\b(memory|rag|recall|retrieval|context|eot|neuron)\b/.test(text)) signals.push('memory')
  if (/\b(research|source|citation|paper|msa|web|browser)\b/.test(text)) signals.push('research', 'docs')
  if (/\b(design|visual|presentation|html|ui|ux)\b/.test(text)) signals.push('design')
  if (/\b(campaign|supercharge|forensic|symbiotic|shintai)\b/.test(text)) signals.push('campaign')
  return unique(signals)
}

function writeManifest(registry) {
  const manifest = {}
  for (const skill of registry.skills) {
    manifest[skill.name] = {
      source_path: skill.source_path,
      hash: skill.hash,
    }
  }
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n')
  stdout.write('Wrote manifest: ' + MANIFEST_PATH + ' (' + registry.skills.length + ' entries)\n')
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
  return surface?.sourceType === 'yuri_skill'
}

function isReferenceOnlySkill(skill) {
  return skill?.source_type === 'codex_plugin_cache_skill' ||
    isReferenceOnlySourcePath(skill?.source_path)
}

function isReferenceOnlySourcePath(sourcePath = '') {
  return String(sourcePath || '').startsWith('.codex/plugins/cache/')
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
