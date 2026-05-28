<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { auditRail } from "$stores/auditRail.svelte";
  import { recentAudit, subscribeAuditLog, type AuditRow } from "$lib/db";

  let events = $state<AuditRow[]>([]);
  let unsub: (() => void) | null = null;

  onMount(async () => {
    events = await recentAudit(80);
    unsub = subscribeAuditLog(row => {
      events = [row, ...events].slice(0, 80);
    });
  });
  onDestroy(() => unsub?.());

  function timeLabel(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ago`;
    return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", timeZone: "Europe/Zurich" });
  }

  function actionIcon(action: string): string {
    if (/ticket|issue|plane/.test(action)) return "🎫";
    if (/meeting|outlook|calendar/.test(action)) return "📅";
    if (/telegram|message/.test(action)) return "💬";
    if (/auth|login|logout/.test(action)) return "🔐";
    if (/client|customer/.test(action)) return "🏢";
    if (/obsidian|vault/.test(action)) return "📝";
    if (/webhook/.test(action)) return "🔗";
    if (/error|fail/.test(action)) return "⚠";
    return "·";
  }

  function actionColor(action: string): string {
    if (/ticket|issue|plane/.test(action)) return "var(--a)";
    if (/meeting|outlook|calendar/.test(action)) return "var(--a2)";
    if (/telegram|message/.test(action)) return "var(--gr)";
    if (/auth|login|logout/.test(action)) return "var(--ye)";
    if (/client|customer/.test(action)) return "var(--or)";
    if (/error|fail|bad/.test(action)) return "var(--re)";
    return "var(--t3)";
  }

  function actionLabel(action: string): string {
    return action.replace(/\./g, " · ").replace(/_/g, " ");
  }
</script>

{#if auditRail.open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <aside class="rail glass glass--thick" aria-label="Audit trail">
    <div class="rail-header">
      <span class="eyebrow">Audit Rail</span>
      <span class="live-dot" title="Live"></span>
      <button type="button" class="rail-close" onclick={() => auditRail.hide()} aria-label="Close audit rail">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
          stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <div class="rail-feed">
      {#each events as ev (ev.id)}
        <div class="rail-event enter-up">
          <div class="rail-dot" style="background:{actionColor(ev.action)};box-shadow:0 0 6px {actionColor(ev.action)};"></div>
          <div class="rail-body">
            <div class="rail-action small" style="color:{actionColor(ev.action)}">
              {actionIcon(ev.action)} {actionLabel(ev.action)}
            </div>
            {#if ev.entity_name}
              <div class="rail-name" title={ev.entity_name}>{ev.entity_name}</div>
            {/if}
            <div class="rail-meta caption">
              {#if ev.actor}<span class="rail-actor">{ev.actor}</span>{/if}
              <span class="rail-time">{timeLabel(ev.created_at)}</span>
            </div>
          </div>
        </div>
      {/each}
      {#if events.length === 0}
        <div class="rail-empty small">No recent events</div>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .rail {
    position: fixed;
    top: 60px;
    right: 0;
    bottom: 0;
    width: 280px;
    z-index: var(--z-fixed);
    border-radius: var(--r-lg) 0 0 var(--r-lg);
    border-right: none;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: rail-slide 220ms var(--ease-spring) both;
  }

  .rail-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--b2);
    flex-shrink: 0;
  }
  .rail-header .eyebrow { flex: 1; }

  .live-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gr);
    box-shadow: 0 0 6px var(--gr);
    animation: breathe 1.8s ease-in-out infinite;
  }

  .rail-close {
    all: unset;
    cursor: pointer;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: var(--t3);
    transition: background var(--dur-fast), color var(--dur-fast);
  }
  .rail-close:hover { background: var(--s2); color: var(--tx); }

  .rail-feed {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    scrollbar-width: thin;
    scrollbar-color: var(--b2) transparent;
  }

  .rail-event {
    display: flex;
    gap: 10px;
    padding: 8px 8px;
    border-radius: 8px;
    transition: background var(--dur-fast);
  }
  .rail-event:hover { background: var(--s1); }

  .rail-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
    margin-top: 5px;
  }

  .rail-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .rail-action {
    font-size: 11.5px;
    font-family: var(--mo);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rail-name {
    font-size: 12.5px;
    color: var(--tx);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rail-meta {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 1px;
  }

  .rail-actor {
    color: var(--t3);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 90px;
  }

  .rail-time {
    color: var(--t4);
    font-size: 10.5px;
    flex-shrink: 0;
    margin-left: auto;
  }

  .rail-empty {
    padding: 24px 12px;
    text-align: center;
    color: var(--t3);
  }

  @keyframes rail-slide {
    from { opacity: 0; transform: translateX(24px); }
    to   { opacity: 1; transform: none; }
  }

  @keyframes breathe {
    0%, 100% { transform: scale(1);   opacity: 1;   }
    50%      { transform: scale(0.7); opacity: 0.5; }
  }

  @media (max-width: 860px) {
    .rail { width: 100%; border-radius: 0; }
  }
</style>
