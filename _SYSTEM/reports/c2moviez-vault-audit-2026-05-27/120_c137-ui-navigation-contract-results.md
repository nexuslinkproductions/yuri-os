# C-137 UI Navigation Contract Results

Date: 2026-05-27  
Target clone: `/tmp/yuri-c2moviez-vault-full.b1RopZ/repo`  
Target HEAD: `8103286e1abc63fa9490cb1375ecde4f340aa2bb`  
Mode: read-only source inspection and static route/link extraction. No target source files mutated. No dev server started. No browser/live route probing.

## Scope

This shard checks the dashboard navigation contract:

```text
SvelteKit route files
  -> active shell/sidebar/mobile nav/command palette links
  -> stale nav components
  -> dead links and missing aliases
  -> LLM navigationability
```

Static extraction found 39 tracked `+page.svelte` routes and 34 unique internal navigation bases in JS/Svelte source. The route tree is much more coherent than the API layer, but it still has important dead links and several competing navigation sources. For a human, this causes broken clicks and feature confusion. For an LLM, it increases the chance of choosing a stale route or treating a label like "Finance" as a real module when no route exists.

## Findings

### R120-F01 - Active Navigation Points To Missing `/finance`

Severity: High navigation and feature-truth risk  
Status: `C137_VERIFIED_STATIC_EXTRACTION`

Evidence:

- No tracked route file exists for `/finance`; the route inventory contains `/revenue` and `/expenses`, but not `/finance`.
- `Dashboard-v2/src/lib/components/Sidebar.svelte:32-38` puts `/finance` in the active MONEY section of the primary sidebar.
- `Dashboard-v2/src/routes/+page.svelte:656-665` includes a home module card with `path: "/finance"`.
- `Dashboard-v2/src/routes/admin/modules/+page.svelte:27-35` marks the Finance module as active and points it to `/finance`.
- `Dashboard-v2/src/routes/focus/+page.svelte:786-793` creates finance items with `href: "/finance"`.
- `Dashboard-v2/src/routes/nexdoc/+page.svelte:281-285` links invoice/contract document flow back to `/finance`.

Impact:

The app advertises Finance as a first-class active module, but clicking it cannot resolve to a tracked Svelte route. This is a direct navigation bug and a repo-truth bug: an LLM following "Finance" will look for a module that does not exist as routed UI.

Required remediation direction:

- Add `/finance` as an alias/landing page that routes to the correct finance surface, or replace all `/finance` links with `/revenue`, `/expenses`, or a new tracked finance route.
- Generate nav links from the route manifest so active modules cannot target missing routes.

### R120-F02 - Welcome Flow Links To Missing `/crm`

Severity: Medium-high onboarding navigation risk  
Status: `C137_VERIFIED`

Evidence:

- No tracked route file exists for `/crm`; the CRM route is `/pipeline/customers`.
- `Dashboard-v2/src/routes/welcome/+page.svelte:78-82` defines the "Marketing Hub" card with `href: "/crm"`.

Impact:

New or unauthorized users can be shown a dead route immediately after onboarding. It also reinforces a false mental model: "CRM" exists as a route in docs/UI language, while the actual route is `/pipeline/customers`.

Required remediation direction:

- Add a `/crm` alias that redirects to `/pipeline/customers`, or update the welcome card to the canonical CRM route.
- Record route aliases in a manifest so labels and paths stay aligned.

### R120-F03 - Active Navigation Is Split Across Multiple Unsynchronized Sources

