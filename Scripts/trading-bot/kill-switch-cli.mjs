#!/usr/bin/env node
/**
 * Trading Bot — Kill-Switch CLI
 *
 * Command-line interface for kill-switch operations:
 *   - Read current state
 *   - Arm (enable live trading)
 *   - Disarm (emergency stop)
 *   - View audit log
 *
 * All arm/disarm events are logged to logs/kill_switch_audit.jsonl
 * with ISO 8601 timestamps and operator name.
 *
 * Usage:
 *   node kill-switch-cli.mjs status              Show current kill-switch state
 *   node kill-switch-cli.mjs arm <operator>       Arm kill-switch
 *   node kill-switch-cli.mjs disarm <operator>    Disarm kill-switch
 *   node kill-switch-cli.mjs audit [--lines N]    Show recent audit log entries
 *   node kill-switch-cli.mjs help                 Show this help
 *
 * Environment:
 *   TRADING_BOT_KILL_SWITCH  Override initial state (ARMED/DISARMED)
 *                           Defaults to DISARMED if unset
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..');
const LOG_DIR = resolve(PROJECT_ROOT, 'logs');
const AUDIT_LOG = resolve(LOG_DIR, 'kill_switch_audit.jsonl');

// Ensure log directory exists
if (!existsSync(LOG_DIR)) {
  mkdirSync(LOG_DIR, { recursive: true });
}

// ─── Hardcoded Default — Never changes ──────────────────────────────────────

const KILL_SWITCH_DEFAULT = 'DISARMED';

let killSwitchState = (process.env.TRADING_BOT_KILL_SWITCH === 'ARMED')
  ? 'ARMED'
  : KILL_SWITCH_DEFAULT;

// ─── Audit Log ──────────────────────────────────────────────────────────────

/**
 * Write an event to the kill-switch audit log.
 * File: logs/kill_switch_audit.jsonl (append-only, permanent retention)
 */
function logEvent(event, operator, reason) {
  const entry = {
    event,
    reason: reason || `manual_${event.toLowerCase()}`,
    timestamp: new Date().toISOString(),
    operator: operator || 'unknown',
    source: 'kill-switch-cli',
  };

  try {
    appendFileSync(AUDIT_LOG, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error(`ERROR: Cannot write audit log: ${err.message}`);
    process.exit(1);
  }

  return entry;
}

// ─── State File (Session-Scoped) ────────────────────────────────────────────
// Using a simple .kill-switch-state file to persist across CLI invocations,
// but NOT across process exits/crashes. The CLI re-reads env var on each run.

function loadState() {
  // Precedence: env var > no persistence across process restart
  if (process.env.TRADING_BOT_KILL_SWITCH === 'ARMED') {
    killSwitchState = 'ARMED';
  } else {
    killSwitchState = KILL_SWITCH_DEFAULT;
  }
  return killSwitchState;
}

// ─── Operations ─────────────────────────────────────────────────────────────

function doStatus() {
  loadState();
  const stage = process.env.TRADING_BOT_CAPITAL
    ? stageFromCapital(parseFloat(process.env.TRADING_BOT_CAPITAL))
    : '0';
  const mode = process.env.TRADING_BOT_MODE || 'sandbox';

  let auditCount = 0;
  if (existsSync(AUDIT_LOG)) {
    try {
      const content = readFileSync(AUDIT_LOG, 'utf-8').trim();
      auditCount = content ? content.split('\n').length : 0;
    } catch {
      auditCount = 0;
    }
  }

  const armIcon = killSwitchState === 'ARMED' ? '🔴' : '🟢';
  const modeIcon = mode === 'live' ? '🔴' : '🟡';

  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║     TRADING BOT — KILL SWITCH        ║`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  ${armIcon} State:      ${killSwitchState.padEnd(20)}║`);
  console.log(`║  ${modeIcon} Mode:       ${mode.padEnd(20)}║`);
  console.log(`║  Stage:        ${String(stage).padEnd(20)}║`);
  console.log(`║  Capital:      $${(parseFloat(process.env.TRADING_BOT_CAPITAL || '1.00')).toFixed(2).padEnd(17)}║`);
  console.log(`║  Audit Events: ${String(auditCount).padEnd(20)}║`);
  console.log(`║  Log File:     kill_switch_audit.jsonl  ║`);
  console.log(`╚══════════════════════════════════════╝\n`);

  if (killSwitchState === 'DISARMED') {
    console.log(`⚠️  LIVE TRADING DISABLED — All trades are blocked.`);
    console.log(`   To enable: npm run trading-bot kill-switch arm <operator>\n`);
  } else {
    console.log(`🔴 LIVE TRADING ENABLED — All trades may execute.`);
    console.log(`   To disable: npm run trading-bot kill-switch disarm <operator>\n`);
  }

  return killSwitchState;
}

