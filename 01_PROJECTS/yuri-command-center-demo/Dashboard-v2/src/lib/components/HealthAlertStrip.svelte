<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { recentAudit, subscribeAuditLog, type AuditRow } from "$lib/db";
  import { serviceRollup } from "$lib/health-sla";

  let audit = $state<AuditRow[]>([]);
  let unsub: (() => void) | null = null;

  onMount(async () => {
    audit = await recentAudit(200);
    unsub = subscribeAuditLog(row => {
      audit = [row, ...audit].slice(0, 200);
    });
  });
  onDestroy(() => unsub?.());

  const rollup   = $derived(serviceRollup(audit));
  const reds     = $derived(rollup.filter(r => r.severity === "red"));
  const yellows  = $derived(rollup.filter(r => r.severity === "yellow"));
</script>

{#if reds.length > 0}
  <aside class="alert-strip red">
    <span class="alert-dot"></span>
    <span class="alert-label">SLA RED</span>
    <span class="alert-msg">
      {reds.map(r => r.svc.label).join(" · ")} — no recent activity
    </span>
    <a class="alert-link" href="/health">Open Health →</a>
  </aside>
{:else if yellows.length > 0}
  <aside class="alert-strip yellow">
    <span class="alert-dot"></span>
    <span class="alert-label">SLA WARN</span>
    <span class="alert-msg">
      {yellows.map(r => r.svc.label).join(" · ")} approaching threshold
    </span>
    <a class="alert-link" href="/health">Open Health →</a>
  </aside>
{/if}

<style>
  .alert-strip {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    padding: 10px 16px;
    border-radius: var(--r-md);
    font-size: 12.5px;
    border: 1px solid;
    animation: slide-in 300ms var(--ease-spring);
  }
  .alert-strip.red {
    background: linear-gradient(135deg, var(--re-14), rgba(0,0,0,0.04));
    border-color: var(--re-40);
    box-shadow: 0 0 0 1px var(--re-18), 0 0 20px var(--re-14);
    color: color-mix(in oklab, var(--re) 70%, white);
  }
  .alert-strip.yellow {
    background: linear-gradient(135deg, var(--ye-14), rgba(0,0,0,0.03));
    border-color: var(--ye-28);
    color: color-mix(in oklab, var(--ye) 70%, white);
  }
  .alert-dot {
    width: 8px; height: 8px; border-radius: 50%;
    flex-shrink: 0;
  }
  .alert-strip.red .alert-dot {
    background: var(--re);
    box-shadow: 0 0 10px var(--re);
    animation: pulse 1.6s infinite ease-in-out;
  }
  .alert-strip.yellow .alert-dot {
    background: var(--ye);
    box-shadow: 0 0 8px var(--ye);
  }
  .alert-label {
    font-family: "Space Grotesk", sans-serif;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    font-weight: 600;
  }
  .alert-msg { flex: 1; color: var(--tx); }
  .alert-link {
    color: inherit; text-decoration: none;
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    font-family: "Space Grotesk", sans-serif;
  }
  .alert-link:hover { background: rgba(255,255,255,0.12); }
  @keyframes slide-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50%      { opacity: 0.6; transform: scale(1.3); }
  }
</style>
