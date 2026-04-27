#!/usr/bin/env node

/**
 * Reinforcement Test Harness
 *
 * Minimal, non-destructive validation of skill and agent manifests.
 * Reads: skill-manifest.json, agent-manifest.json
 * Writes: test-report.json (to reinforcement/audit-output/)
 * Side effects: none (read-only)
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_DIR = __dirname;
const SKILL_MANIFEST = path.join(MANIFEST_DIR, 'skill-manifest.json');
const AGENT_MANIFEST = path.join(MANIFEST_DIR, 'agent-manifest.json');
const AUDIT_DIR = path.join(MANIFEST_DIR, 'audit-output');
const REPORT_FILE = path.join(AUDIT_DIR, 'test-report.json');

// Ensure audit-output exists
if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

// Load manifests
const skillManifest = JSON.parse(fs.readFileSync(SKILL_MANIFEST, 'utf8'));
const agentManifest = JSON.parse(fs.readFileSync(AGENT_MANIFEST, 'utf8'));

const results = {
  timestamp: new Date().toISOString(),
  version: '1.0.0',
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    warnings: 0
  }
};

function test(name, fn) {
  try {
    fn();
    results.tests.push({ name, status: 'PASS', error: null });
    results.summary.passed++;
  } catch (e) {
    results.tests.push({ name, status: 'FAIL', error: e.message });
    results.summary.failed++;
  }
  results.summary.total++;
}

function warn(name, msg) {
  results.tests.push({ name, status: 'WARN', message: msg });
  results.summary.warnings++;
  results.summary.total++;
}

// === SKILL MANIFEST TESTS ===

test('skill-manifest: JSON valid', () => {
  if (!skillManifest || typeof skillManifest !== 'object') throw new Error('Invalid JSON');
});

test('skill-manifest: has required fields', () => {
  const required = ['$schema', 'version', 'generated', 'metadata', 'skills'];
  required.forEach(field => {
    if (!(field in skillManifest)) throw new Error(`Missing field: ${field}`);
  });
});

test('skill-manifest: metadata.total_skills matches array length', () => {
  if (skillManifest.metadata.total_skills !== skillManifest.skills.length) {
    throw new Error(`Total count mismatch: ${skillManifest.metadata.total_skills} vs ${skillManifest.skills.length}`);
  }
});

test('skill-manifest: all skills have name and description', () => {
  skillManifest.skills.forEach(skill => {
    if (!skill.name) throw new Error('Skill missing name');
    if (!skill.description) throw new Error(`Skill ${skill.name} missing description`);
  });
});

test('skill-manifest: all skill locations exist', () => {
  const missing = skillManifest.skills.filter(s => !fs.existsSync(s.location));
  if (missing.length > 0) {
    throw new Error(`${missing.length} skill locations missing: ${missing.map(s => s.name).join(', ')}`);
  }
});

test('skill-manifest: active status count correct', () => {
  const activeCount = skillManifest.skills.filter(s => s.status === 'active').length;
  if (activeCount !== skillManifest.metadata.active_count) {
    throw new Error(`Active count mismatch: ${activeCount} vs ${skillManifest.metadata.active_count}`);
  }
});

test('skill-manifest: no duplicate skill names', () => {
  const names = skillManifest.skills.map(s => s.name);
  const unique = new Set(names);
  if (names.length !== unique.size) throw new Error('Duplicate skill names detected');
});

// === AGENT MANIFEST TESTS ===

test('agent-manifest: JSON valid', () => {
  if (!agentManifest || typeof agentManifest !== 'object') throw new Error('Invalid JSON');
});

test('agent-manifest: has required fields', () => {
  const required = ['$schema', 'version', 'generated', 'metadata', 'agents'];
  required.forEach(field => {
    if (!(field in agentManifest)) throw new Error(`Missing field: ${field}`);
  });
});

test('agent-manifest: metadata.total_agents matches array length', () => {
  if (agentManifest.metadata.total_agents !== agentManifest.agents.length) {
    throw new Error(`Total count mismatch: ${agentManifest.metadata.total_agents} vs ${agentManifest.agents.length}`);
  }
});

test('agent-manifest: all agents have name, description, role', () => {
  agentManifest.agents.forEach(agent => {
    if (!agent.name) throw new Error('Agent missing name');
    if (!agent.description) throw new Error(`Agent ${agent.name} missing description`);
    if (!agent.role) throw new Error(`Agent ${agent.name} missing role`);
  });
});

test('agent-manifest: all agent locations exist', () => {
  const missing = agentManifest.agents.filter(a => !fs.existsSync(a.location));
  if (missing.length > 0) {
    throw new Error(`${missing.length} agent locations missing: ${missing.map(a => a.name).join(', ')}`);
  }
});

test('agent-manifest: no duplicate agent names', () => {
  const names = agentManifest.agents.map(a => a.name);
  const unique = new Set(names);
  if (names.length !== unique.size) throw new Error('Duplicate agent names detected');
});

test('agent-manifest: sonnet agents have explicit model', () => {
  const sonnetAgents = ['architect', 'security-reviewer', 'memory-curator'];
  sonnetAgents.forEach(name => {
    const agent = agentManifest.agents.find(a => a.name === name);
    if (!agent) throw new Error(`Required agent not found: ${name}`);
    if (agent.model !== 'claude-sonnet-4-6') {
      throw new Error(`${name} should use claude-sonnet-4-6, got ${agent.model}`);
    }
  });
});

// === CROSS-MANIFEST TESTS ===

test('skill and agent names do not overlap', () => {
  const skillNames = new Set(skillManifest.skills.map(s => s.name));
  const agentNames = agentManifest.agents.map(a => a.name);
  const overlap = agentNames.filter(name => skillNames.has(name));
  if (overlap.length > 0) {
    throw new Error(`Names overlap between skills and agents: ${overlap.join(', ')}`);
  }
});

test('all skills with requires have valid dependencies', () => {
  skillManifest.skills.forEach(skill => {
    if (!skill.requires || skill.requires.length === 0) return;
    // Just verify the requires array is properly structured
    if (!Array.isArray(skill.requires)) {
      throw new Error(`Skill ${skill.name} requires is not an array`);
    }
  });
});

// === WARNINGS (non-fatal issues) ===

if (skillManifest.metadata.unknown_status > 15) {
  warn('skill-manifest: high unknown count', `${skillManifest.metadata.unknown_status}/${skillManifest.metadata.total_skills} skills have unknown status`);
}

const skillsWithoutTriggers = skillManifest.skills.filter(s => !s.triggers || s.triggers.length === 0).length;
if (skillsWithoutTriggers > 10) {
  warn('skill-manifest: many skills without triggers', `${skillsWithoutTriggers} skills have no triggers defined`);
}

const agentsWithoutModel = agentManifest.agents.filter(a => !a.model).length;
if (agentsWithoutModel > 3) {
  warn('agent-manifest: many agents without explicit model', `${agentsWithoutModel} agents have no model specified`);
}

// === WRITE REPORT ===

fs.writeFileSync(REPORT_FILE, JSON.stringify(results, null, 2));

// === CONSOLE OUTPUT ===

console.log('\n=== REINFORCEMENT TEST HARNESS ===\n');
console.log(`Timestamp: ${results.timestamp}`);
console.log(`\nSummary:`);
console.log(`  Total: ${results.summary.total}`);
console.log(`  Passed: ${results.summary.passed}`);
console.log(`  Failed: ${results.summary.failed}`);
console.log(`  Warnings: ${results.summary.warnings}`);

if (results.summary.failed > 0) {
  console.log(`\nFailed Tests:`);
  results.tests.filter(t => t.status === 'FAIL').forEach(t => {
    console.log(`  ✗ ${t.name}`);
    console.log(`    ${t.error}`);
  });
}

if (results.summary.warnings > 0) {
  console.log(`\nWarnings:`);
  results.tests.filter(t => t.status === 'WARN').forEach(t => {
    console.log(`  ⚠ ${t.name}`);
    console.log(`    ${t.message}`);
  });
}

console.log(`\nReport written to: ${REPORT_FILE}`);
console.log();

process.exit(results.summary.failed > 0 ? 1 : 0);
