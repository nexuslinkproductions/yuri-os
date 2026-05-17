#!/usr/bin/env node

/**
 * yuri-research-capture.mjs — Zero-install Yuri research capture
 *
 * Uses only Node built-ins + osascript (macOS built-in).
 * No npm installs, no Playwright/Chromium, no paid tools.
 *
 * Modes:
 *   --help                          Print usage
 *   --init-archive                  Init archive dir + manifest + source registry
 *   --fetch-url <url> --out <file>  Fetch public URL to compact Markdown evidence pack
 *     --source-type <type>          official|standard|repo|article|unknown
 *   --capture-browser-text          Capture active browser tab text via osascript
 *     --browser <safari|chrome>     Which browser (default: safari)
 *     --out <file>                  Output file (optional, prints to stdout)
 */

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stdout, stderr } from 'node:process'

const ARCHIVE_ROOT = '_SYSTEM/research-archive/yuri-enterprise-ai-os-2026-05'
const MAX_FETCH_BYTES = 200000
const MAX_EXTRACT_LINES = 120
const EXCERPT_MAX_CHARS = 200
const VERSION = '0.1.0'

main()

function main() {
  const args = process.argv.slice(2)
  if (args.length === 0 || args[0] === '--help') { printHelp(); return }
  if (args[0] === '--init-archive') { initArchive(); return }
  if (args[0] === '--fetch-url') {
    const url = getArg(args, 1, '--fetch-url requires a URL')
    const outFile = getArgExt(args, '--out')
    const sourceType = getArgExt(args, '--source-type') || 'unknown'
    fetchUrl(url, outFile, sourceType)
    return
  }
  if (args[0] === '--capture-browser-text') {
    const browser = getArgExt(args, '--browser') || 'safari'
    const outFile = getArgExt(args, '--out')
    captureBrowserText(browser, outFile)
    return
  }
  stderr.write(`Unknown flag: ${args[0]}\n`)
  process.exit(1)
}

function getArg(argv, index, errorMsg) {
  if (index < argv.length && !argv[index].startsWith('--')) return argv[index]
  stderr.write(errorMsg + '\n'); process.exit(1)
}

function getArgExt(argv, flag) {
  const idx = argv.indexOf(flag)
  if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1]
  return ''
}

function printHelp() {
  stdout.write([
    'Yuri Research Capture v' + VERSION,
    'Zero-install, token-cheap research capture.',
    '',
    'Usage:',
    '  node _SYSTEM/Scripts/yuri-research-capture.mjs --help',
    '  node _SYSTEM/Scripts/yuri-research-capture.mjs --init-archive',
    '  node _SYSTEM/Scripts/yuri-research-capture.mjs --fetch-url <url> --out <file> [--source-type <type>]',
    '  node _SYSTEM/Scripts/yuri-research-capture.mjs --capture-browser-text --browser <safari|chrome> [--out <file>]',
    '',
    'Source types: official, standard, repo, article, unknown',
    'Browser: safari (default), chrome',
  ].join('\n') + '\n')
}

