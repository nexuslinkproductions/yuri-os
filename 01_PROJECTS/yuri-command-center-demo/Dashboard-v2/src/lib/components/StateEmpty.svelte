<script lang="ts">
  /**
   * StateEmpty — illustrated empty state. Replaces bare "No data." text.
   */
  interface Props {
    title?: string;
    body?: string;
    icon?: "constellation" | "inbox" | "search" | "calendar";
  }

  let {
    title = "Nothing here yet",
    body = "",
    icon = "constellation",
  }: Props = $props();
</script>

<div class="empty-state enter-up">
  <div class="empty-illustration" aria-hidden="true">
    {#if icon === "constellation"}
      <svg width="96" height="80" viewBox="0 0 96 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Orbital rings -->
        <ellipse cx="48" cy="40" rx="40" ry="22" stroke="var(--b2)" stroke-width="1" stroke-dasharray="3 4"/>
        <ellipse cx="48" cy="40" rx="28" ry="14" stroke="var(--b2)" stroke-width="1" stroke-dasharray="2 5"/>
        <!-- Nodes -->
        <circle cx="48" cy="18" r="3" fill="var(--a)" opacity="0.8"/>
        <circle cx="86" cy="40" r="2" fill="var(--a2)" opacity="0.6"/>
        <circle cx="10" cy="40" r="2" fill="var(--a2)" opacity="0.6"/>
        <circle cx="48" cy="62" r="2.5" fill="var(--a)" opacity="0.5"/>
        <circle cx="20" cy="26" r="1.5" fill="var(--t3)" opacity="0.7"/>
        <circle cx="76" cy="26" r="1.5" fill="var(--t3)" opacity="0.7"/>
        <circle cx="20" cy="54" r="1.5" fill="var(--t3)" opacity="0.7"/>
        <circle cx="76" cy="54" r="1.5" fill="var(--t3)" opacity="0.7"/>
        <!-- Connections -->
        <line x1="48" y1="18" x2="20" y2="26" stroke="var(--b2)" stroke-width="0.75"/>
        <line x1="48" y1="18" x2="76" y2="26" stroke="var(--b2)" stroke-width="0.75"/>
        <line x1="20" y1="26" x2="10" y2="40" stroke="var(--b2)" stroke-width="0.75"/>
        <line x1="76" y1="26" x2="86" y2="40" stroke="var(--b2)" stroke-width="0.75"/>
        <line x1="10" y1="40" x2="20" y2="54" stroke="var(--b2)" stroke-width="0.75"/>
        <line x1="86" y1="40" x2="76" y2="54" stroke="var(--b2)" stroke-width="0.75"/>
        <!-- Centre glow -->
        <circle cx="48" cy="40" r="6" fill="var(--a)" opacity="0.12"/>
        <circle cx="48" cy="40" r="3" fill="var(--a)" opacity="0.35"/>
      </svg>

    {:else if icon === "inbox"}
      <svg width="80" height="72" viewBox="0 0 80 72" fill="none">
        <rect x="12" y="24" width="56" height="38" rx="6" stroke="var(--b2)" stroke-width="1.5"/>
        <path d="M12 36h16l8 10 8-10h16" stroke="var(--b2)" stroke-width="1.5" stroke-linejoin="round"/>
        <circle cx="40" cy="16" r="8" stroke="var(--a)" stroke-width="1.5" opacity="0.6"/>
        <line x1="40" y1="10" x2="40" y2="22" stroke="var(--a)" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
        <line x1="34" y1="16" x2="46" y2="16" stroke="var(--a)" stroke-width="1.5" stroke-linecap="round" opacity="0.6"/>
      </svg>

    {:else if icon === "search"}
      <svg width="80" height="72" viewBox="0 0 80 72" fill="none">
        <circle cx="34" cy="34" r="20" stroke="var(--b2)" stroke-width="1.5"/>
        <circle cx="34" cy="34" r="12" stroke="var(--b2)" stroke-width="1" stroke-dasharray="2 4"/>
        <line x1="48" y1="48" x2="62" y2="62" stroke="var(--b2)" stroke-width="2" stroke-linecap="round"/>
        <circle cx="34" cy="34" r="4" fill="var(--a)" opacity="0.3"/>
        <line x1="28" y1="28" x2="40" y2="40" stroke="var(--a)" stroke-width="1" opacity="0.4"/>
      </svg>

    {:else if icon === "calendar"}
      <svg width="80" height="72" viewBox="0 0 80 72" fill="none">
        <rect x="10" y="18" width="60" height="46" rx="6" stroke="var(--b2)" stroke-width="1.5"/>
        <line x1="10" y1="32" x2="70" y2="32" stroke="var(--b2)" stroke-width="1"/>
        <line x1="28" y1="10" x2="28" y2="26" stroke="var(--b2)" stroke-width="2" stroke-linecap="round"/>
        <line x1="52" y1="10" x2="52" y2="26" stroke="var(--b2)" stroke-width="2" stroke-linecap="round"/>
        <!-- Grid dots -->
        {#each [22, 34, 46, 58] as x}
          {#each [42, 54] as y}
            <circle {x} {y} r="2" fill="var(--t4)"/>
          {/each}
        {/each}
        <circle cx="40" cy="48" r="3" fill="var(--a)" opacity="0.5"/>
      </svg>
    {/if}
  </div>

  <p class="empty-title">{title}</p>
  {#if body}
    <p class="empty-body small">{body}</p>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 32px 20px;
    text-align: center;
  }

  .empty-illustration {
    opacity: 0.7;
  }

  .empty-title {
    font-family: "Space Grotesk", sans-serif;
    font-size: 14px;
    font-weight: 500;
    color: var(--t2);
    margin: 0;
    letter-spacing: -0.005em;
  }

  .empty-body {
    margin: 0;
    max-width: 240px;
    line-height: 1.55;
  }
</style>
