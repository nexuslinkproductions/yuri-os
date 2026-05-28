/**
 * Glass — canonical interactive surfaces (Workstream W).
 *
 * Usage:
 *   import { GlassActionPrimary, GlassActionSecondary, GlassValueChip, GlassInlineLink } from "$lib/components/glass";
 *
 * Rule of thumb per surface:
 *   ≤ 1 GlassActionPrimary    (L1 — hero, brand-tinted)
 *   ≤ 3 GlassActionSecondary  (L2 — standard glass) in the primary action zone
 *   unlimited GlassValueChip  (L3 — clickable values)
 *   unlimited GlassInlineLink (L4 — quiet body-text links)
 *
 * Visual recipes are in lib/styles/design-system.css. Tokens in tokens.css.
 *
 * NEVER ship a bare <button> outside this folder. (Workstream W.5 will lock
 * this with a pre-commit hook.)
 */
export { default as GlassActionPrimary }   from "./GlassActionPrimary.svelte";
export { default as GlassActionSecondary } from "./GlassActionSecondary.svelte";
export { default as GlassValueChip }       from "./GlassValueChip.svelte";
export { default as GlassInlineLink }      from "./GlassInlineLink.svelte";
