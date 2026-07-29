// NEXUS backend spine, module 3 — detection-as-code. Rule files live in
// backend/rules/*.json: { id, description, match, severity, score }.
// The engine consumes audit events from the policy gate and writes `alert`
// objects into the store on a match.
//
// match shape: { action?, actor?, decision?, field_op? }
// field_op:     { field, op, value } where field resolves against the event
//               (actor/action/decision/reason), args.* (raw call args), or
//               object.* (data of the store object named by args.id).

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { store as defaultStore } from './store.mjs';
import { policy as defaultPolicy } from './policy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RULES_DIR = path.join(__dirname, 'rules');

export function loadRules(rulesDir = RULES_DIR) {
  const rules = [];
  for (const f of readdirSync(rulesDir).sort()) {
    if (!f.endsWith('.json')) continue;
    const rule = JSON.parse(readFileSync(path.join(rulesDir, f), 'utf8'));
    if (!rule.id || !rule.match) throw new Error('bad_rule_file: ' + f);
    rules.push(rule);
  }
  return rules;
}

const OPS = {
  eq: (a, b) => a === b,
  ne: (a, b) => a !== b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  not_in: (a, b) => Array.isArray(b) && !b.includes(a),
  contains: (a, b) => typeof a === 'string' && a.includes(String(b)),
  starts_with: (a, b) => typeof a === 'string' && a.startsWith(String(b)),
  exists: (a) => a !== undefined && a !== null,
};

function resolveField(field, event, args, store) {
  if (field.startsWith('args.')) return args ? args[field.slice(5)] : undefined;
  if (field.startsWith('object.')) {
    const id = args && args.id;
    const obj = id && store ? store.get(id) : null;
    return obj ? obj.data[field.slice(7)] : undefined;
  }
  return event[field];
}

export function ruleMatches(rule, event, args, store) {
  const m = rule.match || {};
  if (m.action !== undefined && m.action !== event.action) return false;
  if (m.actor !== undefined && m.actor !== event.actor) return false;
  if (m.decision !== undefined && m.decision !== event.decision) return false;
  if (m.field_op) {
    const op = OPS[m.field_op.op];
    if (!op) return false;
    if (!op(resolveField(m.field_op.field, event, args, store), m.field_op.value)) return false;
  }
  return true;
}

export function createRulesEngine({ store = defaultStore, policy = defaultPolicy, rulesDir = RULES_DIR } = {}) {
  const rules = loadRules(rulesDir);

  /** Evaluate one audit event; write an alert object per matching rule. */
  function evaluate(event, args) {
    const hits = [];
    for (const rule of rules) {
      if (!ruleMatches(rule, event, args, store)) continue;
      const alert = store.put({
        id: `alert-${rule.id}-${String(event.hash).slice(0, 16)}`,
        type: 'alert',
        confidence: 100,
        markings: ['internal'],
        data: {
          rule_id: rule.id,
          description: rule.description || '',
          severity: rule.severity || 'medium',
          score: rule.score ?? 0,
          actor: event.actor,
          action: event.action,
          decision: event.decision,
          reason: event.reason,
          object_id: args && args.id ? String(args.id) : null,
          ts: event.ts,
          event_hash: event.hash,
        },
      });
      hits.push(alert);
    }
    return hits;
  }

  if (policy) policy.onEvent(evaluate);
  return { rules, evaluate };
}

// Default engine: subscribes to the default policy gate at import time. The
// policy singleton buffers the listener lazily, so this import stays free of
// filesystem writes until the first real authorize() call.
export const rulesEngine = createRulesEngine();
