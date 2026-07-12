#!/usr/bin/env node
// @capability: mure-fleet-validate
// @serves: mure fleet integrity test | catalog dispatch-resolvability | cline roster check | armed-state gate | agents.list dangling-ref detector | OMP projection drift gate | canary-evidence gate
// @does: TDD regression anchor for the MURE fleet — validates Cline targets/arming, bounded role schemas, Sol variants, MURE-native card authority, generated OMP projection integrity (exact byte-for-byte drift against the generator's own renderers), and canary-proven provider route evidence. Exits non-zero on any failure.
// @use: node mure-fleet-validate.mjs  (CI/regression gate after any catalog/provider/roster change)
// @exports: validateFleet, validateOmpProjection, validateCanaryEvidence, validateAgentCardAuthority, DISABLED_MODEL_SELECTOR
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CLINE_ROSTER, isArmed as clineArmed } from './cline-fleet.mjs';
import { FORBIDDEN_SELECTOR_PREFIXES, OMP_THINKING_LEVELS, isAdmissibleCanaryEvidence } from '../mure/omp-model-resolver.mjs';
import {
  buildOmpProjection,
  DISABLED_MODEL_SELECTOR,
  renderOmpAgent,
  renderProjectConfig,
  renderProjectionManifest,
  isOwnedAgentFile,
  isOwnedConfig,
  isOwnedManifest,
  assertPathChainSafe,
} from './mure-omp-sync.mjs';

export { DISABLED_MODEL_SELECTOR };

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CATALOG = path.join(REPO, '_SYSTEM/mure/agent-catalog.json');
const MURE_AGENT_DIR = path.join(REPO, '_SYSTEM/mure', 'agents');
const OMP_AGENT_DIR = path.join(REPO, '.omp', 'agents');
const OMP_ROOT = path.join(REPO, '.omp');
const OMP_CONFIG = path.join(REPO, '.omp', 'config.yml');
const OMP_PROJECTION_STATE = path.join(REPO, '_SYSTEM', 'state', 'mure-omp-projection.json');
const PROVIDER_ROUTE_REGISTRY_PATH = path.join(REPO, '_SYSTEM', 'config', 'provider-route-registry.json');

// Thinking-level vocabulary is resolver-owned — never duplicated locally.
const THINKING_LEVELS = new Set(OMP_THINKING_LEVELS);
const COST_TIERS = new Set(['cheap', 'medium', 'heavy', 'apex']);

// The 4 models Marcel targets on ClinePass (cheap: dvf+mimo; heavy: qwen3.7-max+kimi).
const CLINE_TARGETS = [
  'cline-pass/deepseek-v4-flash',
  'cline-pass/mimo-v2.5',
  'cline-pass/qwen3.7-max',
  'cline-pass/kimi-k2.7-code',
];


/** Collect skill ids available from workspace registries. */
function knownSkillIds() {
  const roots = [
    path.join(REPO, 'skills'),
    path.join(REPO, '.claude', 'skills'),
    path.join(REPO, '.codex', 'skills'),
  ];
  const known = new Set();
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const id of fs.readdirSync(root)) {
      if (fs.existsSync(path.join(root, id, 'SKILL.md'))) known.add(id);
    }
  }
  return known;
}

/** Normalize CRLF to LF so Windows-authored or accidentally-CRLF projection
 *  artifacts never cause false ownership/name/drift mismatches. */
function normalizeCRLF(content) {
  return content == null ? content : content.replace(/\r\n/g, '\n');
}

/**
 * NOTE: exact-content comparison for agent cards and config.yml uses plain
 * `normalizeCRLF` — NO long→short ownership-marker folding. This mirrors
 * mure-omp-sync.mjs's OWN `check()` contract exactly (`existingConfig !==
 * expectedConfig` after only a CRLF normalize; renderOmpAgent/
 * renderProjectConfig always emit the SHORT marker). A LONG-marker artifact
 * is therefore `owned` (isOwnedAgentFile/isOwnedConfig accept LONG as a
 * valid generator marker) but CONTENT-DRIFTED — exactly what `sync` itself
 * would report and what a plain `sync` re-run would repair to SHORT. It is
 * never reported as unowned.
 */

/**
 * Whether a projection artifact path is present as a filesystem entry —
 * checked with `lstatSync` (never follows the final symlink) rather than
 * `existsSync` (which follows it and reports a dangling symlink as absent).
 * A dangling symlink at OMP_AGENT_DIR/OMP_CONFIG/OMP_PROJECTION_STATE must
 * still be treated as "present but unreadable" so the guarded readdir/read
 * below produces a deterministic `*-read-error` diagnostic instead of the
 * artifact silently vanishing into a `*-missing`/absent finding.
 */
