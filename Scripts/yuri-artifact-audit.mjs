#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RISK_TERMS = [
  'ignore previous',
  'system prompt',
  'developer message',
  'execute',
  'shell',
  'secret',
  'api key',
  'credential',
  'password',
  'exfiltrate',
  'write file',
  'delete',
];

const USAGE = [
  'Usage:',
  '  node Scripts/yuri-artifact-audit.mjs source-manifest [--out file] [--derived file] <files...>',
  '  node Scripts/yuri-artifact-audit.mjs reference-registry [--out file] [--derived file] <files...>',
  '  node Scripts/yuri-artifact-audit.mjs reference-verify --registry file [--out file] [--limit n] [--timeout-ms n] [--concurrency n]',
  '  node Scripts/yuri-artifact-audit.mjs link-cleanup-report --registry file --verification file [--out file]',
  '  node Scripts/yuri-artifact-audit.mjs section-manifest [--out file] [--derived file] <files...>',
  '  node Scripts/yuri-artifact-audit.mjs document-claims [--out file] [--derived file] <files...>',
  '  node Scripts/yuri-artifact-audit.mjs claim-evidence-graph --claims file --registry file --verification file --sections file [--out file] [--verified-out file] [--timeout-ms n] [--concurrency n]',
  '  node Scripts/yuri-artifact-audit.mjs promotion-gate --graph file --verified file [--out file] [--contradictions-reviewed]',
  '  node Scripts/yuri-artifact-audit.mjs md-vs-html [--format json|markdown] [--out file] --markdown file --html file',
  '  node Scripts/yuri-artifact-audit.mjs control-surface --manifest file --comparison file [--claims file] [--title text] [--out file]',
].join('\n');

const [command, ...argv] = process.argv.slice(2);

