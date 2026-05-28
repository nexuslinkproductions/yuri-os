/**
 * tracker.svelte.ts — global tracker state for Workstream T.2.
 *
 * Exposes:
 *   tracker.running      — TimeEntry | null (current live entry)
 *   tracker.elapsed      — derived seconds since started_at (RAF-driven)
 *   tracker.idle         — boolean: page-visibility-detected idle
 *   tracker.todayHours   — sum of today's closed entry durations / 3600
 *   tracker.weekHours    — sum of this week's closed entry durations / 3600
 *   tracker.capacity     — TeamCapacity | null (own row)
 *
 *   tracker.start(opts)  — POST /api/functions/tracker-start
 *   tracker.stop(opts?)  — POST /api/functions/tracker-stop
 *   tracker.tick()       — POST /api/functions/tracker-tick (idle ping)
 *
 *   tracker.subscribe()  — attach Realtime + RAF loop. Idempotent. Returns
 *                          a dispose function the layout calls on unmount.
 *
 * The store is a Svelte 5 runes class — read it directly from any component:
 *
 *     import { tracker } from "$stores/tracker.svelte";
 *     <span>{tracker.running ? formatHMS(tracker.elapsed) : "—"}</span>
 */

import { browser } from "$app/environment";
import {
  fetchRunningEntry,
  fetchTeamCapacity,
  listMyTimeEntries,
  postAuthed,
  subscribeTimeEntries,
  subscribeTeamCapacity,
  type TimeEntry,
  type TeamCapacity,
} from "$lib/db";
import { user } from "$stores/user.svelte";

const HEARTBEAT_MS = 60_000;        // 60s
const IDLE_THRESHOLD_MS_DEFAULT = 10 * 60_000;

class TrackerState {
  running   = $state<TimeEntry | null>(null);
  /** seconds since started_at, recomputed by RAF for smooth chip animation. */
  elapsed   = $state(0);
  idle      = $state(false);
  capacity  = $state<TeamCapacity | null>(null);
  todayHours = $state(0);
  weekHours  = $state(0);
  loading   = $state(false);

  // ── internals ─────────────────────────────────────────────────────
  private _rafId: number | null = null;
  private _heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private _idleTimer: ReturnType<typeof setTimeout> | null = null;
  private _lastInputAt = Date.now();
  private _unsubTE: (() => void) | null = null;
  private _unsubTC: (() => void) | null = null;
  private _subscribed = false;

  /** Subscribe to Realtime + start RAF loop. Idempotent. Returns a dispose. */
  subscribe(): () => void {
    if (!browser || this._subscribed) return () => this._dispose();
    this._subscribed = true;
    this._bootstrap();
    this._startRaf();
    this._startHeartbeat();
    this._attachIdleWatch();
    this._unsubTE = subscribeTimeEntries((row, event) => this._onTimeEntryChange(row, event));
    this._unsubTC = subscribeTeamCapacity((row, event) => this._onCapacityChange(row, event));
    return () => this._dispose();
  }

  // ── public API ────────────────────────────────────────────────────
  async start(opts: {
    plane_issue_id?: string | null;
    plane_issue_seq?: string | null;
    client_code?: string | null;
    client_task_id?: string | null;
    project_code?: string | null;
    description?: string | null;
    is_billable?: boolean | null;
  }): Promise<TimeEntry | null> {
    if (!user.can("tracker.start")) {
      throw new Error("You don't have permission to start a timer.");
    }
    this.loading = true;
    try {
      // T.7.3-G — client_task_id stays in opts for the future RPC param. The
      // current `tracker_start` RPC ignores extra keys via PostgREST; if it
      // ever changes to strict-mode, strip here.
      const r = await postAuthed("/api/functions/tracker-start", opts);
      const entry = (r?.entry as TimeEntry) ?? null;
      if (entry) {
        this.running = entry;
        this._lastInputAt = Date.now();   // reset idle tracker on every start
      }
      return entry;
    } finally {
      this.loading = false;
    }
  }

  async stop(opts: { entry_id?: string; idle_seconds?: number; notes?: string } = {}): Promise<TimeEntry | null> {
    if (!user.can("tracker.stop")) {
      throw new Error("You don't have permission to stop a timer.");
    }
    const entry_id = opts.entry_id || this.running?.id;
    if (!entry_id) return null;
    this.loading = true;
    try {
      const r = await postAuthed("/api/functions/tracker-stop", {
        entry_id,
        idle_seconds: opts.idle_seconds ?? 0,
        notes: opts.notes ?? null,
      });
      const entry = (r?.entry as TimeEntry) ?? null;
      if (entry && this.running?.id === entry.id) {
        this.running = null;
        this.elapsed = 0;
        this.idle = false;
      }
      // Refresh today/week totals after a stop
      await this._refreshAggregates();
      return entry;
    } finally {
      this.loading = false;
    }
  }

