/**
 * pusher-realtime.ts
 *
 * Thin wrapper around pusher-js that connects to the local Soketi server and
 * exposes the same subscription API surface that supabase.ts postgres_changes
 * subscriptions used to provide.
 *
 * Soketi WebSocket endpoint:  wss://db.c2moviez.com/app/{key}
 * Bridge server (VPS):        Scripts/soketi-bridge.js  →  pm2 soketi-bridge
 * PG triggers:                Dashboard-v2/supabase-migrations/012_pg_notify_triggers.sql
 *
 * Channel naming (matches soketi-bridge.js NOTIFY_MAP):
 *   nex.entity-state.{entity_type}   — entity_state table changes
 *   nex.audit-log                    — audit_log INSERT
 *   nex.reasoning-edges              — exeo_reasoning_edges changes
 *   nex.reasoning-thoughts           — exeo_thoughts changes
 *   nex.scheduled-blocks             — scheduled_blocks changes
 *   nex.customer-master              — customer_master changes
 */

import { browser } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import Pusher from 'pusher-js';

// Derive WebSocket host from PUBLIC_SUPABASE_URL (e.g. https://db.c2moviez.com)
function getSoketiHost(): string {
  const url = publicEnv.PUBLIC_SUPABASE_URL ?? '';
  try {
    return new URL(url).hostname;
  } catch {
    return 'db.c2moviez.com';
  }
}

const SOKETI_KEY = '271f66a43ec883ffc8eb67e197df6cf9';

let _pusher: Pusher | null = null;

type ConnState = 'connecting' | 'connected' | 'unavailable' | 'disconnected' | 'failed';
let _connState: ConnState = 'connecting';
const _connListeners: Array<(s: ConnState) => void> = [];

// ── Reconnect throttling (P4 fix: prevent reconnect spam) ─────────────────
// Track reconnect attempts within a sliding 60s window. After 10 attempts,
// suppress further reconnects until the window expires. Errors are logged
// at most once per 30s to avoid spamming the console.
const RECONNECT_WINDOW_MS = 60_000;
const RECONNECT_MAX_PER_WINDOW = 10;
const RECONNECT_DELAY_MIN_MS = 2_000;
const RECONNECT_DELAY_MAX_MS = 30_000;
const ERROR_LOG_THROTTLE_MS = 30_000;
let _reconnectTimestamps: number[] = [];
let _reconnectAttempt = 0;
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let _lastErrorLogAt = 0;

function _recordReconnectAttempt(): boolean {
  const now = Date.now();
  _reconnectTimestamps = _reconnectTimestamps.filter(t => now - t < RECONNECT_WINDOW_MS);
  if (_reconnectTimestamps.length >= RECONNECT_MAX_PER_WINDOW) {
    return false; // suppressed
  }
  _reconnectTimestamps.push(now);
  return true;
}

function _nextReconnectDelay(): number {
  _reconnectAttempt = Math.min(_reconnectAttempt + 1, 10);
  const delay = Math.min(RECONNECT_DELAY_MIN_MS * Math.pow(2, _reconnectAttempt - 1), RECONNECT_DELAY_MAX_MS);
  return delay;
}

function _resetReconnectBackoff(): void {
  _reconnectAttempt = 0;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
}

function _notifyConnState(s: ConnState) {
  _connState = s;
  if (s === 'connected') _resetReconnectBackoff();
  for (const cb of _connListeners) { try { cb(s); } catch {} }
}

export function getConnectionState(): ConnState { return _connState; }

export function onConnectionStateChange(cb: (s: ConnState) => void): () => void {
  _connListeners.push(cb);
  return () => { const i = _connListeners.indexOf(cb); if (i >= 0) _connListeners.splice(i, 1); };
}

export function reconnectPusher(): void {
  if (!browser) return;
  if (_reconnectTimer) return; // already scheduled
  if (!_recordReconnectAttempt()) {
    // Too many reconnects in window - back off silently
    return;
  }
  const delay = _nextReconnectDelay();
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    if (_pusher) { try { _pusher.disconnect(); } catch {} _pusher = null; }
    _notifyConnState('connecting');
    getPusher();
  }, delay);
}

function getPusher(): Pusher | null {
  if (!browser) return null;
  if (_pusher) return _pusher;

  const host = getSoketiHost();
  _pusher = new Pusher(SOKETI_KEY, {
    wsHost: host,
    wsPort: 443,
    wssPort: 443,
    forceTLS: true,
    disableStats: true,
    enabledTransports: ['ws', 'wss'],
    cluster: 'mt1',
    // Internal pusher-js reconnect timings (avoids tight reconnect loops)
    activityTimeout: 30_000,
    pongTimeout: 10_000,
    unavailableTimeout: 10_000,
  });

  _pusher.connection.bind('state_change', ({ current }: { current: ConnState }) => {
    _notifyConnState(current);
    if (current === 'connected') {
      if (browser) window.dispatchEvent(new CustomEvent('nex:ws-connected'));
    }
  });

  _pusher.connection.bind('error', (err: unknown) => {
    const now = Date.now();
    if (now - _lastErrorLogAt > ERROR_LOG_THROTTLE_MS) {
      _lastErrorLogAt = now;
      console.warn('[pusher-realtime] connection error', err);
    }
  });

  _notifyConnState('connecting');
  return _pusher;
}