function doArm(operator) {
  if (!operator || operator.trim().length === 0) {
    console.error('ERROR: Operator name is required.');
    console.error('Usage: node kill-switch-cli.mjs arm <operator>');
    process.exit(1);
  }

  if (killSwitchState === 'ARMED') {
    const entry = logEvent('ARM_ALREADY_ARMED', operator, 'already_armed');
    console.log(`Kill-switch: ALREADY ARMED`);
    console.log(`  Operator: ${operator}`);
    console.log(`  Audit:    ${entry.timestamp}`);
    return;
  }

  killSwitchState = 'ARMED';
  process.env.TRADING_BOT_KILL_SWITCH = 'ARMED';
  const entry = logEvent('ARMED', operator, 'manual_arm');
  console.log(`\n🔴 KILL-SWITCH ARMED`);
  console.log(`  Operator: ${operator}`);
  console.log(`  Timestamp: ${entry.timestamp}`);
  console.log(`  Audit:     ${AUDIT_LOG}`);
  console.log(`  Status:    Live trading is now ENABLED\n`);
  console.log(`⚠️  WARNING: Real capital can now be traded.`);
  console.log(`   Type 'npm run trading-bot kill-switch disarm <operator>' to stop.\n`);
}

function doDisarm(operator) {
  if (!operator || operator.trim().length === 0) {
    console.error('ERROR: Operator name is required.');
    console.error('Usage: node kill-switch-cli.mjs disarm <operator>');
    process.exit(1);
  }

  const previous = killSwitchState;
  killSwitchState = 'DISARMED';
  process.env.TRADING_BOT_KILL_SWITCH = 'DISARMED';

  const entry = logEvent(
    previous === 'ARMED' ? 'EMERGENCY_DISARM' : 'DISARMED_ALREADY',
    operator,
    previous === 'ARMED' ? 'emergency_stop' : 'already_disarmed'
  );
  console.log(`\n🟢 KILL-SWITCH DISARMED`);
  console.log(`  Operator: ${operator}`);
  console.log(`  Timestamp: ${entry.timestamp}`);
  console.log(`  Previous:  ${previous}`);
  console.log(`  Audit:     ${AUDIT_LOG}`);
  console.log(`  Status:    Live trading is now DISABLED\n`);
}

function doAudit(lines = 20) {
  if (!existsSync(AUDIT_LOG)) {
    console.log('No kill-switch audit log found.');
    console.log(`Expected: ${AUDIT_LOG}`);
    return;
  }

  try {
    const content = readFileSync(AUDIT_LOG, 'utf-8').trim();
    if (!content) {
      console.log('Kill-switch audit log is empty.');
      return;
    }

    const events = content.split('\n').filter(Boolean);
    const total = events.length;
    const toShow = Math.min(lines, total);
    const start = total - toShow;

    console.log(`\n=== KILL-SWITCH AUDIT LOG (last ${toShow} of ${total} events) ===\n`);

    for (let i = start; i < total; i++) {
      try {
        const entry = JSON.parse(events[i]);
        const icon = entry.event === 'ARMED' ? '🔴' :
                     entry.event === 'EMERGENCY_DISARM' ? '🚨' :
                     entry.event.startsWith('DISARM') ? '🟢' : '📋';
        const reason = entry.reason || '';
        console.log(`${icon} [${entry.timestamp}] ${entry.event.padEnd(20)} ${entry.operator.padEnd(20)} ${reason}`);
      } catch {
        // Raw JSON fallback
        console.log(`  ${events[i]}`);
      }
    }
    console.log();
  } catch (err) {
    console.error(`ERROR: Cannot read audit log: ${err.message}`);
    process.exit(1);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function stageFromCapital(capital) {
  if (capital >= 500) return 3;
  if (capital >= 100) return 2;
  if (capital >= 10) return 1;
  return 0;
}

function printUsage() {
  console.log(`
Kill-Switch CLI — Trading Bot Safety Control

Usage:
  node kill-switch-cli.mjs status                Show current kill-switch state
  node kill-switch-cli.mjs arm <operator>         Arm kill-switch (enable trading)
  node kill-switch-cli.mjs disarm <operator>      Disarm kill-switch (stop trading)
  node kill-switch-cli.mjs audit [--lines N]      Show audit log (default: last 20)
  node kill-switch-cli.mjs help                   Show this help message

Arguments:
  operator    Identifier for who performed the action (e.g. "trader@domain")
  --lines N   Number of audit log entries to show (default: 20)

npm shortcut:
  npm run trading-bot:kill-switch -- status
  npm run trading-bot:kill-switch -- arm trader@domain
  npm run trading-bot:kill-switch -- disarm trader@domain

Environment:
  TRADING_BOT_KILL_SWITCH  Override initial state (ARMED/DISARMED)
                           Default: DISARMED (hardcoded)
  TRADING_BOT_MODE         sandbox (default) or live
  TRADING_BOT_CAPITAL      Stage capital (default: 1.00)

Audit log: logs/kill_switch_audit.jsonl
  `);
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('help') || args.includes('--help')) {
    printUsage();
    return;
  }

  switch (args[0]) {
    case 'status':
      doStatus();
      break;

    case 'arm':
      doArm(args[1]);
      break;

    case 'disarm':
      doDisarm(args[1]);
      break;

    case 'audit': {
      let lines = 20;
      const linesIdx = args.indexOf('--lines');
      if (linesIdx !== -1 && args[linesIdx + 1]) {
        lines = parseInt(args[linesIdx + 1], 10) || 20;
      }
      doAudit(lines);
      break;
    }

    default:
      console.error(`Unknown command: ${args[0]}`);
      printUsage();
      process.exit(1);
  }
}

main();