  /** Manual idle reset — call when the user re-engages after the idle modal. */
  resetIdle() {
    this.idle = false;
    this._lastInputAt = Date.now();
  }

  /** Force re-bootstrap (e.g. after sign-out → sign-in switch). */
  async refresh() {
    await this._bootstrap();
  }

  // ── internals ─────────────────────────────────────────────────────
  private async _bootstrap() {
    if (!user.id) return;
    try {
      const [running, capacity] = await Promise.all([
        fetchRunningEntry(user.id),
        fetchTeamCapacity(user.id),
      ]);
      this.running = running;
      this.capacity = capacity;
      await this._refreshAggregates();
    } catch (e) {
      console.warn("[tracker] bootstrap failed", e);
    }
  }

  private async _refreshAggregates() {
    if (!user.id) return;
    try {
      const recent = await listMyTimeEntries(user.id, 200);
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const weekStart = new Date(today);
      const dow = weekStart.getDay() || 7;   // 1..7 (Mon..Sun)
      weekStart.setDate(weekStart.getDate() - (dow - 1));

      let todaySec = 0, weekSec = 0;
      for (const e of recent) {
        if (!e.ended_at || !e.duration_seconds) continue;
        const started = new Date(e.started_at);
        if (started >= today) todaySec += e.duration_seconds;
        if (started >= weekStart) weekSec += e.duration_seconds;
      }
      this.todayHours = +(todaySec / 3600).toFixed(2);
      this.weekHours  = +(weekSec  / 3600).toFixed(2);
    } catch (e) {
      console.warn("[tracker] _refreshAggregates", e);
    }
  }

  private _onTimeEntryChange(row: TimeEntry, event: "INSERT" | "UPDATE" | "DELETE") {
    if (row.user_id !== user.id) return;
    if (event === "DELETE") {
      if (this.running?.id === row.id) {
        this.running = null;
        this.elapsed = 0;
      }
      return;
    }
    // INSERT or UPDATE
    if (row.ended_at === null) {
      // It's running — set as current
      this.running = row;
    } else if (this.running?.id === row.id) {
      // Currently running entry just got stopped (potentially by another tab)
      this.running = null;
      this.elapsed = 0;
      this._refreshAggregates();
    } else {
      // A historical entry was edited — refresh totals
      this._refreshAggregates();
    }
  }

  private _onCapacityChange(row: TeamCapacity, _event: "INSERT" | "UPDATE" | "DELETE") {
    if (row.user_id !== user.id) return;
    this.capacity = row;
  }

  // ── RAF-driven elapsed counter (smooth + backgrounded-tab-safe) ───
  private _startRaf() {
    if (!browser) return;
    const tick = () => {
      if (this.running?.started_at) {
        const startedMs = new Date(this.running.started_at).getTime();
        this.elapsed = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
      } else {
        this.elapsed = 0;
      }
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  // ── 60s heartbeat to backend while running ────────────────────────
  private _startHeartbeat() {
    if (!browser) return;
    this._heartbeatTimer = setInterval(async () => {
      if (!this.running?.id) return;
      const idleSec = Math.max(0, Math.floor((Date.now() - this._lastInputAt) / 1000));
      try {
        await postAuthed("/api/functions/tracker-tick", {
          entry_id: this.running.id,
          idle_seconds: idleSec,
        });
      } catch (e) {
        // Quiet — heartbeat failure shouldn't surface as toast
        console.warn("[tracker] heartbeat failed", e);
      }
    }, HEARTBEAT_MS);
  }

  // ── browser-side idle detection (input + visibility) ──────────────
  private _attachIdleWatch() {
    if (!browser) return;
    const reset = () => { this._lastInputAt = Date.now(); if (this.idle) this.idle = false; };
    window.addEventListener("mousedown", reset, { passive: true });
    window.addEventListener("keydown",   reset, { passive: true });
    window.addEventListener("touchstart",reset, { passive: true });
    window.addEventListener("scroll",    reset, { passive: true });
    // periodic check
    setInterval(() => {
      if (!this.running) return;
      const threshold = (user.id && this.capacity ? IDLE_THRESHOLD_MS_DEFAULT : IDLE_THRESHOLD_MS_DEFAULT);
      if (Date.now() - this._lastInputAt > threshold) this.idle = true;
    }, 30_000);
  }

  private _dispose() {
    this._subscribed = false;
    if (this._rafId !== null) cancelAnimationFrame(this._rafId);
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    if (this._idleTimer) clearTimeout(this._idleTimer);
    if (this._unsubTE) this._unsubTE();
    if (this._unsubTC) this._unsubTC();
    this._rafId = null;
    this._heartbeatTimer = null;
    this._idleTimer = null;
    this._unsubTE = null;
    this._unsubTC = null;
  }
}

export const tracker = new TrackerState();

/** Pure helper — format seconds as HH:MM:SS (or MM:SS under one hour). */
export function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
