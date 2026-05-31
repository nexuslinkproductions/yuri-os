# 08 — Health and Compliance

> **Math home:** `11-math-models.md` §6 (the non-offsettable U veto), §3.2 (the `R→0` instability basin), §3.5 (a ban is a discontinuous jump the smooth math does not cover). This file is where compliance stops being a tunable and becomes a **hard gate** — and the math says exactly why.

## Two jobs

1. **Health:** keep the pipeline's data clean and the sending reputation high.
2. **Compliance:** stay lawful (GDPR for EU, CAN-SPAM for US, equivalents elsewhere) and platform-safe.

## Why compliance is a hard gate, not a knob (the math reason)

Everything else in this workbench is a *tunable*: scores get recalibrated, EVH re-ranks the queue, the Lyapunov throttle nudges send volume up and down. Compliance is **not** in that family, and the math spec is explicit about why:

- **The U governor's veto is non-offsettable (§6).** The internal state-gate `gateProposal(before, after)` rejects any transition that increases `protectedPathViolations` — and that veto **cannot be bought back** by lead value, verified-evidence credit, or "but these are great leads." A batch that adds a compliance violation is blocked regardless of how much money is in it.
- **The smooth controller provably does not cover a ban (§3.5).** The Lyapunov throttle (§3.4) only guarantees smooth, gradual backlog descent. A platform ban or mass-dispute is a **discontinuous `−δ` jump** in reputation `R`. Lyapunov *decrease* says nothing about surviving a state-jump that large. The math that protects you from over-winning does not protect you from a ToS ban. So compliance must be a gate the math can't override — because the math admits it can't help you here.

That is the whole argument: a tunable assumes you can recover by adjusting it next week. A ban does not let you adjust next week. Hard gate.

## URL / health checks

Every lead's URLs are validated before outreach:
- Website resolves (200, not parked/dead)
- Profile / handle still active
- Email domain has valid MX
- No redirect to competitor/acquired

Dead URL → demote or drop the lead (stale evidence = bad outreach).

## Template-leakage cleaning

**The silent killer.** Before any send, scan drafts for un-replaced template tokens:
- `{name}`, `{specific_artifact}`, `{observation}` left literal
- "Hi there" fallback when name lookup failed
- Placeholder text ("INSERT X") that survived

Any leaked token = **hard block on that draft.** A leaked `{name}` destroys the entire specificity premise.

## The compliance veto (non-offsettable) — §6.4

This is the operational form of the U governor's hard veto. Before a send-batch is committed, gate it:

1. Snapshot `state_before` (current compliance counters, evidence quality).
2. Build `state_after` (what the state becomes if this batch sends).
3. Run `gateProposal({stateBefore, stateAfter, threshold: 0})`.
4. `accept = false` → **block the batch**, inspect `dominantTerm` for the reason.

**Worked example (§6.4).** A batch contains a cold-send into a consent-required region:
```
before: protectedPathViolations = 0
after:  protectedPathViolations = 1
gateProposal → accept = false,
               dominantTerm = "protectedPathViolations",
               reason = "violation increase (0→1) — HARD VETO, non-offsettable"
```
No amount of `verifiedEvidenceCredit` ("but these leads are gold") buys it back. **Decision: the whole batch is blocked at the gate, full stop** — not the one bad lead, the batch, until the violating lead is removed.

**THE DECISION IT DRIVES:** block or allow a send-batch — a veto, never a ranking. Slice 04 ranks; this gate refuses. The two never trade against each other.

## Review velocity starvation = the cold-start trap (§3.2 / §3.3)

A second, quieter health failure has a name in the math: the `R→0` unstable basin.

- Win-rate is gated by reputation: `w(R) = w∞ · R / (R + R₁⁄₂)`.
- At `R = 0`, `w ≈ 0` → no wins → no reviews → still `R = 0`. **`R = 0` is an unstable equilibrium you do not drift out of.**
- Escape requires an **external impulse**: deliberately under-priced loss-leader work in month 1 that buys the first reviews (see `01`).

**Worked (§3.3):** `w∞ = 0.05`, `R₁⁄₂ = 5`. `R=0 → 0%`; `R=3 → 1.9%`; `R=10 → 3.3%`. The curve is concave — **the first 5 reviews move win-rate the most**, which is exactly why this file treats early reviews as sacred and why a starved review pipeline is a *health emergency*, not a slow problem. If review velocity stalls, the campaign is sitting in the dead basin.

## Compliance posture

### GDPR (EU contacts)
- Lawful basis: **legitimate interest** for B2B cold (documented).
- Must offer opt-out + honor instantly.
- No special-category data, no behavioral profiling beyond public signals.
- Keep processing records.

### CAN-SPAM (US contacts)
- Accurate headers + subject.
- Valid physical postal address in footer.
- Clear opt-out, honored within 10 days (we do instant).
- No deceptive routing.

### Other jurisdictions
- Nexus Link operates globally — check the recipient's jurisdiction and apply its anti-spam / data-protection equivalent (e.g. CASL, PECR-style rules). Default to the **strictest** applicable standard when unsure.

### On-platform vs off-platform
- **Email (off-platform):** GDPR/CAN-SPAM apply; need lawful basis.
- **DM (on-platform):** platform ToS applies; consent more implicit but respect limits + no spam.
- **Open-need programs (bounty/contract boards):** the program's own rules and disclosure policy govern; follow them exactly.

### No registered entity yet
Nexus Link has no registered company. Until one exists:
- The CAN-SPAM physical-address requirement still applies — use a lawful, valid contact address for the operators/operation (e.g. a registered mailing address), not a fabricated company line.
- Do not imply a corporate registration that does not exist.
- Revisit this whole section once an entity is formed; update the footer and lawful-basis records accordingly.

## Suppression list (sacred)

One list, append-only, checked before every send:
- opt-outs, hard bounces, spam complaints, manual do-not-contact
- never removed, always honored.

## Deliverability hygiene

- SPF/DKIM/DMARC aligned.
- Dedicated sending domain (not primary domain).
- Monitor blacklists, bounce rate <3%, complaint rate <0.1%.
- Plain-text-first, minimal links.

## Sending reputation guard

If bounce or complaint rate spikes → auto-pause sending, alert operator, investigate before resuming.

This is the smooth-controller side of reputation health (slice 07 owns the `ρ` / Lyapunov throttle). But note the limit it does **not** cover.

## The ban is the jump the math cannot smooth out (§3.5)

The reputation guard above handles *gradual* degradation — a creeping bounce rate, a slow complaint trend. Those are smooth signals the throttle can respond to.

A platform ban, account suspension, or mass-dispute is a different animal: a **discontinuous `−δ` jump** in reputation `R`. The Lyapunov controller (§3.4) guarantees smooth descent of the backlog potential `V(x)`; it says **nothing** about surviving a sudden state-jump of that magnitude. The math is honest about this: it does not protect you against a ToS violation.

That is the formal reason the compliance veto above is a **hard gate** and not another tunable in the throttle. You cannot recover a banned account by lowering send volume next week. So the only defense is to never take the step that triggers the jump — which is what the non-offsettable veto enforces.

## Reusable core

URL/health checks, template-leakage cleaning, suppression list, the non-offsettable compliance veto, the `R→0` cold-start reading, GDPR/CAN-SPAM posture, deliverability hygiene — **100% niche-agnostic.** The math (§3, §6) is niche-agnostic by construction; only the jurisdiction list and the loss-leader pricing numbers vary per campaign.