try {
  if (command === 'source-manifest') {
    const options = parseManifestArgs(argv);
    writeResult(buildSourceManifest(options), 'json', options.out);
  } else if (command === 'reference-registry') {
    const options = parseArtifactFilesArgs(argv, 'reference-registry');
    writeResult(buildReferenceRegistry(options), 'json', options.out);
  } else if (command === 'reference-verify') {
    const options = parseReferenceVerifyArgs(argv);
    writeResult(await buildReferenceVerification(options), 'json', options.out);
  } else if (command === 'link-cleanup-report') {
    const options = parseLinkCleanupArgs(argv);
    writeResult(buildLinkCleanupReport(options), 'markdown', options.out);
  } else if (command === 'section-manifest') {
    const options = parseArtifactFilesArgs(argv, 'section-manifest');
    writeResult(buildSectionManifest(options), 'json', options.out);
  } else if (command === 'document-claims') {
    const options = parseArtifactFilesArgs(argv, 'document-claims');
    writeResult(buildDocumentClaimRegister(options), 'json', options.out);
  } else if (command === 'claim-evidence-graph') {
    const options = parseClaimEvidenceGraphArgs(argv);
    const graph = await buildClaimEvidenceGraph(options);
    if (options.verifiedOut) {
      writeResult(graph.verified_source_claims, 'json', options.verifiedOut);
    }
    writeResult(graph, 'json', options.out);
  } else if (command === 'promotion-gate') {
    const options = parsePromotionGateArgs(argv);
    writeResult(buildPromotionGate(options), 'json', options.out);
  } else if (command === 'md-vs-html') {
    const options = parseComparisonArgs(argv);
    writeResult(buildMdHtmlComparison(options), options.format, options.out);
  } else if (command === 'control-surface') {
    const options = parseControlSurfaceArgs(argv);
    writeResult(buildControlSurface(options), 'html', options.out);
  } else {
    throw new Error(USAGE);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function parseManifestArgs(args) {
  return parseArtifactFilesArgs(args, 'source-manifest');
}

function parseArtifactFilesArgs(args, commandName) {
  const files = [];
  const derived = new Set();
  let out = '';
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--out') out = requireValue(args, ++index, '--out');
    else if (arg === '--derived') derived.add(path.resolve(requireValue(args, ++index, '--derived')));
    else files.push(path.resolve(arg));
  }
  if (files.length === 0) throw new Error(`${commandName} requires at least one file\n${USAGE}`);
  return { files, derived, out };
}

function parseComparisonArgs(args) {
  const options = { markdown: '', html: '', format: 'json', out: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--markdown') options.markdown = path.resolve(requireValue(args, ++index, '--markdown'));
    else if (arg === '--html') options.html = path.resolve(requireValue(args, ++index, '--html'));
    else if (arg === '--format') options.format = requireValue(args, ++index, '--format');
    else if (arg === '--out') options.out = requireValue(args, ++index, '--out');
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (!options.markdown || !options.html) throw new Error(`md-vs-html requires --markdown and --html\n${USAGE}`);
  if (!['json', 'markdown'].includes(options.format)) throw new Error('--format must be json or markdown');
  return options;
}

function parseControlSurfaceArgs(args) {
  const options = { manifest: '', comparison: '', claims: '', title: 'Yuri OS Audit Control Surface', out: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--manifest') options.manifest = path.resolve(requireValue(args, ++index, '--manifest'));
    else if (arg === '--comparison') options.comparison = path.resolve(requireValue(args, ++index, '--comparison'));
    else if (arg === '--claims') options.claims = path.resolve(requireValue(args, ++index, '--claims'));
    else if (arg === '--title') options.title = requireValue(args, ++index, '--title');
    else if (arg === '--out') options.out = requireValue(args, ++index, '--out');
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (!options.manifest || !options.comparison) throw new Error(`control-surface requires --manifest and --comparison\n${USAGE}`);
  return options;
}

function parseReferenceVerifyArgs(args) {
  const options = { registry: '', out: '', limit: 0, timeoutMs: 8000, concurrency: 4 };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--registry') options.registry = path.resolve(requireValue(args, ++index, '--registry'));
    else if (arg === '--out') options.out = requireValue(args, ++index, '--out');
    else if (arg === '--limit') options.limit = Number(requireValue(args, ++index, '--limit'));
    else if (arg === '--timeout-ms') options.timeoutMs = Number(requireValue(args, ++index, '--timeout-ms'));
    else if (arg === '--concurrency') options.concurrency = Number(requireValue(args, ++index, '--concurrency'));
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (!options.registry) throw new Error(`reference-verify requires --registry\n${USAGE}`);
  if (!Number.isFinite(options.limit) || options.limit < 0) throw new Error('--limit must be a non-negative number');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive number');
  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) throw new Error('--concurrency must be a positive number');
  options.concurrency = Math.min(12, Math.max(1, Math.floor(options.concurrency)));
  return options;
}

function parseLinkCleanupArgs(args) {
  const options = { registry: '', verification: '', out: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--registry') options.registry = path.resolve(requireValue(args, ++index, '--registry'));
    else if (arg === '--verification') options.verification = path.resolve(requireValue(args, ++index, '--verification'));
    else if (arg === '--out') options.out = requireValue(args, ++index, '--out');
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (!options.registry || !options.verification) throw new Error(`link-cleanup-report requires --registry and --verification\n${USAGE}`);
  return options;
}

function parseClaimEvidenceGraphArgs(args) {
  const options = {
    claims: '',
    registry: '',
    verification: '',
    sections: '',
    out: '',
    verifiedOut: '',
    timeoutMs: 8000,
    concurrency: 4,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--claims') options.claims = path.resolve(requireValue(args, ++index, '--claims'));
    else if (arg === '--registry') options.registry = path.resolve(requireValue(args, ++index, '--registry'));
    else if (arg === '--verification') options.verification = path.resolve(requireValue(args, ++index, '--verification'));
    else if (arg === '--sections') options.sections = path.resolve(requireValue(args, ++index, '--sections'));
    else if (arg === '--out') options.out = requireValue(args, ++index, '--out');
    else if (arg === '--verified-out') options.verifiedOut = requireValue(args, ++index, '--verified-out');
    else if (arg === '--timeout-ms') options.timeoutMs = Number(requireValue(args, ++index, '--timeout-ms'));
    else if (arg === '--concurrency') options.concurrency = Number(requireValue(args, ++index, '--concurrency'));
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (!options.claims || !options.registry || !options.verification || !options.sections) {
    throw new Error(`claim-evidence-graph requires --claims, --registry, --verification, and --sections\n${USAGE}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('--timeout-ms must be a positive number');
  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) throw new Error('--concurrency must be a positive number');
  options.concurrency = Math.min(12, Math.max(1, Math.floor(options.concurrency)));
  return options;
}

function parsePromotionGateArgs(args) {
  const options = { graph: '', verified: '', out: '', contradictionsReviewed: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--graph') options.graph = path.resolve(requireValue(args, ++index, '--graph'));
    else if (arg === '--verified') options.verified = path.resolve(requireValue(args, ++index, '--verified'));
    else if (arg === '--out') options.out = requireValue(args, ++index, '--out');
    else if (arg === '--contradictions-reviewed') options.contradictionsReviewed = true;
    else throw new Error(`Unknown argument: ${arg}\n${USAGE}`);
  }
  if (!options.graph || !options.verified) throw new Error(`promotion-gate requires --graph and --verified\n${USAGE}`);
  return options;
}

function requireValue(args, index, flag) {
  const value = args[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function buildSourceManifest({ files, derived, out = '' }) {
  const sources = files.map((file) => analyzeFile(file, derived.has(file) ? 'derived' : 'source'));
  const manifestId = crypto.createHash('sha256').update(sources.map((source) => source.sha256).join('\n')).digest('hex');
  return {
    schema_version: 2,
    manifest_id: manifestId,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: true,
    taint_policy: 'input artifacts are tainted until normalized; raw contents are not canonical memory',
    source_count: sources.length,
    provenance_summary: summarizeProvenance(sources),
    sources,
    output_file: out || null,
  };
}

function buildMdHtmlComparison({ markdown, html, format = 'json', out = '' }) {
  const md = analyzeFile(markdown, 'source');
  const rendered = analyzeFile(html, 'source');
  const comparison = {
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: true,
    markdown: md,
    html: rendered,
    deltas: {
      bytes: rendered.bytes - md.bytes,
      approx_tokens: rendered.approx_tokens - md.approx_tokens,
      headings: rendered.heading_count - md.heading_count,
      links: rendered.link_count - md.link_count,
      table_rows: rendered.table_rows - md.table_rows,
      code_blocks: rendered.code_blocks - md.code_blocks,
      interactive_controls: rendered.interactive_controls - md.interactive_controls,
      scripts: rendered.scripts - md.scripts,
    },
    semantic_equivalence: semanticEquivalence(md, rendered),
    criteria: compareCriteria(md, rendered),
    decision: 'markdown_canonical_html_derived',
    decision_rationale: [
      'Markdown remains cheaper, simpler to diff, and lower attack surface.',
      'HTML adds measurable value for anchors, link recovery, browser review, accessibility affordances, and operational dashboards.',
      'HTML should be derived or artifact-layer output unless a task explicitly needs browser-native interaction.',
    ],
    output_file: out || null,
  };

  return format === 'markdown' ? renderComparisonMarkdown(comparison) : comparison;
}

function buildReferenceRegistry({ files, derived, out = '' }) {
  const sources = files.map((file) => analyzeFile(file, derived.has(file) ? 'derived' : 'source'));
  const references = sources.flatMap((source) => source.links.map((link) => {
    const tier = classifyReferenceTier(link.href);
    const resolution = referenceResolution(link.href);
    return {
      id: referenceId(source.file, link.href, link.source_line || 0),
      href: link.href,
      normalized_href: resolution.normalized_href,
      resolution_precision: resolution.precision,
      cleanup_notes: resolution.cleanup_notes,
      text: link.text,
      syntax: link.syntax,
      tier: tier.tier,
      tier_reason: tier.reason,
      evidence_status: tier.evidenceStatus,
      source_file: source.file,
      source_sha256: source.sha256,
      source_kind: source.kind,
      source_role: source.source_role,
      source_line: link.source_line || null,
    };
  }));
  const occurrenceCounts = references.reduce((counts, reference) => {
    counts[reference.normalized_href] = (counts[reference.normalized_href] || 0) + 1;
    return counts;
  }, {});
  for (const reference of references) {
    reference.occurrence_count = occurrenceCounts[reference.normalized_href] || 1;
    reference.duplicate = reference.occurrence_count > 1;
    reference.verification_status = verificationStatusFor(reference);
    reference.verification = {
      status: reference.verification_status,
      method: 'classification_only_no_fetch',
      checked_at: null,
    };
  }
  return {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: false,
    taint_policy: 'registry records references found in tainted artifacts; referenced content is not verified by this command',
    source_count: sources.length,
    reference_count: references.length,
    unique_reference_count: new Set(references.map((reference) => reference.normalized_href)).size,
    external_reference_count: references.filter((reference) => /^https?:\/\//i.test(reference.href)).length,
    local_reference_count: references.filter((reference) => !/^https?:\/\//i.test(reference.href)).length,
    counts_by_tier: countByTier(references),
    verification_status_counts: countBy(references, 'verification_status'),
    references,
    output_file: out || null,
  };
}

async function buildReferenceVerification({ registry, out = '', limit = 0, timeoutMs = 8000, concurrency = 4 }) {
  const registryData = JSON.parse(fs.readFileSync(registry, 'utf8'));
  const references = Array.isArray(registryData.references) ? registryData.references : [];
  const uniqueTargets = dedupeReferences(references);
  const selectedTargets = limit > 0 ? uniqueTargets.slice(0, limit) : uniqueTargets;
  const results = await verifyReferenceTargets(selectedTargets, { timeoutMs, concurrency });
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: true,
    source_registry: registry,
    source_reference_count: references.length,
    unique_reference_count: uniqueTargets.length,
    checked_reference_count: results.length,
    limit_applied: limit > 0 ? limit : null,
    timeout_ms: timeoutMs,
    concurrency,
    counts: countBy(results, 'status'),
    results,
    output_file: out || null,
  };
}

function buildLinkCleanupReport({ registry, verification }) {
  const registryData = JSON.parse(fs.readFileSync(registry, 'utf8'));
  const verificationData = JSON.parse(fs.readFileSync(verification, 'utf8'));
  const references = Array.isArray(registryData.references) ? registryData.references : [];
  const results = Array.isArray(verificationData.results) ? verificationData.results : [];
  const failed = results.filter((result) => result.status !== 'reachable' && result.status !== 'local_skipped');
  const normalizedChanges = references
    .map((reference) => ({
      id: reference.id,
      source_line: reference.source_line,
      href: reference.href,
      normalized_href: reference.normalized_href,
      cleaned_href: normalizeHref(reference.href || ''),
      issue: linkCleanupIssue(reference.href || ''),
    }))
    .filter((entry) => entry.issue || entry.cleaned_href !== entry.normalized_href);
  const cleanedFailures = failed.map((result) => ({
    href: result.href,
    normalized_href: result.normalized_href,
    cleaned_href: normalizeHref(result.href || result.normalized_href || ''),
    status: result.status,
    http_status: result.http_status || '',
    reason: result.reason || '',
    issue: linkCleanupIssue(result.href || result.normalized_href || ''),
  }));
  const repaired = cleanedFailures.filter((entry) => entry.cleaned_href !== entry.normalized_href && /^https?:\/\/[^/]+\S*/i.test(entry.cleaned_href));
  const unrepairable = cleanedFailures.filter((entry) => !/^https?:\/\/[^/]+\S*/i.test(entry.cleaned_href));
  return [
    '# Link Cleanup Report',
    '',
    `generated_at: ${new Date().toISOString()}`,
    `source_registry: ${registry}`,
    `source_verification: ${verification}`,
    '',
    '## Summary',
    '',
    `- failed_links_before_cleanup: ${failed.length}`,
    `- normalized_reference_changes: ${normalizedChanges.length}`,
    `- repairable_failed_links: ${repaired.length}`,
    `- unrepairable_failed_links: ${unrepairable.length}`,
    '',
    '## Repairable Failed Links',
    '',
    '| Status | HTTP | Issue | Raw | Cleaned |',
    '|---|---:|---|---|---|',
    ...repaired.map((entry) => `| ${escapeMarkdown(entry.status)} | ${escapeMarkdown(entry.http_status)} | ${escapeMarkdown(entry.issue || 'normalized')} | \`${escapeMarkdown(entry.href)}\` | \`${escapeMarkdown(entry.cleaned_href)}\` |`),
    '',
    '## Unrepairable Failed Links',
    '',
    '| Status | Issue | Raw | Reason |',
    '|---|---|---|---|',
    ...unrepairable.map((entry) => `| ${escapeMarkdown(entry.status)} | ${escapeMarkdown(entry.issue || 'invalid_after_cleanup')} | \`${escapeMarkdown(entry.href)}\` | ${escapeMarkdown(entry.reason)} |`),
    '',
    '## Remaining Non-Malformed Failures',
    '',
    '| Status | HTTP | URL | Reason |',
    '|---|---:|---|---|',
    ...cleanedFailures
      .filter((entry) => !entry.issue && entry.cleaned_href === entry.normalized_href)
      .map((entry) => `| ${escapeMarkdown(entry.status)} | ${escapeMarkdown(entry.http_status)} | \`${escapeMarkdown(entry.href)}\` | ${escapeMarkdown(entry.reason || 'remote_http_error')} |`),
    '',
  ].join('\n');
}

function buildPromotionGate({ graph, verified, out = '', contradictionsReviewed = false }) {
  const graphData = JSON.parse(fs.readFileSync(graph, 'utf8'));
  const verifiedData = JSON.parse(fs.readFileSync(verified, 'utf8'));
  const verifiedClaims = Array.isArray(verifiedData.claims) ? verifiedData.claims : [];
  const contradictionClaimIds = new Set((graphData.adjacency?.contradicts || []).flatMap((edge) => [edge.from_claim_id, edge.to_claim_id]));
  const claims = verifiedClaims.map((claim) => {
    const blockers = [];
    if (claim.support_score < 0.35) blockers.push('support_score_below_0_35');
    if (!['P0', 'P1'].includes(claim.reference?.tier || 'unknown')) blockers.push('reference_tier_not_primary_or_repository');
    if (contradictionClaimIds.has(claim.claim_id) && !contradictionsReviewed) blockers.push('contradiction_candidate_unreviewed');
    if (claim.reference?.resolution_precision === 'origin_replacement') blockers.push('source_url_replaced_by_origin_homepage');
    return {
      ...claim,
      canonical_memory_gate: blockers.length === 0 ? 'eligible_for_canonical_memory_candidate' : 'blocked_from_canonical_memory',
      blockers,
      review_basis: contradictionClaimIds.has(claim.claim_id) && contradictionsReviewed ? 'user_reported_contradiction_review_completed' : 'machine_gate_only',
      promotion_requirements: blockers.length === 0
        ? ['human approve claim text', 'write sanitized canonical summary, not raw source prose']
        : ['resolve blockers before promotion'],
    };
  });
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: true,
    source_graph: graph,
    source_verified_claims: verified,
    contradiction_review_status: contradictionsReviewed ? 'user_reported_reviewed' : 'not_reviewed_by_gate',
    policy: 'Only claims passing this gate may be considered canonical memory candidates. Raw source prose remains tainted.',
    thresholds: {
      support_min_score: 0.35,
      allowed_reference_tiers: ['P0', 'P1'],
      contradiction_review_required: true,
      origin_replacement_blocks_canonical_memory: true,
    },
    counts: {
      verified_claims: claims.length,
      eligible: claims.filter((claim) => claim.canonical_memory_gate === 'eligible_for_canonical_memory_candidate').length,
      blocked: claims.filter((claim) => claim.canonical_memory_gate !== 'eligible_for_canonical_memory_candidate').length,
    },
    claims,
    output_file: out || null,
  };
}

async function buildClaimEvidenceGraph({ claims, registry, verification, sections, out = '', timeoutMs = 8000, concurrency = 4 }) {
  const claimData = JSON.parse(fs.readFileSync(claims, 'utf8'));
  const registryData = JSON.parse(fs.readFileSync(registry, 'utf8'));
  const verificationData = JSON.parse(fs.readFileSync(verification, 'utf8'));
  const sectionData = JSON.parse(fs.readFileSync(sections, 'utf8'));
  const claimRows = Array.isArray(claimData.claims) ? claimData.claims : [];
  const references = Array.isArray(registryData.references) ? registryData.references : [];
  const verificationRows = Array.isArray(verificationData.results) ? verificationData.results : [];
  const sectionRows = Array.isArray(sectionData.sections) ? sectionData.sections : [];
  const reachable = verificationRows.filter((row) => row.status === 'reachable');
  const contentByHref = await fetchReferenceContents(reachable, { timeoutMs, concurrency });
  const referencesById = new Map(references.map((reference) => [reference.id, reference]));
  const verificationByHref = new Map(verificationRows.map((row) => [row.normalized_href, row]));
  const referenceGroups = groupReferencesByNormalizedHref(references);
  const claimNodes = claimRows.map((claim) => ({ ...claim, key_terms: keyTerms(claim.text) }));
  const referenceNodes = [...referenceGroups.values()].map((group) => ({
    normalized_href: group.normalized_href,
    href: group.href,
    tier: group.tier,
    reference_ids: group.reference_ids,
    source_lines: group.source_lines,
    occurrence_count: group.occurrence_count,
    verification: verificationByHref.get(group.normalized_href) || null,
    content_fetch: summarizeContentFetch(contentByHref.get(group.normalized_href)),
  }));
  const adjacency = {
    supports: [],
    contradicts: [],
    depends_on: [],
    same_source_section: [],
    same_reference: [],
  };
  const claimReferenceMatches = new Map();

  for (const claim of claimNodes) {
    const candidateReferences = candidateReferencesForClaim(claim, references, sectionRows);
    const matches = [];
    for (const reference of candidateReferences) {
      const normalizedHref = reference.normalized_href || normalizeHref(reference.href || '');
      const fetched = contentByHref.get(normalizedHref);
      const verificationResult = verificationByHref.get(normalizedHref);
      const score = fetched?.status === 'fetched' ? lexicalSupportScore(claim.text, fetched.text) : 0;
      const matchedTerms = fetched?.status === 'fetched' ? matchedKeyTerms(claim.text, fetched.text) : [];
      const edgeBase = {
        claim_id: claim.id,
        reference_id: reference.id,
        normalized_href: normalizedHref,
        score,
        matched_terms: matchedTerms,
        source_line_distance: reference.source_file === claim.source_file && reference.source_line
          ? Math.abs(reference.source_line - claim.source_line)
          : null,
        verification_status: verificationResult?.status || reference.verification_status || 'unknown',
        content_status: fetched?.status || 'not_fetched',
      };
      if (score >= 0.18 && matchedTerms.length >= 3) {
        adjacency.supports.push({
          ...edgeBase,
          relation: 'supports',
          method: 'reachable_reference_content_lexical_overlap',
          content_sha256: fetched.sha256,
          evidence_title: fetched.title || '',
          evidence_excerpt: evidenceExcerpt(claim.text, fetched.text),
        });
        matches.push({ reference, fetched, score, matchedTerms, relation: 'supports' });
      } else if (verificationResult?.status === 'reachable') {
        adjacency.depends_on.push({
          ...edgeBase,
          relation: 'depends_on',
          blocker: fetched?.status === 'fetched' ? 'content_overlap_below_support_threshold' : fetched?.reason || 'content_fetch_failed',
        });
      } else {
        adjacency.depends_on.push({
          ...edgeBase,
          relation: 'depends_on',
          blocker: 'reference_not_reachable_or_not_checked',
        });
      }
    }
    claimReferenceMatches.set(claim.id, matches);
  }

  addSectionAdjacency(claimNodes, adjacency.same_source_section);
  addSameReferenceAdjacency(adjacency.supports, adjacency.same_reference);
  addContradictionAdjacency(claimNodes, adjacency.supports, adjacency.contradicts);

  const verifiedSourceClaims = claimNodes
    .map((claim) => {
      const supports = adjacency.supports.filter((edge) => edge.claim_id === claim.id);
      if (supports.length === 0) return null;
      const best = supports.slice().sort((a, b) => b.score - a.score)[0];
      const reference = referencesById.get(best.reference_id);
      const resolutionPrecision = reference?.resolution_precision || referenceResolution(reference?.href || best.normalized_href).precision;
      return {
        claim_id: claim.id,
        text: claim.text,
        classification: claim.classification,
        source_file: claim.source_file,
        source_line: claim.source_line,
        section_id: claim.section_id,
        support_status: 'content_matched',
        support_score: best.score,
        matched_terms: best.matched_terms,
        reference: {
          id: best.reference_id,
          href: reference?.href || best.normalized_href,
          normalized_href: best.normalized_href,
          tier: reference?.tier || 'unknown',
          source_line: reference?.source_line || null,
          resolution_precision: resolutionPrecision,
          cleanup_notes: reference?.cleanup_notes || [],
        },
        content_sha256: best.content_sha256,
        evidence_title: best.evidence_title || '',
        evidence_excerpt: best.evidence_excerpt || '',
        verification_method: best.method,
      };
    })
    .filter(Boolean);

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: true,
    source_claims: claims,
    source_registry: registry,
    source_verification: verification,
    source_sections: sections,
    claim_count: claimNodes.length,
    reference_count: referenceNodes.length,
    reachable_reference_count: reachable.length,
    content_fetch_counts: countBy([...contentByHref.values()], 'status'),
    edge_counts: Object.fromEntries(Object.entries(adjacency).map(([key, value]) => [key, value.length])),
    thresholds: {
      support_min_score: 0.18,
      support_min_matched_terms: 3,
    },
    nodes: {
      claims: claimNodes,
      references: referenceNodes,
    },
    adjacency,
    verified_source_claims: {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      source_graph: out || null,
      claim_count: verifiedSourceClaims.length,
      claims: verifiedSourceClaims,
    },
    output_file: out || null,
  };
}

function dedupeReferences(references) {
  const seen = new Map();
  for (const reference of references) {
    const normalized = reference.normalized_href || normalizeHref(reference.href || '');
    if (!seen.has(normalized)) {
      seen.set(normalized, {
        href: reference.href || normalized,
        normalized_href: normalized,
        tier: reference.tier || 'unknown',
        reference_ids: [],
        occurrence_count: 0,
      });
    }
    const target = seen.get(normalized);
    target.reference_ids.push(reference.id || '');
    target.occurrence_count += reference.occurrence_count || 1;
  }
  return [...seen.values()];
}

async function verifyReferenceTargets(targets, { timeoutMs, concurrency }) {
  const results = new Array(targets.length);
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await verifyReferenceTarget(targets[index], timeoutMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  return results;
}

async function verifyReferenceTarget(target, timeoutMs) {
  if (!/^https?:\/\//i.test(target.normalized_href)) {
    return {
      ...target,
      status: 'local_skipped',
      reason: 'non_http_reference',
      checked_at: new Date().toISOString(),
    };
  }

  let url;
  try {
    url = new URL(target.normalized_href);
  } catch (error) {
    return {
      ...target,
      status: 'invalid_url',
      reason: error.message,
      checked_at: new Date().toISOString(),
    };
  }

  const started = Date.now();
  try {
    let response = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'YuriArtifactAudit/1.0' },
    });
    let method = 'HEAD';
    if (response.status === 405) {
      response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'user-agent': 'YuriArtifactAudit/1.0', range: 'bytes=0-0' },
      });
      method = 'GET_RANGE';
    }
    return {
      ...target,
      status: response.ok ? 'reachable' : 'http_error',
      http_status: response.status,
      final_url: response.url,
      method,
      elapsed_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...target,
      status: error.name === 'TimeoutError' ? 'timeout' : 'fetch_error',
      reason: error.message,
      elapsed_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    };
  }
}

