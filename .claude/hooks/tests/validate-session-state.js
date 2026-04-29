#!/usr/bin/env node
/**
 * Session State Schema Validator
 * Validates lifecycle correctness of aeonic.* fields in session-state.json
 */

const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(process.env.HOME, '.claude', 'state', 'session-state.json');

console.log('========================================');
console.log('Session State Schema Validator');
console.log('========================================\n');

let state = null;
try {
    const content = fs.readFileSync(STATE_FILE, 'utf-8');
    state = JSON.parse(content);
} catch (error) {
    console.error(`✗ FAIL: Cannot read or parse ${STATE_FILE}`);
    console.error(`  Error: ${error.message}`);
    console.error('\nHint: Run a fresh session to initialize session-state.json');
    process.exit(1);
}

const checks = [];

// Check 1: aeonic key exists
const check1 = {
    name: 'aeonic key exists',
    pass: state.aeonic !== undefined,
    hint: 'aeonic key should be initialized by aeonic-ingest.js on SessionStart'
};
checks.push(check1);

if (state.aeonic) {
    // Check 2: loadedAt is valid ISO
    const check2 = {
        name: 'loadedAt is valid ISO timestamp',
        pass: typeof state.aeonic.loadedAt === 'string' &&
              !isNaN(Date.parse(state.aeonic.loadedAt)) &&
              new Date(state.aeonic.loadedAt).toISOString() === state.aeonic.loadedAt,
        hint: 'loadedAt should be ISO format string (e.g., 2026-04-26T12:34:56.789Z)'
    };
    checks.push(check2);

    // Check 3: sections exists and is object
    const check3 = {
        name: 'sections is an object',
        pass: typeof state.aeonic.sections === 'object' && !Array.isArray(state.aeonic.sections),
        hint: 'sections should be a plain object with section names as keys'
    };
    checks.push(check3);

    if (state.aeonic.sections && typeof state.aeonic.sections === 'object') {
        // Check 4: required sections present
        const requiredSections = ['ROLE_MATRIX', 'GLOBAL_OFFLOAD_DIRECTIVE', 'CORE_DIRECTIVES'];
        const sectionCount = Object.keys(state.aeonic.sections).length;
        const hasRequired = requiredSections.every(s => state.aeonic.sections[s] !== undefined);

        const check4 = {
            name: 'required sections present',
            pass: hasRequired && sectionCount >= 3,
            hint: `sections should contain at least: ${requiredSections.join(', ')}. Found ${sectionCount} sections.`
        };
        checks.push(check4);

        // Check 5: section content non-empty
        const nonEmptySections = requiredSections.filter(s =>
            state.aeonic.sections[s] && state.aeonic.sections[s].length > 0
        );
        const check5 = {
            name: 'required sections have content',
            pass: nonEmptySections.length === requiredSections.length,
            hint: `All required sections should have non-empty content. Found ${nonEmptySections.length}/${requiredSections.length} non-empty.`
        };
        checks.push(check5);
    }

    // Check 6: lastEnforceAt is numeric (if set)
    if (state.aeonic.lastEnforceAt !== undefined) {
        const check6 = {
            name: 'lastEnforceAt is numeric (if set)',
            pass: typeof state.aeonic.lastEnforceAt === 'number',
            hint: 'lastEnforceAt should be a Unix timestamp (number)'
        };
        checks.push(check6);
    } else {
        const check6 = {
            name: 'lastEnforceAt not yet set (expected)',
            pass: true,
            hint: 'Will be set on first aeonic-enforce.js execution'
        };
        checks.push(check6);
    }
}

// Print results
let passed = 0;
let failed = 0;

for (const check of checks) {
    const status = check.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${check.name}`);
    if (!check.pass) {
        console.log(`  Hint: ${check.hint}`);
        failed++;
    } else {
        passed++;
    }
}

console.log('\n========================================');
console.log(`Results: ${passed} PASS, ${failed} FAIL`);
console.log('========================================\n');

if (failed === 0) {
    console.log('✓ Session state schema is valid');
    console.log(`  File: ${STATE_FILE}`);
}

process.exit(failed > 0 ? 1 : 0);
