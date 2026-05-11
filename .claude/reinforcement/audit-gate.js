#!/usr/bin/env node

/**
 * Read-Only Audit Gate
 *
 * Inspects system state without mutations. Entry point for audit mode.
 * Returns structured audit report with coverage, status, and recommendations.
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_DIR = __dirname;
const SKILL_MANIFEST = path.join(MANIFEST_DIR, 'skill-manifest.json');
const AGENT_MANIFEST = path.join(MANIFEST_DIR, 'agent-manifest.json');
const AUDIT_DIR = path.join(MANIFEST_DIR, 'audit-output');
const AUDIT_REPORT = path.join(AUDIT_DIR, 'audit-gate-report.json');

if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

const skillManifest = JSON.parse(fs.readFileSync(SKILL_MANIFEST, 'utf8'));
const agentManifest = JSON.parse(fs.readFileSync(AGENT_MANIFEST, 'utf8'));
const MODEL_RUNTIME_KINDS = new Set(['model_agent']);

const audit = {
  timestamp: new Date().toISOString(),
  mode: 'read-only',
  system: {
    skills_total: skillManifest.metadata.total_skills,
    agents_total: agentManifest.metadata.total_agents,
    status_breakdown: {
      active: skillManifest.metadata.active_count,
      unknown: skillManifest.metadata.unknown_status
    },
    model_distribution: agentManifest.metadata.by_model,
    runtime_distribution: agentManifest.metadata.by_runtime_kind
  },
  coverage: {
    skills: {
      with_triggers: skillManifest.skills.filter(s => s.triggers && s.triggers.length > 0).length,
      with_requires: skillManifest.skills.filter(s => s.requires && s.requires.length > 0).length,
      enterprise_ready: skillManifest.skills.filter(s => s.enterprise_ready === true).length,
      versioned: skillManifest.skills.filter(s => s.version !== null).length
    },
    agents: {
      with_model: agentManifest.agents.filter(a => a.model !== null).length,
      with_runtime_kind: agentManifest.agents.filter(a => a.runtime_kind).length,
      native_functions: agentManifest.agents.filter(a => a.runtime_kind === 'native_function').length,
      with_responsibilities: agentManifest.agents.filter(a => a.responsibilities && a.responsibilities.length > 0).length,
      sonnet_tier: agentManifest.agents.filter(a => a.model === 'claude-sonnet-4-6').length,
      haiku_tier: agentManifest.agents.filter(a => a.model === 'claude-haiku-4-5-20251001').length
    }
  },
  gaps: {
    skills_without_status: skillManifest.skills.filter(s => s.status === 'unknown').map(s => s.name),
    model_agents_without_model: agentManifest.agents
      .filter(a => MODEL_RUNTIME_KINDS.has(a.runtime_kind) && !a.model)
      .map(a => a.name),
    agents_without_runtime_kind: agentManifest.agents.filter(a => !a.runtime_kind).map(a => a.name),
    skills_without_triggers: skillManifest.skills.filter(s => !s.triggers || s.triggers.length === 0).map(s => s.name)
  },
  readiness: {
    manifest_completeness: calculateCompleteness(skillManifest, agentManifest),
    enterprise_gates_met: checkEnterpriseGates(skillManifest, agentManifest),
    test_coverage: 'pending', // Will be filled by test harness
    recommendations: generateRecommendations(skillManifest, agentManifest)
  }
};

function calculateCompleteness(skills, agents) {
  let skillScore = 0;
  let agentScore = 0;

  // Skills completeness
  skillScore += skills.metadata.active_count / skills.metadata.total_skills * 20;
  const skillsWithTriggers = skills.skills.filter(s => s.triggers && s.triggers.length > 0).length;
  skillScore += (skillsWithTriggers / skills.metadata.total_skills) * 30;
  const skillsVersioned = skills.skills.filter(s => s.version).length;
  skillScore += (skillsVersioned / skills.metadata.total_skills) * 20;
  const skillsEnterprise = skills.skills.filter(s => s.enterprise_ready === true).length;
  skillScore += (skillsEnterprise / skills.metadata.total_skills) * 30;

  // Agents completeness
  const runtimeReady = agents.agents.filter(a =>
    a.runtime_kind === 'native_function' ||
    a.runtime_kind === 'scheduled_function' ||
    (MODEL_RUNTIME_KINDS.has(a.runtime_kind) && a.model)
  ).length;
  agentScore += (runtimeReady / agents.metadata.total_agents) * 40;
  const agentsWithResp = agents.agents.filter(a => a.responsibilities && a.responsibilities.length > 0).length;
  agentScore += (agentsWithResp / agents.metadata.total_agents) * 60;

  return {
    skills_pct: Math.round(skillScore),
    agents_pct: Math.round(agentScore),
    overall_pct: Math.round((skillScore + agentScore) / 2)
  };
}

function checkEnterpriseGates(skills, agents) {
  const gates = {
    'audit_mode_available': fs.existsSync(path.join(MANIFEST_DIR, 'audit-gate.js')),
    'manifest_machine_readable': true,
    'test_harness_available': fs.existsSync(path.join(MANIFEST_DIR, 'test-harness.js')),
    'sonnet_architects_present': agents.agents.some(a => a.model === 'claude-sonnet-4-6'),
    'haiku_workers_present': agents.agents.some(a => a.model === 'claude-haiku-4-5-20251001'),
    'active_skills_present': skills.metadata.active_count >= 5
  };

  return gates;
}

function generateRecommendations(skills, agents) {
  const recs = [];

  if (skills.metadata.unknown_status > 15) {
    recs.push('Update status field for >15 skills (currently "unknown")');
  }

  const skillsNoTriggers = skills.skills.filter(s => !s.triggers || s.triggers.length === 0).length;
  if (skillsNoTriggers > 10) {
    recs.push(`Define triggers for ${skillsNoTriggers} skills without CLI invocation paths`);
  }

  const modelAgentsNoModel = agents.agents.filter(a => MODEL_RUNTIME_KINDS.has(a.runtime_kind) && !a.model).length;
  if (modelAgentsNoModel > 0) {
    recs.push(`Assign explicit models to ${modelAgentsNoModel} model-backed agents (critical for cost/latency prediction)`);
  }

  const agentsNoRuntime = agents.agents.filter(a => !a.runtime_kind).length;
  if (agentsNoRuntime > 0) {
    recs.push(`Add runtime_kind to ${agentsNoRuntime} agents`);
  }

  const skillsNoVersion = skills.skills.filter(s => !s.version).length;
  if (skillsNoVersion > 20) {
    recs.push(`Add semantic versioning to ${skillsNoVersion} skills for release tracking`);
  }

  if (!recs.length) {
    recs.push('System is well-structured. Proceed with Phase 0B (Repository Truth Baseline).');
  }

  return recs;
}

// Write report
fs.writeFileSync(AUDIT_REPORT, JSON.stringify(audit, null, 2));

// Console output
console.log('\n=== READ-ONLY AUDIT GATE ===\n');
console.log(`Timestamp: ${audit.timestamp}`);
console.log(`Mode: ${audit.mode}\n`);

console.log('System State:');
console.log(`  Skills: ${audit.system.skills_total} (${audit.system.status_breakdown.active} active)`);
console.log(`  Agents: ${audit.system.agents_total}`);
console.log(`  Models: ${Object.entries(audit.system.model_distribution).map(([k,v]) => `${v} ${k}`).join(', ')}\n`);

console.log('Readiness:');
console.log(`  Skills Completeness: ${audit.readiness.manifest_completeness.skills_pct}%`);
console.log(`  Agents Completeness: ${audit.readiness.manifest_completeness.agents_pct}%`);
console.log(`  Overall: ${audit.readiness.manifest_completeness.overall_pct}%\n`);

console.log('Enterprise Gates:');
Object.entries(audit.readiness.enterprise_gates_met).forEach(([gate, status]) => {
  const mark = status ? '✓' : '✗';
  console.log(`  ${mark} ${gate}: ${status}`);
});

console.log('\nRecommendations:');
audit.readiness.recommendations.forEach(rec => {
  console.log(`  → ${rec}`);
});

console.log(`\nReport written to: ${AUDIT_REPORT}`);
console.log();
