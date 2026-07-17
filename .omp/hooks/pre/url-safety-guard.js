// url-safety-guard.js — OMP PreToolUse adapter over universal YURI safety + shell URL policy.
//
// Default-export: hook(pi) — synchronous registration via pi.on('tool_call', …).
// Also exports createHandler(scanner?) for test injection.
//
// Deterministic. Zero runtime dependencies beyond the shared url-policy.mjs.
// Fail-closed: policy errors → block.

import { scanCommand as _scanCommand } from '../../../_SYSTEM/Scripts/url-policy.mjs';
import { evaluateToolCall as _evaluateToolCall } from '../../../_SYSTEM/Scripts/policy/yuri-safety-core.mjs';

/**
 * Build a tool_call event handler that routes every tool through YURI safety,
 * then scans shell commands for dangerous URLs.
 * @param {function} [scanner] — (command: string) => null | {url: string, reason: string}
 *   Defaults to the shared url-policy scanCommand.
 * @returns {function} async event handler: (event) => void | {block: true, reason: string}
 */
export function createHandler(scanner = _scanCommand, safetyEvaluator = _evaluateToolCall) {
  return async (event) => {
    const toolName = event?.toolName ?? event?.tool_name ?? event?.name ?? '';
    const input = event?.input ?? event?.toolInput ?? event?.tool_input ?? {};
    const normalizedTool = String(toolName)
      .split('.')
      .pop()
      .replace(/[^a-z0-9_-]/giu, '')
      .toLowerCase();

    try {
      const safetyDecision = safetyEvaluator(toolName, input, {
        cwd: event?.cwd ?? event?.workdir ?? input?.cwd ?? input?.workdir,
      });
      if (!safetyDecision?.allowed) {
        return { block: true, reason: safetyDecision?.reason || 'YURI safety policy denied the command' };
      }

      if (['bash', 'shell', 'exec_command', 'execcommand', 'terminal'].includes(normalizedTool)) {
        const command = input?.command ?? input?.cmd;
        if (typeof command === 'string' && command) {
          const blocked = scanner(command);
          if (blocked) return { block: true, reason: blocked.reason };
        }
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
 * Registers exactly one tool_call handler backed by shared YURI safety and URL policy.
 * @param {object} pi — OMP HookAPI ({ on(event, handler) })
 */
export default function hook(pi) {
  pi.on('tool_call', createHandler());
}
