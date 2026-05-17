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
const { execFileSync } = require('child_process');

const REPO_ROOT = process.env.YURI_ROOT || '/Users/marcelspatz/YURI-OS-MUSUBI';
const LEARNING_DIR = path.join(REPO_ROOT, '_SYSTEM/learning');
const CONFIG_PATH = path.join(LEARNING_DIR, 'config.json');
const SESSIONS_LOG = path.join(LEARNING_DIR, 'sessions.jsonl');
const LEARNING_CLI = path.join(REPO_ROOT, '_SYSTEM/Scripts/yuri-learning-capture.mjs');

async function captureSession() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    if (!config.enabled) {
      return;
    }

    // Read transcript from Antigravity brain sessions
    const brainDir = path.join(process.env.HOME || '/Users/marcelspatz', '.gemini/antigravity/brain');
    if (!fs.existsSync(brainDir)) {
      return;
    }

    // Get most recent session
    const sessions = fs.readdirSync(brainDir).filter(f => !f.startsWith('.'));
    if (sessions.length === 0) {
      return;
    }

    sessions.sort((a, b) => {
      const statA = fs.statSync(path.join(brainDir, a));
      const statB = fs.statSync(path.join(brainDir, b));
      return statB.mtimeMs - statA.mtimeMs;
    });

    const latestSession = sessions[0];
    const transcriptPath = path.join(brainDir, latestSession, '.system_generated', 'logs', 'overview.txt');

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
      captureToLearningLedger(latestSession, signals);
    }
  } catch (error) {
    console.error('[Capture] Error:', error.message);
  }
}

function extractSignals(transcript, config) {
  const signals = [];
  const maxChars = config.captureMaxChars;

  const correctionPatterns = [
    /^(no|don't|stop|remove|delete|fix|change|update)[\s\w:,-]*/i,
    /^(yes|exactly|perfect|keep|that's right|correct|good)/i
  ];

  const lines = transcript.split('\n').filter(l => l.trim().length > 0);
  const parsedLines = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);

  parsedLines.forEach((entry, idx) => {
    if (entry.type === 'USER_INPUT' && entry.content) {
      // Strip tags like <USER_REQUEST> and trim whitespace
      const cleanContent = entry.content.replace(/<[^>]+>/g, '').trim();
      
      correctionPatterns.forEach(pattern => {
        if (pattern.test(cleanContent)) {
          let context = cleanContent;
          if (idx > 0 && parsedLines[idx - 1].type === 'PLANNER_RESPONSE') {
            context = 'Previous Action -> ' + cleanContent;
          }
          signals.push({
            type: 'correction',
            isCorrective: pattern.toString().includes('no|don') ? true : false,
            snippet: context.substring(0, maxChars.userMessage)
          });
        }
      });
    }
  });

  return signals;
}

function captureToLearningLedger(sessionId, signals) {
  const corrections = signals.filter(signal => signal.isCorrective).length;
  const confirmations = signals.length - corrections;
  const notes = signals.map(signal => signal.snippet).filter(Boolean).join('\n').slice(0, 1200);

  const startPayload = {
    sessionId,
    command: 'captured-session',
    commandType: 'hook_capture',
    topicTags: ['hook-capture', corrections > 0 ? 'correction' : 'confirmation'],
    goal: 'Capture session feedback signals into Yuri learning ledger',
    metadata: { signalCount: signals.length, corrections, confirmations }
  };

  const finalizePayload = {
    sessionId,
    outcome: corrections > 0 ? 'mixed' : 'stable',
    corrections,
    rework: corrections,
    autoScore: corrections > 0 ? 55 : 72,
    whatHappened: `Captured ${signals.length} learning signal(s).`,
    whatGotBetter: confirmations > 0 ? 'User confirmation signals identified.' : undefined,
    whatGotWorse: corrections > 0 ? 'User correction signals require review.' : undefined,
    notes,
    metadata: { signalCount: signals.length, corrections, confirmations }
  };

  try {
    execFileSync('node', [LEARNING_CLI, 'start', '--json', JSON.stringify(startPayload)], { cwd: REPO_ROOT, stdio: 'ignore' });
    execFileSync('node', [LEARNING_CLI, 'finalize', '--json', JSON.stringify(finalizePayload)], { cwd: REPO_ROOT, stdio: 'ignore' });
  } catch (error) {
    console.error('[Capture] Learning ledger bridge failed:', error.message);
  }
}

captureSession();
