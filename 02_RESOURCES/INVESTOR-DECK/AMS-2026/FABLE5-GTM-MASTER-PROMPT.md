# Fable 5 Master Prompt — AMS-2026 Go-to-Market Deepening Pass

> Copy-paste handoff artifact. Pair with `FABLE5-GTM-BUILD-BRIEF.md` in this same folder. Generated 2026-07-06.

---

# FABLE 5 — EXTEND: NEXUS LINK · YURI Businessplan, Go-to-Market Chapter

## Mission

The AMS Wien 2026 businessplan (`04-PRAESENTATION-DE.html`) already has a real, shipped Go-to-Market chapter (new Ch.8, pages 14–37, subsections 8.1–8.10) — built by a 16-agent fan-out (5 dissection lanes → 7 GTM-synthesis lanes → 4 HTML-formatting lanes), grounded line-by-line in the rest of the document, cross-coordinated live, and rendered/validated. Your job is NOT to build the GTM chapter from scratch — it exists. Your job is the **deeper adversarial pass**: stress-test what's there, resolve what it deliberately left open, and reconcile the pre-existing chapters (1–3, 9–12) it correctly chose not to silently rewrite.

## Read first (context)

- **Build brief (the full picture, corrections made, open items):** `FABLE5-GTM-BUILD-BRIEF.md`, same folder.
- **The live artifact:** `04-PRAESENTATION-DE.html` — read Ch.8 in full (pages 14–37) before touching anything.
- **YURI contract:** `_SYSTEM/yuri-origin.md`, `CLAUDE.md` (this repo is a worktree of YURI-OS-MUSUBI; `main` is held by the other worktree, you are on `ai-business`, content-identical to `main`'s tip plus this GTM work).

## What's already locked (do not re-litigate without new evidence)

- **Beachhead ICP: Venture Builder & Berater** (Faisal Hourani match). Secondary rings: Solo-Gründer & Familienunternehmen (René Spatz proof), Daytrader & Wissensarbeiter (Janine Wälti proof). A 12th exploratory segment ("Solo-Experten & Personal-Brand-Professionals," Atilla Ünal) is observation-only, not resourced.
- **Canonical phase frame:** quarterly (Q3'26 Fundament / Q4'26–Q1'27 Modellbau / Q1–Q2'27 Skalierung / H2'27 Wachstum), 6–12 month pilot-scaling window (not the source's stricter "6 Monate" alone).
- **Pricing:** Professional EUR 49–99/mo, Business EUR 299–799/mo (≤25 seats), Unternehmen EUR 15K–50K/yr, Open Source free, Beratung/Pilot EUR 2.5K–10K flat entry fee. Pilot→paid conversion modeled at 25–35% (Ziel) split 80:20 Business:Unternehmen.
- **Competitive taxonomy:** 3 buckets from Ch.6.3 — observability/governance (Galileo, Tumeryk, **"Microsoft AGT" UNVERIFIED**), agent memory (Mem0, Letta), agent orchestration (LangChain, CrewAI). "Disclosed math, no black box" is the primary defensible moat.
- **Positioning:** "Erweiterung der Modellanbieter, nicht deren Konkurrenz" is the ONE tagline — do not introduce a second, competing positioning line.
- **Hard guardrail:** two unrelated things share the name "Nexus Link" (this document's NEXUS LINK GmbH / YURI vehicle, vs. an unrelated Atilla-Ünal DACH-SMB-CRM venture whose competitive set is weclapp/click.tools/GoHighLevel/sevDesk). Never substitute one competitive set for the other. Full guardrail block: new §8.9, standalone page.

## Your actual work (the open items — see build-brief §3 for full detail)

1. **Get founder confirmation on "Microsoft AGT"** (§3.1) — either it's Microsoft's real `agent-governance-toolkit` OSS project (plausible match, unconfirmed) or it needs replacing/striking before any external use.
2. **Reconcile Ch.9's milestone table and Ch.11's phase-plan table** to the canonical quarterly frame now established in Ch.8.1 (currently only Ch.8.1 documents/resolves the 3-way phase conflict; Ch.9/Ch.11 still show their original, now-superseded numbers).
3. **Reconcile Ch.7.1's own "6 Monate" text/bar-chart** to the 6–12-month window adopted everywhere else in the new GTM material.
4. **Resolve the organ-count contradiction** (Ch.1 "vier Organe" vs Ch.2/3 "neun + fünf = 14") and the **energy-gate term-count contradiction** ("zwölf gewichtete Terme" vs 8 shown) doc-wide — these predate the GTM work and were deliberately not touched.
5. **Resolve or accept the "Neuron-Loop 9 Phasen vs. 4 named" and dual-meaning "Sentinel" ambiguities** in their home chapters (4.4/5.3/3.9).
6. **Founder decision on anime/pop-culture-derived internal codenames** in the architecture chapters — keep, translate, or excise; the new GTM chapter already avoids them entirely on principle.
7. **Verify or replace the two web-researched cost-optimization-pillar competitor candidates** (Portkey/LiteLLM/OpenRouter; Vantage/Finout/Amnic) — found this session, unconfirmed, tagged as such in §8.9.3.
8. **Once Gate B produces real data** (first whitelist cohort onboarded): replace every `(Annahme, nicht aus Bestandsdaten)`-tagged number in new §8.10 with actuals.

## Hard rules (YURI binding floor — same as always)

- **Worktree awareness:** this repo (`YURI-BUSINESS`) and YURI-OS-MUSUBI share one git object store as separate worktrees on different branches. You cannot `git checkout main` here — it's held by the other worktree. Merge/rebase `ai-business` onto `main`'s tip if you need to catch up; never force.
- **Mutation contract:** explicit pathspec only, never `git add .`/bare commit. The pre-commit `root-architecture.test` hook is not worktree-aware and will false-positive-fail here — `--no-verify` is the established, documented bypass (see commits `192fcc02`, `e0f32744`) **only after** running `node _SYSTEM/Scripts/secret-leak-scan.mjs` manually and confirming zero findings.
- **Ehrlichkeit-über-Hype is load-bearing across all 41 pages now** — every new claim needs a `(Ziel)` / `(Annahme, nicht aus Bestandsdaten)` / equivalent hedge, exactly like the rest of the document. Do not upgrade a hedged claim to a bare fact without new evidence.
- **Re-validate on every edit:** page numbers 1..N sequential no gaps/dupes, `<section>`/`<div>`/`<table>` tag balance, chapter running-header labels, visual screenshot spot-check.
- **Never conflate the two Nexus-Link contexts** (see guardrail, §8.9).

**Start wherever the founder's priority is highest among the 8 open items above. Report changed files + validation results + residual risk per item, same discipline as the rest of this build.**
