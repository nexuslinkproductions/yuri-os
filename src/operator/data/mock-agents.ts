import type { AgentLane } from './types';

// TODO(data-source):
export const MOCK_LANES: AgentLane[] = [
  { id: 'deepseek-v4-pro', model: 'deepseek-v4-pro', status: 'online', utilization: 0.82, sessionCount: 34, latencyMs: 280 },
  { id: 'deepseek-v4-flash', model: 'deepseek-v4-flash', status: 'online', utilization: 0.64, sessionCount: 28, latencyMs: 140 },
  { id: 'gpt-oss', model: 'gpt-oss', status: 'degraded', utilization: 0.91, sessionCount: 19, latencyMs: 420 },
  { id: 'qwen', model: 'qwen', status: 'online', utilization: 0.45, sessionCount: 22, latencyMs: 195 },
  { id: 'claude-sonnet-4-6', model: 'claude-sonnet-4-6', status: 'online', utilization: 0.73, sessionCount: 27, latencyMs: 260 },
  { id: 'claude-opus-4-7', model: 'claude-opus-4-7', status: 'online', utilization: 0.88, sessionCount: 8, latencyMs: 510 },
  { id: 'swarm-ruflo', model: 'swarm-ruflo', status: 'online', utilization: 0.38, sessionCount: 4, latencyMs: 340 },
];
