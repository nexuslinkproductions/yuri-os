<script lang="ts">
  /**
   * RosterCssVars — Workstream U.2 "no hardcoded roster colours".
   *
   * On mount, reads `user_profiles.code/color` from Supabase and injects
   * one CSS custom-property per member into <html>:
   *
   *     --roster-CTI: #3FB5F2;
   *     --roster-FK:  #7B5CFF;
   *     --roster-MS:  #ff9f0a;
   *
   * Everywhere in the codebase that references `var(--roster-XX)` (tokens.css,
   * /focus, /tracker, /tracker/team) continues to resolve the same way — but
   * now the values come from the DB. Adding a 5th team member → just INSERT
   * into user_profiles with code + color → CSS vars appear on next mount.
   *
   * Mounts once in +layout.svelte. Auto-subscribes to user_profiles changes
   * so colour edits propagate without a refresh.
   */
  import { onMount, onDestroy } from "svelte";
  import { supabase, hasClient } from "$lib/db";
  import { browser } from "$app/environment";
  import type { RealtimeChannel } from "@supabase/supabase-js";

  let channel: RealtimeChannel | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  type ProfileRow = { code: string | null; color: string | null };

  function applyRosterVars(rows: ProfileRow[]) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    for (const r of rows) {
      if (!r.code || !r.color) continue;
      root.style.setProperty(`--roster-${r.code}`, r.color);
    }
  }

  async function refreshFromDb() {
    if (!hasClient()) return;
    const { data, error } = await supabase()
      .from("user_profiles")
      .select("code, color")
      .eq("is_active", true)
      .not("code", "is", null)
      .not("color", "is", null);
    if (error) { console.warn("[RosterCssVars] load failed:", error.message); return; }
    applyRosterVars((data ?? []) as ProfileRow[]);
  }

  function attach() {
    if (!browser || !hasClient() || channel) return;
    disposed = false;
    channel = supabase()
      .channel(`user-profiles-css-vars`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_profiles" },
        () => refreshFromDb(),
      )
      .subscribe((status) => {
        if ((status === "CLOSED" || status === "CHANNEL_ERROR") && !disposed) {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => { channel = null; attach(); }, 3_000);
        }
      });
  }

  onMount(async () => {
    await refreshFromDb();
    attach();
  });

  onDestroy(() => {
    disposed = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (channel) { supabase().removeChannel(channel); channel = null; }
  });
</script>

<!-- This component renders nothing — it's a pure side-effect host. -->