function artifactPresent(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch (e) {
    if (e && e.code === 'ENOENT') return false;
    // Any other lstat failure (e.g. EACCES on a path segment) still means
    // "something is there but unreadable" — let the guarded read surface
    // the deterministic read-error diagnostic rather than a false "missing".
    return true;
  }
}

/** Structural deep-equality: object key sets + values (order-insensitive for
 *  objects), array order-sensitive. Used for full manifest comparison so
 *  drift in any nested field — provenance, per-card fields, array order,
 *  counts — is caught, not just aggregate counts. */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

function readAgentCardName(filePath) {
  const source = normalizeCRLF(fs.readFileSync(filePath, 'utf8'));
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatter) return null;
  const name = frontmatter[1].match(/^name:\s*["']?([^"'\n]+)["']?\s*$/m);
  return name ? name[1].trim() : null;
}

function listFilesRecursive(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...listFilesRecursive(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

export function validateAgentCardAuthority(catalog, options = {}) {
  const mureAgentDir = options.mureAgentDir || MURE_AGENT_DIR;
  const ompRoot = options.ompRoot || OMP_ROOT;
  const nativeCards = new Set(
    fs.existsSync(mureAgentDir)
      ? fs.readdirSync(mureAgentDir).filter((name) => name.endsWith('.md'))
      : [],
  );
  const catalogNames = new Set(catalog.agents.map((agent) => agent.name));
  const problems = [];

  for (const agent of catalog.agents) {
    const filename = `${agent.name}.md`;
    if (!nativeCards.has(filename)) {
      problems.push(`missing:${filename}`);
      continue;
    }
    const cardName = readAgentCardName(path.join(mureAgentDir, filename));
    if (cardName !== agent.name) problems.push(`name-mismatch:${filename}:${cardName ?? '<missing-name>'}`);
  }
  for (const filename of nativeCards) {
    const name = filename.slice(0, -3);
    if (!catalogNames.has(name)) problems.push(`uncatalogued:${filename}`);
  }

  // Narrowed: only flag OMP mure-* files OUTSIDE the projection agents/ dir.
  // Generated projection files inside .omp/agents/ are validated by validateOmpProjection.
  const ompMureFiles = listFilesRecursive(ompRoot)
    .filter((file) => {
      const rel = path.relative(REPO, file);
      // Skip the projection directory — validated separately
      if (rel.startsWith('.omp/agents/')) return false;
      return path.basename(file).startsWith('mure-');
    })
    .map((file) => path.relative(REPO, file));
  problems.push(...ompMureFiles.map((name) => `retired-omp-mure-file:${name}`));
  if (catalog.agentCardRoot !== '_SYSTEM/mure/agents') {
    problems.push(`agentCardRoot:${catalog.agentCardRoot ?? '<missing>'}`);
  }
  if (String(catalog.source || '').includes('.omp/agents')) problems.push('catalog-source-still-omp');
  return problems;
}

// ── OMP Projection helpers ────────────────────────────────────────────────

/** Parse YAML frontmatter from an agent .md file. Returns null on parse failure.
 *  CRLF-safe: the source is normalized to LF before any line-based parsing. */
function parseOmpAgentFrontmatter(source) {
  const normalized = normalizeCRLF(source);
  // Frontmatter is `---\n...\n---` after the opening fence
  const m = normalized.match(/---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  const lines = m[1].split('\n');
  let listKey = null;
  let listAcc = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (listKey && /^-\s+/.test(trimmed)) {
      listAcc.push(trimmed.replace(/^-\s+/, ''));
      continue;
    }

    // Key-value line: close any open list
    if (listKey) {
      fm[listKey] = listAcc;
      listKey = null;
      listAcc = null;
    }

    const kv = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();

    if (val === '') {
      // Empty value — could be the start of a nested list
      listKey = key;
      listAcc = [];
      continue;
    }

    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Strip trailing YAML array brackets for simple lists
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    fm[key] = val;
  }

  // Close any trailing list
  if (listKey) {
    fm[listKey] = listAcc;
  }

  return fm;
}

/**
 * Normalize a spawns value for comparison.
 * - '*' or array → identity token (arrays are mismatch in scalar contract)
 * - scalar string → comma-split/trim/filter/join(', ') to canonical form
 * - anything else → JSON-stringified for diagnostic
 */
function normalizeSpawns(value) {
  if (value === '*') return '*';
  if (Array.isArray(value)) return '<non-scalar>' + JSON.stringify(value);
  if (typeof value === 'string') {
    return value.split(',').map(s => s.trim()).filter(Boolean).join(', ');
  }
  return '<non-scalar>' + JSON.stringify(value);
}

/** Parse OMP config.yml into a flat map of dotted keys (e.g. "task.disabledAgents" → array). */
function parseOmpConfig(source) {
  const result = {};
  const lines = normalizeCRLF(source).split('\n');
  let currentSection = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      // Top-level key
      const m = trimmed.match(/^(\w[\w-]*):\s*(.*)/);
      if (m) {
        currentSection = m[1];
        const val = m[2].trim();
        if (val) result[currentSection] = val;
        else result[currentSection] = {};
      }
    } else if (currentSection) {
      // Indented key under current section
      const listItem = trimmed.match(/^-\s+(.*)/);
      if (listItem) {
        const arrKey = `${currentSection}.list`;
        if (!result[arrKey]) result[arrKey] = [];
        result[arrKey].push(listItem[1].trim());
      } else {
        const m = trimmed.match(/^(\w[\w-]*):\s*(.*)/);
        if (m) {
          result[`${currentSection}.${m[1]}`] = m[2].trim();
        }
      }
    }
  }
  // Hoist known list keys
  if (result['task.list']) { result['task.disabledAgents'] = result['task.list']; delete result['task.list']; }
  return result;
}

