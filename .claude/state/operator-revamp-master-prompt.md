# OPERATOR CENTER — TOTAL REVAMP MASTER PROMPT
**Routing:** DeepSeek-only (Pro lead, Flash workers) + @swarm/Ruflo offload. **NO Anthropic Agent() spawns.**
**Owner:** Marcel Spatz / NUDIMMUD
**Date:** 2026-05-06
**Authority:** Opus = thin overseer only. DeepSeek-workhorse owns plan, design, code, ship.

---

## 1. MISSION
Total redesign + reimplementation of the Operator center served at `http://localhost:4200/operator`.
Match — and exceed — the fluidity, polish, and cohesion of the freshly revamped consumer site (`src/consumer/*`).
Rethink every surface: information architecture, navigation, motion, density, color, typography, micro-interactions, command surfaces, data visualization, accessibility.
Plan → design → execute → commit → ship. End state: production-ready, type-clean, brand-aligned, motion-rich, accessible.

## 2. NON-NEGOTIABLE CONSTRAINTS
- DeepSeek + @swarm only. No Claude/Anthropic agent spawning. No Opus author edits beyond minor copy/typo level.
- Match the visual + interaction DNA of `src/consumer/*` (sections, motion, gradient/texture vocabulary, scroll feel, type system, brand voice).
- Do NOT touch: `backend/data/`, `.env`, `.claude/state/` (write only `.claude/state/operator-revamp-*.md`), `/Volumes/T7`, Conclave, secrets.
- Stay on branch `main` at cwd `/Users/marcelspatz/NUDIMMUD`. Verify before any write.
- One coherent transaction. SPLIT_REQUIRED if scope balloons beyond 1 sprint — log split, request re-entry.
- No `--no-verify`, no `git push --force`, no `rm -rf` of unrelated paths.
- All commits authored under existing git identity. Commit messages = imperative, concise, evidence-backed.

## 3. CURRENT STATE (verified 2026-05-06)
- Operator entry: `src/operator/OperatorShell.tsx` (167 lines, single file).
- App routing: `src/App.tsx` lazy-loads `OperatorShell` when `pathname.startsWith('/operator')`.
- Consumer template (reference for fluidity DNA):
  - Shell: `src/consumer/ConsumerSite.tsx`
  - Style: `src/consumer/consumer.css`
  - Sections: Hero, Services, Portfolio, About, Oracle, Contact
  - Components: AnimatedCounter, LiveTicker, SectionIndicator, Navigation, MobileMenu
- Dev URL: `http://localhost:4200/operator` (Vite dev server, port 4200).

## 4. SCOPE — REIMAGINED OPERATOR CENTER
Operator is the internal command surface for the NUDIMMUD/Yuri OS / Nexus Link operator/admin/console layer. Treat as a "studio cockpit" — not a CRUD admin panel. It must FEEL alive: telemetry, agent state, swarm activity, token spend, queue health, deployment posture, design audit HUD, oracle voice status, wake-word state — all surfaced with motion and clarity.

Suggested surfaces (DeepSeek must finalize IA after research):
- **Dashboard / Cockpit** — live KPIs, token bars, lane utilization, recent sessions, alerts
- **Agents & Swarm** — running lanes, capacity, model routing graph, kill/restart controls (read-only stubs OK)
- **Sessions** — chronological feed, search, transcript drill-down (read from existing session state if exposed; otherwise mock)
- **Skills & Routing** — skill catalog, trigger map, invocation heatmap
- **Token Ops / FinOps** — spend per model, budget pacing, offload efficiency
- **Design Audit HUD** — surface existing `src/components/DesignAuditHUD/*`
- **Oracle Console** — voice/wake-word status, transcript, control surface
- **Deployment & Health** — service health, port 3098 shell service, launchd state
- **Settings / Profile** — operator identity, theme, preferences

## 5. RESEARCH MANDATE (DEEPSEEK + WEBSEARCH)
Before designing: DeepSeek runs websearch on reference cockpits/operator UIs. Extract patterns, do NOT clone. Suggested seeds:
- Linear, Vercel dashboard, Railway, Resend, Supabase Studio, Raycast, Arc browser command palette, Stripe Workbench, Cloudflare dashboard, Statsig, PostHog, Grafana 11, Sentry, Datadog NextGen, Cursor IDE inspector, OpenAI Platform.
- Motion refs: Linear releases page, Vercel marketing, Apple Vision UI, Framer site, GSAP showcase.
- Design system refs: Radix Themes, shadcn, Linear's design system, Vercel Geist.
Compile a `RESEARCH_PACK.md` (≤80 lines) of distilled patterns BEFORE design phase.

## 6. PHASES (deepseek-workhorse owns all)
Each phase ends with an artifact written to `.claude/state/operator-revamp-<phase>.md`.