type UnsubscribeFn = () => void;

/**
 * Subscribe to entity_state changes for a given entity_type.
 * Replaces supabase().channel().on('postgres_changes', ...) for entity_state.
 */
export function subscribeEntityStatePusher(
  entityType: string,
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const channelName = `nex.entity-state.${entityType}`;
  const ch = pusher.subscribe(channelName);
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe(channelName);
  };
}

/**
 * Subscribe to audit_log INSERT events.
 */
export function subscribeAuditLogPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.audit-log');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('insert', handler);

  return () => {
    ch.unbind('insert', handler);
    pusher.unsubscribe('nex.audit-log');
  };
}

/**
 * Subscribe to exeo_reasoning_edges changes.
 */
export function subscribeReasoningEdgesPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.reasoning-edges');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe('nex.reasoning-edges');
  };
}

/**
 * Subscribe to exeo_thoughts changes.
 */
export function subscribeReasoningThoughtsPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.reasoning-thoughts');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe('nex.reasoning-thoughts');
  };
}

/**
 * Subscribe to scheduled_blocks changes.
 */
export function subscribeScheduledBlocksPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.scheduled-blocks');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe('nex.scheduled-blocks');
  };
}

/**
 * Subscribe to customer_master changes.
 */
export function subscribeCustomerMasterPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.customer-master');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe('nex.customer-master');
  };
}

/**
 * Subscribe to time_entries changes.
 */
export function subscribeTimeEntriesPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.time-entries');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe('nex.time-entries');
  };
}

/**
 * Subscribe to team_capacity changes.
 */
export function subscribeTeamCapacityPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.team-capacity');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe('nex.team-capacity');
  };
}

/**
 * Subscribe to absences changes.
 */
export function subscribeAbsencesPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.absences');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe('nex.absences');
  };
}

/**
 * Subscribe to user_profiles changes.
 */
export function subscribeUserProfilesPusher(
  onChange: (row: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};

  const ch = pusher.subscribe('nex.user-profiles');
  const handler = (data: Record<string, unknown>) => onChange(data);
  ch.bind('change', handler);

  return () => {
    ch.unbind('change', handler);
    pusher.unsubscribe('nex.user-profiles');
  };
}

/**
 * Subscribe to NEXOGRAM messages on a given channel.
 * Soketi channel: nex.nexogram.{channelId}, event: message.
 */
export function subscribeNexogramChannel(
  channelId: string,
  onMessage: (msg: Record<string, unknown>) => void,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};
  const channelName = `nex.nexogram.${channelId}`;
  const ch = pusher.subscribe(channelName);
  const handler = (data: Record<string, unknown>) => onMessage(data);
  ch.bind('message', handler);
  return () => {
    ch.unbind('message', handler);
    pusher.unsubscribe(channelName);
  };
}

/**
 * Subscribe to NEXOGRAM ephemeral events (typing, edits, deletes, reactions)
 * for a given channel. Returns a single unsubscribe that detaches all binders.
 *
 * The underlying Pusher channel is shared with subscribeNexogramChannel - both
 * subscribe() calls on the same channel name resolve to the same Channel
 * object, so we can bind extra events without paying double-subscribe cost.
 */
export type NexogramEphemeralEvent =
  | 'typing'
  | 'stop_typing'
  | 'edit'
  | 'delete'
  | 'reaction';

export function subscribeNexogramEphemeral(
  channelId: string,
  handlers: Partial<Record<NexogramEphemeralEvent, (payload: Record<string, unknown>) => void>>,
): UnsubscribeFn {
  const pusher = getPusher();
  if (!pusher) return () => {};
  const channelName = `nex.nexogram.${channelId}`;
  const ch = pusher.subscribe(channelName);
  const bound: Array<[string, (data: Record<string, unknown>) => void]> = [];
  for (const [evt, cb] of Object.entries(handlers)) {
    if (!cb) continue;
    const wrapped = (data: Record<string, unknown>) => {
      try { cb(data); } catch (e) { console.warn(`[nexogram-ephemeral:${evt}]`, e); }
    };
    ch.bind(evt, wrapped);
    bound.push([evt, wrapped]);
  }
  return () => {
    for (const [evt, fn] of bound) ch.unbind(evt, fn);
    // Note: we do NOT call pusher.unsubscribe here because the channel is
    // shared with subscribeNexogramChannel. The message subscription owns
    // the channel lifecycle.
  };
}
