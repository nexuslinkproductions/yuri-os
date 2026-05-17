#!/usr/bin/env node
/**
 * AEONIC Domain Validation
 * Tests inferDomain logic and provides DB query instructions
 */

const path = require('path');

// Inline FILE_DOMAIN_MAP and inferDomain (mirrors vaultIngestion.ts)
const FILE_DOMAIN_MAP = {
    'AEONIC_PROTOCOL.md':  'AEONIC',
    'CODEX_PROTOCOL.md':   'AEONIC',
    'esoteric_codex.md':   'HERMETIC',
    'creative_codex.md':   'CREATIVE',
    'language_codex.md':   'LINGUISTICS',
    'nabu.md':             'SYSTEM',
    'identity.md':         'MEMORY',
    'session_log.md':      'LOG',
    'enki_state.md':       'MEMORY',
    'STRUCTURE.md':        'SYSTEM',
};

const DIR_DOMAIN_MAP = {
    '06_KNOWLEDGE-BASE/01_COSMOLOGY':     'COSMOLOGY',
    '06_KNOWLEDGE-BASE/02_CONSCIOUSNESS': 'CONSCIOUSNESS',
    '06_KNOWLEDGE-BASE/03_COMMUNICATION': 'COMMUNICATION',
    '06_KNOWLEDGE-BASE/04_SYNTHESIS':     'SYNTHESIS',
    '06_KNOWLEDGE-BASE/05_OPERATIONAL':   'OPERATIONAL',
    '06_KNOWLEDGE-BASE/00_META':          'META',
    '06_KNOWLEDGE-BASE':                  'HERMETIC',
    'NISABA/01_DEPLOYMENT':               'DEPLOYMENT',
    'NISABA/02_EVOLUTION':                'EVOLUTION',
    'NISABA/03_DISTRIBUTION':             'DISTRIBUTION',
    'NISABA/04_QUALITY':                  'QUALITY',
    'NISABA/05_DEFENSE':                  'DEFENSE',
    'NISABA/06_SWARM':                    'SWARM',
    'NISABA/07_CANON':                    'CANON',
    'NISABA/08_INGESTION':                'INGESTION',
    'NISABA':                             'SYSTEM',
    '_SYSTEM':                            'SYSTEM',
    '03_RESOURCES':                       'RESOURCE',
    '02_AREAS':                           'MEMORY',
    '00_COMMAND-CENTER':                  'COMMAND',
    'NEURAL-NETWORK':                     'NEURAL',
    'iC2M':                               'PROJECT_ENGINE',
    '06_NETWORK-SYNC/C2MOVIEZ':           'CLAUDIO_VAULT',
    '01_PROJECTS':                        'PROJECTS',
};

function inferDomain(relativePath) {
    const filename = path.basename(relativePath);
    if (FILE_DOMAIN_MAP[filename]) return FILE_DOMAIN_MAP[filename];
    for (const prefix of Object.keys(DIR_DOMAIN_MAP).sort((a, b) => b.length - a.length)) {
        if (relativePath.startsWith(prefix)) return DIR_DOMAIN_MAP[prefix];
    }
    return 'GENERAL';
}

// Test cases
const testCases = [
    { path: 'AEONIC_PROTOCOL.md', expected: 'AEONIC' },
    { path: 'CODEX_PROTOCOL.md', expected: 'AEONIC' },
    { path: 'esoteric_codex.md', expected: 'HERMETIC' },
    { path: 'creative_codex.md', expected: 'CREATIVE' },
    { path: 'nabu.md', expected: 'SYSTEM' },
    { path: 'NISABA/06_SWARM/foo.md', expected: 'SWARM' },
    { path: 'NISABA/01_DEPLOYMENT/bar.md', expected: 'DEPLOYMENT' },
    { path: '_SYSTEM/kernel.py', expected: 'SYSTEM' },
    { path: '06_KNOWLEDGE-BASE/REPORT.md', expected: 'HERMETIC' },
    { path: 'some-random-file.md', expected: 'GENERAL' },
    { path: 'UNKNOWN/deeply/nested/file.md', expected: 'GENERAL' },
];

console.log('========================================');
console.log('AEONIC Domain Inference Tests');
console.log('========================================\n');

let passed = 0;
let failed = 0;

for (const test of testCases) {
    const result = inferDomain(test.path);
    const status = result === test.expected ? '✓ PASS' : '✗ FAIL';
    if (result === test.expected) {
        passed++;
    } else {
        failed++;
    }
    console.log(`${status}: inferDomain('${test.path}') => '${result}' (expected '${test.expected}')`);
}

console.log('\n========================================');
console.log(`Results: ${passed} PASS, ${failed} FAIL`);
console.log('========================================\n');

// DB Query Guide
console.log('DB End-to-End Verification (post-ingest):');
console.log('\n1. After running vault ingest, query AEONIC nodes:');
console.log(`
   sqlite3 backend/data/yuri.db
   SELECT domain, COUNT(*) as count FROM knowledge_nodes WHERE domain='AEONIC';
   -- Expected: AEONIC | 2
`);

console.log('2. Verify both AEONIC files indexed:');
console.log(`
   SELECT source_path, title, domain FROM knowledge_nodes WHERE domain='AEONIC' ORDER BY source_path;
   -- Expected rows:
   --   AEONIC_PROTOCOL.md | AEONIC_PROTOCOL // YURI_SWARM_GOVERNANCE | AEONIC
   --   CODEX_PROTOCOL.md  | ... | AEONIC
`);

console.log('\n========================================\n');

process.exit(failed > 0 ? 1 : 0);
