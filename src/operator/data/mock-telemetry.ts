// TODO(data-source):
const KPIS = [
  { label: 'Active Sessions', value: 142, unit: '', sparkline: [120, 135, 128, 140, 155, 148, 142], trend: 'up' as const },
  { label: 'Tokens/min', value: 18400, unit: '', sparkline: [17200, 18100, 17900, 18300, 18600, 18450, 18400], trend: 'up' as const },
  { label: 'Avg Latency', value: 320, unit: 'ms', sparkline: [340, 335, 328, 322, 318, 320, 320], trend: 'down' as const },
  { label: 'Success Rate', value: 98.7, unit: '%', sparkline: [98.2, 98.4, 98.5, 98.6, 98.8, 98.7, 98.7], trend: 'up' as const },
  { label: 'Active Agents', value: 7, unit: '', sparkline: [6, 7, 7, 6, 7, 7, 7], trend: 'flat' as const },
  { label: 'Queue Depth', value: 3, unit: '', sparkline: [8, 6, 5, 4, 5, 4, 3], trend: 'down' as const },
];

// TODO(data-source):
const ALERTS = [
  { id: 'a1', level: 'warn' as const, message: 'deepseek-v4-pro latency spike +42ms', ts: Date.now() - 120000 },
  { id: 'a2', level: 'info' as const, message: 'swarm-ruflo node joined fleet', ts: Date.now() - 300000 },
  { id: 'a3', level: 'info' as const, message: 'Token budget 68% consumed for cycle', ts: Date.now() - 600000 },
  { id: 'a4', level: 'critical' as const, message: 'ollama health check timeout on :11434', ts: Date.now() - 900000 },
  { id: 'a5', level: 'info' as const, message: 'Skills registry sync completed (15 entries)', ts: Date.now() - 1200000 },
  { id: 'a6', level: 'warn' as const, message: 'gpt-oss context window at 89% capacity', ts: Date.now() - 1800000 },
];

export function getTelemetry(): {
  kpis: Array<{ label: string; value: number; unit?: string; sparkline: number[]; trend: 'up' | 'down' | 'flat' }>;
  alerts: Array<{ id: string; level: 'info' | 'warn' | 'critical'; message: string; ts: number }>;
} {
  return { kpis: KPIS, alerts: ALERTS };
}