function buildSectionManifest({ files, derived, out = '' }) {
  const sources = files.map((file) => analyzeFile(file, derived.has(file) ? 'derived' : 'source'));
  const sections = sources.flatMap((source) => extractSections(source));
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: false,
    taint_policy: 'section hashes and metrics are safe for planning; section prose remains tainted source material',
    source_count: sources.length,
    section_count: sections.length,
    counts_by_kind: sections.reduce((counts, section) => {
      counts[section.kind] = (counts[section.kind] || 0) + 1;
      return counts;
    }, {}),
    sections,
    output_file: out || null,
  };
}

function buildDocumentClaimRegister({ files, derived, out = '' }) {
  const sources = files.map((file) => analyzeFile(file, derived.has(file) ? 'derived' : 'source'));
  const claims = sources.flatMap((source) => extractDocumentClaims(source));
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    advisory_only: true,
    local_truth_claim: false,
    raw_output_policy: 'source document prose is tainted; claim candidates require local verification before promotion',
    source_count: sources.length,
    claim_count: claims.length,
    counts: countBy(claims, 'classification'),
    claims,
    output_file: out || null,
  };
}

function analyzeFile(file, sourceRole) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const raw = fs.readFileSync(file);
  const text = raw.toString('utf8');
  const ext = path.extname(file).toLowerCase();
  const kind = ext === '.html' || ext === '.htm' ? 'html' : ext === '.md' || ext === '.markdown' ? 'markdown' : 'text';
  const headings = extractHeadings(text, kind);
  const links = extractLinks(text, kind);
  const tables = countTables(text, kind);
  const codeBlocks = countCodeBlocks(text, kind);
  const diagrams = countDiagrams(text, kind);
  const accessibility = accessibilitySignals(text, kind);
  const risks = promptInjectionRisks(text);
  const words = text.match(/\S+/g) || [];
  const fingerprint = semanticFingerprint(text, kind);

  return {
    file,
    file_name: path.basename(file),
    source_role: sourceRole,
    kind,
    sha256: crypto.createHash('sha256').update(raw).digest('hex'),
    bytes: raw.length,
    lines: text.split(/\r?\n/).length,
    words: words.length,
    approx_tokens: Math.ceil(words.length * 1.33),
    heading_count: headings.length,
    heading_tree: headings,
    link_count: links.length,
    links,
    table_rows: tables.rows,
    table_count: tables.count,
    code_blocks: codeBlocks,
    diagrams,
    scripts: kind === 'html' ? countMatches(text, /<script\b/gi) : 0,
    interactive_controls: kind === 'html' ? countMatches(text, /<(button|input|select|textarea|form)\b/gi) : 0,
    accessibility,
    prompt_injection_risks: risks,
    provenance: provenanceInventory(text, kind, links, sourceRole),
    semantic_fingerprint: fingerprint,
    suitability: suitability(kind, risks, text),
  };
}

