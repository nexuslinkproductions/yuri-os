// url-safety-guard.js — OMP PreToolUse hook: Bash command URL safety guard.
//
// Default-export: hook(pi) — synchronous registration via pi.on('tool_call', …).
// Also exports createHandler(scanner?) for test injection.
//
// Deterministic. Zero runtime dependencies beyond the shared url-policy.mjs.
// Fail-closed: policy errors → block.

import { scanCommand as _scanCommand } from '../../../_SYSTEM/Scripts/url-policy.mjs';
import { evaluateToolCall as _evaluateToolCall } from '../../../_SYSTEM/Scripts/policy/yuri-safety-core.mjs';

/**
 * Build a tool_call event handler that scans Bash commands for dangerous URLs.
 * @param {function} [scanner] — (command: string) => null | {url: string, reason: string}
 *   Defaults to the shared url-policy scanCommand.
 * @returns {function} async event handler: (event) => void | {block: true, reason: string}
 */
export function createHandler(scanner = _scanCommand, safetyEvaluator = _evaluateToolCall) {
  return async (event) => {
    // Only gate Bash tool invocations.
    if (event?.toolName !== 'bash') return;

    const command = event?.input?.command;
    if (typeof command !== 'string' || !command) return;

    try {
      const safetyDecision = safetyEvaluator('bash', {
        command,
        cwd: event?.input?.cwd || event?.input?.workdir,
      });
      if (!safetyDecision?.allowed) {
        return { block: true, reason: safetyDecision?.reason || 'YURI safety policy denied the command' };
      }

      const blocked = scanner(command);
      if (blocked) {
        return { block: true, reason: blocked.reason };
      }
    } catch (err) {
      // Fail closed: any policy exception blocks the call.
      return { block: true, reason: `URL guard error: ${(err && err.message) || err || 'unknown'}` };
    }
    // No return = allow.
  };
}

/**
 * Default hook factory — OMP calls this synchronously with the HookAPI.
 * Registers exactly one tool_call handler backed by the shared url-policy.
 * @param {object} pi — OMP HookAPI ({ on(event, handler) })
 */
export default function hook(pi) {
  pi.on('tool_call', createHandler());
}
