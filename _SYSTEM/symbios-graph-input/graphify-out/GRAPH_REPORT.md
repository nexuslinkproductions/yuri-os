# Graph Report - /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input  (2026-05-15)

## Corpus Check
- Corpus is ~2,986 words - fits in a single context window. You may not need a graph.

## Summary
- 24 nodes · 32 edges · 5 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Safe Name Alternatives|Safe Name Alternatives]]
- [[_COMMUNITY_EU Legal Framework|EU Legal Framework]]
- [[_COMMUNITY_EU Legal Framework|EU Legal Framework]]
- [[_COMMUNITY_EU Legal Framework|EU Legal Framework]]
- [[_COMMUNITY_Safe Name Alternatives|Safe Name Alternatives]]

## God Nodes (most connected - your core abstractions)
1. `SymbiOS (Target)` - 18 edges
2. `SYMBIO — IPMED S.à.r.l.` - 5 edges
3. `SYMBIO — Symbio Finland Oy` - 5 edges
4. `Nizza Class 42 — IT/Software/AI` - 5 edges
5. `SymBio — WTE Wassertechnik` - 3 edges
6. `SYMBIOSCIENCE — Mars Inc.` - 3 edges
7. `Sabel v Puma (CJEU C-251/95)` - 3 edges
8. `EUIPO — EU Trademark Registry` - 3 edges
9. `SYMBIOS Workspaces GmbH` - 2 edges
10. `Nizza Class 35 — Business Consulting` - 2 edges

## Surprising Connections (you probably didn't know these)
- `SymbiOS (Target)` --conflicts_with--> `SYMBIO — IPMED S.à.r.l.`  [EXTRACTED]
  /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md → /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md  _Bridges community 0 → community 1_
- `SymbiOS (Target)` --name_conflict_with--> `SYMBIOS Workspaces GmbH`  [EXTRACTED]
  /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md → /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md  _Bridges community 0 → community 2_
- `SymbiOS (Target)` --secondary_conflict_with--> `SYMBIOSCIENCE — Mars Inc.`  [EXTRACTED]
  /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md → /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md  _Bridges community 0 → community 3_
- `SymbiOS (Target)` --safer_alternative--> `CogniFlow OS (Alternative)`  [EXTRACTED]
  /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md → /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md  _Bridges community 0 → community 4_
- `SYMBIOSCIENCE — Mars Inc.` --registered_in--> `Nizza Class 42 — IT/Software/AI`  [EXTRACTED]
  /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md → /Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/symbios-graph-input/symbios-trademark-research.md  _Bridges community 3 → community 1_

## Hyperedges (group relationships)
- **Class 42 Conflict Cluster** — ipmed_symbio, finland_symbio, wte_symbio [EXTRACTED 0.95]
- **Safe Alternative Names** — alt_cogniflos, alt_synaptiq, alt_nexelos, alt_velosync, alt_clerqai [EXTRACTED 0.90]
- **EU Trademark Legal Framework** — sabel_v_puma, canon_doctrine, eutmr_art19, nizza_class_42, nizza_class_35 [EXTRACTED 0.95]

## Communities

### Community 0 - "Safe Name Alternatives"
Cohesion: 0.2
Nodes (10): Clerq AI (Alternative), NexelOS (Alternative), Velosync (Alternative), Symbioworld (Celonis), EUIPO Filing Cost €900 (Cl.35+42), Mike — Austrian Startup Founder, Österreichisches Patentamt, SYMBIOTIC DIGITAL FLORA — Sony (+2 more)

### Community 1 - "EU Legal Framework"
Cohesion: 0.48
Nodes (7): Canon Doctrine — Goods/Services Similarity, EUIPO — EU Trademark Registry, SYMBIO — Symbio Finland Oy, SYMBIO — IPMED S.à.r.l., Nizza Class 42 — IT/Software/AI, Sabel v Puma (CJEU C-251/95), SymBio — WTE Wassertechnik

### Community 2 - "EU Legal Framework"
Cohesion: 1.0
Nodes (2): EUTMR Art.19 — Marks Survive Insolvency, SYMBIOS Workspaces GmbH

### Community 3 - "EU Legal Framework"
Cohesion: 1.0
Nodes (2): SYMBIOSCIENCE — Mars Inc., Nizza Class 35 — Business Consulting

### Community 4 - "Safe Name Alternatives"
Cohesion: 1.0
Nodes (2): CogniFlow OS (Alternative), SynaptiQ (Alternative)

## Knowledge Gaps
- **11 isolated node(s):** `Symbioworld (Celonis)`, `SYMBIOTIC DIGITAL FLORA — Sony`, `Österreichisches Patentamt`, `WIPO — International TM`, `Canon Doctrine — Goods/Services Similarity` (+6 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `EU Legal Framework`** (2 nodes): `EUTMR Art.19 — Marks Survive Insolvency`, `SYMBIOS Workspaces GmbH`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `EU Legal Framework`** (2 nodes): `SYMBIOSCIENCE — Mars Inc.`, `Nizza Class 35 — Business Consulting`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Safe Name Alternatives`** (2 nodes): `CogniFlow OS (Alternative)`, `SynaptiQ (Alternative)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SymbiOS (Target)` connect `Safe Name Alternatives` to `EU Legal Framework`, `EU Legal Framework`, `EU Legal Framework`, `Safe Name Alternatives`?**
  _High betweenness centrality (0.806) - this node is a cross-community bridge._
- **Why does `SYMBIO — IPMED S.à.r.l.` connect `EU Legal Framework` to `Safe Name Alternatives`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `SYMBIO — Symbio Finland Oy` connect `EU Legal Framework` to `Safe Name Alternatives`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `SYMBIO — IPMED S.à.r.l.` (e.g. with `Sabel v Puma (CJEU C-251/95)` and `SYMBIO — Symbio Finland Oy`) actually correct?**
  _`SYMBIO — IPMED S.à.r.l.` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `SYMBIO — Symbio Finland Oy` (e.g. with `Sabel v Puma (CJEU C-251/95)` and `SYMBIO — IPMED S.à.r.l.`) actually correct?**
  _`SYMBIO — Symbio Finland Oy` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Symbioworld (Celonis)`, `SYMBIOTIC DIGITAL FLORA — Sony`, `Österreichisches Patentamt` to the rest of the system?**
  _11 weakly-connected nodes found - possible documentation gaps or missing edges._