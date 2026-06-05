import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const MODEL_POLICY_PATH = path.join(REPO_ROOT, '.claude/config/models.json');

export function loadOffloadLanes() {
  if (!existsSync(MODEL_POLICY_PATH)) return {};
  const policy = JSON.parse(readFileSync(MODEL_POLICY_PATH, 'utf8'));
  return policy.offload_lanes || {};
}

export function getOffloadLane(id) {
  const lanes = loadOffloadLanes();
  const cfg = lanes[id];
  if (!cfg) throw new Error(`offload_lanes.${id} missing from ${MODEL_POLICY_PATH}`);
  return cfg;
}
