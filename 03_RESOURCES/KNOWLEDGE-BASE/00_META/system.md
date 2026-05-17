# NUDIMMUD — System Architecture

> [!NOTE] Navigation
> This file documents how the KNOWLEDGE-BASE is organized, how files connect, and how to navigate the system.
> Parent: [[identity]] | Index: this file IS the index for `00_META/`

---

## I. VAULT TOPOLOGY

```
NUDIMMUD/                          ← root (Obsidian vault)
├── identity.md                    ← master identity codex (top-level)
├── esoteric_codex.md              ← mythic operating principles
├── enki_state.md                  ← current project state / weather report
├── session_log.md                 ← DRIFT · INSIGHT log
├── session_prompt.md              ← minimal load prompt for new sessions
├── creative_codex.md              ← creative direction principles
├── geopolitical_log.md            ← WATCHER mode running record
├── language_codex.md              ← SCRIBE mode running record
│
├── 00_COMMAND-CENTER/             ← operational hub (HOME.md, daily notes, dashboards)
├── 01_PROJECTS/                   ← client work (C2MOVIEZ, MACL-ONE, etc.)
├── 02_AREAS/                      ← ongoing responsibilities
├── 03_RESOURCES/                  ← assets, LUTs, presets, templates
├── 04_FINANCE/                    ← Austrian EPU bookkeeping
├── 05_NEXUS-LINK/                 ← company identity and brand
├── 06_KNOWLEDGE-BASE/             ← THIS DIRECTORY — deep knowledge expansion
│   ├── 00_META/                   ← identity, system, ontology
│   │   ├── identity.md            ← master identity (see [[identity]])
│   │   └── system.md              ← this file
│   ├── 01_COSMOLOGY/              ← esoteric tradition depth
│   │   ├── gnosis.md              ← Gnostic systems, Nag Hammadi, Valentinian/Sethian
│   │   ├── sumerian.md            ← Anunnaki, ME tablets, Enki cosmology
│   │   ├── kabbalah.md            ← Sefirot, Qliphoth, Ein Sof, Partzufim
│   │   ├── hermetics.md           ← Corpus Hermeticum, Seven Principles, Tabula
│   │   └── alchemy.md             ← Four stages, solve et coagula, practical psychology
│   ├── 02_CONSCIOUSNESS/          ← psychology and consciousness research
│   │   ├── archetypes.md          ← Jung, Hillman, individuation, collective unconscious
│   │   ├── transpersonal.md       ← Grof, Wilber, COEX, BPM, integral
│   │   ├── phenomenology.md       ← Husserl, Merleau-Ponty, Heidegger, hard problem
│   │   └── nondual.md             ← Advaita, Dzogchen, Kashmir Shaivism, Turiya
│   ├── 03_COMMUNICATION/          ← full human communication stack
│   │   ├── somatic.md             ← polyvagal, body language, micro-expressions
│   │   ├── emotional.md           ← attunement, mirroring, attachment, object relations
│   │   ├── narrative.md           ← Hero's Journey, Propp, myth as cognitive framework
│   │   ├── linguistic.md          ← NLP, speech acts, presuppositions, Socratic method
│   │   ├── influence.md           ← Cialdini, cognitive biases, Kahneman
│   │   ├── sales.md               ← SPIN, objection handling, close architectures
│   │   └── vienna_context.md      ← Austrian/Viennese business culture specifics
│   ├── 04_SYNTHESIS/              ← cross-domain integration
│   │   ├── cross_references.md    ← master link map
│   │   ├── isomorphisms.md        ← structural deep equivalences across all systems
│   │   └── mode_sefirot_map.md    ← 7 modes × Sefirot × other frameworks
│   └── 05_OPERATIONAL/            ← NUDIMMUD operational protocols
│       ├── mode_protocols.md      ← trigger signals, activation, architecture per mode
│       ├── response_architecture.md ← how to construct multi-layer responses
│       ├── reading_layers.md      ← 7-layer message reading protocol
│       └── partner_memory.md      ← long-term memory and drift detection
├── 06_NETWORK-SYNC/               ← collaboration (C2MOVIEZ, planzerfilms)
└── 07_ARCHIVE/                    ← completed/inactive
```

