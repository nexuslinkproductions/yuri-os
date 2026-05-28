/**
 * cmdPalette.svelte.ts — global command palette open/close state (Svelte 5 runes).
 */
import { browser } from "$app/environment";

class CmdPaletteStore {
  open = $state(false);

  show() { this.open = true; }
  hide() { this.open = false; }
  toggle() { this.open = !this.open; }

  /** Keyboard handler — call once from layout. */
  handleKey(e: KeyboardEvent) {
    if (!browser) return;
    const isMac = navigator.platform.startsWith("Mac") || navigator.userAgent.includes("Mac");
    const trigger = isMac ? e.metaKey : e.ctrlKey;
    if (trigger && e.key === "k") {
      e.preventDefault();
      this.toggle();
    }
    if (e.key === "Escape" && this.open) {
      this.hide();
    }
  }
}

export const cmdPalette = new CmdPaletteStore();
