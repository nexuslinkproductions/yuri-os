#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'yuri-artifact-audit.mjs');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yuri-artifact-audit-test-'));
const execFileAsync = promisify(execFile);
const server = http.createServer((request, response) => {
  if (request.url === '/ok') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
    return;
  }
  if (request.url === '/paper') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('Exact attention remains important for hard retrieval workloads because alternatives face expressiveness limits and kernel efficiency constraints.');
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain' });
  response.end('missing');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const serverPort = server.address().port;

try {
  const md = path.join(tempRoot, 'source.md');
  const html = path.join(tempRoot, 'source.html');
  fs.writeFileSync(md, [
    '# Test Artifact',
    '',
    'See [CommonMark](https://spec.commonmark.org/current/).',
    '',
    '- Upgrade candidate: Add source manifests before promotion.',
    '- Risk: raw model output may poison memory.',
    '- Test: verify section graph alignment.',
    '- Hypothesis: future alignment could compare section graphs.',
    '',
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '```mermaid',
    'flowchart LR',
    '  A --> B',
    '  label["https://"]',
    '```',
    '',
  ].join('\n'));
  fs.writeFileSync(html, [
    '<!doctype html>',
    '<html><body>',
    '<a href="#main-content">Skip to main content</a>',
    '<main id="main-content">',
    '<h1 id="test-artifact">Test Artifact</h1>',
    '<a href="https://spec.commonmark.org/current/">CommonMark</a>',
    '<p>Upgrade candidate: Add source manifests before promotion.</p>',
    '<p>Risk: raw model output may poison memory.</p>',
    '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
    '<button type="button" aria-label="Toggle">Toggle</button>',
    '<script>window.__test = true;</script>',
    '</main></body></html>',
    '',
  ].join('\n'));

  const manifest = JSON.parse(execFileSync(process.execPath, [script, 'source-manifest', md, html], { encoding: 'utf8' }));
  assert.equal(manifest.schema_version, 2, 'manifest schema v2 missing');
  assert.equal(Boolean(manifest.manifest_id), true, 'manifest id missing');
  assert.equal(manifest.source_count, 2, 'manifest should include both files');
  assert.equal(manifest.provenance_summary.total_external_links, 2, 'external provenance summary mismatch');
  assert(manifest.provenance_summary.gaps.includes('linked_sources_not_fetched_or_verified'), 'linked-source provenance gap missing');
  assert.equal(manifest.sources[0].heading_count, 1, 'markdown heading count mismatch');
  assert.equal(manifest.sources[0].link_count, 1, 'markdown link count mismatch');
  assert.equal(manifest.sources[1].scripts, 1, 'html script count mismatch');
  assert.equal(manifest.sources[1].interactive_controls, 1, 'html interactive control count mismatch');
  assert.equal(manifest.sources[1].suitability, 'derived_review_artifact_only', 'scripted html should be derived only');

  const registry = JSON.parse(execFileSync(process.execPath, [script, 'reference-registry', md, html], { encoding: 'utf8' }));
  assert.equal(registry.schema_version, 2, 'reference registry schema missing');
  assert.equal(registry.reference_count, 3, 'registry should preserve external links and local anchors');
  assert.equal(registry.counts_by_tier.P0, 2, 'CommonMark spec should be tiered as P0 academic/official');
  assert.equal(registry.counts_by_tier.unknown, 1, 'local anchors should stay unverified');
  assert.equal(registry.verification_status_counts.not_fetched, 2, 'external references should be marked not_fetched by default');
  assert.equal(registry.verification_status_counts.local_unverified, 1, 'local anchors should be marked local_unverified');
  const mdReference = registry.references.find((reference) => reference.source_kind === 'markdown' && reference.href.includes('commonmark'));
  const htmlReference = registry.references.find((reference) => reference.source_kind === 'html' && reference.href.includes('commonmark'));
  assert.equal(mdReference.source_line, 3, 'markdown source line should be preserved');
  assert.equal(mdReference.occurrence_count, 2, 'duplicate normalized references should be counted');
  assert.equal(mdReference.verification_status, 'not_fetched', 'reference verification status should be explicit');
  assert.equal(htmlReference.source_line, 6, 'html source line should be preserved');

  const sections = JSON.parse(execFileSync(process.execPath, [script, 'section-manifest', md, html], { encoding: 'utf8' }));
  assert.equal(sections.schema_version, 1, 'section manifest schema missing');
  assert.equal(sections.section_count, 2, 'section manifest should include one section per fixture file');
  assert.equal(sections.sections[0].heading, 'Test Artifact', 'markdown heading missing from section manifest');
  assert.equal(sections.sections[0].start_line, 1, 'markdown section start line mismatch');
  assert.equal(sections.sections[0].link_count, 1, 'markdown section link count mismatch');
  assert.equal(sections.sections[1].heading, 'Test Artifact', 'html heading missing from section manifest');
  assert.equal(sections.sections[1].interactive_controls, 1, 'html section control count mismatch');

  const documentClaims = JSON.parse(execFileSync(process.execPath, [script, 'document-claims', md], { encoding: 'utf8' }));
  assert.equal(documentClaims.schema_version, 1, 'document claim register schema missing');
  assert.equal(documentClaims.local_truth_claim, false, 'document claims must remain tainted');
  assert(documentClaims.claims.some((claim) => claim.classification === 'upgrade_candidate' && claim.heading_path.includes('Test Artifact')), 'upgrade claim candidate missing');
  assert(documentClaims.claims.some((claim) => claim.classification === 'risk' && claim.evidence_required.includes('reproduction or explicit unresolved assumption')), 'risk claim candidate missing');
  assert(documentClaims.claims.some((claim) => claim.classification === 'hypothesis' && claim.promotion === 'direct_check_required_or_record_blocker'), 'document hypotheses should be active direct checks');
  assert(documentClaims.claims.some((claim) => claim.classification === 'test_candidate' && claim.promotion === 'execute_test_or_record_blocker'), 'document tests should be executable direct checks');
  assert(documentClaims.claims.some((claim) => claim.classification === 'upgrade_candidate' && claim.promotion === 'direct_check_required_before_ranking'), 'document upgrades should require direct checking');

  const verifyRegistryPath = path.join(tempRoot, 'verify-registry.json');
  fs.writeFileSync(verifyRegistryPath, JSON.stringify({
    references: [
      { id: 'ok-ref', href: `http://127.0.0.1:${serverPort}/ok`, normalized_href: `http://127.0.0.1:${serverPort}/ok`, tier: 'P1' },
      { id: 'ok-ref-dirty', href: `http://127.0.0.1:${serverPort}/ok\uE201`, normalized_href: `http://127.0.0.1:${serverPort}/ok`, tier: 'P1' },
      { id: 'missing-ref', href: `http://127.0.0.1:${serverPort}/missing`, normalized_href: `http://127.0.0.1:${serverPort}/missing`, tier: 'P1' },
      { id: 'local-ref', href: '#main-content', normalized_href: '#main-content', tier: 'unknown' },
    ],
  }, null, 2));
  const referenceVerificationResult = await execFileAsync(
    process.execPath,
    [script, 'reference-verify', '--registry', verifyRegistryPath, '--timeout-ms', '2000'],
    { encoding: 'utf8' },
  );
  const referenceVerification = JSON.parse(referenceVerificationResult.stdout);
  assert.equal(referenceVerification.schema_version, 1, 'reference verification schema missing');
  assert.equal(referenceVerification.counts.reachable, 1, 'reachable reference count mismatch');
  assert.equal(referenceVerification.counts.http_error, 1, 'http error reference count mismatch');
  assert.equal(referenceVerification.counts.local_skipped, 1, 'local skipped reference count mismatch');
  assert(referenceVerification.results.some((result) => result.reference_ids.includes('ok-ref-dirty') && result.status === 'reachable'), 'private-use URL marker should be normalized before verification');

  const cleanupReport = execFileSync(
    process.execPath,
    [script, 'link-cleanup-report', '--registry', verifyRegistryPath, '--verification', verifyRegistryPath],
    { encoding: 'utf8' },
  );
  assert(cleanupReport.includes('Link Cleanup Report'), 'cleanup report heading missing');

  const graphClaimsPath = path.join(tempRoot, 'graph-claims.json');
  const graphRegistryPath = path.join(tempRoot, 'graph-registry.json');
  const graphVerificationPath = path.join(tempRoot, 'graph-verification.json');
  const graphSectionsPath = path.join(tempRoot, 'graph-sections.json');
  fs.writeFileSync(graphClaimsPath, JSON.stringify({
    claims: [
      {
        id: 'claim-1',
        source_file: md,
        source_kind: 'markdown',
        section_id: 'section-1',
        source_line: 4,
        text: 'Exact attention remains important for hard retrieval workloads because alternatives face expressiveness limits and kernel efficiency constraints.',
        classification: 'verified_fact_candidate',
      },
    ],
  }, null, 2));
  fs.writeFileSync(graphRegistryPath, JSON.stringify({
    references: [
      {
        id: 'paper-ref',
        href: `http://127.0.0.1:${serverPort}/paper`,
        normalized_href: `http://127.0.0.1:${serverPort}/paper`,
        source_file: md,
        source_line: 5,
        tier: 'P1',
        occurrence_count: 1,
      },
    ],
  }, null, 2));
  fs.writeFileSync(graphVerificationPath, JSON.stringify({
    results: [
      {
        href: `http://127.0.0.1:${serverPort}/paper`,
        normalized_href: `http://127.0.0.1:${serverPort}/paper`,
        status: 'reachable',
        http_status: 200,
        final_url: `http://127.0.0.1:${serverPort}/paper`,
        reference_ids: ['paper-ref'],
      },
    ],
  }, null, 2));
  fs.writeFileSync(graphSectionsPath, JSON.stringify({
    sections: [
      { id: 'section-1', source_file: md, start_line: 1, end_line: 8 },
    ],
  }, null, 2));
  const graphResult = await execFileAsync(
    process.execPath,
    [
      script,
      'claim-evidence-graph',
      '--claims',
      graphClaimsPath,
      '--registry',
      graphRegistryPath,
      '--verification',
      graphVerificationPath,
      '--sections',
      graphSectionsPath,
      '--timeout-ms',
      '2000',
    ],
    { encoding: 'utf8' },
  );
  const graph = JSON.parse(graphResult.stdout);
  assert.equal(graph.schema_version, 1, 'claim evidence graph schema missing');
  assert.equal(graph.edge_counts.supports, 1, 'content-level support edge missing');
  assert.equal(graph.verified_source_claims.claim_count, 1, 'verified source claim missing');
  assert(graph.verified_source_claims.claims[0].evidence_excerpt.includes('Exact attention'), 'evidence excerpt missing');
  assert(Array.isArray(graph.adjacency.contradicts), 'contradiction adjacency should be present');

  const graphOutputPath = path.join(tempRoot, 'claim-evidence-graph.json');
  const verifiedOutputPath = path.join(tempRoot, 'verified-source-claims.json');
  const promotionGatePath = path.join(tempRoot, 'promotion-gate.json');
  fs.writeFileSync(graphOutputPath, JSON.stringify(graph, null, 2));
  fs.writeFileSync(verifiedOutputPath, JSON.stringify(graph.verified_source_claims, null, 2));
  execFileSync(
    process.execPath,
    [
      script,
      'promotion-gate',
      '--graph',
      graphOutputPath,
      '--verified',
      verifiedOutputPath,
      '--out',
      promotionGatePath,
    ],
    { encoding: 'utf8' },
  );
  const promotionGate = JSON.parse(fs.readFileSync(promotionGatePath, 'utf8'));
  assert.equal(promotionGate.schema_version, 1, 'promotion gate schema missing');
  assert.equal(promotionGate.counts.eligible, 1, 'supported P1 claim should pass promotion gate');

  const comparison = JSON.parse(execFileSync(
    process.execPath,
    [script, 'md-vs-html', '--markdown', md, '--html', html],
    { encoding: 'utf8' },
  ));
  assert.equal(comparison.decision, 'markdown_canonical_html_derived', 'canonical decision mismatch');
  assert.equal(comparison.criteria.prompt_injection_surface, 'html_larger_surface', 'html risk surface should be larger');
  assert(['strong_semantic_overlap', 'partial_semantic_overlap'].includes(comparison.semantic_equivalence.status), 'semantic overlap should be measurable for matched fixtures');
  assert(comparison.semantic_equivalence.score >= 0.55, 'semantic overlap score should clear partial threshold');

  const report = execFileSync(
    process.execPath,
    [script, 'md-vs-html', '--format', 'markdown', '--markdown', md, '--html', html],
    { encoding: 'utf8' },
  );
  assert(report.includes('# MD vs HTML Comparison'), 'markdown report heading missing');
  assert(report.includes('decision: markdown_canonical_html_derived'), 'markdown report decision missing');
  assert(report.includes('## Semantic Equivalence'), 'semantic section missing');

  const manifestPath = path.join(tempRoot, 'manifest.json');
  const comparisonPath = path.join(tempRoot, 'comparison.json');
  const claimsPath = path.join(tempRoot, 'claims.json');
  const controlSurfacePath = path.join(tempRoot, 'control.html');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
  fs.writeFileSync(claimsPath, JSON.stringify({
    claims: [
      {
        classification: 'hypothesis',
        source_section: 'deepseek',
        text: 'Adversarial HTML corpus should be expanded.',
        promotion: 'direct_check_required_or_record_blocker',
      },
    ],
  }, null, 2));
  execFileSync(
    process.execPath,
    [script, 'control-surface', '--manifest', manifestPath, '--comparison', comparisonPath, '--claims', claimsPath, '--out', controlSurfacePath],
    { encoding: 'utf8' },
  );
  const controlSurface = fs.readFileSync(controlSurfacePath, 'utf8');
  assert(controlSurface.includes('Derived HTML control surface'), 'control surface boundary missing');
  assert(controlSurface.includes('Adversarial HTML corpus'), 'claim row missing from control surface');

  process.stdout.write('yuri-artifact-audit: pass\n');
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
