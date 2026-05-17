#!/usr/bin/env node

/**
 * yuri-skill-loader.mjs — Yuri skill/doctrine discovery prototype
 *
 * Discovers skill files from Yuri's doctrine surfaces and normalises
 * them into a structured in-memory registry.
 *
 * Reference pattern: OpenClaw ~/.openclaw/workspace/skills/<name>/SKILL.md
 * Initial substrate: .cline/rules/*.md and .claude/skills/*
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
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest
 *   node _SYSTEM/Scripts/yuri-skill-loader.mjs --help
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { stdout, stderr } from 'node:process'

const REPO_ROOT = '/Users/marcelspatz/YURI-OS-MUSUBI'
const MANIFEST_PATH = path.join(REPO_ROOT, '_SYSTEM', 'skill-hash-registry.json')

// Discovery paths (order = precedence; first match wins for duplicate names)
const DISCOVERY_PATHS = [
  { prefix: '.cline/rules', sourceType: 'cline_rule', kind: 'flat_md' },
  { prefix: '.claude/skills', sourceType: 'claude_skill', kind: 'flat_md' },
  { prefix: '.claude/skills', sourceType: 'claude_skill', kind: 'skill_md' },
  // Future OpenClaw-style expansion can reuse kind=skill_md for skills/<name>/SKILL.md.
]

const PREVIEW_LINES = 20

// Body injection size limits (tunable)
const SKILL_BODY_MAX_PER_SKILL = 5000  // max chars per skill body
const SKILL_BODY_MAX_TOTAL = 15000      // max chars across all skill bodies

main()

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
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --write-manifest',
    '  node _SYSTEM/Scripts/yuri-skill-loader.mjs --help',
    '',
    'Discovery paths:',
    '  .cline/rules/*.md (current)',
    '  .claude/skills/*.md (current)',
    '  .claude/skills/<name>/SKILL.md (current)',
  ].join('\n') + '\n')
}

function buildRegistry() {
  const skills = []
  const seen = new Map()

  for (const surface of DISCOVERY_PATHS) {
    const surfacePath = path.join(REPO_ROOT, surface.prefix)
    if (!existsSync(surfacePath)) continue

    for (const discovered of discoverSurfaceFiles(surface, surfacePath)) {
      const { skillName, sourcePath } = discovered
      const stat = statSync(sourcePath)

      if (!stat.isFile()) continue

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
      skills.push(skill)
    }
  }

  return { skills, discovered_at: new Date().toISOString(), count: skills.length }
}

function discoverSurfaceFiles(surface, surfacePath) {
  const discovered = []

  if (surface.kind === 'flat_md') {
    const entries = readdirSync(surfacePath, { withFileTypes: true })
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

  return discovered
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

  // Check for collisions
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

    if (!entry) {
      status = 'UNREGISTERED'
      unregisteredCount++
      detail = 'not in manifest'
    } else if (entry.hash !== skill.hash) {
      status = 'DRIFT'
      driftCount++
      detail = 'manifest=' + entry.hash + ' disk=' + skill.hash
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
      results.push({
        name,
        source_path: entry.source_path || 'unknown',
        hash: entry.hash,
        status: 'MISSING',
        detail: 'in manifest but not found on disk',
      })
      missingCount++
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

  // Exit non-zero on DRIFT, MISSING, or collision
  if (driftCount > 0 || missingCount > 0 || hasCollision) {
    process.exit(1)
  }
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
