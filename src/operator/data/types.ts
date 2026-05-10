export interface OperatorRoute {
  path: string;
  label: string;
  icon: string;
  section: string;
  keywords: string[];
}

export interface AgentLane {
  id: string;
  model: string;
  status: 'online' | 'degraded' | 'offline';
  utilization: number;
  sessionCount: number;
  latencyMs: number;
}

export interface SessionRecord {
  id: string;
  title: string;
  model: string;
  status: 'active' | 'completed' | 'error' | 'interrupted';
  startTs: number;
  endTs?: number | null;
  tokenCount: number;
  summary: string;
  targetDurationMs?: number;
  deadlineAt?: number;
  lastHeartbeatAt?: number;
  restartCount?: number;
  checkpointRef?: string | null;
  idleMode?: 'backlog' | 'hold';
  currentTask?: string;
  prompt?: string;
  canResume?: boolean;
  runtimePid?: number | null;
}

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  invocationCount: number;
  category: string;
  triggers: string[];
  trigger?: string;
  avgLatencyMs?: number;
  lastInvoked?: number | null;
}

export interface TokenSpend {
  model: string;
  cost: number;
  tokensIn: number;
  tokensOut: number;
  ts: number;
}

export interface HealthCheck {
  port: number;
  service: string;
  status: 'up' | 'down' | 'unknown';
  uptimeSeconds: number;
  latencyMs: number;
}

export const ROUTES: OperatorRoute[] = [
  { path: '/operator', label: 'Cockpit', icon: '◈', section: 'Dashboard', keywords: ['home', 'kpi', 'dashboard'] },
  { path: '/operator/agents', label: 'Agents', icon: '⬡', section: 'Operations', keywords: ['swarm', 'lane', 'model'] },
  { path: '/operator/sessions', label: 'Sessions', icon: '☰', section: 'Operations', keywords: ['transcript', 'history'] },
  { path: '/operator/skills', label: 'Skills', icon: '◆', section: 'Operations', keywords: ['catalog', 'trigger'] },
  { path: '/operator/tokenops', label: 'Token Ops', icon: '◎', section: 'Finance', keywords: ['spend', 'budget', 'cost'] },
  { path: '/operator/design-audit', label: 'Design Audit', icon: '⊡', section: 'Quality', keywords: ['audit', 'design'] },
  { path: '/operator/oracle', label: 'Reasoning', icon: '✦', section: 'AI', keywords: ['oracle', 'query', 'reasoning', 'council', 'voice', 'wake', 'transcript'] },
  { path: '/operator/health', label: 'Health', icon: '⎔', section: 'Infra', keywords: ['service', 'port', 'uptime'] },
  { path: '/operator/settings', label: 'Settings', icon: '⚙', section: 'System', keywords: ['theme', 'preferences'] },
];
