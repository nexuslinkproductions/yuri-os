#!/usr/bin/env node

/**
 * Self-Evolving Hooks: Dream Worker
 *
 * Background analyzer: reads session signals and writes rules when patterns emerge.
 * Runs on idle, requires: 4+ hours idle time, 3+ new sessions, 2+ same correction.
 *
 * Triggered: Scheduled (hourly or via cron)
 */

const fs = require('fs');
const path = require('path');

const LEARNING_DIR = '/Volumes/T7/NUDIMMUD/_SYSTEM/learning';
const CONFIG_PATH = path.join(LEARNING_DIR, 'config.json');
const SESSIONS_LOG = path.join(LEARNING_DIR, 'sessions.jsonl');
const LAST_DREAM_PATH = path.join(LEARNING_DIR, '.last-dream');

async function dream() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!config.enabled) {
      return;
    }

    // Check if enough time has passed
    const lastDream = fs.existsSync(LAST_DREAM_PATH)
      ? JSON.parse(fs.readFileSync(LAST_DREAM_PATH, 'utf8'))
      : { timestamp: 0, sessionCount: 0 };

    const now = Date.now();
    const hoursSinceLast = (now - lastDream.timestamp) / (1000 * 60 * 60);
    const newSessionCount = countNewSessions(lastDream.sessionCount);

    if (
      hoursSinceLast < config.thresholds.minHoursForDreamWorker ||
      newSessionCount < config.thresholds.minNewSessionsForDream
    ) {
      return;
    }

    // Read signals and find patterns
    if (!fs.existsSync(SESSIONS_LOG)) {
      return;
    }

    const lines = fs.readFileSync(SESSIONS_LOG, 'utf8').split('\n').filter(l => l);
    const patterns = findPatterns(lines, config);

    // Write new rules
    if (patterns.length > 0) {
      patterns.forEach(pattern => {
        writeRule(pattern.domain, pattern.rule);
      });

      console.log(`[Dream] Wrote ${patterns.length} new rule(s).`);
    }

    // Update last dream state
    fs.writeFileSync(
      LAST_DREAM_PATH,
      JSON.stringify({
        timestamp: now,
        sessionCount: lines.length
      })
    );
  } catch (error) {
    console.error('[Dream] Error:', error.message);
  }
}

function countNewSessions(lastCount) {
  if (!fs.existsSync(SESSIONS_LOG)) {
    return 0;
  }
  const lines = fs.readFileSync(SESSIONS_LOG, 'utf8').split('\n').filter(l => l);
  return lines.length - lastCount;
}

function findPatterns(lines, config) {
  const signals = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);

  const patterns = [];
  const threshold = config.thresholds.minSessionsForRule;

  // Simple frequency analysis: if same snippet appears 2+ times, it's a pattern
  const snippetCounts = {};
  signals.forEach(signal => {
    if (signal.snippet) {
      snippetCounts[signal.snippet] = (snippetCounts[signal.snippet] || 0) + 1;
    }
  });

  Object.entries(snippetCounts).forEach(([snippet, count]) => {
    if (count >= threshold) {
      // Guess domain from context
      const domain = guessDomain(snippet);
      patterns.push({
        domain,
        rule: `Learned from ${count} corrections: ${snippet.substring(0, 80)}`
      });
    }
  });

  return patterns;
}

function guessDomain(snippet) {
  const domainKeywords = {
    'finance': ['invoice', 'expense', 'payment', 'receipt', 'cost', 'balance'],
    'on-set': ['shot', 'location', 'equipment', 'call sheet', 'crew', 'gear'],
    'briefs': ['brief', 'proposal', 'deliverable', 'spec', 'requirement'],
    'client-comms': ['email', 'message', 'tone', 'claudio', 'marc', 'update']
  };

  let guessed = 'global';
  let maxMatches = 0;

  Object.entries(domainKeywords).forEach(([domain, keywords]) => {
    const matches = keywords.filter(kw => snippet.toLowerCase().includes(kw)).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      guessed = domain;
    }
  });

  return guessed;
}

function writeRule(domain, rule) {
  const rulePath = path.join(LEARNING_DIR, `${domain}.md`);
  if (!fs.existsSync(rulePath)) {
    return; // Domain file must exist
  }

  const content = fs.readFileSync(rulePath, 'utf8');
  const updated = content.replace(
    /\*\(No rules yet/,
    `- ${rule}\n\n*Previous entry: (No rules yet`
  ).replace(
    /\(No rules yet — will populate from first corrections\)\*/,
    'corrections)*'
  );

  fs.writeFileSync(rulePath, updated);
}

dream();