1. **RESEARCH** — websearch + ladder Tier 1–4 only; output `RESEARCH_PACK.md` (≤80 lines).
2. **PLAN / IA** — sitemap, route map, component tree, data shape, motion budget; output `IA_PLAN.md`.
3. **DESIGN** — invoke design-master + design-critique + frontend-design skills (DeepSeek-side); produce design tokens, layout grid, component specs, motion spec, accessibility spec; output `DESIGN_SPEC.md`.
4. **SCAFFOLD** — create folder structure mirroring `src/consumer/` (sections/, components/, data/, operator.css). Replace single-file `OperatorShell.tsx` with shell + sections + nav.
5. **IMPLEMENT** — build all sections + components. Reuse consumer primitives where they fit (AnimatedCounter, SectionIndicator pattern). All TypeScript strict, no `any` leakage.
6. **WIRE** — connect to existing endpoints/state where available (session state, token tracking, skill registry, design audit HUD). Mock where source absent — clearly flagged with `// TODO(data-source):`.
7. **POLISH** — motion pass, focus states, keyboard nav (cmd-k palette mandatory), reduced-motion, color-contrast WCAG AA, mobile/tablet responsive.
8. **AUDIT** — design-critique pass + accessibility-review skill + tsc + vite build + lint. All must pass.
9. **SHIP** — staged commit(s) on branch `main`. Final commit message format:
   ```
   operator: total revamp — fluidity-matched cockpit IA, motion, design system

   - Replace single-file OperatorShell with sectioned cockpit
   - <one bullet per major surface>
   - Match consumer-site motion/typography/color DNA
   - Adds: <list>
   - WCAG AA, reduced-motion, keyboard-first
   ```
   Git push only if user explicitly approved. Default: commit, do NOT push.

## 7. DESIGN PRINCIPLES (HARD)
- "Studio cockpit, not admin panel."
- Motion = purposeful, never decorative; <16ms frame budget; respect prefers-reduced-motion.
- Density tiers: glance / scan / focus — every surface declares its tier.
- Single primary color action per view. Brand palette inherits from `consumer.css` tokens.
- Typography hierarchy mirrors consumer site; geometric sans for chrome, mono for telemetry numbers.
- Cmd-K palette is the spine. All navigation, search, action invocation routes through it.
- Live data first; static views are failure modes.
- Gradients + grain + subtle bloom — same vocabulary as consumer hero.
- Empty states get personality; loading states are skeletons or shimmer, never spinners alone.

## 8. TECH RAILS
- React 18, TypeScript strict, Vite, existing routing.
- CSS: extend `consumer.css` tokens via a shared `:root` token layer; new `operator.css` consumes them.
- Animation: prefer CSS + `Web Animations API`; reach for GSAP/Framer-Motion only if already installed (verify before adding deps).
- No new heavy deps without justification logged in `IA_PLAN.md`.
- All routes lazy-loaded under `/operator/*` sub-paths.

## 9. EVIDENCE & REPORTING
- Every phase: write artifact to `.claude/state/operator-revamp-<phase>.md` (≤120 lines).
- Final report: `.claude/state/operator-revamp-FINAL.md` with sections — RESULT | FILES_CHANGED | VALIDATION (tsc/build/lint output excerpts) | COMMITS | NON_CLAIMS | NEXT_RECOMMENDED.
- Tag every claim Observed | Inferred | Assumed | Unknown.
- No raw stdout dumps. Compact evidence packs only.

## 10. STOP CONDITIONS
- Hard stop + report if: scope > 1 sprint, deps need adding, breaking change in App.tsx routing required beyond the `/operator` block, T7 access needed, secrets needed.
- On stop: write `.claude/state/operator-revamp-BLOCKED.md` with exact blocker, scope, requested approval.

## 11. TOOL ACCESS GRANTED
- All design skills: design-master, design-critique, frontend-design, design-system, accessibility-review, ux-copy, design-handoff, research-synthesis.
- Web research: websearch (Tier 1–4 ladder; Tier 5 owner approval required).
- Local: Read/Edit/Write/Bash within the cwd boundary.
- Browser preview tools (Claude-in-Chrome / Preview MCP) for visual QA — read-tier only on browsers; navigate via Chrome MCP.
- Swarm fan-out: deepseek-v4-pro lead, deepseek-v4-flash workers, Ruflo browser/research lanes.

## 12. ROUTING TOPOLOGY
```
DeepSeek Pro (lead)
  ├── DeepSeek Flash workers (parallel section drafts)
  ├── @swarm/Ruflo (websearch, asset gathering, screenshot capture of refs)
  ├── design-master skill (token + spec generation)
  ├── design-critique skill (pass 7 audit)
  └── frontend-design skill (component scaffolding)
Opus (overseer)
  └── verifies artifacts present, NO author edits, escalation gate only
```

## 13. ENTRYPOINT FOR DEEPSEEK
First action: read `src/consumer/consumer.css`, `src/consumer/ConsumerSite.tsx`, all of `src/consumer/sections/*`, `src/consumer/components/*`, and `src/operator/OperatorShell.tsx`. Then begin Phase 1 (RESEARCH).

END OF MASTER PROMPT.