function initArchive() {
  const archiveDir = path.resolve(ARCHIVE_ROOT)
  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true })
    stdout.write('Created archive dir: ' + archiveDir + '\n')
  } else {
    stdout.write('Archive dir exists: ' + archiveDir + '\n')
  }

  const now = new Date().toISOString().split('T')[0]

  const manifestPath = path.join(archiveDir, '00_manifest.md')
  if (!existsSync(manifestPath)) {
    const m = [
      '# Yuri Enterprise AI OS — Research Archive',
      '',
      '**Date**: ' + now,
      '**Archive status**: REFERENCE_ONLY until approved',
      '**advisory_only**: true',
      '**local_truth_claim**: false',
      '',
      '## Purpose',
      '',
      'Enterprise-grade research archive for Yuri OS.',
      '',
      '## Governance',
      '',
      '- Canonical origin: `_SYSTEM/yuri-origin.md`',
      '- Content governance: `_SYSTEM/yuri-content-governance.md`',
      '- Evidence contract: `_SYSTEM/Scripts/yuri-evidence-contract.mjs`',
      '',
      '## Rules',
      '',
      '- No RAG ingestion without explicit owner approval.',
      '- All sources carry provenance.',
      '- Model output is advisory_only=true and local_truth_claim=false.',
      '- External corpora are never authority by default.',
      '',
      '## Source Count',
      '',
      '- Total sources: 0 (placeholder)',
      '- See 01_source_registry.md.',
      '',
      '## Files',
      '',
      '| File | Status | Content |',
      '|---|---|---|',
      '| 00_manifest.md | CURRENT | This file |',
      '| 01_source_registry.md | CURRENT | Source registry |',
      '| 02_capture_pipeline.md | CURRENT | Capture pipeline design |',
      '| 03+ | PLANNED | Enterprise governance, security, etc. |',
      '',
    ]
    writeFileSync(manifestPath, m.join('\n') + '\n')
    stdout.write('Created: ' + manifestPath + '\n')
  } else {
    stdout.write('Manifest exists: ' + manifestPath + '\n')
  }

  const registryPath = path.join(archiveDir, '01_source_registry.md')
  if (!existsSync(registryPath)) {
    const r = [
      '# Source Registry',
      '',
      '## Source Status Values',
      '',
      '| Status | Meaning |',
      '|---|---|',
      '| PLANNED | Identified but not yet fetched |',
      '| FETCHED | Captured to evidence pack |',
      '| READY_FOR_REVIEW | Reviewed, ready for human review |',
      '| READY_FOR_RAG_AFTER_APPROVAL | Approved for RAG ingestion |',
      '| REFERENCE_ONLY | Archived, not eligible for RAG |',
      '| DO_NOT_INGEST_RAW | Raw source only; no RAG unfiltered |',
      '',
      '## Sources',
      '',
      '| URL | Tier | Type | Status | License Note | Confidence |',
      '|---|---|---|---|---|---|',
      '| _placeholder_ | -- | -- | PLANNED | -- | -- |',
      '',
    ]
    writeFileSync(registryPath, r.join('\n') + '\n')
    stdout.write('Created: ' + registryPath + '\n')
  } else {
    stdout.write('Registry exists: ' + registryPath + '\n')
  }

  stdout.write('INIT_ARCHIVE_OK\n')
}

async function fetchUrl(url, outFile, sourceType) {
  const now = new Date().toISOString()
  const startTime = Date.now()
  let response
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'YuriResearchCapture/0.1.0 (educational research)' },
    })
  } catch (err) {
    stderr.write('FETCH_FAILED: ' + err.message + '\n'); process.exit(1)
  }
  const contentType = response.headers.get('content-type') || ''
  const statusCode = response.status
  const duration = Date.now() - startTime
  if (!response.ok) {
    stderr.write('FETCH_FAILED: HTTP ' + response.status + ' ' + response.statusText + '\n'); process.exit(1)
  }
  let rawText
  try { rawText = await response.text() } catch (err) {
    stderr.write('READ_FAILED: ' + err.message + '\n'); process.exit(1)
  }
  if (rawText.length > MAX_FETCH_BYTES) rawText = rawText.slice(0, MAX_FETCH_BYTES)
  const contentHash = createHash('sha256').update(rawText).digest('hex').slice(0, 16)
  const cleaned = rawText
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const lines = cleaned.match(/.{1,200}(?:\s|$)/g) || []
  const excerptLines = lines.slice(0, MAX_EXTRACT_LINES)
  const out = []
  out.push('# Yuri Research Capture — Evidence Pack')
  out.push('')
  out.push('**URL**: ' + url)
  out.push('**Fetched**: ' + now)
  out.push('**Content-Type**: ' + contentType)
  out.push('**HTTP Status**: ' + statusCode)
  out.push('**Duration**: ' + duration + 'ms')
  out.push('**Source Type**: ' + sourceType)
  out.push('**Content Hash**: ' + contentHash)
  out.push('**Tool**: yuri-research-capture.mjs v' + VERSION)
  out.push('**License Note**: unknown (determine from source)')
  out.push('**Confidence**: preliminary — review required')
  out.push('**advisory_only**: true')
  out.push('**local_truth_claim**: false')
  out.push('')
  out.push('## Extraction')
  out.push('')
  out.push('- **Raw bytes**: ' + rawText.length)
  out.push('- **Cleaned lines**: ' + lines.length)
  out.push('- **Excerpt lines**: ' + excerptLines.length)
  out.push('')
  out.push('## Excerpt')
  out.push('')
  out.push('```')
  for (const line of excerptLines) out.push(line)
  out.push('```')
  out.push('')
  const content = out.join('\n')
  if (outFile) {
    const outPath = path.resolve(outFile)
    writeFileSync(outPath, content)
    stdout.write('FETCH_OK written=' + outPath + ' bytes=' + content.length + ' hash=' + contentHash + '\n')
  } else {
    stdout.write(content)
  }
}