function extractHeadings(text, kind) {
  if (kind === 'html') {
    return [...text.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((match) => ({
      level: Number(match[1]),
      text: stripTags(match[2]),
      id: extractAttr(match[0], 'id') || null,
      source_line: lineNumberAt(text, match.index || 0),
    }));
  }

  return text.split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (!match) return null;
      match.sourceLine = index + 1;
      return match;
    })
    .filter(Boolean)
    .map((match) => ({
      level: match[1].length,
      text: match[2].trim(),
      id: null,
      source_line: match.sourceLine,
    }));
}

function extractLinks(text, kind) {
  const links = [];
  if (kind === 'html') {
    for (const match of text.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      links.push({ href: match[1], text: stripTags(match[2]), syntax: 'html_anchor', source_line: lineNumberAt(text, match.index || 0) });
    }
    return links;
  }

  for (const match of text.matchAll(/!?\[([^\]]*)\]\(([^)]+)\)/g)) {
    links.push({ href: match[2], text: match[1], syntax: 'markdown_link', source_line: lineNumberAt(text, match.index || 0) });
  }
  for (const match of text.matchAll(/url([^]+)([^]+)/g)) {
    links.push({ href: match[2], text: match[1], syntax: 'filecite_url_markup', source_line: lineNumberAt(text, match.index || 0) });
  }
  const codeFenceRanges = markdownCodeFenceRanges(text);
  for (const match of text.matchAll(/https?:\/\/[^\s)>]+/g)) {
    if (codeFenceRanges.some(([start, end]) => (match.index || 0) >= start && (match.index || 0) <= end)) continue;
    const normalized = normalizeHref(match[0]);
    if (!isUsableHttpHref(normalized)) continue;
    if (!links.some((link) => link.href === match[0])) {
      links.push({ href: match[0], text: '', syntax: 'bare_url', source_line: lineNumberAt(text, match.index || 0) });
    }
  }
  return links;
}

function markdownCodeFenceRanges(text) {
  const ranges = [];
  const pattern = /^```.*$/gm;
  let start = null;
  for (const match of text.matchAll(pattern)) {
    if (start === null) start = match.index || 0;
    else {
      ranges.push([start, (match.index || 0) + match[0].length]);
      start = null;
    }
  }
  return ranges;
}

function countTables(text, kind) {
  if (kind === 'html') {
    return {
      count: countMatches(text, /<table\b/gi),
      rows: countMatches(text, /<tr\b/gi),
    };
  }
  const rows = text.split(/\r?\n/).filter((line) => /^\s*\|.*\|\s*$/.test(line)).length;
  return { count: rows > 0 ? 1 : 0, rows };
}

function countCodeBlocks(text, kind) {
  if (kind === 'html') return countMatches(text, /<pre\b|<code\b/gi);
  return Math.floor(countMatches(text, /^```/gm) / 2);
}

