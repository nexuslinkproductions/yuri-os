/**
 * theme.svelte.ts — persistent light/dark mode state (Svelte 5 runes).
 */
import { browser } from "$app/environment";

type Theme = "dark" | "light";

function initial(): Theme {
  if (!browser) return "light";
  const stored = localStorage.getItem("exeo-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "light";
}

class ThemeStore {
  current = $state<Theme>(initial());

  toggle() {
    this.set(this.current === "dark" ? "light" : "dark");
  }

  set(value: Theme) {
    this.current = value;
    if (browser) {
      localStorage.setItem("exeo-theme", value);
      document.documentElement.setAttribute("data-theme", value);
    }
  }

  sync() {
    if (!browser) return;
    document.documentElement.setAttribute("data-theme", this.current);
  }
}

export const theme = new ThemeStore();
