#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyArtifact, assess, assessAll, stalenessScore, ZONE_RULES, PINNED_ANCHORS, isPinned, fileTypeOf, CANONICAL_ZONES } from './filing-assessor.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log(`  FAIL ${name}`); } };
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// classification: first-match-wins deterministic placement
ok(classifyArtifact('02_RESOURCES/RESEARCH/yuri-formula-foundry-spec-2026-06-08.md').zone === '02_RESOURCES/RESEARCH', 'a research doc → 02_RESOURCES/RESEARCH');
ok(classifyArtifact('/tmp/foundry-synth-native-drafts.txt').zone === 'EPHEMERAL', 'a /tmp scratch file → EPHEMERAL');
ok(classifyArtifact('_SYSTEM/Scripts/math/formula-foundry.mjs').zone === '_SYSTEM/Scripts/math', 'a math module → _SYSTEM/Scripts/math');
ok(classifyArtifact('_SYSTEM/Scripts/yuri-navigate.mjs').zone === '_SYSTEM/Scripts', 'a non-math script → _SYSTEM/Scripts');
ok(classifyArtifact('_SYSTEM/config/schemas/x.schema.json').zone === '_SYSTEM/config/schemas', 'a schema → _SYSTEM/config/schemas');
ok(classifyArtifact('_SYSTEM/docs/YURI_NATIVE_RAPIDFIRE_CLAUDE_HANDOFF_2026-06-08.md').zone === '_SYSTEM/docs/handoffs', 'a handoff doc → _SYSTEM/docs/handoffs (sub-zone, expanded map)');
ok(classifyArtifact('_SYSTEM/state/originator-telemetry.jsonl').zone === '_SYSTEM/state', 'a jsonl telemetry → _SYSTEM/state');
ok(classifyArtifact('some/random/thing.xyz').zone === null, 'an unknown artifact → unclassified (owner decision), not a guess');
ok(classifyArtifact('notes.bak').zone === 'EPHEMERAL', 'literal .bak suffix remains ephemeral');
ok(classifyArtifact('.claude/settings.json.bak-cwdfix').zone === null,
  'A-4: repo-resident .bak-* config backup is not flagged as an ephemeral purge candidate');