function countDiagrams(text, kind) {
  if (kind === 'html') return countMatches(text, /class=["'][^"']*mermaid|<svg\b/gi);
  return countMatches(text, /^```mermaid\b/gm);
}

function accessibilitySignals(text, kind) {
  if (kind !== 'html') {
    return {
      heading_structure_available: extractHeadings(text, kind).length > 0,
      skip_link: false,
      main_landmark: false,
      aria_usage: false,
    };
  }
  return {
    heading_structure_available: extractHeadings(text, kind).length > 0,
    skip_link: /href=["']#main-content["']|skip to main content/i.test(text),
    main_landmark: /<main\b|role=["']main["']/i.test(text),
    aria_usage: /\baria-[a-z]+=/i.test(text),
  };
}

function promptInjectionRisks(text) {
  const lower = text.toLowerCase();
  return RISK_TERMS.filter((term) => lower.includes(term));
}

function suitability(kind, risks, text) {
  if (kind === 'html' && (countMatches(text, /<script\b/gi) > 0 || risks.length > 0)) {
    return 'derived_review_artifact_only';
  }
  if (kind === 'html') return 'derived_review_artifact';
  if (risks.length > 0) return 'tainted_canonical_candidate_requires_sanitization';
  return 'canonical_candidate';
}

function compareCriteria(md, html) {
  return {
    parseability: md.kind === 'markdown' ? 'markdown_simpler' : 'unknown',
    heading_stability: html.heading_count >= md.heading_count ? 'html_equal_or_richer' : 'markdown_richer',
    token_cost: md.approx_tokens <= html.approx_tokens ? 'markdown_lower' : 'html_lower',
    extraction_accuracy: html.link_count > md.link_count ? 'html_better_for_links' : 'markdown_sufficient',
    link_recoverability: html.link_count > md.link_count ? 'html_better' : 'markdown_equal_or_better',
    table_preservation: html.table_rows >= md.table_rows ? 'html_equal_or_better' : 'markdown_equal_or_better',
    diagram_preservation: html.diagrams >= md.diagrams ? 'html_equal_or_better' : 'markdown_equal_or_better',
    browser_render_fidelity: 'html_better',
    accessibility: html.accessibility.main_landmark || html.accessibility.skip_link ? 'html_better_when_authored_well' : 'markdown_renderer_dependent',
    prompt_injection_surface: html.scripts > 0 || html.interactive_controls > 0 ? 'html_larger_surface' : 'comparable',
    semantic_equivalence: semanticEquivalence(md, html).status,
    canonical_memory_suitability: 'markdown_plus_sidecar_manifest',
  };
}

function renderComparisonMarkdown(comparison) {
  return [
    '# MD vs HTML Comparison',
    '',
    `generated_at: ${comparison.generated_at}`,
    `decision: ${comparison.decision}`,
    '',
    '| Metric | Markdown | HTML | Delta |',
    '|---|---:|---:|---:|',
    `| Bytes | ${comparison.markdown.bytes} | ${comparison.html.bytes} | ${comparison.deltas.bytes} |`,
    `| Approx tokens | ${comparison.markdown.approx_tokens} | ${comparison.html.approx_tokens} | ${comparison.deltas.approx_tokens} |`,
    `| Headings | ${comparison.markdown.heading_count} | ${comparison.html.heading_count} | ${comparison.deltas.headings} |`,
    `| Links | ${comparison.markdown.link_count} | ${comparison.html.link_count} | ${comparison.deltas.links} |`,
    `| Table rows | ${comparison.markdown.table_rows} | ${comparison.html.table_rows} | ${comparison.deltas.table_rows} |`,
    `| Code blocks | ${comparison.markdown.code_blocks} | ${comparison.html.code_blocks} | ${comparison.deltas.code_blocks} |`,
    `| Interactive controls | ${comparison.markdown.interactive_controls} | ${comparison.html.interactive_controls} | ${comparison.deltas.interactive_controls} |`,
    `| Scripts | ${comparison.markdown.scripts} | ${comparison.html.scripts} | ${comparison.deltas.scripts} |`,
    '',
    '## Semantic Equivalence',
    '',
    `score: ${comparison.semantic_equivalence.score}`,
    `status: ${comparison.semantic_equivalence.status}`,
    `heading_overlap: ${comparison.semantic_equivalence.heading_overlap}`,
    `term_overlap: ${comparison.semantic_equivalence.term_overlap}`,
    `link_overlap: ${comparison.semantic_equivalence.link_overlap}`,
    '',
    '## Criteria',
    '',
    ...Object.entries(comparison.criteria).map(([key, value]) => `- ${key}: ${value}`),
    '',
    '## Rationale',
    '',
    ...comparison.decision_rationale.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function provenanceInventory(text, kind, links, sourceRole) {
  const scriptSrcs = kind === 'html'
    ? [...text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map((match) => match[1])
    : [];
  const importRefs = [
    ...text.matchAll(/\bimport\s+(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g),
    ...text.matchAll(/\brequire\(["']([^"']+)["']\)/g),
  ].map((match) => match[1]);
  const externalLinks = links.filter((link) => /^https?:\/\//i.test(link.href));
  const localLinks = links.filter((link) => !/^https?:\/\//i.test(link.href));

  return {
    role: sourceRole,
    derived_declared: sourceRole === 'derived',
    external_link_count: externalLinks.length,
    local_link_count: localLinks.length,
    external_links: externalLinks.slice(0, 120),
    local_links: localLinks.slice(0, 120),
    script_srcs: scriptSrcs,
    inline_script_count: kind === 'html' ? Math.max(0, countMatches(text, /<script\b/gi) - scriptSrcs.length) : 0,
    import_refs: [...new Set(importRefs)].slice(0, 120),
    provenance_gaps: [
      ...(sourceRole === 'derived' ? ['derived_source_not_machine_verified'] : []),
      ...(scriptSrcs.length > 0 ? ['external_or_local_script_dependency_present'] : []),
      ...(externalLinks.length > 0 ? ['linked_sources_not_fetched_or_verified'] : []),
    ],
  };
}

function summarizeProvenance(sources) {
  return {
    derived_count: sources.filter((source) => source.source_role === 'derived').length,
    total_external_links: sources.reduce((sum, source) => sum + source.provenance.external_link_count, 0),
    total_local_links: sources.reduce((sum, source) => sum + source.provenance.local_link_count, 0),
    total_script_srcs: sources.reduce((sum, source) => sum + source.provenance.script_srcs.length, 0),
    total_inline_scripts: sources.reduce((sum, source) => sum + source.provenance.inline_script_count, 0),
    total_import_refs: sources.reduce((sum, source) => sum + source.provenance.import_refs.length, 0),
    gaps: [...new Set(sources.flatMap((source) => source.provenance.provenance_gaps))],
  };
}

function semanticFingerprint(text, kind) {
  const plain = stripTags(kind === 'html' ? text.replace(/<script[\s\S]*?<\/script>/gi, ' ') : text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ');
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'were', 'you', 'your', 'have', 'has', 'not', 'but', 'all', 'can', 'will', 'should', 'could', 'would']);
  const counts = new Map();
  for (const term of plain.split(/\s+/).filter((item) => item.length > 2 && !stop.has(item))) {
    counts.set(term, (counts.get(term) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    term_count: counts.size,
    top_terms: ranked.slice(0, 80).map(([term, count]) => ({ term, count })),
  };
}

function semanticEquivalence(md, html) {
  const mdTerms = new Set(md.semantic_fingerprint.top_terms.map((entry) => entry.term));
  const htmlTerms = new Set(html.semantic_fingerprint.top_terms.map((entry) => entry.term));
  const mdHeadings = new Set(md.heading_tree.map((heading) => heading.text.toLowerCase()));
  const htmlHeadings = new Set(html.heading_tree.map((heading) => heading.text.toLowerCase()));
  const mdLinks = new Set(md.links.map((link) => link.href));
  const htmlLinks = new Set(html.links.map((link) => link.href));
  const termOverlap = overlapScore(mdTerms, htmlTerms);
  const headingOverlap = overlapScore(mdHeadings, htmlHeadings);
  const linkOverlap = overlapScore(mdLinks, htmlLinks);
  const score = Number(((termOverlap * 0.55) + (headingOverlap * 0.25) + (linkOverlap * 0.20)).toFixed(3));
  return {
    score,
    status: score >= 0.8 ? 'strong_semantic_overlap' : score >= 0.55 ? 'partial_semantic_overlap' : 'weak_semantic_overlap',
    term_overlap: Number(termOverlap.toFixed(3)),
    heading_overlap: Number(headingOverlap.toFixed(3)),
    link_overlap: Number(linkOverlap.toFixed(3)),
    method: 'top-term-heading-link weighted overlap; structural benchmark only, not proof of full meaning preservation',
  };
}

function overlapScore(left, right) {
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const item of left) {
    if (right.has(item)) shared += 1;
  }
  return shared / Math.max(left.size, right.size);
}

function buildControlSurface({ manifest, comparison, claims = '', title }) {
  const manifestData = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  const comparisonData = JSON.parse(fs.readFileSync(comparison, 'utf8'));
  const claimData = claims && fs.existsSync(claims) ? JSON.parse(fs.readFileSync(claims, 'utf8')) : null;
  const sources = manifestData.sources || [];
  const claimRows = claimData?.claims || [];
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    ':root{--ink:#17201b;--paper:#f7f3e8;--line:#c6b98d;--accent:#315c48;--warn:#9a4d22;}',
    'body{margin:0;background:linear-gradient(135deg,#f7f3e8,#e7dfc3);color:var(--ink);font-family:Georgia,serif;}',
    'main{max-width:1180px;margin:0 auto;padding:40px 24px 72px;}',
    'h1{font-size:clamp(34px,6vw,72px);line-height:.95;margin:0 0 18px;}',
    'h2{border-bottom:1px solid var(--line);padding-bottom:8px;margin-top:36px;}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;}',
    '.card{background:rgba(255,255,255,.55);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 12px 30px rgba(49,92,72,.08);}',
    '.metric{font-size:32px;font-weight:700;color:var(--accent);}',
    'table{width:100%;border-collapse:collapse;background:rgba(255,255,255,.45);}',
    'th,td{border-bottom:1px solid var(--line);padding:10px;text-align:left;vertical-align:top;}',
    'code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;}',
    '.warn{color:var(--warn);font-weight:700;}',
    '</style>',
    '</head>',
    '<body>',
    '<main id="main-content">',
    `<h1>${escapeHtml(title)}</h1>`,
    '<p>Derived HTML control surface. Markdown remains canonical; this file is navigation, audit, and orchestration UI only.</p>',
    '<section class="grid" aria-label="Run metrics">',
    metricCard('Sources', manifestData.source_count),
    metricCard('External Links', manifestData.provenance_summary?.total_external_links || 0),
    metricCard('Semantic Score', comparisonData.semantic_equivalence?.score ?? 'n/a'),
    metricCard('Decision', comparisonData.decision || 'unknown'),
    '</section>',
    '<h2>Sources</h2>',
    '<table><thead><tr><th>File</th><th>Role</th><th>Kind</th><th>Hash</th><th>Signals</th></tr></thead><tbody>',
    ...sources.map((source) => `<tr><td><code>${escapeHtml(source.file)}</code></td><td>${escapeHtml(source.source_role)}</td><td>${escapeHtml(source.kind)}</td><td><code>${escapeHtml(source.sha256.slice(0, 16))}</code></td><td>${escapeHtml(`${source.heading_count} headings, ${source.link_count} links, ${source.table_rows} table rows`)}</td></tr>`),
    '</tbody></table>',
    '<h2>MD vs HTML</h2>',
    `<p><strong>Decision:</strong> ${escapeHtml(comparisonData.decision)}. <strong>Semantic status:</strong> ${escapeHtml(comparisonData.semantic_equivalence?.status || 'unknown')}.</p>`,
    '<h2>Council Claims</h2>',
    claimRows.length > 0 ? '<table><thead><tr><th>Type</th><th>Source</th><th>Claim</th><th>Promotion</th></tr></thead><tbody>' : '<p>No claim register attached.</p>',
    ...claimRows.slice(0, 80).map((claim) => `<tr><td>${escapeHtml(claim.classification)}</td><td>${escapeHtml(claim.source_section)}</td><td>${escapeHtml(claim.text)}</td><td>${escapeHtml(claim.promotion)}</td></tr>`),
    claimRows.length > 0 ? '</tbody></table>' : '',
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function metricCard(label, value) {
  return `<article class="card"><div>${escapeHtml(label)}</div><div class="metric">${escapeHtml(String(value))}</div></article>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function extractAttr(tag, attr) {
  const match = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
  return match ? match[1] : '';
}

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function extractSections(source) {
  const raw = fs.readFileSync(source.file, 'utf8');
  const lines = raw.split(/\r?\n/);
  const headings = source.heading_tree.length > 0
    ? source.heading_tree.map((heading) => ({
      level: heading.level,
      heading: heading.text,
      source_line: heading.source_line || 1,
    }))
    : [{ level: 1, heading: '[document]', source_line: 1 }];
  const stack = [];
  return headings.map((heading, index) => {
    while (stack.length > 0 && stack[stack.length - 1].level >= heading.level) stack.pop();
    stack.push({ level: heading.level, heading: heading.heading });
    const startLine = heading.source_line;
    const endLine = index + 1 < headings.length ? Math.max(startLine, headings[index + 1].source_line - 1) : lines.length;
    const sectionText = lines.slice(startLine - 1, endLine).join('\n');
    const sectionLinks = extractLinks(sectionText, source.kind);
    const tableInfo = countTables(sectionText, source.kind);
    const words = sectionText.match(/\S+/g) || [];
    return {
      id: sectionId(source.file, startLine, heading.heading),
      source_file: source.file,
      source_sha256: source.sha256,
      source_role: source.source_role,
      kind: source.kind,
      level: heading.level,
      heading: heading.heading,
      heading_path: stack.map((entry) => entry.heading),
      start_line: startLine,
      end_line: endLine,
      sha256: crypto.createHash('sha256').update(sectionText).digest('hex'),
      bytes: Buffer.byteLength(sectionText),
      words: words.length,
      approx_tokens: Math.ceil(words.length * 1.33),
      link_count: sectionLinks.length,
      table_rows: tableInfo.rows,
      table_count: tableInfo.count,
      code_blocks: countCodeBlocks(sectionText, source.kind),
      diagrams: countDiagrams(sectionText, source.kind),
      scripts: source.kind === 'html' ? countMatches(sectionText, /<script\b/gi) : 0,
      interactive_controls: source.kind === 'html' ? countMatches(sectionText, /<(button|input|select|textarea|form)\b/gi) : 0,
      prompt_injection_risks: promptInjectionRisks(sectionText),
      suitability: suitability(source.kind, promptInjectionRisks(sectionText), sectionText),
    };
  });
}

function extractDocumentClaims(source) {
  const raw = fs.readFileSync(source.file, 'utf8');
  const lines = raw.split(/\r?\n/);
  return extractSections(source).flatMap((section) => {
    const sectionLines = lines.slice(section.start_line - 1, section.end_line);
    return sectionLines.flatMap((line, offset) => {
      const sourceLine = section.start_line + offset;
      const text = normalizeDocumentClaimLine(line);
      if (!looksLikeDocumentClaim(text)) return [];
      const classification = classifyDocumentClaim(text);
      const inlineLinks = extractLinks(line, source.kind).map((link) => ({
        href: link.href,
        normalized_href: normalizeHref(link.href),
        text: link.text,
        tier: classifyReferenceTier(link.href).tier,
      }));
      return [{
        id: documentClaimId(source.file, sourceLine, text),
        source_file: source.file,
        source_sha256: source.sha256,
        source_role: source.source_role,
        source_kind: source.kind,
        section_id: section.id,
        heading_path: section.heading_path,
        source_line: sourceLine,
        text,
        classification,
        taint_status: 'tainted_source_claim',
        promotion: documentClaimPromotion(classification),
        evidence_required: documentClaimEvidenceRequired(classification),
        references: inlineLinks,
      }];
    });
  });
}

function normalizeDocumentClaimLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || /^```/.test(trimmed) || /^[-*]{3,}$/.test(trimmed)) return '';
  if (/^\|?\s*:?-{3,}:?\s*\|/.test(trimmed)) return '';
  if (/^#{1,6}\s+/.test(trimmed)) return '';
  if (/^\|/.test(trimmed)) {
    return trimmed.split('|').map((cell) => cell.trim()).filter(Boolean).join(' | ');
  }
  return trimmed
    .replace(/^[-*]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .trim();
}

function looksLikeDocumentClaim(text) {
  if (!text || text.length < 12) return false;
  return /\b(pass|fail|risk|upgrade|candidate|should|must|requires?|evidence|benchmark|baseline|uncertain|hypothesis|source|memory|routing|sandbox|manifest|verify|claim)\b/i.test(text);
}

function classifyDocumentClaim(text) {
  const lower = text.toLowerCase();
  if (/(delete secrets|exfiltrate|disable guard|bypass policy|ignore previous)/.test(lower)) return 'unsafe_or_rejected';
  if (/\b(risk|unsafe|blindspot|poison|contaminat|failure|regression|worse)\b/.test(lower)) return 'risk';
  if (/\b(test|benchmark|verify|check|baseline|selftest|acceptance|fuzz)\b/.test(lower)) return 'test_candidate';
  if (/\b(upgrade|candidate|adopt|promote|implement|add|extend|formalize)\b/.test(lower)) return 'upgrade_candidate';
  if (/\b(pass|sha256|evidence|source|observed|file)\b/.test(lower)) return 'verified_fact_candidate';
  return 'hypothesis';
}

function documentClaimPromotion(classification) {
  if (classification === 'verified_fact_candidate') return 'eligible_after_local_verification';
  if (classification === 'test_candidate') return 'execute_test_or_record_blocker';
  if (classification === 'upgrade_candidate') return 'direct_check_required_before_ranking';
  if (classification === 'risk') return 'direct_check_required_before_risk_register';
  if (classification === 'hypothesis') return 'direct_check_required_or_record_blocker';
  return 'blocked';
}

function documentClaimEvidenceRequired(classification) {
  if (classification === 'verified_fact_candidate') return ['local command output', 'file hash/path', 'test result'];
  if (classification === 'test_candidate') return ['new regression test', 'expected pass/fail gate'];
  if (classification === 'upgrade_candidate') return ['impact/risk/reversibility ranking', 'acceptance test'];
  if (classification === 'risk') return ['reproduction or explicit unresolved assumption'];
  if (classification === 'hypothesis') return ['deterministic validation before promotion'];
  return ['none; blocked'];
}

function groupReferencesByNormalizedHref(references) {
  const groups = new Map();
  for (const reference of references) {
    const normalizedHref = reference.normalized_href || normalizeHref(reference.href || '');
    if (!groups.has(normalizedHref)) {
      groups.set(normalizedHref, {
        normalized_href: normalizedHref,
        href: reference.href || normalizedHref,
        tier: reference.tier || 'unknown',
        resolution_precision: reference.resolution_precision || 'exact',
        cleanup_notes: new Set(reference.cleanup_notes || []),
        reference_ids: [],
        source_lines: [],
        occurrence_count: 0,
      });
    }
    const group = groups.get(normalizedHref);
    group.reference_ids.push(reference.id);
    if (reference.source_line) group.source_lines.push(reference.source_line);
    group.occurrence_count += reference.occurrence_count || 1;
    for (const note of reference.cleanup_notes || []) group.cleanup_notes.add(note);
  }
  for (const group of groups.values()) group.cleanup_notes = [...group.cleanup_notes];
  return groups;
}

function candidateReferencesForClaim(claim, references, sections) {
  const sameFile = references.filter((reference) => reference.source_file === claim.source_file);
  const section = sections.find((item) => item.id === claim.section_id)
    || sections.find((item) => item.source_file === claim.source_file && claim.source_line >= item.start_line && claim.source_line <= item.end_line);
  const inline = extractLinks(claim.text || '', claim.source_kind || 'markdown')
    .map((link) => normalizeHref(link.href))
    .filter(Boolean);
  const byInline = sameFile.filter((reference) => inline.includes(reference.normalized_href || normalizeHref(reference.href || '')));
  const byLineWindow = sameFile.filter((reference) => reference.source_line && Math.abs(reference.source_line - claim.source_line) <= 8);
  const bySection = section
    ? sameFile.filter((reference) => reference.source_line >= section.start_line && reference.source_line <= section.end_line)
    : [];
  const bySourceCitation = sourceCitationLineRanges(claim.text)
    .flatMap((range) => sameFile.filter((reference) => reference.source_line >= range.start && reference.source_line <= range.end));
  return uniqueReferences([...byInline, ...bySourceCitation, ...byLineWindow, ...bySection]).slice(0, 24);
}

function sourceCitationLineRanges(text) {
  const ranges = [];
  for (const match of String(text || '').matchAll(/L(\d+)(?:-L?(\d+))?/g)) {
    const start = Number(match[1]);
    const end = Number(match[2] || match[1]);
    if (Number.isFinite(start) && Number.isFinite(end)) ranges.push({ start: Math.min(start, end), end: Math.max(start, end) });
  }
  return ranges;
}

function uniqueReferences(references) {
  const seen = new Set();
  const result = [];
  for (const reference of references) {
    const key = reference.id || `${reference.source_file}:${reference.source_line}:${reference.normalized_href || reference.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(reference);
  }
  return result;
}

async function fetchReferenceContents(targets, { timeoutMs, concurrency }) {
  const results = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const index = cursor;
      cursor += 1;
      const target = targets[index];
      results.set(target.normalized_href, await fetchReferenceContent(target, timeoutMs));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()));
  return results;
}

async function fetchReferenceContent(target, timeoutMs) {
  const href = target.final_url || target.normalized_href || target.href;
  const started = Date.now();
  try {
    const response = await fetch(href, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'user-agent': 'YuriArtifactAudit/1.0',
        accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5',
      },
    });
    if (!response.ok) {
      return {
        status: 'http_error',
        http_status: response.status,
        reason: `GET returned ${response.status}`,
        elapsed_ms: Date.now() - started,
      };
    }
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text();
    const text = normalizeEvidenceText(raw, contentType);
    return {
      status: 'fetched',
      http_status: response.status,
      final_url: response.url,
      content_type: contentType,
      bytes: Buffer.byteLength(raw),
      text_bytes: Buffer.byteLength(text),
      sha256: crypto.createHash('sha256').update(text).digest('hex'),
      title: extractTitle(raw, contentType),
      text,
      elapsed_ms: Date.now() - started,
      fetched_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: error.name === 'TimeoutError' ? 'timeout' : 'fetch_error',
      reason: error.message,
      elapsed_ms: Date.now() - started,
    };
  }
}

