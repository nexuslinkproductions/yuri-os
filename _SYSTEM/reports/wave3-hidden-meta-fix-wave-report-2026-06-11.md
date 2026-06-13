# Wave-3 Hidden-Meta Domain — Fix Wave Report (2026-06-11)

Executor: Claude (Fable 5). Decisions: D-H1=A unregister, D-H2=A remove dup, D-H3=B dead-write doc, D-H4=verify-first (tracker).

## Landed (8/8 WPs)
- **WP-H.1 (D-H1-A)** eot-background-start UNREGISTERED from SessionStart (done in the same settings edit that added the skill-loader validate hook) + RETIRED header on the file. The false "🔄 EOT monitoring active" turn-1 claim is gone; real EOT stays in user-prompt-submit + yuri-closeout.
- **WP-H.2 (D-H2-A)** SOUL identity duplication REMOVED from brain-inject (extractPersonaRules + REQUIRED_HEADINGS + IDENTITY block + dead SOUL_FILE const): ~570 tok/boot saved; subagent triple-SOUL down to native + soul-persona-inject. IDENTITY_HASH (frozen-invariants drift anchor) and NEURO_CORE kept — they are not SOUL duplication. **Doc gate adapted:** CLAUDE.md's "brain-inject … never the stable identity" line is now TRUE (the code was the liar, not the doc) — no CLAUDE.md edit needed; header doc in brain-inject updated.
- **WP-H.3** staleness guards (shared stalenessOf/ageDisplay): >48h → ⚠ STALE prefix; >7d → one-line suppressed marker; ages shown as `Nd old`. Applied to loadLearnedRules, loadLaneHealth, loadRoadmapState. **Proven live:** the run probe showed 4 suppressed markers — the 20-24-day-stale sections are now honestly suppressed instead of injected as current state.
- **WP-H.4** ZONE restructure (option A, the stronger one): MEMORY.md + LEARNED_RULES moved from ZONE-A to ZONE-C; ZONE-A is now genuinely static (IDENTITY_HASH + NEURO_CORE + hardware + anima-DNA); false "cacheable prefix" claim replaced with the honest harness-dependent note. Emitted JSON shape verified by live run (hookSpecificOutput intact, block ~9.6k chars, down from ~14k+).
- **WP-H.5 (D-H3-B)** aeonic.sections/loadedAt annotated DEAD WRITE with the revisit-after-G.4 condition.
- **WP-H.6 (D-H4)** startup-offload optimized — **verification PASSED by direct observation**: the harness posted its native available-skills system-reminder twice in this live interactive session, independent of startup-offload. Index dropped to count+pointer (`60 skills available via the Skill tool…`): **~2,900 → ~40 tok/boot**. Live probe confirms the new one-liner.
- **WP-H.7** STATE_FILE orphan const removed; dead-field map comment added at the session-state init (incl. the DS-corrected `errors[]` = ALIVE).
- **WP-H.8** AEONIC_PROTOCOL.md → MUSUBI_PROTOCOL.md comment fix (0 stale refs); headings-array duplication resolved BY the H.2 deletion — soul-persona-inject is now the single copy, with a sync-reminder comment.

## Boot-weight delta (per session)
~570 (SOUL dup) + ~2,860 (skill index) + ~6 (EOT lie) ≈ **−3,400 tok/boot**, plus stale-state suppression shrinking the brain block further when state is old (live probe: 9.6k chars).

## Final acceptance gate (9/9, gate 3 doc-leg adapted)
1. baseline ✓ 2. unregistered + RETIRED ✓ (0 / 1) 3. persona refs 0 code + doc now truthful ✓ 4. staleness refs 21 ✓ 5. honest cache note ✓ 6. DEAD WRITE ✓ 7. orphan const 0 ✓ 8. dead-field comments ✓ 9. D-H1..4 in tracker ✓. All edited hooks node --check green; brain-inject + startup-offload live-run probes captured.

## PARKED
H.A–H.H stand (H.C musubi-ingest shim shrink still open — its comment fix landed here). Audit follow-ups: H.AUDIT-3 RESOLVED (verification above); H.AUDIT-1/2 open.
