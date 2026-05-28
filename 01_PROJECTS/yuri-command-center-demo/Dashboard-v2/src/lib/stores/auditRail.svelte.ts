/**
 * auditRail.svelte.ts — audit rail open/close state (Svelte 5 runes).
 */
import { browser } from "$app/environment";

class AuditRailStore {
  open = $state(false);

  show() { this.open = true; }
  hide() { this.open = false; }
  toggle() {
    this.open = !this.open;
    if (browser) localStorage.setItem("exeo-audit-rail", this.open ? "1" : "0");
  }

  init() {
    if (!browser) return;
    const stored = localStorage.getItem("exeo-audit-rail");
    if (stored === "1") this.open = true;
  }
}

export const auditRail = new AuditRailStore();