Severity: Medium-high LLM navigationability risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/routes/+layout.svelte:13-16` imports `Sidebar`, `MobileBottomNav`, and `CommandPalette`.
- `Dashboard-v2/src/routes/+layout.svelte:242`, `355`, and `356` render those three active navigation surfaces.
- `Dashboard-v2/src/lib/components/TopNav.svelte:7-21` defines another route list, but no active import/render of `TopNav` was found.
- `Dashboard-v2/src/lib/components/CommandBar.svelte:67-85` defines another mobile nav list, but no active import/render of `CommandBar` was found.
- These inactive nav lists differ from the active sidebar/mobile navigation; for example, `TopNav` includes `/learning`, `/reasoning`, and `/tokens`, while the active sidebar emphasizes `/nexogram`, `/tracker`, `/pipeline/customers`, `/nexdoc`, `/files`, `/expenses`, `/railguard`, and `/di-monitor`.

Impact:

Multiple route lists make the repo harder for an LLM to navigate safely. A model can read an unused component and infer an obsolete primary navigation structure. Humans maintaining the UI can also update one nav list and forget the others.

Required remediation direction:

- Generate all nav surfaces from one route/module registry.
- Mark unused nav components as archived or remove them from active source.
- Add a static check that active nav, command palette, mobile nav, and module registry share canonical route ids.

### R120-F04 - Command Palette Navigation Coverage Is Stale

Severity: Medium navigation efficiency risk  
Status: `C137_VERIFIED`

Evidence:

- `Dashboard-v2/src/lib/components/CommandPalette.svelte:96-106` defines only nine navigation items: Command, Focus, Meetings, Clients, Pipeline, Revenue, Projects, Intel, and Health.
- The active sidebar includes major surfaces absent from the command palette, including `/nexogram`, `/tracker`, `/pipeline/customers`, `/nexdoc`, `/files`, `/expenses`, `/ai-monitor`, `/railguard`, `/di-monitor`, and `/admin`.
- `Dashboard-v2/src/routes/+layout.svelte:264-271` presents the command palette as the central search/navigation affordance in the top bar.

Impact:

The most efficient navigation affordance does not know many of the most important active modules. This hurts day-to-day usability and reduces LLM operator efficiency because the palette is an obvious place to infer canonical app structure.

Required remediation direction:

- Feed command-palette route items from the same module registry as the sidebar.
- Include aliases such as "CRM" -> `/pipeline/customers`, "Finance" -> canonical finance landing, "RailGuard", "NEXOGRAM", "CHRONEX", and "Files".

### R120-F05 - Route Inventory Includes Hidden Or Low-Confidence Surfaces Without Manifest Classification

Severity: Medium repo-truth risk  
Status: `C137_VERIFIED`

Evidence:

- Static route inventory includes hidden or special-purpose routes such as `/components`, `/planner`, `/pitch`, `/auth/callback`, and `/welcome`.
- `Dashboard-v2/src/routes/components/+page.svelte:11-20` hides the design-system showcase client-side unless `PUBLIC_DEV=1`, then redirects with `goto("/")`.
- `Dashboard-v2/src/routes/admin/+page.svelte:1-12` is a client-side redirect to `/admin/members`.
- There is no route manifest classifying routes as primary, alias, admin, auth-only, dev-only, public pitch, hidden, or retired.

Impact:

Without route classification, both humans and LLMs must infer whether a route is a main product surface, a compatibility alias, an auth callback, a dev showcase, or a retired experiment. That leads to inefficient navigation and overconfident claims about features.

Required remediation direction:

- Add a route manifest with `id`, `path`, `label`, `status`, `navSurface`, `authClass`, `owner`, and `featureFamily`.
- Generate sidebar, mobile nav, command palette, and module cards from it.
- Require every route to be classified before final acceptance.

### R120-F06 - Domain Labels And Paths Are Not Canonically Aliased

Severity: Medium LLM usability risk  
Status: `C137_VERIFIED`

Evidence:

- Active UI labels use domain names such as Finance, CRM, CHRONEX, NEXdoc, NEXOGRAM, and RailGuard.
- Canonical paths sometimes use different language: CRM is `/pipeline/customers`; CHRONEX is `/tracker`; Finance has no route; system health is `/health`; deploy log is `/di-monitor`.
- No tracked alias map was found during this shard.

Impact:

Domain labels are useful for humans, but without an alias map an LLM has to guess the path behind a product name. This is how assistants hallucinate modules or navigate dead routes.

Required remediation direction:

- Add a `route_aliases` section to the route/module manifest.
- Include common names, product names, legacy names, and hidden/deprecated names.
- Use the alias map in docs, command palette, and any future LLM navigation packet.

## Positive Controls Observed

- The active layout clearly renders only `Sidebar`, `MobileBottomNav`, and `CommandPalette`.
- Most active primary links do map to tracked routes.
- `Sidebar.svelte:73-79` has a small active-route override so `/pipeline/customers` does not incorrectly activate `/pipeline`.
- `/admin` has a stable landing URL that redirects to `/admin/members`, which is useful if converted into a manifest-declared alias.
- The `/components` showcase is hidden unless `PUBLIC_DEV=1`, reducing accidental normal-user exposure.

## Coverage Boundary

This shard is static. It does not run the SvelteKit app, does not verify rendered clicks, and does not account for live reverse-proxy aliases. It proves that the tracked source contains missing route targets and unsynchronized navigation sources, which is enough to mark UI navigationability as incomplete until a route/module manifest exists.
