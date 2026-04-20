#!/usr/bin/env node

/**
 * Self-Evolving Hooks: Session Capture
 *
 * Captures human messages, agent executions, and skill files read.
 * Stores as JSONL for Dream Worker analysis.
 *
 * Triggered: Stop (session end)
 */

const fs = require('fs');
const path = require('path');

const LEARNING_DIR = '/Volumes/T7/NUDIMMUD/_SYSTEM/learning';
const CONFIG_PATH = path.join(LEARNING_DIR, 'config.json');
const SESSIONS_LOG = path.join(LEARNING_DIR, 'sessions.jsonl');
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || '/Volumes/T7';

async function captureSession() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!config.enabled) {
      return;
    }

    // Read transcript from latest project session
    const projectSessions = path.join(PROJECT_DIR, '.claude/projects');
    if (!fs.existsSync(projectSessions)) {
      return;
    }

    // Get most recent session
    const sessions = fs.readdirSync(projectSessions).filter(f => f.startsWith('.'));
    if (sessions.length === 0) {
      return;
    }

    sessions.sort((a, b) => {
      const statA = fs.statSync(path.join(projectSessions, a));
      const statB = fs.statSync(path.join(projectSessions, b));
      return statB.mtimeMs - statA.mtimeMs;
    });

    const latestSession = sessions[0];
    const transcriptPath = path.join(projectSessions, latestSession, 'transcript.md');

    if (!fs.existsSync(transcriptPath)) {
      return;
    }

    const transcript = fs.readFileSync(transcriptPath, 'utf8');

    // Parse and extract signals
    const signals = extractSignals(transcript, config);

    // Append to sessions log
    if (signals.length > 0) {
      signals.forEach(signal => {
        fs.appendFileSync(
          SESSIONS_LOG,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            ...signal
          }) + '\n'
        );
      });

      console.log(`[Capture] Stored ${signals.length} signal(s) for dream worker.`);
    }
  } catch (error) {
    console.error('[Capture] Error:', error.message);
  }
}

function extractSignals(transcript, config) {
  const signals = [];
  const maxChars = config.captureMaxChars;

  // Look for user corrections and confirmations
  const correctionPatterns = [
    /^(no|don't|stop|remove|delete|fix|change|update)[\s\w:,-]*/im,
    /^(yes|exactly|perfect|keep|that's right|correct|good)/im
  ];

  const lines = transcript.split('\n');
  lines.forEach((line, idx) => {
    correctionPatterns.forEach(pattern => {
      if (pattern.test(line.trim())) {
        // Extract context: previous line + this line
        const context = lines.slice(Math.max(0, idx - 1), idx + 1).join(' ');
        signals.push({
          type: 'correction',
          isCorrective: pattern.toString().includes('no|don') ? true : false,
          snippet: context.substring(0, maxChars.userMessage)
        });
      }
    });
  });

  return signals;
}

captureSession();
