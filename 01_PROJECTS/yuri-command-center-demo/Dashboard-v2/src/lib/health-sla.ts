/**
 * Health SLA config — shared between /health and the Overview red-alert strip.
 * Each service has a matcher (action regex), a threshold in minutes for each
 * severity level, and a human-readable path/hint for the CEO.
 */
import type { AuditRow } from "$lib/db";

export type Severity = "ok" | "yellow" | "red" | "unknown";

export interface SlaService {
  key: string;
  label: string;
  match: (row: AuditRow) => boolean;
  // minutes: row newer than `ok` → ok; newer than `yellow` → yellow; older or missing → red
  threshold: { ok: number; yellow: number };
  plist_path?: string;
  hint?: string;
}

export const SLA_SERVICES: SlaService[] = [
  {
    key: "plane-webhook",
    label: "Plane webhook",
    match: r => /^(plane\.webhook|webhook\.plane|ticket\.(created|updated|deleted))/i.test(r.action || "")
      || r.actor === "plane-webhook" || r.actor === "plane",
    threshold: { ok: 360, yellow: 720 }, // 6h / 12h
    plist_path: "com.c2moviez.plane-sync / plane-webhook (VPS)",
    hint: "Incoming ticket updates from Plane.so.",
  },
  {
    key: "outlook-webhook",
    label: "Outlook sync",
    match: r => /^(outlook\.|webhook\.outlook|meeting\.(created|updated|deleted))/i.test(r.action || "")
      || r.actor === "outlook-webhook" || r.actor === "outlook",
    threshold: { ok: 720, yellow: 1440 }, // 12h / 24h
    plist_path: "outlook-sync (launchd) · outlook-webhook (VPS)",
    hint: "Calendar + meeting ingestion via m365 Graph.",
  },
  {
    key: "realtime",
    label: "Supabase realtime",
    match: r => /\.(insert|update|upsert|realtime)/i.test(r.action || "") || true, // any audit row counts
    threshold: { ok: 30, yellow: 120 }, // 30m / 2h
    plist_path: "Supabase realtime channels · entity_state + audit_log",
    hint: "Live Dashboard updates.",
  },
  {
    key: "auto-backup",
    label: "Auto-backup",
    match: r => /^auto[.-]backup/i.test(r.action || "") || r.actor === "auto-backup",
    threshold: { ok: 60, yellow: 180 }, // 1h / 3h
    plist_path: "com.c2moviez.auto-backup (launchd)",
    hint: "Git commits of Scripts/ + .claude/agents/ every hour.",
  },
  {
    key: "exeo-daemon",
    label: "EXEO daemon",
    match: r => /^exeo\.daemon/i.test(r.action || ""),
    threshold: { ok: 360, yellow: 720 }, // 6h / 12h
    plist_path: "com.c2moviez.exeo-daemon (launchd · tmux)",
    hint: "Telegram inbox → MCP Claude orchestrator.",
  },
  {
    key: "cto-nightly",
    label: "CTO nightly pass",
    match: r => /^cto\.nightly/i.test(r.action || ""),
    threshold: { ok: 28 * 60, yellow: 52 * 60 }, // 28h / 52h
    plist_path: "com.c2moviez.cto-nightly (launchd · 00:30 CEST)",
    hint: "Overnight health + roadmap + predictions pass.",
  },
];

export function computeSeverity(svc: SlaService, latest?: AuditRow): Severity {
  if (!latest) return "red";
  const minsAgo = (Date.now() - new Date(latest.created_at).getTime()) / 60_000;
  if (minsAgo <= svc.threshold.ok)     return "ok";
  if (minsAgo <= svc.threshold.yellow) return "yellow";
  return "red";
}

export function latestMatch(svc: SlaService, rows: AuditRow[]): AuditRow | undefined {
  return rows.find(r => svc.match(r));
}

export function serviceRollup(rows: AuditRow[]) {
  return SLA_SERVICES.map(svc => {
    const latest = latestMatch(svc, rows);
    const severity = computeSeverity(svc, latest);
    return { svc, latest, severity };
  });
}
