// NEX UI primitives — Polish Sprint Eve 1.
// Headless accessibility from bits-ui, styled with c2moviez design tokens.
// No Tailwind. Inherits --bg2 / --bd / --tx / --a / --a2 etc.

export { default as Dialog } from "./Dialog.svelte";
export { default as Sheet } from "./Sheet.svelte";

// Future primitives (Eve 1B):
//   - Combobox (fuzzy search dropdown)
//   - DropdownMenu (action menus)
//   - Popover (lightweight non-modal)
//   - AlertDialog (destructive confirmation, like Dialog but force-modal)
// The existing GlassToast.svelte stays for notifications.
