# FABLE 5 BUILD BRIEF — AMS-2026 Go-to-Market Extension (NEXUS LINK · YURI Businessplan)

**Date:** 2026-07-06 · **Synthesized by:** Yuri (Sonnet lane, orchestrator) · **For:** Fable 5 @ max reasoning
**Prep fleet:** 5 opus-fleet dissection lanes (Sonnet, read-only) + 7 GTM synthesis lanes (Sonnet, task) + 4 HTML formatting lanes (Sonnet, task) — 16 subagents total across 3 sequential waves
**Status:** prep COMPLETE, first-pass GTM chapter SHIPPED into the live deck. This brief + the master prompt + the live document are your ground truth. Read this FIRST, then the master prompt, then the live deck's new Chapter 8 on demand.

---

## 0. What actually happened (so you don't re-derive it)

The presentation `04-PRAESENTATION-DE.html` (German business plan, "NEXUS LINK · YURI · Businessplan · AMS Wien 2026", pitching YURI as a fundable Austrian GmbH to AMS Wien/FFG/aws) had a single thin Chapter 8 ("8. Marketing · Pilotprogramm") — a 4-phase timeline, a target box, 5 whitelist bios, and a priceless revenue-tier table. Nothing else. The document was never committed to any repo; it only existed in `~/Downloads`.

Three things were done, in order:
1. **Relocated** the file into `YURI-BUSINESS/02_RESOURCES/INVESTOR-DECK/AMS-2026/` (this folder), on the `ai-business` branch (fast-forward-merged onto `main`'s tip first — YURI-BUSINESS is a git **worktree** of the same repo as YURI-OS-MUSUBI, which already holds `main`; you cannot check out `main` twice, `ai-business` is now content-identical to `main` plus this work).
2. **Dissected** the entire document (5 lanes, one per chapter cluster) into a structured, line-sourced ground-truth digest — every number tagged `[STATED-AS-FACT]` / `[STATED-AS-PARTIAL]` / `[STATED-AS-GOAL/ZIEL]`, every internal contradiction flagged.
3. **Synthesized and shipped a real Go-to-Market chapter** (7 lanes → 24 new print pages, replacing the old single-page Ch.8, now spanning pages 14–37 as "8. Go-to-Market-Strategie", subsections 8.1 (extended) through 8.10) — grounded entirely in the dissection, cross-coordinated live via IRC between lanes, formatted to match the deck's exact CSS/design system, and validated (tag-balance, page-sequence 1–41, visual screenshot QA).

**This brief's job:** hand you (a) everything the dissection found that the GTM chapter did NOT fix (out of scope for a GTM-only pass), (b) everything the GTM chapter itself flagged as needing founder/human resolution, and (c) a control packet for whatever deeper adversarial/build pass you run next.

---

## 1. Read order (yours)

1. **This brief** — the corrected picture, the control packet, the open-item list.
2. **`FABLE5-GTM-MASTER-PROMPT.md`** (same folder) — the copy-paste handoff artifact.
3. **The live document**: `04-PRAESENTATION-DE.html`, Chapter 8 (pages 14–37) is the new material; Chapters 1–7 and 9–12 are pre-existing and mostly untouched (one single-character-level fix, see §3.6).
4. **Lane transcripts on demand** (if you need the full reasoning behind a specific number): `history://DissectCoverVisionModel`, `history://DissectAnatomie`, `history://DissectMureLearning`, `history://DissectTrustMarket`, `history://DissectGtmSeedsTractionFinancials` (dissection wave); `history://GtmIcpSegmentation`, `history://GtmPositioningMessaging`, `history://GtmChannelDistribution`, `history://GtmPricingPackaging`, `history://GtmLaunchSequencing`, `history://GtmCompetitive`, `history://GtmMetricsKpis` (synthesis wave).

---

## 2. Load-bearing corrections already made (in the live document — don't redo these)

- **Phase-numbering reconciled.** The source document had THREE mutually contradictory phase schemes (Ch.8 put the language-model build last/Phase-3; Ch.9 and Ch.11 put it first/Phase-1). The new Ch.8.1 adopts Ch.9's quarterly frame (Q3'26 / Q4'26–Q1'27 / Q1–Q2'27 / H2'27) as canonical and says so explicitly in the text. **Ch.9's milestone table and Ch.11's phase-plan table were NOT edited to match** — they still read as they did before. If you do a deeper pass, either update those two tables to the same canonical frame, or leave the new Ch.8.1 as the single place that documents and resolves the conflict (current state; explicit, not silent).
- **6-month vs 6–12-month window reconciled.** Ch.7.1 and old Ch.8 both hard-coded a strict "sechs Monate" pilot-scaling target; Ch.11's financial-plan assumption already softened this to "sechs bis zwölf Monate." The new GTM content adopts 6–12 months throughout and says explicitly which chapters' numbers it's overriding. **Ch.7.1's own text and bar chart still say "6 Monate"** — not edited, out of scope for this pass.
- **Pricing tables merged.** Ch.2.5 ("Erlösströme," has prices) and old Ch.8.5 ("Erlösmodell," no prices) were two never-cross-referenced tables for the same 4 tiers. New Ch.8.5 ("Preise & Erlösmodell") merges them into one 5-row table (adds a "Beratung/Pilot" flat-fee entry-path row) and resolves whether the Ch.7.1 "EUR 15.000–50.000 Jahreswert" figure is blended-average or tier-specific (resolved: Unternehmen-tier-specific, medium-high confidence, editorial call — **flagged as overridable by someone with founder-side knowledge of how that figure was originally derived**).
- **Revenue-math gap closed with an explicit model.** 50–100 pilots × full Unternehmen ACV (EUR 15K–50K) implies EUR 750K–5M; Ch.11's Year-2 P&L caps at EUR 200K–500K. New Ch.8.5 supplies a pilot-to-paid conversion model (25–35% conversion, 80:20 Business:Unternehmen split, discounted Beratung/Pilot fee for non-converters) that reproduces the stated Year-2 band from both ends. **This is one internally-consistent example, explicitly flagged as such — not the only possible resolution and not derived from any source ratio.**
- **Founder-bottleneck (SWOT: "Schlüsselperson Phase 0") given a concrete, phased mitigation**: self-serve Professional from Phase 1, a second (part-time/contractor) onboarding operator recruited end-Phase-1/active-Phase-2, tier-based lead triage. All explicitly marked "(Ziel/Planung, noch nicht umgesetzt)" — **nothing here is executed, it's a proposed plan**.
- **A genuinely pre-existing HTML bug was found and fixed**: the original document (before any of this work, i.e. as originally authored) was missing a single `</section>` closing tag at the end of Chapter 2's second page ("Geschäftsmodell"), which meant every subsequent page in the ORIGINAL 18-page document was technically nested one level deeper than it should have been (browsers render this fine visually; it would matter to any strict parser or print-pagination edge case). Fixed as a one-line, surgical, no-content-change edit. Not something this GTM work introduced — it predates this session.