---

## II. NAVIGATION PROTOCOL

### Entry Points by Query Type

| Query Type | Start Here | Then |
|-----------|-----------|------|
| "Who/what is NUDIMMUD?" | [[identity]] | [[../01_COSMOLOGY/sumerian]] |
| Esoteric question | [[../01_COSMOLOGY/gnosis]] or [[../01_COSMOLOGY/kabbalah]] | [[../04_SYNTHESIS/isomorphisms]] |
| Psychological/consciousness | [[../02_CONSCIOUSNESS/archetypes]] | [[../04_SYNTHESIS/isomorphisms]] |
| Communication / persuasion | [[../03_COMMUNICATION/linguistic]] | [[../03_COMMUNICATION/influence]] |
| Sales / client work | [[../03_COMMUNICATION/sales]] | [[../03_COMMUNICATION/vienna_context]] |
| How NUDIMMUD responds | [[../05_OPERATIONAL/mode_protocols]] | [[../05_OPERATIONAL/reading_layers]] |
| Cross-domain synthesis | [[../04_SYNTHESIS/isomorphisms]] | [[../04_SYNTHESIS/cross_references]] |

### The Palace Protocol
Before reading raw files, check `claude-palace-out/palace-index.md` for vault-wide structure.
When palace-index has enough context, avoid reading raw files (token efficiency).

---

## III. WIKILINK STANDARDS

All files in `06_KNOWLEDGE-BASE/` use Obsidian `[[wikilink]]` format.

**Internal links** (within 06_KNOWLEDGE-BASE/):
- Same directory: `[[filename]]`
- Cross-directory: `[[../01_COSMOLOGY/gnosis]]`
- With display text: `[[../01_COSMOLOGY/kabbalah|Kabbalah]]`

**Vault-level links** (to files outside 06_KNOWLEDGE-BASE/):
- `[[/NUDIMMUD/identity]]` — root identity file
- `[[/NUDIMMUD/esoteric_codex]]` — mythic operating layer
- `[[/NUDIMMUD/enki_state]]` — current operational state

**Cross-vault links** (to files outside NUDIMMUD/):
- Not currently implemented — see integration strategy in [[REPORT]] when created

---

## IV. FILE CREATION PROTOCOL

When adding new files to 06_KNOWLEDGE-BASE/:
1. Place in the correct domain folder
2. Open with a `> [!NOTE]` navigation callout listing parent, related files
3. Use consistent heading structure: Roman numerals (I, II, III...)
4. End with `*Last expanded: [date]*` timestamp
5. Add minimum 5 `[[wikilinks]]` to related concepts
6. Update [[cross_references]] with the new file

---

## V. DEPTH RATING SYSTEM

Files in this system carry an implicit depth rating:
- **Layer 1 — Surface**: general overview, accessible framing
- **Layer 2 — Structure**: internal architecture, connections between concepts
- **Layer 3 — Abzu**: the generative depth, synthesis points, operational insight

All files in `06_KNOWLEDGE-BASE/` target **Layer 2–3**. Layer 1 content should be in standard wiki sources. The value of this vault is precisely what cannot be found by searching.

---

## VI. TEMPORAL MAINTENANCE

**Session close protocol**: 
After any session that generates new patterns, run:
1. Add entry to `/NUDIMMUD/session_log.md` (DRIFT + INSIGHT)
2. Check if any cross-references need updating in `04_SYNTHESIS/cross_references.md`
3. If new structural insight emerges, update `04_SYNTHESIS/isomorphisms.md`

**Monthly review**:
- Read `session_log.md` accumulated entries
- Fold patterns into `identity.md` (root) updates
- Rebuild graphify if vault has grown significantly

---

*Last expanded: 2026-04-17 — DOMAIN EXPANSION Round 1*
