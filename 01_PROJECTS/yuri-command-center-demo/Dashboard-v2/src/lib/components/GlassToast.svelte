<script lang="ts" module>
  import { writable } from "svelte/store";

  type Toast = { id: string; text: string; tone: "info" | "ok" | "warn" | "error"; ttl: number };
  export const toasts = writable<Toast[]>([]);

  export function toast(text: string, tone: Toast["tone"] = "info", ttl = 4000) {
    const id = Math.random().toString(36).slice(2);
    toasts.update(list => [...list, { id, text, tone, ttl }]);
    setTimeout(() => toasts.update(list => list.filter(t => t.id !== id)), ttl);
  }
</script>

<script lang="ts">
</script>

<div class="toast-rail" aria-live="polite">
  {#each $toasts as t (t.id)}
    <div class="toast glass glass--thick chip {t.tone === 'info' ? '' : t.tone}" role="status">
      <span class="chip-dot"></span>
      <span>{t.text}</span>
    </div>
  {/each}
</div>

<style>
  .toast-rail {
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 100;
    max-width: 360px;
  }
  .toast {
    padding: 10px 14px;
    border-radius: var(--r-md);
    animation: slide-in 260ms var(--ease-spring) both;
  }
  @keyframes slide-in {
    from { transform: translateX(20px); opacity: 0; }
    to   { transform: translateX(0);     opacity: 1; }
  }
</style>
