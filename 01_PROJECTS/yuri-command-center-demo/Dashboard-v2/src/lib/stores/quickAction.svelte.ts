/**
 * quickAction.svelte.ts — global quick-action overlay state (Svelte 5 runes).
 * Triggered via ⌘⇧A or programmatically.
 */
import { browser } from "$app/environment";

export type QuickVerb = "pipeline-won" | "email" | "push" | "schedule" | null;

class QuickActionStore {
  open = $state(false);
  verb = $state<QuickVerb>(null);

  show(v: QuickVerb = null) { this.verb = v; this.open = true; }
  hide() { this.open = false; this.verb = null; }
  toggle() { this.open ? this.hide() : this.show(); }

  handleKey(e: KeyboardEvent) {
    if (!browser) return;
    const isMac = navigator.platform.startsWith("Mac") || navigator.userAgent.includes("Mac");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === "a") {
      e.preventDefault();
      this.toggle();
    }
    if (e.key === "Escape" && this.open) this.hide();
  }
}

export const quickAction = new QuickActionStore();