/**
 * Validate the generated OMP projection artifacts (.omp/agents/*.md, .omp/config.yml,
 * _SYSTEM/state/mure-omp-projection.json) against the live catalog.
 *
 * Derives the canonical card set from `buildOmpProjection(catalog)` — the single
 * source for normalized names, collision qualification, resolver status, and tool
 * translation. Every artifact is additionally compared BYTE-FOR-BYTE (after
 * CRLF-to-LF normalization only — no ownership-marker folding; a LONG-marker
 * artifact remains recognized ownership but shows as byte-content drift)
 * against the
 * generator's own renderers (`renderOmpAgent`, `renderProjectConfig`,
 * `renderProjectionManifest`) — this is the only way to catch nonempty
 * description drift, an omitted/extra field, or provenance corruption that a
 * purely aggregate/count-based check would miss. Granular field-level
 * diagnostics are retained alongside the exact-match diagnostics because they
 * pinpoint which field drifted.
 *
 * A SyncError from the generator (e.g. missing variant model) is reported as
 * source-invalid instead of crashing.
 *
 * Read-only: never writes, never mutates.
 * Returns an array of problem strings (empty = clean).
 */
export function validateOmpProjection(catalog) {
  const problems = [];

  // ── Build projection from catalog (canonical source of truth) ─────────
  let projection;
  try {
    projection = buildOmpProjection(catalog);
  } catch (e) {
    if (e.name === 'SyncError') {
      problems.push(`omp-source-invalid:${e.message}`);
      return problems;
    }
    // Unexpected errors (import failures, runtime bugs) must surface, not masquerade as source-invalid
    throw e;
  }

  // Normalized lookup maps
  const cardByFilename = new Map();      // filename → card
  const expectedFilenames = new Set();   // every projected filename
  const executableFilenames = new Set(); // filenames of OK cards
  const disabledFilenames = new Set();   // filenames of FAIL_CLOSED cards

  for (const card of projection.cards) {
    cardByFilename.set(card.filename, card);
    expectedFilenames.add(card.filename);
  }
  for (const card of projection.okCards) {
    executableFilenames.add(card.filename);
  }
  for (const card of projection.disabledCards) {
    disabledFilenames.add(card.filename);
  }

  // Track discovered agent file stems
  const discoveredIds = new Set();

  const hasAgents = artifactPresent(OMP_AGENT_DIR);
  const hasConfig = artifactPresent(OMP_CONFIG);
  const hasState = artifactPresent(OMP_PROJECTION_STATE);

  // ── Absent-projection gate ─────────────────────────────────────────────
  // A nonempty catalog projects at least one card; if NO artifact exists at
  // all (agents dir, config, and state all absent), the projection is
  // entirely missing and must fail loud rather than pass silently. An empty
  // catalog with no artifacts is explicitly fine — nothing was ever owed.
  if (projection.cards.length > 0 && !hasAgents && !hasConfig && !hasState) {
    problems.push(`omp-projection-absent:${projection.cards.length}`);
  }

  // ── Validate .omp/agents/*.md ─────────────────────────────────────────
  let agentFiles = null;
  if (hasAgents) {
    try {
      assertPathChainSafe(OMP_AGENT_DIR, '.omp/agents', REPO);
      agentFiles = fs.readdirSync(OMP_AGENT_DIR).filter((name) => name.endsWith('.md'));
    } catch (e) {
      problems.push(e && e.name === 'SyncError' ? 'omp-agents-unsafe-path' : 'omp-agents-read-error');
    }
    const seenFrontmatterNames = new Map(); // frontmatter name → filename

    for (const filename of (agentFiles || [])) {
      const stem = filename.slice(0, -3); // strip .md

      if (discoveredIds.has(stem)) {
        problems.push(`omp-agent-duplicate:${filename}`);
        continue;
      }
      discoveredIds.add(stem);

      const filePath = path.join(OMP_AGENT_DIR, filename);
      let source;
      try {
        assertPathChainSafe(filePath, `.omp/agents/${filename}`, REPO);
        source = fs.readFileSync(filePath, 'utf8');
      } catch (e) {
        problems.push(e && e.name === 'SyncError' ? `omp-agent-unsafe-path:${filename}` : `omp-agent-read-error:${filename}`);
        if (!expectedFilenames.has(stem)) {
          problems.push(`omp-agent-stale:${filename}`);
        }
        continue;
      }

      // Ownership marker — reuse the generator's own structural gate rather
      // than a locally-duplicated regex.
      if (!isOwnedAgentFile(source)) {
        problems.push(`omp-agent-no-ownership:${filename}`);
      }

      // Must be an expected card (by normalized filename)
      if (!expectedFilenames.has(stem)) {
        problems.push(`omp-agent-stale:${filename}`);
        continue;
      }

      const card = cardByFilename.get(stem);

      // Exact-content gate: complete canonical bytes vs the generator's own
      // renderer. Applied independently of ownership/frontmatter parse
      // success below, so a malformed-but-expected card still surfaces the
      // authoritative mismatch diagnostic rather than only granular ones.
      if (card) {
        const expectedContent = renderOmpAgent(card);
        const actualContent = normalizeCRLF(source);
        if (actualContent !== expectedContent) {
          problems.push(`omp-agent-content-mismatch:${filename}`);
        }
      }

      // Frontmatter required fields
      const fm = parseOmpAgentFrontmatter(source);
      if (!fm) {
        problems.push(`omp-agent-no-frontmatter:${filename}`);
        continue;
      }

      // agentId must never appear in frontmatter (evidence belongs in manifest only)
      if ('agentId' in fm) {
        problems.push(`omp-agent-has-agentId:${filename}`);
      }

      if (!fm.name) {
        problems.push(`omp-agent-missing-name:${filename}`);
      } else {
        if (fm.name !== stem) {
          problems.push(`omp-agent-name-mismatch:${filename} frontmatter="${fm.name}" expected="${stem}"`);
        }
        if (seenFrontmatterNames.has(fm.name)) {
          const otherFile = seenFrontmatterNames.get(fm.name);
          problems.push(`omp-agent-name-collision:${filename} and ${otherFile} both declare name="${fm.name}"`);
        } else {
          seenFrontmatterNames.set(fm.name, filename);
        }
      }
      if (!fm.description) problems.push(`omp-agent-missing-description:${filename}`);

      // Tools must match the generator's translated allowlist exactly
      if (!card) continue;

      const expectedTools = card.tools ?? [];
      const actualTools = ('tools' in fm) ? (Array.isArray(fm.tools) ? fm.tools : null) : [];
      if (actualTools === null) {
        problems.push(`omp-agent-tools-not-array:${stem}`);
      } else {
        const toolsMatch = expectedTools.length === actualTools.length &&
          expectedTools.every((t, i) => actualTools[i] === t);
        if (!toolsMatch) {
          problems.push(`omp-agent-tools-mismatch:${stem} got=${JSON.stringify(actualTools)} expected=${JSON.stringify(expectedTools)}`);
        }
      }

      // thinkingLevel: must match projection, including omission when null/off
      const projectedTL = card.thinkingLevel;
      const renderableTL = (projectedTL && projectedTL !== 'off') ? projectedTL : null;
      const hasTL = 'thinkingLevel' in fm;
      if (renderableTL) {
        if (!hasTL) {
          problems.push(`omp-agent-missing-thinkingLevel:${stem} expected="${renderableTL}"`);
        } else if (fm.thinkingLevel !== renderableTL) {
          problems.push(`omp-agent-thinkingLevel-mismatch:${stem} got="${fm.thinkingLevel}" expected="${renderableTL}"`);
        }
      } else if (hasTL) {
        problems.push(`omp-agent-unexpected-thinkingLevel:${stem} got="${fm.thinkingLevel}" (expected omitted)`);
      }

      // spawns: must match projection, including omission, with symmetric token normalization
      const projectedSpawns = card.spawns || null;
      const hasSpawns = 'spawns' in fm;
      if (projectedSpawns) {
        if (!hasSpawns) {
          problems.push(`omp-agent-missing-spawns:${stem} expected="${projectedSpawns}"`);
        } else {
          const normProjected = normalizeSpawns(projectedSpawns);
          const normActual = normalizeSpawns(fm.spawns);
          if (normProjected !== normActual) {
            problems.push(`omp-agent-spawns-mismatch:${stem} got="${normActual}" expected="${normProjected}"`);
          }
        }
      } else if (hasSpawns) {
        problems.push(`omp-agent-unexpected-spawns:${stem} got="${fm.spawns}" (expected omitted)`);
      }

      if (card.resolution.status === 'OK') {
        const expectedModel = card.resolution.selector;
        if (!('model' in fm) || !fm.model) {
          problems.push(`omp-agent-missing-model:${stem} (resolves OK as "${expectedModel}")`);
        } else if (fm.model === DISABLED_MODEL_SELECTOR) {
          problems.push(`omp-agent-ok-has-disabled-sentinel:${stem} model="${DISABLED_MODEL_SELECTOR}" (resolves OK as "${expectedModel}")`);
        } else if (fm.model !== expectedModel) {
          problems.push(`omp-agent-model-mismatch:${stem} got="${fm.model}" expected="${expectedModel}"`);
        } else {
          for (const prefix of FORBIDDEN_SELECTOR_PREFIXES) {
            if (fm.model.startsWith(prefix)) {
              problems.push(`omp-agent-forbidden-selector:${stem} model="${fm.model}" (prefix "${prefix}")`);
            }
          }
        }
      } else {
        // FAIL_CLOSED card: must carry exact sentinel model for defense-in-depth.
        // The unregistered "disabled" provider fails locally rather than
        // inheriting/defaulting from stale session settings.
        if (!('model' in fm) || !fm.model) {
          problems.push(`omp-agent-disabled-missing-model:${stem} ${card.resolution.failClass}: ${card.resolution.reason}`);
        } else if (fm.model !== DISABLED_MODEL_SELECTOR) {
          problems.push(`omp-agent-disabled-wrong-model:${stem} got="${fm.model}" expected="${DISABLED_MODEL_SELECTOR}" (${card.resolution.failClass})`);
        }
      }
    }

    if (agentFiles) {
      // Missing expected cards
      for (const fn of expectedFilenames) {
        if (!discoveredIds.has(fn)) {
          problems.push(`omp-agent-missing:${fn}.md`);
        }
      }

      // Count conservation
      if (discoveredIds.size !== expectedFilenames.size) {
        problems.push(`omp-agent-count-mismatch:projected=${discoveredIds.size} expected=${expectedFilenames.size}`);
      }
    }
  }

  // ── Validate .omp/config.yml ──────────────────────────────────────────
  if ((hasConfig || hasState) && !hasAgents) {
    problems.push('omp-agents-missing (config or state present but .omp/agents/ absent)');
  }
  if ((hasAgents || hasState) && !hasConfig) {
    problems.push('omp-config-missing (agents or state present but config.yml absent — disabled-agent safety requires config)');
  }
  if (projection.cards.length > 0 && (hasAgents || hasConfig) && !hasState) {
    problems.push('omp-state-missing (agents or config present but manifest absent)');
  }

  if (hasConfig) {
    let configSource = null;
    try {
      assertPathChainSafe(OMP_CONFIG, '.omp/config.yml', REPO);
      configSource = fs.readFileSync(OMP_CONFIG, 'utf8');
    } catch (e) {
      problems.push(e && e.name === 'SyncError' ? 'omp-config-unsafe-path' : 'omp-config-read-error');
    }

    if (configSource !== null) {
      const firstLine = normalizeCRLF(configSource).split('\n')[0].trim();

      // Ownership marker — reuse the generator's own structural gate.
      if (!isOwnedConfig(configSource)) {
        problems.push(`omp-config-no-ownership:first-line="${firstLine}"`);
      }

      // Exact-content gate: complete canonical bytes vs the generator's own renderer.
      const expectedConfig = renderProjectConfig(projection);
      const actualConfig = normalizeCRLF(configSource);
      if (actualConfig !== expectedConfig) {
        problems.push('omp-config-content-mismatch');
      }

      const cfg = parseOmpConfig(configSource);

      // Generator-owned config must never carry modelRoles.default
      if ('modelRoles.default' in cfg) {
        problems.push('omp-config-has-modelRoles-default (generator-owned config must omit modelRoles.default)');
      }
      // disabledAgents validation — must be an exact set match against projection
      const hasDisabledKey = 'task.disabledAgents' in cfg;
      const rawDisabled = cfg['task.disabledAgents'];

      if (hasDisabledKey) {
        if (!Array.isArray(rawDisabled)) {
          problems.push(`omp-config-disabledAgents-not-array:got=${typeof rawDisabled}`);
        } else {
          // No duplicates
          const seen = new Set();
          for (const id of rawDisabled) {
            if (seen.has(id)) {
              problems.push(`omp-config-disabledAgents-duplicate:${id}`);
            }
            seen.add(id);
          }
          // Set equality: every member must be a disabled card, every disabled card must be present
          const configSet = new Set(rawDisabled);
          for (const id of configSet) {
            if (!expectedFilenames.has(id)) {
              problems.push(`omp-config-disabled-unknown:${id}`);
            }
            if (hasAgents && agentFiles && !discoveredIds.has(id)) {
              problems.push(`omp-config-disabled-not-projected:${id}`);
            }
            if (executableFilenames.has(id)) {
              problems.push(`omp-config-executable-disabled:${id}`);
            }
          }
          for (const id of disabledFilenames) {
            if (!configSet.has(id)) {
              problems.push(`omp-config-missing-disabled:${id}`);
            }
          }
        }
      } else if (disabledFilenames.size > 0) {
        problems.push(`omp-config-no-disabledAgents (${disabledFilenames.size} cards are FAIL_CLOSED but no disabledAgents list in config)`);
      }
    }
  }

  // ── Validate _SYSTEM/state/mure-omp-projection.json ──────────────────
  if (hasState) {
    let stateSource = null;
    try {
      assertPathChainSafe(OMP_PROJECTION_STATE, '_SYSTEM/state/mure-omp-projection.json', REPO);
      stateSource = fs.readFileSync(OMP_PROJECTION_STATE, 'utf8');
    } catch (e) {
      problems.push(e && e.name === 'SyncError' ? 'omp-state-unsafe-path' : 'omp-state-read-error');
    }

    if (stateSource !== null) {
      try {
        const state = JSON.parse(stateSource);

        // Ownership marker — reuse the generator's own structural gate.
        if (!isOwnedManifest(stateSource)) {
          problems.push('omp-state-no-ownership');
        }

        // Content-mismatch gate combines two comparisons against the
        // generator's own renderer:
        //  1. Byte-exact: matches mure-omp-sync.mjs's OWN --check contract
        //     exactly (`existingManifest !== expectedManifest`, a raw string
        //     comparison after CRLF normalization) — a reformatted or
        //     key-reordered-but-semantically-identical manifest is drift,
        //     not a pass, because sync itself would refuse to call it
        //     clean. This is what makes the module's @does "byte-for-byte"
        //     claim literally true.
        //  2. Semantic deep-equal (order-insensitive on object keys,
        //     order-sensitive on arrays): an independent structural
        //     comparison of the SAME two documents, so a drift that somehow
        //     survives the raw-string check (impossible in practice, since
        //     any semantic difference is necessarily also a byte
        //     difference) is still caught by construction. The parsed
        //     `expectedManifest` this produces also feeds the granular
        //     projected/executable/disabled/invariant checks below.
        const expectedManifestText = renderProjectionManifest(projection, catalog.generated ?? null);
        const expectedManifest = JSON.parse(expectedManifestText);
        const byteExactMatch = normalizeCRLF(stateSource) === expectedManifestText;
        const semanticMatch = deepEqual(state, expectedManifest);
        if (!byteExactMatch || !semanticMatch) {
          problems.push('omp-state-content-mismatch');
        }

        // Flat manifest counts must match projection exactly
        const projected = state.projected;
        const executable = state.executable;
        const disabled = state.disabled;

        if (!Number.isInteger(projected)) {
          problems.push(`omp-state-projected-missing:got=${JSON.stringify(projected)}`);
        } else if (projected !== expectedFilenames.size) {
          problems.push(`omp-state-projected-mismatch:got=${projected} expected=${expectedFilenames.size}`);
        }

        if (!Number.isInteger(executable)) {
          problems.push(`omp-state-executable-missing:got=${JSON.stringify(executable)}`);
        } else if (executable !== projection.executable) {
          problems.push(`omp-state-executable-mismatch:got=${executable} expected=${projection.executable}`);
        }

        if (!Number.isInteger(disabled)) {
          problems.push(`omp-state-disabled-missing:got=${JSON.stringify(disabled)}`);
        } else if (disabled !== projection.disabled) {
          problems.push(`omp-state-disabled-mismatch:got=${disabled} expected=${projection.disabled}`);
        }

        const allInt = Number.isInteger(projected) && Number.isInteger(executable) && Number.isInteger(disabled);
        if (allInt && (executable + disabled !== projected)) {
          problems.push(`omp-state-invariant-violation:executable(${executable})+disabled(${disabled})!=projected(${projected})`);
        }
      } catch (e) {
        problems.push(`omp-state-parse-error:${e.message}`);
      }
    }
  }

  return problems;
}