function captureBrowserText(browser, outFile) {
  if (!['safari', 'chrome'].includes(browser)) {
    stderr.write('Unsupported browser: ' + browser + '. Use safari or chrome.\n'); process.exit(1)
  }
  const now = new Date().toISOString()
  let script, useJavaScript = false
  if (browser === 'safari') {
    script = [
      'tell application "System Events"',
      '  set isRunning to (name of processes) contains "Safari"',
      'end tell',
      'if isRunning then',
      '  tell application "Safari"',
      '    set pageURL to URL of front document',
      '    set pageTitle to name of front document',
      '    set pageText to text of front document',
      '    return pageURL & "|||" & pageTitle & "|||" & pageText',
      '  end tell',
      'end if',
    ].join('\n')
  } else {
    useJavaScript = true
    script = [
      'var chrome = Application("Google Chrome");',
      'if (chrome.running()) {',
      '  var tab = chrome.windows[0].activeTab();',
      '  var url = tab.url();',
      '  var title = tab.title();',
      '  var text = tab.text();',
      '  url + "|||" + title + "|||" + text',
      '}',
    ].join('\n')
  }
  let output
  try {
    const args = useJavaScript ? ['-l', 'JavaScript', '-e'] : ['-e']
    output = execSync('osascript', args, {
      input: script, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 10000,
    })
  } catch (err) {
    stderr.write('BROWSER_CAPTURE_FAILED: ' + err.message + '\n'); process.exit(1)
  }
  const trimmed = output.trim()
  const sep = trimmed.indexOf('|||')
  if (sep === -1) { stderr.write('BROWSER_CAPTURE_FAILED: unexpected output\n'); process.exit(1) }
  const url = trimmed.slice(0, sep)
  const rest = trimmed.slice(sep + 3)
  const sep2 = rest.indexOf('|||')
  const title = sep2 >= 0 ? rest.slice(0, sep2) : rest
  const pageText = sep2 >= 0 ? rest.slice(sep2 + 3) : ''
  const contentHash = createHash('sha256').update(pageText).digest('hex').slice(0, 16)
  const excerpt = pageText.slice(0, EXCERPT_MAX_CHARS)
  const out = []
  out.push('# Yuri Research Capture — Browser Text')
  out.push('')
  out.push('**URL**: ' + url)
  out.push('**Title**: ' + title)
  out.push('**Captured**: ' + now)
  out.push('**Browser**: ' + browser)
  out.push('**Content Hash**: ' + contentHash)
  out.push('**advisory_only**: true')
  out.push('**local_truth_claim**: false')
  out.push('')
  out.push('## Excerpt')
  out.push('')
  out.push('```')
  out.push(excerpt)
  out.push('```')
  out.push('')
  const content = out.join('\n')
  if (outFile) {
    const outPath = path.resolve(outFile)
    writeFileSync(outPath, content)
    stdout.write('BROWSER_CAPTURE_OK written=' + outPath + ' hash=' + contentHash + '\n')
  } else {
    stdout.write(content)
  }
}
