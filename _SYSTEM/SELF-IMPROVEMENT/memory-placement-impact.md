# Memory Brain-Stem Placement Impact (v12 -> v13 -> v15)

## Before v13

MEMORY at y=-1400 (stage 15 of 17). Terminal node -- written to by ROUTING output, read only via explicit MEM_READ tool calls. Operational sections operated context-blind unless they explicitly invoked memory.

Pulse-cortex turns showed: average context-fetches per advisor 2.3, duplicate fetches per turn 1.7 (advisors re-reading same context).

## After v13 (relocated)

MEMORY at y=620 (stage 4 of 17, right after ENKI). 16 memory-read edges to all major operational sections + 6 advisors.

Operational analogy:
- MEMORY = brain stem (involuntary, always-on)
- pulse-bus = short-term memory (5min TTL ring)
- pulse-archive = long-term consolidation (daily WARN+ findings)
- karpathy wiki = semantic memory (atomic facts)

## v15 enhancement

Lane-as-user-input protocol (tier-gated, complex/critical only) now injects MEMORY context BEFORE every high-stakes lane dispatch. Lanes no longer operate context-blind on important work.

## Measurable improvements (estimated, pre-soak)

- Re-context fetches: -30% (advisors share enriched prompt)
- Time-to-first-action: -15% (less back-and-forth)
- Token cost per critical turn: -22% (no duplicate context loads)
- Pulse-archive consolidation rate: +40% (lanes now log to bus)

## Soak validation plan

Measure across 50 critical turns post-v15. Targets:
- Memory hit rate per lane dispatch: >=80% (read from cache)
- Context-fetch duplicates per turn: <=0.5
- Lane output quality (subjective): >=85% useful first response

## Conclusion

Memory placement was a structural error pre-v13. Relocation made MEMORY the brain stem -- foundational, always-read, never terminal. Combined with WP2 lane-wrapping, every high-stakes Yuri OS operation now runs with full personality, context, and prior learning loaded.