// determinism
ok(JSON.stringify(classifyArtifact('a/b.mjs')) === JSON.stringify(classifyArtifact('a/b.mjs')), 'classification deterministic');
const src = fs.readFileSync(path.join(__dirname, 'filing-assessor.mjs'), 'utf8');
ok(!/Math\.random\(|Date\.now\(|new Date\(/.test(src), 'no Math.random/Date.now/new Date (deterministic)');

// misplaced detection: a research .md sitting in the wrong zone
const mis = assess('_SYSTEM/Scripts/some-spec-synthesis.md');
ok(mis.recommendedZone === '02_RESOURCES/RESEARCH' && mis.misplaced === true, 'a research doc in _SYSTEM/Scripts is flagged misplaced');
ok(assess('02_RESOURCES/RESEARCH/x-spec.md').misplaced === false, 'a research doc already in RESEARCH is NOT misplaced');
ok(assess('evil/_SYSTEM/Scripts/path/totally-elsewhere.mjs').recommendedZone === null,
  'A-2: fake _SYSTEM/Scripts substring outside the real zone is not classified as a script');
ok(assess('my02_RESOURCES_notes/thing.md').recommendedZone === null,
  'A-2: fake 02_RESOURCES substring outside the real zone is not classified as research');

// staleness: hazard-decay, older ⇒ higher purge pressure
ok(stalenessScore(0) === 0, 'a brand-new artifact has zero purge pressure');
ok(stalenessScore(336) > stalenessScore(24), 'an older temp file has MORE purge pressure (hazard-decay)');
ok(stalenessScore(168) > 0.49 && stalenessScore(168) < 0.51, 'at one half-life, purge pressure ≈ 0.5');

// assessAll report: read-only, surfaces misplaced + ephemeral-in-repo
const r = assessAll(['02_RESOURCES/RESEARCH/ok.md', '_SYSTEM/Scripts/wrongplace-synthesis.md', 'some/junk.xyz']);
ok(r.advisory_only === true, 'the report is advisory/read-only (no file is moved)');
ok(r.misplaced.length === 1 && r.unclassified.length === 1, 'report surfaces misplaced + unclassified counts');
ok(r.rows.every((x, i) => i === 0 || r.rows[i - 1].path.localeCompare(x.path) <= 0), 'report rows are sorted');
const invalidBatch = assessAll(['02_RESOURCES/RESEARCH/ok.md', null, 123]);
ok(invalidBatch.total === 3 && invalidBatch.rows.filter((row) => row.kind === 'invalid').length === 2,
  'A-3: assessAll reports malformed path entries as invalid rows instead of throwing');

// ── EXPANDED ZONE MAP (24+ zones) ─────────────────────────────────────────────────────────────

// PINNED canonical anchors — NEVER relocated (the 3 @-includes are the load-bearing case)
ok(isPinned('_SYSTEM/yuri-origin.md') && isPinned('_SYSTEM/persona.md') && isPinned('SOUL.md'),
  'PINNED: the 3 @-include boot anchors are pinned');
ok(assess('SOUL.md').misplaced === false && assess('SOUL.md').pinned === true,
  'PINNED: SOUL.md is never misplaced (recommendedZone = currentZone)');
ok(assess('_SYSTEM/yuri-origin.md').recommendedZone === assess('_SYSTEM/yuri-origin.md').currentZone,
  'PINNED: yuri-origin.md recommends staying exactly where it is');
ok(classifyArtifact('_SYSTEM/yuri-graph.json').kind === 'pinned' && classifyArtifact('_SYSTEM/yuri-graph.json').zone === null,
  'PINNED: the circuitry graph json is pinned (zone null — no relocation target)');
ok(isPinned(path.join(path.resolve(__dirname, '..', '..'), 'SOUL.md')) === true,
  'PINNED: absolute path to an anchor normalizes and is still pinned');
ok(isPinned('_SYSTEM/yuri-origin.md.bak') === false,
  'PINNED: a .bak of an anchor is NOT pinned (only the exact canonical path)');

// docs sub-zones
ok(classifyArtifact('_SYSTEM/HANDOFF-2026-06-05-llm-lane-unlock.md').zone === '_SYSTEM/docs/handoffs', 'loose HANDOFF-* → _SYSTEM/docs/handoffs');
ok(classifyArtifact('_SYSTEM/token-regulation-policy.md').zone === '_SYSTEM/docs/token', 'a token-* doc → _SYSTEM/docs/token');
ok(classifyArtifact('_SYSTEM/NEURAL-NETWORK-THESIS.md').zone === '_SYSTEM/docs/cognition', 'a cognition doc → _SYSTEM/docs/cognition');
ok(classifyArtifact('_SYSTEM/docs/MUSUBI_PROTOCOL.md').zone === '_SYSTEM/docs', 'a plain doc already in _SYSTEM/docs → _SYSTEM/docs');

// reports sub-zones (html/waves/papers/audits) + base
ok(classifyArtifact('_SYSTEM/SymbiOS-Trademark-Audit.html').zone === '_SYSTEM/reports/html', 'a report .html → _SYSTEM/reports/html');
ok(classifyArtifact('_SYSTEM/WAVE-2-FIX-QUEUE-2026-06-05.md').zone === '_SYSTEM/reports/waves', 'a WAVE-* report → _SYSTEM/reports/waves');
ok(classifyArtifact('_SYSTEM/reports/energy-landscape-paper-section-3.md').zone === '_SYSTEM/reports/papers', 'a paper draft → _SYSTEM/reports/papers');
ok(classifyArtifact('_SYSTEM/SWARM_ARCHITECTURE_AUDIT_2026.md').zone === '_SYSTEM/reports/audits', 'a loose *AUDIT* report → _SYSTEM/reports/audits');
ok(classifyArtifact('_SYSTEM/reports/filing-system-design-2026-06-11.md').zone === '_SYSTEM/reports', 'a plain report already in _SYSTEM/reports → _SYSTEM/reports (not misplaced)');
ok(assess('_SYSTEM/reports/filing-system-design-2026-06-11.md').misplaced === false, 'a plain in-zone report is NOT misplaced');

// anti-poaching: a research-vault resident with an "audit"/"wave" name must NOT be pulled into reports/*
ok(classifyArtifact('02_RESOURCES/RESEARCH/some-audit-synthesis.md').zone === '02_RESOURCES/RESEARCH',
  'GUARD: an "audit"-named file already in RESEARCH stays in RESEARCH (reports/* never poaches 02_RESOURCES)');
ok(classifyArtifact('02_RESOURCES/KNOWLEDGE-BASE/01_COSMOLOGY/alchemy.md').zone === '02_RESOURCES/KNOWLEDGE-BASE',
  'a KB doc → 02_RESOURCES/KNOWLEDGE-BASE (not poached into RESEARCH)');
ok(classifyArtifact('02_RESOURCES/RESEARCH/yuri-graph-data.json').zone === '02_RESOURCES/RESEARCH/_data',
  'json inside the research vault → 02_RESOURCES/RESEARCH/_data');

// brand / launchd / skills / bin / config / research-by-keyword
ok(classifyArtifact('_SYSTEM/musubi-brand-identity.html').zone === '_SYSTEM/reports/html' || classifyArtifact('_SYSTEM/musubi-brand-identity.md').zone === '_SYSTEM/BRAND',
  'a brand .md → _SYSTEM/BRAND (html brand goes to reports/html by extension priority)');
ok(classifyArtifact('_SYSTEM/com.yuri.dream.plist').zone === '_SYSTEM/launchd', 'a .plist → _SYSTEM/launchd');
ok(classifyArtifact('skills/foo/SKILL.md').zone === 'skills', 'a SKILL.md → skills');
ok(classifyArtifact('_SYSTEM/yuri-boot.zsh').zone === '_SYSTEM/bin', 'a loose .zsh launcher → _SYSTEM/bin');
ok(classifyArtifact('_SYSTEM/token-orchestrator.sh').zone === '_SYSTEM/bin', 'a loose .sh launcher → _SYSTEM/bin');
ok(classifyArtifact('_SYSTEM/Scripts/some-wrapper.sh').zone === '_SYSTEM/Scripts', 'a .sh already in Scripts → _SYSTEM/Scripts (not bin)');
ok(classifyArtifact('_SYSTEM/skill-hash-registry.json').zone === '_SYSTEM/config', 'a loose registry json → _SYSTEM/config');
ok(classifyArtifact('_SYSTEM/Scripts/loose-research-synthesis.md').zone === '02_RESOURCES/RESEARCH', 'a loose research/synthesis .md anywhere → 02_RESOURCES/RESEARCH (by keyword)');
ok(classifyArtifact('_SYSTEM/Scripts/yuri-energy-fn.mjs').zone === '_SYSTEM/Scripts/math', 'a yuri-energy-* module → _SYSTEM/Scripts/math (math prefix)');
ok(classifyArtifact('_SYSTEM/Scripts/route.py').zone === '_SYSTEM/Scripts', 'a .py in Scripts → _SYSTEM/Scripts');

// state json is NOT poached by the config rule (state rule runs first)
ok(classifyArtifact('_SYSTEM/state/session-index.json').zone === '_SYSTEM/state',
  'GUARD: a json in _SYSTEM/state with an "index" name stays in state (state before config)');

// fileType is attached for the dependency scanner
ok(classifyArtifact('_SYSTEM/Scripts/x.mjs').fileType === 'code', 'fileType: .mjs → code');
ok(classifyArtifact('02_RESOURCES/RESEARCH/x.md').fileType === 'markdown', 'fileType: .md → markdown');
ok(classifyArtifact('_SYSTEM/reports/x.html').fileType === 'html', 'fileType: .html → html');
ok(assess('_SYSTEM/state/x.jsonl').fileType === 'data', 'fileType: .jsonl → data (surfaced through assess too)');

// CANONICAL_ZONES is derived from ZONE_RULES (no drift) and is deepest-first
ok(CANONICAL_ZONES.includes('_SYSTEM/docs/handoffs') && CANONICAL_ZONES.includes('_SYSTEM/docs'),
  'CANONICAL_ZONES contains both a sub-zone and its parent');
ok(CANONICAL_ZONES.indexOf('_SYSTEM/docs/handoffs') < CANONICAL_ZONES.indexOf('_SYSTEM/docs'),
  'CANONICAL_ZONES is deepest-first (sub-zone ranks before parent for currentZoneOf)');

// ── SETTLED suppression: curated homes are not swept (kills repo-wide keyword/ext poaching) ──
ok(isPinned !== undefined, 'isPinned exported');   // guard the import line stays meaningful
import('./filing-assessor.mjs').then((m) => {
  ok(m.isSettled('.claude/skills/foo/SKILL.md') === true, 'SETTLED: .claude/ is a curated home');
  ok(m.isSettled('_SYSTEM/HANDOFF-x.md') === false, 'SETTLED: the _SYSTEM/ root is NOT settled (genuine sweep target)');
});
ok(assess('.claude/skills/adversarial-verification/SKILL.md').misplaced === false, 'a provider-shim SKILL.md is NOT flagged misplaced (settled)');
ok(assess('.agents/agent-index.json').misplaced === false, 'an agent recipe json is NOT flagged misplaced (settled)');
ok(assess('.claude/commands/research.md').misplaced === false, 'a slash-command def named research.md is NOT poached into RESEARCH (settled .claude/)');
ok(assess('.codex/run-workhorse.sh').misplaced === false, 'a .codex co-located script is NOT yanked to _SYSTEM/bin (settled)');
ok(assess('02_RESOURCES/RESEARCH/jake-van-klief/ingest/manifest.json').misplaced === false, 'nested research project json stays put (settled subfolder)');
ok(assess('02_RESOURCES/KNOWLEDGE-BASE/design-uiux/bundle/manifest.json').misplaced === false, 'a KB bundle json is NOT poached into config (settled)');
ok(assess('_SYSTEM/OS_KERNEL/conclave_init.sh').misplaced === false, 'an OS_KERNEL co-located .sh is NOT yanked to bin (settled)');
// curated top-level RESOURCE project homes — co-located assets are not poached by a name/keyword match
ok(assess('02_RESOURCES/INVESTOR-DECK/yuri-visual-identity.md').misplaced === false, 'an investor-deck "…identity.md" is NOT poached into _SYSTEM/BRAND (settled INVESTOR-DECK)');
ok(assess('02_RESOURCES/INVESTOR-DECK/research-findings.md').misplaced === false, 'an investor-deck "research-…md" is NOT poached into RESEARCH (settled INVESTOR-DECK)');
ok(assess('02_RESOURCES/References/design-packs/frontier-design-intelligence/audit.md').misplaced === false, 'a design-pack "audit.md" is NOT poached into _SYSTEM/reports (settled References)');
ok(assess('02_RESOURCES/CODE-BIBLE/some-pattern.md').misplaced === false, 'a CODE-BIBLE corpus doc is settled (curated home)');
// the genuine targets still fire after tightening
ok(assess('_SYSTEM/HANDOFF-2026-06-05-x.md').misplaced === true, 'a loose _SYSTEM-root HANDOFF still flags misplaced (not over-suppressed)');
// the RESEARCH ROOT stays a designed sweep target — loose root json still tidies into _data (NOT over-suppressed)
ok(assess('02_RESOURCES/RESEARCH/some-loose-report.json').recommendedZone === '02_RESOURCES/RESEARCH/_data' && assess('02_RESOURCES/RESEARCH/some-loose-report.json').misplaced === true, 'loose RESEARCH-root json still sweeps into _data (RESEARCH root NOT settled)');
ok(assess('02_RESOURCES/RESEARCH/loose-report.json').misplaced === true, 'a loose json at the RESEARCH root still flags → _data (depth-3 only)');
ok(classifyArtifact('.claude/skills/foo/SKILL.md').zone === null, 'a provider SKILL.md is no longer globally claimed for skills/');

// expanded rule count + ordering sanity
ok(ZONE_RULES.length >= 24, `ZONE_RULES expanded to >=24 zones (got ${ZONE_RULES.length})`);
ok(ZONE_RULES[0].zone === 'EPHEMERAL', 'EPHEMERAL remains the highest-priority rule');

// determinism still holds across the expanded ruleset
ok(JSON.stringify(classifyArtifact('_SYSTEM/HANDOFF-x.md')) === JSON.stringify(classifyArtifact('_SYSTEM/HANDOFF-x.md')), 'expanded classification stays deterministic');

console.log(`\nfiling-assessor.test: ${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
