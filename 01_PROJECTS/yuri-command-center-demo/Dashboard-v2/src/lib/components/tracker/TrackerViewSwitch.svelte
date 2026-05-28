<script lang="ts">
  /**
   * TrackerViewSwitch — three glass pills at the top of /tracker.
   *
   *   Tracker  |  Calendar  |  Team time
   *
   * Used by /tracker/+page.svelte. Reads ?view= from the URL via the host
   * page; on change, host calls goto('?view=...').
   *
   * The Team tab is gated on tracker.view_team — when the caller doesn't
   * have permission, the host hides the entire pill rather than letting
   * this component show a disabled tab (cleaner).
   */
  import { user } from "$stores/user.svelte";

  type View = "tracker" | "tasks" | "analytics" | "calendar" | "team";

  interface Props {
    active: View;
    onChange: (v: View) => void;
  }
  const { active, onChange }: Props = $props();

  const tabs: { id: View; label: string; icon: string; perm?: string }[] = [
    { id: "tracker",   label: "Timeline",  icon: "⧗" },
    { id: "tasks",     label: "Tasks",     icon: "≡" },
    { id: "analytics", label: "Analytics", icon: "▦" },
    { id: "calendar",  label: "Plan week", icon: "◷" },
    { id: "team",      label: "Team time", icon: "◖", perm: "tracker.view_team" },
  ];
  const visible = $derived(tabs.filter(t => !t.perm || user.can(t.perm) || user.isAdmin));
</script>

<nav class="switch" aria-label="Tracker view">
  {#each visible as t}
    <button
      type="button"
      class="pill"
      class:pill--active={active === t.id}
      onclick={() => onChange(t.id)}
      aria-pressed={active === t.id}
    >
      <span class="pill__icon" aria-hidden="true">{t.icon}</span>
      <span class="pill__label">{t.label}</span>
    </button>
  {/each}
</nav>

<style>
  .switch {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--glass-card);
    backdrop-filter: var(--blur-card);
    -webkit-backdrop-filter: var(--blur-card);
    border: 1px solid var(--line);
    box-shadow: var(--sh-card);
  }
  .pill {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: var(--t2);
    font: 600 12.5px/1 var(--sa);
    cursor: pointer;
    transition: background 140ms var(--ease), color 140ms var(--ease);
  }
  .pill:hover { background: var(--s2); color: var(--tx); }
  .pill--active {
    background: linear-gradient(135deg, var(--brand-soft) 0%, var(--brand-softer) 100%);
    color: var(--brand-deep);
    box-shadow: inset 0 0 0 1px var(--brand-line);
  }
  .pill__icon { font-size: 13px; opacity: 0.85; }

  @media (max-width: 480px) {
    .pill { padding: 8px 10px; }
    .pill__label { font-size: 11.5px; }
  }
</style>
