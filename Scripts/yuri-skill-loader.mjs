#!/usr/bin/env node

/**
 * yuri-skill-loader.mjs — Yuri skill/doctrine discovery prototype
 *
 * Discovers skill files from Yuri's doctrine surfaces and normalises
 * them into a structured in-memory registry.
 *
 * Reference pattern: OpenClaw ~/.openclaw/workspace/skills/<name>/SKILL.md
 * Initial substrate: .cline/rules/*.md
 *
 * This is a discovery/normalisation prototype only.
 * No runtime skill execution. No plugin API. No session integration.
 *
 * Usage:
 *   node Scripts/yuri-skill-loader.mjs --list
 *   node Scripts/yuri-skill-loader.mjs --skill <name>
 *   node Scripts/yuri-skill-loader.mjs --json
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { stdout, stderr } from 'node:process'

const REPO_ROOT = '/Users/marcelspatz/NUDIMMUD'

// Discovery paths (order = precedence; first match wins for duplicate names)
const DISCOVERY_PATHS = [
  { prefix: '.cline/rules', sourceType: 'cline_rule', pattern: /^(.+)\.md$/ },
  // Future OpenClaw-style expansion:
  // { prefix: 'skills', sourceType: 'openclaw_skill', pattern: /^([^/]+)\/SKILL\.md$/ },
]

const PREVIEW_LINES = 20

main()

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help') {
    printHelp()
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

  stderr.write(`Unknown flag: ${args[0]}\n`)
  process.exit(1)
}

function printHelp() {
  stdout.write([
    'Yuri Skill Loader — doctrine discovery prototype',
    '',
    'Usage:',
    '  node Scripts/yuri-skill-loader.mjs --list',
    '  node Scripts/yuri-skill-loader.mjs --skill <name>',
    '  node Scripts/yuri-skill-loader.mjs --json',
    '  node Scripts/yuri-skill-loader.mjs --help',
    '',
    'Discovery paths:',
    '  .cline/rules/*.md (current)',
    '  skills/<name>/SKILL.md (future, OpenClaw-style)',
  ].join('\n') + '\n')
}

function buildRegistry() {
  const skills = []
  const seen = new Map()

  for (const surface of DISCOVERY_PATHS) {
    const surfacePath = path.join(REPO_ROOT, surface.prefix)
    if (!existsSync(surfacePath)) continue

    const entries = readdirSync(surfacePath, { withFileTypes: true })

    for (const entry of entries) {
      const match = entry.name.match(surface.pattern)
      if (!match) continue

      const skillName = match[1]
      const sourcePath = path.join(surfacePath, entry.name)
      const stat = statSync(sourcePath)

      if (!stat.isFile()) continue

      const body = readFileSync(sourcePath, 'utf8')
      const hash = createHash('sha256').update(body).digest('hex').slice(0, 16)
      const loadedAt = new Date().toISOString()

      const skill = {
        name: skillName,
        source_path: path.join(surface.prefix, entry.name),
        source_type: surface.sourceType,
        body,
        hash,
        loaded_at: loadedAt,
      }

      if (seen.has(skillName)) {
        // Prefer first-encountered (higher precedence in DISCOVERY_PATHS)
        const existing = seen.get(skillName)
        skill.collision = true
        skill.collision_with = existing.source_path
        existing.collision = true
        existing.collision_with = skill.source_path
        // Don't add duplicate — keep existing (first wins)
        continue
      }

      seen.set(skillName, skill)
      skills.push(skill)
    }
  }

  return { skills, discovered_at: new Date().toISOString(), count: skills.length }
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
    stderr.write(`SKILL_NOT_FOUND: ${name}\n`)
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
