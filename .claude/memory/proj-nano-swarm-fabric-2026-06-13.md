---
name: proj-nano-swarm-fabric-2026-06-13
description: "NANO SWARM = Marcel's autonomous-lane fabric (renamed from NexBots): dozens of self-refreshing, 500k-auto-compact, observable, lease-coordinated, FULLY-AGENTIC lanes (native + external) on the Kagami control domain. Design-doc locked-pending-owner; 43-agent plan done"
metadata:
  node_type: memory
  type: project
  tier: hot
  scope: yuri-architecture
  trig:
    - nano swarm
    - nano
    - autonomous lane
    - swarm
    - lease registry
    - agentic harness
    - compact gate
    - kagami swarm
  refs:
    - feedback-max-reasoning-fleet-override
    - ref-mimo-pipe-artifact
    - filing-autonomy-layer-2026-06-13
  type: project
  originSessionId: edb85ed5-bc21-4594-8321-aebf593bc5a1
---

GOAL: build the NANO SWARM — dozens of autonomous "nano" lanes running side-by-side, each self-refreshing + auto-compacting at 500k (HARD) + observable + lease-coordinated (never clobber) + self-checking + FULLY AGENTIC (native Agent/Workflow AND external mimo/codex/deepseek). Renamed twice by Marcel: NexBots → NANO SWARM.
WHO: Marcel (owner, directing the architecture); this lane (planning + synthesis).
WHEN: design phase 2026-06-13; build is owner-gated (design-doc-first was his explicit call).
WHERE: design doc `_SYSTEM/reports/nano-swarm-fabric-design-2026-06-13.md` (lockable spec). Planning workflow `wf_0634f027-775` (43 max-reasoning agents). Substrate = the Kagami control domain (kagami-overseer/control-domain/event-bus + worker-bridge + local-concurrency + token-ledger).
STATE: 43-agent fleet produced 8 architectures + 24 adversarial attacks (15 CRIT) + mimo peer-design + reachability probe. TWO PROVEN TRUTHS drive everything: (T1) the 500k gate CANNOT use transcript/billing token counts (stale mid-loop) → use a PreToolUse hook reading live `context_window.used_percentage`, cloned from energy-enforce.mjs deny path, fail-closed. (T2) external lanes are STRUCTURALLY BLIND to all YURI guards (PreToolUse hooks on the NATIVE path only) → external model = PLANNER ONLY, a NATIVE harness EXECUTES through the same PEP + sanitize tool results + realpath/closed-set (never lexical). Winner = KAGAMI-SWARM spine (smallest delta, cron-self-renewal, no daemon) + per-PATH mkdir-EXCL lease + worktree-per-nano (95% isolation) + planner/executor harness + event-bus-as-spine observability + cost governor + reaper. 4 gaps: G1 nano-lease.mjs, G2 nano-compact-gate.js, G3 nano-refresh.mjs, G4 agentic harness. Universal scale risk = unbounded events.jsonl/lease-ledger replay → rotation+snapshot before ~6 nanos. REACHABLE TODAY: native (agentic now) + mimo (single-shot, needs G4); codex+deepseek BOTH egress-BLOCKED here (AggregateError).
DECISIONS LOCKED (2026-06-13): native cron self-renewal · lease-root = kagami-control guarded API (nod granted; add LEASE_* event kinds) · cost = TRACKING ONLY no-capping (TOLLGATE budget-veto dropped) · BUILD APPROVED · output = fragment+assemble (each nano owns its own fragment file, assembler stitches; NOT concurrent region-writes). T2 CORRECTED: external lanes via llm-lane.mjs ALREADY see YURI structure + are guarded by the SAME safety core (evaluateToolCall) + agentic (24-iter loop) + energy-traced (coreOnDispatch) — Marcel was right, fleet over-stated; G4 shrank to "route external nanos through llm-lane (not raw mimo) + harden its lexical extra-rules + fix egress". The only external blocker here is egress.
BUILD PROGRESS (47 tests green, all mutation-verified + capability-registered): Phase 0 DONE — readKagamiEventsSince (cursor reader, 8/0, on kagami-event-bus.mjs), nano-refresh.mjs (self-refresh→<nano-brain>, 9/0), nano-tick.mjs (loop driver, cursor recovers from own last HANDOFF, 7/0); 2-nano e2e proven (peer-visibility on one bus). Phase 1 DONE — nano-compact-gate.mjs + .claude/hooks/nano-compact-gate.js (14/0) the 500k ceiling, SHIPPED DISARMED + UNWIRED (0 settings.json refs), scoped to YURI_NANO_ID, fail-open, dual-arm; arm only after metrics-only burn-in confirms a live PreToolUse token signal (existing PreToolUse hooks read only tool_name/session_id — token field NOT yet confirmed in that payload). G1 DONE — nano-lease.mjs (9/0) per-PATH mkdir-EXCL atomic lease + owner-verified release/renew + dead(pid)/stale(renewedAt) reclaim (race-safe rename-then-delete); lock dir = _SYSTEM/state/nano/leases (verified writable); reuses _lib/fs atomicWriteFile.
NEXT (Phase 2 — prove no-collision + wire it together): integrate lease-claim + compact-precheck INTO nano-tick (claim before work, skip-if-held); emit LEASE_CLAIMED/RELEASED/EXPIRED to the kagami bus (add the 4 event kinds to kagami-control-domain.mjs per decision #2) so leases show on the swarm-board; run 2-3 nanos proving exactly-one-claims. THEN: the supervisor (kagami-overseer driver + reaper), event-log ROTATION (scale risk before ~6 nanos), G4 (llm-lane external routing). Output: fragment+assemble assembler when shared-doc work arises.
SEE: [[feedback-max-reasoning-fleet-override]] · [[ref-mimo-pipe-artifact]] · [[filing-autonomy-layer-2026-06-13]]