function summarizeContentFetch(result) {
  if (!result) return null;
  const { text, ...summary } = result;
  return summary;
}

function normalizeEvidenceText(raw, contentType) {
  let text = String(raw || '');
  if (/html/i.test(contentType) || /<html[\s>]/i.test(text)) {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ');
  }
  return text
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 250000);
}

function extractTitle(raw, contentType) {
  if (!/html/i.test(contentType)) return '';
  const match = String(raw || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : '';
}

function lexicalSupportScore(claimText, evidenceText) {
  const claimTerms = keyTerms(claimText);
  if (claimTerms.length === 0 || !evidenceText) return 0;
  const evidenceTerms = new Set(keyTerms(evidenceText, 4000));
  const shared = claimTerms.filter((term) => evidenceTerms.has(term));
  return Number((shared.length / claimTerms.length).toFixed(3));
}

function matchedKeyTerms(claimText, evidenceText) {
  const evidenceTerms = new Set(keyTerms(evidenceText, 4000));
  return keyTerms(claimText).filter((term) => evidenceTerms.has(term)).slice(0, 32);
}

function evidenceExcerpt(claimText, evidenceText) {
  const terms = matchedKeyTerms(claimText, evidenceText);
  const text = String(evidenceText || '');
  const lower = text.toLowerCase();
  const anchor = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0] || 0;
  const start = Math.max(0, anchor - 180);
  return text.slice(start, start + 520).trim();
}

