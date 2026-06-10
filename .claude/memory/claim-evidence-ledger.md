---
name: claim-evidence-ledger
description: NEXT BUILD (before app): claim-and-evidence ledger that reads agent work as claims, to fire the 6 epistemic energy factors on live work
metadata:
  type: project
  tier: semantic
  scope: all
  trig: ["claim ledger", "evidence ledger", "claim tracking", "epistemic factors", "wire energy factors", "read work as claims", "next build", "before app"]
  refs: ["[[energy-dashboard-and-action-mode]]", "[[subconscious-memory-build]]", "[[project-nexus-link-app-vision]]"]
---

GOAL: build the claim-and-evidence ledger that reads the agent's work as CLAIMS, not just tool events, so the epistemic energy factors fire on live work.
WHY: the energy gate's live hook only instruments tool-event facts (work landed, work failed, boundary crossed). That feeds five of the eleven factors. The other six (claimed-vs-verified drift / KL, claim-status entropy, information gain, evidence staleness, promotion-ladder inversion) measure the state of claims and evidence OVER TIME, which a single tool event cannot supply. They need a dedicated ledger: detect each claim the agent makes, track its verification status, age the evidence, model the promotion ladder. The whole point of the system is not tool events alone; it must read work as claims. Owner stated this explicitly.
SEQUENCE: this is the NEXT major build, BEFORE the Nexus Link app, after the current dashboard rework.
WHERE: feeds yuri-energy computeU state (claimPromotionDistribution, claimed/verified distributions, prior/posterior belief states, evidence ages, promotionLadderInversions). A live extraction layer sitting parallel to the everyday energy hook.
STATE: identified 2026-05-31 while explaining the live-vs-instrumented factor split to the owner. The math already consumes these fields; controlled runs author them by hand; the live sensor is the missing piece.
NEXT: design the ledger (claim detection from agent work, verification tracking, evidence aging, ladder model), wire it to the live path, light up the remaining factors on real work.
SEE: [[energy-dashboard-and-action-mode]], [[subconscious-memory-build]], [[project-nexus-link-app-vision]]