// ── Canary evidence gate ────────────────────────────────────────────────

/** Parse provider-route-registry.json tolerating its JSON5-ish trailing commas
 *  (mirrors the resolver's own read of the same file). */
function loadProviderRouteRegistry() {
  const raw = fs.readFileSync(PROVIDER_ROUTE_REGISTRY_PATH, 'utf8');
  return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
}

/**
 * Validate that every canary-proven route in a provider route registry
 * carries admissible evidence, per the resolver's own admissibility rule
 * ({@link isAdmissibleCanaryEvidence}, imported from omp-model-resolver.mjs
 * — the SAME predicate `buildRouteByModelIndex` enforces at registry-load
 * time, so a route that would fail this check would already fail to load
 * anywhere else in the system). No duplicated standard/corroborated/date
 * predicates live here anymore; this function's only job is iterating every
 * canary-proven route and translating a failed admissibility check into the
 * stable `provider-route-canary-evidence-invalid:<model>` diagnostic.
 *
 * Non-canary-proven routes are skipped entirely — historical evidence on a
 * demoted or blocked route is never treated as admission.
 *
 * @param {object} registry — parsed provider-route-registry.json (or compatible fixture)
 * @returns {string[]} problems (empty = clean)
 */
export function validateCanaryEvidence(registry) {
  const problems = [];
  const modelIdentities = (registry && registry.modelIdentities) || {};

  for (const identity of Object.values(modelIdentities)) {
    for (const route of (identity && identity.routes) || []) {
      if (!route || route.status !== 'canary-proven') continue;
      if (isAdmissibleCanaryEvidence(route)) continue;
      problems.push(`provider-route-canary-evidence-invalid:${route.model ?? '<missing-model>'}`);
    }
  }

  return problems;
}