function keyTerms(text, limit = 80) {
  const stop = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'were', 'you', 'your', 'have', 'has',
    'not', 'but', 'all', 'can', 'will', 'should', 'could', 'would', 'source', 'claim', 'evidence', 'filecite',
    'turn', 'line', 'lines', 'https', 'http', 'candidate', 'requires', 'required', 'current', 'local',
  ]);
  const counts = new Map();
  const normalized = stripTags(String(text || ''))
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ');
  for (const term of normalized.split(/\s+/)) {
    if (term.length < 3 || stop.has(term) || /^\d+$/.test(term)) continue;
    counts.set(term, (counts.get(term) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term);
}

function addSectionAdjacency(claims, edges) {
  const bySection = new Map();
  for (const claim of claims) {
    if (!bySection.has(claim.section_id)) bySection.set(claim.section_id, []);
    bySection.get(claim.section_id).push(claim);
  }
  for (const sectionClaims of bySection.values()) {
    for (let index = 0; index < sectionClaims.length - 1; index += 1) {
      edges.push({
        from_claim_id: sectionClaims[index].id,
        to_claim_id: sectionClaims[index + 1].id,
        section_id: sectionClaims[index].section_id,
        relation: 'same_source_section',
      });
    }
  }
}

function addSameReferenceAdjacency(supportEdges, sameReferenceEdges) {
  const byReference = new Map();
  for (const edge of supportEdges) {
    if (!byReference.has(edge.normalized_href)) byReference.set(edge.normalized_href, []);
    byReference.get(edge.normalized_href).push(edge);
  }
  for (const edges of byReference.values()) {
    const uniqueClaimIds = [...new Set(edges.map((edge) => edge.claim_id))];
    for (let index = 0; index < uniqueClaimIds.length - 1; index += 1) {
      sameReferenceEdges.push({
        from_claim_id: uniqueClaimIds[index],
        to_claim_id: uniqueClaimIds[index + 1],
        normalized_href: edges[0].normalized_href,
        relation: 'same_reference',
      });
    }
  }
}

function addContradictionAdjacency(claims, supportEdges, contradictionEdges) {
  const claimsById = new Map(claims.map((claim) => [claim.id, claim]));
  const byReference = new Map();
  const seen = new Set();
  for (const edge of supportEdges) {
    if (!byReference.has(edge.normalized_href)) byReference.set(edge.normalized_href, []);
    byReference.get(edge.normalized_href).push(edge.claim_id);
  }
  for (const [normalizedHref, claimIds] of byReference.entries()) {
    for (let leftIndex = 0; leftIndex < claimIds.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < claimIds.length; rightIndex += 1) {
        const left = claimsById.get(claimIds[leftIndex]);
        const right = claimsById.get(claimIds[rightIndex]);
        if (left && right && likelyContradiction(left.text, right.text)) {
          const key = [left.id, right.id, normalizedHref].sort().join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          contradictionEdges.push({
            from_claim_id: left.id,
            to_claim_id: right.id,
            normalized_href: normalizedHref,
            relation: 'contradicts',
            method: 'shared_reference_opposite_modality_heuristic',
          });
        }
      }
    }
  }
}

