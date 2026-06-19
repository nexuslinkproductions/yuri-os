---
name: feedback-propagate-reconcile-continuously
description: "Continuously propagate + reconcile shared artifacts (registries, indexes) yourself; never leave them stale for the other lane — that deadlocks"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 51f7834d-cf40-4e99-b14a-c821aacd0189
---

RULE (Marcel, 2026-06-19): "we have to continuously update whatever we are doing all the time" + "reconcile the capabilities index otherwise the other lane will also wait for this lane to do so."

WHEN: any work that touches a SHARED, GENERATED artifact other lanes depend on — `capabilities.json` (capability-scan), the search index (`ai reindex`), the GitNexus graph, skill-hash registry, circuitry/propagation, `MEMORY.md`.

DO: regenerate + COMMIT the reconciled artifact yourself, as part of finishing the work — not "later." After any change, run the relevant reindex/scan and commit so the shared state reflects reality. Then verify the gate actually passes.

DONT: leave a shared registry/index stale-but-uncommitted "for the other lane to reconcile." If both lanes defer, NOBODY reconciles → the pre-commit gate (and capability-recall) stays broken for everyone = DEADLOCK. I did this with `capabilities.json` (left it uncommitted with the parallel lane's `as-baseline` + my missing voice cap) and Marcel caught the deadlock.

KEY DISTINCTION: the "don't sweep a parallel session's uncommitted work" rail is about their SOURCE files — it does NOT apply to a GENERATED catalog. Committing the regenerated index reflects on-disk reality and unblocks all lanes; it does not touch their source. Reconcile the catalog; leave their code.

ALSO FORGED HERE: capability-scan was `.mjs`+`//`-only, so the whole Python/shell voice subsystem was invisible to recall — extended it to scan `.py`/`.sh` + `#` comments. A propagation gap is often a SCANNER gap, not just an uncommitted file. SEE [[proj-autonomous-self-maintenance-2026-06-15]] · [[ref-capability-scan-tag-window]] · [[proj-yuri-voice-glm-zai-2026-06-19]]
