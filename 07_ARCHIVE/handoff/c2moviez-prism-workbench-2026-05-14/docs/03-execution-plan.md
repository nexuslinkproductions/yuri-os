# PRISM Engineering Campaign

## Goal

Finish PRISM as a polished c2moviez Sales Engagement Workbench: Today-first, visually premium, source-aware, safe for manual outreach, and optimized for Fanny's daily acquisition loop.

## Campaign Phases

### Phase 1: Campaign Memory & Branch Hygiene

- Work from `codex/c2moviez-acquisition-crm` in an isolated worktree.
- Keep dirty `main` offload changes untouched.
- Archive the Perplexity blueprint under `_SYSTEM/research-archive/c2moviez-acquisition-workbench/`.
- Use this campaign directory as owner-intent evidence.

### Phase 2: State & Safety Spine

- Add machine/human state separation while keeping `status` and `crm_stage` as compatibility fields.
- Add explicit server actions for mark-sent, reply logging, disqualification, follow-up creation, and compliance review request.
- Restrict generic patching to safe edits: notes, draft text, metadata.
- Add opt-out suppression table keyed by email, LinkedIn URL, and exact contact/company identity.
- Enforce send gates server-side.

### Phase 3: Source Pipeline

- Normalize full source pipeline inputs into the existing cold acquisition service.
- Track source batch, source confidence, public email basis, LinkedIn URL, company domain, and evidence completeness.
- Ensure wrong-lead risk is reduced before visual polish: source quality and evidence fit must be visible in Dossier.

### Phase 4: Today-First PRISM UI

- Rename visible product from "Acquisition CRM" to "PRISM".
- Build Today view as default screen.
- Add topbar metrics: sent this week, overdue follow-ups, blocked leads.
- Use "Open next lead" as compliance-safe highest score.
- Keep queue available, but secondary to Today mission.

### Phase 5: Inspector & Draft Workspace

- Replace one long inspector scroll with tabs: Dossier, Draft, Activity, Compliance, Notes.
- Draft tab shows generated draft versions plus context panel.
- Personalization checklist includes company, role, trigger, CTA, pain, solution, and source proof.
- Draft language is English-only.
- Add the outreach draft doctrine as a first-class generator/evaluation contract.
- Drafts must be concise, compassionate, evidence-grounded, and ready for Fanny to rework before manual send.
- Block or downgrade draft readiness when the source evidence is too thin, unrelated, unverifiable, or likely to produce generic spam.
- Each draft must include a client profile summary for Fanny: who they are, what was noticed, why it might matter, what c2moviez can truthfully open with, and what not to mention.

### Phase 5B: Outreach Draft Quality Engine

- Replace broad diagnosis-heavy draft language with a fact-first "noticed something" opening.
- Build draft inputs from website signals, LinkedIn/company evidence, source metadata, industry fit, contact role, and public email basis.
- Separate evidence from inference in the generator so claims cannot outrun the Dossier.
- Generate short variants for LinkedIn intro, LinkedIn follow-up, email cold, and email follow-up.
- Add evaluator flags for unrelated claims, over-selling, generic language, unsupported pain diagnosis, fake familiarity, exaggerated certainty, and AI-spam tone.
- If evaluator fails, set human state to needs research or draft review instead of ready to send.

### Phase 6: Copy, Send, Reply, Follow-Up Loop

- Copying a draft opens a confirmation modal.
- Confirmation asks for channel and follow-up date.
- After mark sent, show success and ask next step.
- Reply modal captures reply type and next action.
- Opt-out reply triggers suppression and disqualification.
- Follow-up dates are user-chosen each time.

### Phase 7: Premium Visual Finish

- Use light c2moviez design, not NUDIMMUD HUD.
- Blend Linear's queue discipline, Superhuman's focus flow, and custom internal ops density.
- Target desktop and tablet.
- Avoid generic SaaS cards, decorative gradients, kanban boards, and automation-looking send controls.

### Phase 8: v1.1 Speed Layer

- Add keyboard shortcuts after core v1.
- Add command palette after shortcuts.
- Keep these out of the v1 critical path unless the core loop finishes early.

## Cut Policy

If scope grows, cut in this order:

1. Command palette
2. Undo layer
3. Advanced analytics
4. Tablet-specific polish
5. Deep draft-version controls

Do not cut:

- Today mission flow
- Premium visual system
- Clean source pipeline
- Compliance send gates
- Fast manual outreach loop