function likelyContradiction(left, right) {
  const leftLower = String(left || '').toLowerCase();
  const rightLower = String(right || '').toLowerCase();
  const leftNegated = /\b(no|not|never|without|fails?|blocked|unsafe|cannot|can't|does not)\b/.test(leftLower);
  const rightNegated = /\b(no|not|never|without|fails?|blocked|unsafe|cannot|can't|does not)\b/.test(rightLower);
  if (leftNegated === rightNegated) return false;
  const shared = new Set(keyTerms(leftLower).filter((term) => keyTerms(rightLower).includes(term)));
  return shared.size >= 3;
}

function classifyReferenceTier(href) {
  if (!/^https?:\/\//i.test(href)) {
    return { tier: 'unknown', reason: 'local_or_non_http_reference', evidenceStatus: 'local_reference_unverified' };
  }
  let host = '';
  try {
    host = new URL(href).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return { tier: 'unknown', reason: 'unparseable_url', evidenceStatus: 'unverified_reference' };
  }
  if (isP0Host(host)) return { tier: 'P0', reason: 'academic_or_official_source', evidenceStatus: 'source_claim_requires_fetch_or_local_verification' };
  if (isP1Host(host)) return { tier: 'P1', reason: 'repository_or_documentation_source', evidenceStatus: 'source_claim_requires_fetch_or_local_verification' };
  if (isP2Host(host)) return { tier: 'P2', reason: 'blog_company_social_or_context_source', evidenceStatus: 'context_only_until_verified' };
  return { tier: 'unknown', reason: 'unclassified_external_source', evidenceStatus: 'unverified_reference' };
}

function isP0Host(host) {
  return host === 'arxiv.org'
    || host.endsWith('.arxiv.org')
    || host === 'openreview.net'
    || host.endsWith('.openreview.net')
    || host === 'aclanthology.org'
    || host.endsWith('.aclanthology.org')
    || host === 'doi.org'
    || host === 'commonmark.org'
    || host === 'spec.commonmark.org'
    || host === 'developers.openai.com'
    || host === 'docs.github.com'
    || host.endsWith('.gov')
    || host === 'w3.org'
    || host.endsWith('.w3.org')
    || host === 'whatwg.org'
    || host === 'ietf.org'
    || host.endsWith('.ietf.org');
}

function isP1Host(host) {
  return host === 'github.com'
    || host.endsWith('.github.com')
    || host.endsWith('.github.io')
    || host === 'npmjs.com'
    || host.endsWith('.npmjs.com')
    || host === 'pypi.org'
    || host.endsWith('.pypi.org')
    || host === 'huggingface.co'
    || host.endsWith('.huggingface.co')
    || host === 'docs.vale.sh'
    || host === 'lychee.cli.rs'
    || host === 'mkdocs.org'
    || host.endsWith('.mkdocs.org')
    || host === 'squidfunk.github.io'
    || host === 'docusaurus.io'
    || host.endsWith('.docusaurus.io');
}

function isP2Host(host) {
  return host === 'x.com'
    || host === 'twitter.com'
    || host.endsWith('.twitter.com')
    || host === 'skool.com'
    || host.endsWith('.skool.com')
    || host === 'eduba.io'
    || host.endsWith('.eduba.io')
    || host === 'youtube.com'
    || host.endsWith('.youtube.com')
    || host === 'youtu.be'
    || host.endsWith('.medium.com')
    || host.endsWith('.substack.com');
}

function countByTier(references) {
  const counts = { P0: 0, P1: 0, P2: 0, unknown: 0 };
  for (const reference of references) counts[reference.tier] = (counts[reference.tier] || 0) + 1;
  return counts;
}

function verificationStatusFor(reference) {
  if (!/^https?:\/\//i.test(reference.href)) return 'local_unverified';
  return 'not_fetched';
}

function countBy(items, key) {
  return items.reduce((counts, item) => {
    const value = item[key] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function normalizeHref(href) {
  href = cleanHrefArtifact(href);
  if (/^https:\/\/services\.eduba\.io\/?$/i.test(href)) href = 'https://eduba.io/';
  if (!/^https?:\/\//i.test(href)) return href;
  try {
    const url = new URL(href);
    url.hash = '';
    return url.toString();
  } catch {
    return href;
  }
}

function referenceResolution(href) {
  const cleaned = cleanHrefArtifact(href);
  const normalized = normalizeHref(href);
  const cleanupNotes = [];
  if (cleaned !== String(href || '').trim()) cleanupNotes.push('trimmed_artifact_suffix');
  if (/^https:\/\/services\.eduba\.io\/?$/i.test(cleaned)) cleanupNotes.push('dead_services_subdomain_replaced_by_origin_homepage');
  return {
    normalized_href: normalized,
    precision: cleanupNotes.includes('dead_services_subdomain_replaced_by_origin_homepage') ? 'origin_replacement' : 'exact',
    cleanup_notes: cleanupNotes,
  };
}

function isUsableHttpHref(href) {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const url = new URL(href);
    return Boolean(url.hostname);
  } catch {
    return false;
  }
}

function cleanHrefArtifact(href) {
  return String(href || '')
    .trim()
    .replace(/[\uE000-\uF8FF]+$/gu, '')
    .replace(/[),.;:'"`\]]+$/g, '')
    .trim();
}

function linkCleanupIssue(href) {
  const value = String(href || '');
  const issues = [];
  if (/[\uE000-\uF8FF]/u.test(value)) issues.push('private_use_marker');
  if (/[),.;:'"`\]]+$/.test(value)) issues.push('trailing_punctuation_or_quote');
  if (/^https?:\/\/["']?$/i.test(value.trim())) issues.push('missing_host');
  if (/^https:\/\/services\.eduba\.io\/?$/i.test(value.trim())) issues.push('dead_services_subdomain_origin_replacement');
  return issues.join('+');
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function referenceId(file, href, line) {
  return `ref-${crypto.createHash('sha1').update(`${file}:${line}:${href}`).digest('hex').slice(0, 10)}`;
}

function sectionId(file, line, heading) {
  return `section-${crypto.createHash('sha1').update(`${file}:${line}:${heading}`).digest('hex').slice(0, 10)}`;
}

function documentClaimId(file, line, text) {
  return `docclaim-${crypto.createHash('sha1').update(`${file}:${line}:${text}`).digest('hex').slice(0, 10)}`;
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function writeResult(value, format = 'json', out = '') {
  const body = format === 'markdown' || format === 'html' ? String(value) : `${JSON.stringify(value, null, 2)}\n`;
  if (out) fs.writeFileSync(path.resolve(out), body);
  else process.stdout.write(body);
}