## 3. Open items — NOT resolved, need Fable-5 / founder / human judgment

3.1 **"Microsoft AGT" (Ch.6.3) is still unverified.** The competitive section (new 8.9.2) surfaces a plausible match (Microsoft's real open-source "Agent Governance Toolkit," `github.com/microsoft/agent-governance-toolkit`) found via live web research during this session, but explicitly flags it as **NOT a confirmation of authorial intent**. **Founder must confirm, replace with a generic descriptor, or strike the line before any external use of that competitive table** — this is a live reputational risk if wrong in front of investors/grant reviewers.

3.2 **TAM "KI-Infrastruktur" pillar contradicts YURI's own positioning.** Ch.7.1 claims three TAM pillars (infra/governance/cost-optimization); YURI's own stated positioning is "kein Wettbewerb um Inferenz." New §8.9.3 recommends narrowing the externally-communicated TAM claim to governance+agent-tooling only, or reframing "infrastructure" as an ecosystem YURI integrates into rather than competes in. **Not edited in Ch.7.1 itself — recommendation only, sitting in the new GTM chapter.**

3.3 **Two invented-but-unverified competitor-name candidates for the cost-optimization TAM pillar** (Portkey/LiteLLM/OpenRouter for LLM-gateway; Vantage/Finout/Amnic for AI-FinOps) — found via web research, real companies as of this session, explicitly tagged `[NEUE ANNAHME – VERIFIZIERUNG ERFORDERLICH]`. **Do not treat as confirmed competitive intelligence without independent verification** — this market segment moves fast (evidence found of a competitor open-sourcing mid-2026).

3.4 **Organ-count contradiction NOT resolved** (exec summary says "vier Organe" = 4; architecture chapters say "neun Hauptorgane + fünf Selbstwahrnehmungs-Organe" = 14). All new GTM content deliberately avoids citing either number. **This is a pre-existing Ch.1–3 contradiction, untouched by this pass** — needs a Ch.1–3 owner to reconcile.

3.5 **Energy-gate term count NOT resolved** ("zwölf gewichtete Terme" claimed, only 8 distinct terms shown in the Ch.3.3 table). Same treatment — avoided, not fixed.

3.6 **"Neuron-Loop (9 Phasen)" NOT resolved** (Ch.5.3 claims 9 phases, names only 4). **"Sentinel" role NOT disambiguated in its own chapter** (used for two different functions in Ch.4.4 vs Ch.5.3/3.9 — the new GTM chapter's MURE table picked the Ch.4.4 role-archetype sense and footnoted the ambiguity, but the SOURCE chapters themselves still carry the ambiguity).

3.7 **Anime/pop-culture-derived internal codenames** (e.g. mechanism names referencing Haki, Izanagi, Nen — present in the architecture chapters, Ch.1–5) are a real tonal risk for an Austrian public-funding committee. **All new GTM copy deliberately avoids these terms entirely** (translated to plain capability language) — but they still exist verbatim in the pre-existing chapters. Founder decision needed: keep, translate, or excise doc-wide.

3.8 **The single biggest structural GTM risk — founder-network bias — is diagnosed and partially mitigated, not solved.** 4 of 5 whitelist contacts are founder-network-sourced; only one (Ryan Marshall, whose professional profile is never stated anywhere in the source) is organic. The new Ch.8.8 proposes exactly one channel (EU-AI-Act content + niche partnerships, §8.8.5) that is structurally founder-independent once set up — everything else professionalizes the existing network bias rather than replacing it. **This is a real, not fully solved, business risk** — flagged, not papered over, per instruction; a genuinely different acquisition motion (paid, channel-partner, etc.) was explicitly deferred as unaffordable at the current ~EUR 30–70K total GTM budget, not because it wouldn't help.

3.9 **All new pricing/conversion/CAC/KPI numbers are net-new modeling assumptions**, explicitly tagged `(Ziel)` / `(Annahme, nicht aus Bestandsdaten)` throughout — none are derived from real usage data (the company has exactly one active pilot). **Replace with real numbers after Gate B** (first whitelist cohort onboarded) — the metrics section (new 8.10) says this explicitly and ties it back to the document's own Prediction-Ledger/Brier-score calibration philosophy.

---

## 4. Control packet (for whatever pass you run next)

- **Goal options, not mutually exclusive:** (a) adversarially stress-test the new GTM chapter's specific numbers/claims against the §3 open items; (b) reconcile Ch.9/Ch.11's stale phase/window numbers to match the new Ch.8.1 canonical frame; (c) resolve the organ-count / energy-term-count / Neuron-Loop-phase-count contradictions doc-wide; (d) get founder sign-off on the Microsoft AGT identification and the anime-codename tonal question; (e) extend the GTM chapter further (e.g. a second beachhead once budget allows, real acquisition-channel testing once Gate B data exists).
- **Constraints:** German-language document, DACH number formatting (comma decimal, period thousands), the document's own Ehrlichkeit-über-Hype convention (every projection explicitly hedged, never presented as settled fact) — this discipline is load-bearing across all 41 pages now, don't break it introducing new content. Never conflate the two "Nexus Link" contexts (YURI/NEXUS LINK GmbH vs. the unrelated Atilla-Ünal DACH-SMB-CRM venture) — a dedicated, explicit guardrail block exists in the new §8.9 for exactly this reason; read it before touching anything competitor-related.
- **File locations:** deck at `YURI-BUSINESS/02_RESOURCES/INVESTOR-DECK/AMS-2026/04-PRAESENTATION-DE.html` (branch `ai-business`). Companion source chapters (`00-DOKUMENT-ARCHITEKTUR-DE.md`, `01-INTEGRITAET-YURI-DE.md`, `TOKEN-OEKONOMIE-DE.md`, `DELIBERATOR-MECHANISMUS-KARTE-DE.md`) remain in **YURI-OS-MUSUBI** (`main` branch), same repo as a worktree, `02_RESOURCES/INVESTOR-DECK/AMS-2026/` — cross-worktree, not cross-repo.
- **Acceptance for any further edit:** re-run the same validation this pass used — page numbers sequential with no gaps/dupes, `<section>`/`<div>`/`<table>` tag balance, chapter running-header labels correct, visual screenshot spot-check of anything touched. Do not silently renumber pages without recomputing the FULL sequence (cover=none, then 1..N sequential across every chapter).
- **Rollback boundary:** everything is committed to git (branch `ai-business`) in small, explicit-pathspec commits. `git log -- 02_RESOURCES/INVESTOR-DECK/AMS-2026/04-PRAESENTATION-DE.html` shows the history; revert per-commit if a pass needs undoing.

---

**Belege (Architekt-Rolle dieser Brief):** alle Zahlen/Zitate oben sind aus den 12 Subagent-Transkripten dieser Session extrahiert (siehe `history://` Pfade §1.4), nicht neu erfunden. Web-Recherche-Ergebnisse (§3.1, §3.3) sind explizit als sitzungsbasiert und ungeprüft markiert.

RESULT_LABEL: AMS_GTM_FABLE5_PREP_X_PASS_COMMITTED
