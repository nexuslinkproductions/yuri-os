import { apiFetch } from '../../lib/runtime';
import type { SessionBacklogPayload, SessionRecord } from './types';

export interface SessionRuntimePayload {
  session: SessionRecord | null;
}

export interface SessionHistoryPayload {
  sessions: SessionRecord[];
}

export interface ControlPlaneGraphSummary {
  graphId: string;
  intentId: string;
  scenario: string;
  routeLane: string;
  createdAt: string | null;
  lifecycle: string[];
  nodeCount: number;
  artifactRoot: string | null;
  graphPlanPath: string;
  normalizedIntentPath: string | null;
  rawOutputTainted: boolean;
  sanitizedVerifiedSummaryOnly: boolean;
  promotionRequiresReview: boolean;
}

export interface ControlPlanePromotionGateStatus {
  status: string;
  action: string;
  requiresVerification: boolean;
  verifiedNodeCount: number;
  totalNodeCount: number;
  verificationState: string | null;
  promotionState: string | null;
}

export interface ControlPlaneStatusPayload {
  activeSession: SessionRecord | null;
  currentGraph: ControlPlaneGraphSummary | null;
  nodeCountsByVerificationStatus: Record<string, number>;
  promotionGateStatus: ControlPlanePromotionGateStatus;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload?.error === 'string' ? payload.error : `request failed: ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export async function fetchCurrentSession(): Promise<SessionRecord | null> {
  const response = await apiFetch('/api/sessions/current');
  const payload = await readJson<SessionRuntimePayload>(response);
  return payload.session;
}

export async function fetchSessionHistory(limit = 20): Promise<SessionRecord[]> {
  const response = await apiFetch(`/api/sessions/history?limit=${limit}`);
  const payload = await readJson<SessionHistoryPayload>(response);
  return payload.sessions;
}

export async function fetchControlPlaneStatus(): Promise<ControlPlaneStatusPayload> {
  const response = await apiFetch('/api/control-plane/status');
  return readJson<ControlPlaneStatusPayload>(response);
}

export async function fetchSessionBacklog(sessionId?: string | null, limit = 12): Promise<SessionBacklogPayload | null> {
  if (!sessionId) return null;
  const params = new URLSearchParams({
    sessionId,
    limit: String(limit),
  });
  const response = await apiFetch(`/api/sessions/backlog?${params.toString()}`);
  return readJson<SessionBacklogPayload>(response);
}

export async function startRuntimeSession(): Promise<SessionRecord> {
  const response = await apiFetch('/api/sessions/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Operator Autonomous Session',
      prompt: 'Run a durable Yuri command-center work session. Continue explicit operator work first, then bounded backlog work.',
      durationMs: 2 * 60 * 60 * 1000,
      idleMode: 'backlog',
    }),
  });
  const payload = await readJson<SessionRuntimePayload>(response);
  if (!payload.session) throw new Error('session start returned no session');
  return payload.session;
}

export async function stopRuntimeSession(sessionId: string): Promise<SessionRecord> {
  const response = await apiFetch('/api/sessions/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      reason: 'Stopped from operator command center',
    }),
  });
  const payload = await readJson<SessionRuntimePayload>(response);
  if (!payload.session) throw new Error('session stop returned no session');
  return payload.session;
}