export function validateFleet() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const clineModels = new Set(Object.values(CLINE_ROSTER));
  const checks = [];

  // CHECK B — the 4 ClinePass targets present in CLINE_ROSTER
  const missing = CLINE_TARGETS.filter((t) => !clineModels.has(t));
  checks.push({ name: 'B: 4 ClinePass targets in CLINE_ROSTER', ok: missing.length === 0, detail: missing.length ? `MISSING: ${missing.join(', ')}` : CLINE_TARGETS.join(', ') });

  // CHECK C — cline armed
  const armed = clineArmed();
  checks.push({ name: 'C: cline fleet armed', ok: armed, detail: armed ? 'armed' : 'DISARMED (arm via YURI_CLINE_FLEET=1 or touch _SYSTEM/state/cline-fleet.enabled)' });

  // CHECK D — every base role satisfies the bounded immaculate design schema
  const incomplete = [];
  const knownSkills = knownSkillIds();
  for (const a of catalog.agents) {
    const missingFields = [];
    if (!a.description || a.description.length < 20 || a.description.length > 320) missingFields.push(`description(${a.description?.length || 0})`);
    if (!Array.isArray(a.skills) || a.skills.length < 4 || a.skills.length > 9) missingFields.push(`skills(${a.skills?.length || 0})`);
    else {
      const unknown = a.skills.filter((id) => !knownSkills.has(id));
      if (unknown.length) missingFields.push(`unknown-skills:${unknown.join(',')}`);
    }
    if (!THINKING_LEVELS.has(a.thinkingLevel)) missingFields.push(`thinkingLevel:${a.thinkingLevel}`);
    const temperature = a.params?.temperature;
    if (temperature != null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 1)) missingFields.push(`temperature:${temperature}`);
    if (missingFields.length) incomplete.push(`${a.name}: ${missingFields.join('+')}`);
  }
  checks.push({ name: 'D: base-role schema is bounded and resolvable', ok: incomplete.length === 0, detail: incomplete.length ? `${incomplete.length}/${catalog.agents.length} invalid: ${incomplete.slice(0, 6).join('; ')}${incomplete.length > 6 ? ' …' : ''}` : `${catalog.agents.length} roles complete` });

  // CHECK E — Sol pilot variant CATALOG DEFINITIONS are structurally complete.
  // This validates catalog shape only (id/thinkingLevel/tools/max_tokens/
  // systemSections/costTier/sol-pilot flag) — dispatch eligibility is a
  // separate concern checked by CHECK I/J (OMP projection + canary evidence).
  const solVariants = catalog.agents.flatMap((a) => (a.variants || [])
    .filter((v) => v.model === 'openai/gpt-5.6-sol')
    .map((v) => ({ role: a.name, ...v })));
  const solProblems = [];
  const solIds = new Set();
  for (const v of solVariants) {
    const badFields = [];
    if (!v.id || solIds.has(v.id)) badFields.push(v.id ? 'duplicate-id' : 'id');
    solIds.add(v.id);
    if (!THINKING_LEVELS.has(v.thinkingLevel)) badFields.push(`thinkingLevel:${v.thinkingLevel}`);
    if (!Array.isArray(v.tools) || v.tools.length === 0) badFields.push('tools');
    if (!Number.isInteger(v.max_tokens) || v.max_tokens < 1) badFields.push(`max_tokens:${v.max_tokens}`);
    if (!Array.isArray(v.systemSections) || v.systemSections.length === 0) badFields.push('systemSections');
    if (!COST_TIERS.has(v.costTier)) badFields.push(`costTier:${v.costTier}`);
    if (!Array.isArray(v.eligibilityFlags) || !v.eligibilityFlags.includes('sol-pilot')) badFields.push('sol-pilot-flag');
    if (badFields.length) solProblems.push(`${v.role}/${v.id || '<missing>'}: ${badFields.join('+')}`);
  }
  checks.push({
    name: 'E: GPT-5.6 Sol pilot catalog definitions are structurally complete',
    ok: solVariants.length > 0 && solProblems.length === 0,
    detail: solProblems.length
      ? solProblems.join('; ')
      : `${solVariants.length} structurally complete Sol variant definitions (OMP dispatch/canary eligibility by CHECK I/J)`,
  });

  // CHECK H — every catalog role has exactly one MURE-native card and
  // repo-local OMP non-projection files cannot silently become a second MURE authority.
  const cardAuthorityProblems = validateAgentCardAuthority(catalog);
  const ompCount = fs.existsSync(OMP_AGENT_DIR) ? fs.readdirSync(OMP_AGENT_DIR).filter(n => n.endsWith('.md')).length : 0;
  checks.push({
    name: 'H: MURE cards are canonical; OMP projection files accepted',
    ok: cardAuthorityProblems.length === 0,
    detail: cardAuthorityProblems.length ? cardAuthorityProblems.join('; ') : `${catalog.agents.length} catalog cards resolve under _SYSTEM/mure/agents; .omp/agents has ${ompCount} projected files`,
  });

  // CHECK I — generated OMP projection artifacts match the live catalog exactly
  const ompProblems = validateOmpProjection(catalog);
  const hasProjection = fs.existsSync(OMP_AGENT_DIR) || fs.existsSync(OMP_CONFIG) || fs.existsSync(OMP_PROJECTION_STATE);
  const totalExpected = catalog.agents.length + catalog.agents.reduce((sum, a) => sum + (a.variants || []).length, 0);
  checks.push({
    name: 'I: OMP projection matches live catalog',
    ok: ompProblems.length === 0,
    detail: ompProblems.length
      ? ompProblems.join('; ')
      : (hasProjection ? `projection clean: ${totalExpected} expected cards` : 'no projection artifacts present'),
  });

  // CHECK J — every canary-proven provider route carries admissible evidence
  const registry = loadProviderRouteRegistry();
  const canaryProblems = validateCanaryEvidence(registry);
  checks.push({
    name: 'J: canary-proven provider routes carry admissible evidence',
    ok: canaryProblems.length === 0,
    detail: canaryProblems.length ? canaryProblems.join('; ') : 'all canary-proven routes carry admissible evidence',
  });

  return { ok: checks.every((c) => c.ok), checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, checks } = validateFleet();
  for (const c of checks) process.stdout.write(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}\n      ${c.detail}\n`);
  process.stdout.write(`\n${ok ? 'GREEN — fleet integrity verified' : 'RED — fleet integrity failures above'}\n`);
  process.exit(ok ? 0 : 1);
}
