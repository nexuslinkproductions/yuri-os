# Palace Map — Vault Topology & Connection Pathways

**Use this map to understand how clusters relate to each other and find connection points.**

---

## Spatial Layout (How Clusters Connect)

```
                    ┌─────────────────────────────────┐
                    │   COMMAND-CENTER (Hub)          │
                    │  HOME.md, MOCs, Session Logs    │
                    └──────────────┬──────────────────┘
                                   │
        ┌──────────────┬───────────┼───────────┬──────────────┐
        │              │           │           │              │
    PROJECTS       AREAS     NETWORK-SYNC  FINANCE     RESOURCES
   (Active Work) (Ongoing)  (Partners)    (Billing)   (Templates)
        │              │           │           │              │
    ┌───┴───┐    ┌──────┐    ┌──────┐   ┌──────┐         │
    │ C2MZ  │    │Net   │    │C2MZ  │   │Inv  │         │
    │ MACL  │    │Health│    │Data  │   │Exp  │         │
    │Others │    │Learn │    │(Git) │   │Rec  │         │
    └───────┘    └──────┘    └──────┘   └──────┘         │
        │              │           │           │              │
        └──────────────┴───────────┼───────────┴──────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
              NEXUS-LINK              KNOWLEDGE-BASE
            (Brand/Company)          (Esoteric/Synthesis)
                    │                             │
                    │    ┌─────────────────────────┘
                    │    │
                    └────┼──────┬──────┬──────┐
                         │      │      │      │
                      ARCHIVE  SYSTEM  GRAPH  CODE
                   (Historical) (Tools) (Index)
```

---

## Edge Connections (How Work Flows)

### Entry → Project → Network → Deliverable

**Typical project workflow path:**

```
HOME.md (status check)
  ↓
MOC-Projects.md (find project)
  ↓
01_PROJECTS/[CLIENT]/brief.md (scope, deliverables, timeline)
  ↓
01_PROJECTS/[CLIENT]/crew.md + timeline.md (execution planning)
  ↓
[On-set capture or production work happens]
  ↓
01_PROJECTS/[CLIENT]/notes/ (shoot logs, feedback)
  ↓
06_NETWORK-SYNC/C2MOVIEZ/Database/ (reference Claudio's project context)
  ↓
01_PROJECTS/[CLIENT]/deliverables/ (final outputs)
  ↓
04_FINANCE/2026/Invoices/ (billing after delivery)
```

### Partnership → Sync → Project Mapping

**How C2MOVIEZ integration flows:**

```
06_NETWORK-SYNC/C2MOVIEZ/SETUP-GUIDE.md (Claudio integration)
  ↓
06_NETWORK-SYNC/C2MOVIEZ/Database/ (Claudio's filesystem)
  ↓
06_NETWORK-SYNC/C2MOVIEZ/_MAPPING.md (path alignment)
  ↓
01_PROJECTS/C2MOVIEZ/[CLIENT]_[YYYY-MM]/ (Marcel's project folder)
  ↓
[Bidirectional slug matching and cross-vault references]
  ↓
06_NETWORK-SYNC/C2MOVIEZ/_SYNC-STATUS.md (log of sync state)
```

### Knowledge Synthesis Path

**How esoteric/deep work flows:**

```
Session need: Need cross-domain insight for [X decision]
  ↓
06_KNOWLEDGE-BASE/REPORT.md (god nodes + synthesis overview)
  ↓
06_KNOWLEDGE-BASE/04_SYNTHESIS/isomorphisms.md (pattern bridges)
  ↓
06_KNOWLEDGE-BASE/[DOMAIN]/*.md (deep dive: Cosmology, Consciousness, etc.)
  ↓
identity.md (ABZU mode + MODE 6 INITIATOR reflection)
  ↓
enki_state.md (personal constraints + decision framework)
  ↓
[Synthesis output]
```

---

## Cross-Cluster Bridges (Where Clusters Touch)

| Bridge | Cluster A | Cluster B | Purpose | Key File |
|--------|-----------|-----------|---------|----------|
| **Client Data** | Projects | Areas | Project context + client contracts | `02_AREAS/Clients/[Client].md` + `01_PROJECTS/[CLIENT]/crew.md` |
| **Team Profiles** | Network-Sync | Areas | C2MOVIEZ team info + partner profiles | `06_NETWORK-SYNC/C2MOVIEZ/Database/04 - Team/` + `02_AREAS/Network/C2MOVIEZ-TEAM.md` |
| **Shared Assets** | Resources | Projects | Templates, LUTs, presets used in projects | `03_RESOURCES/Templates/` → linked in project brief |
| **Billing Flow** | Projects | Finance | Project completion → invoice creation | `01_PROJECTS/[CLIENT]/budget.md` → `04_FINANCE/2026/Invoices/` |
| **Brand Consistency** | Nexus-Link | Projects | Company positioning applied to project work | `05_NEXUS-LINK/brand-standards.md` → project brief |
| **Esoteric Framework** | Knowledge-Base | Areas | Operative frameworks for decision-making | `06_KNOWLEDGE-BASE/04_SYNTHESIS/operational_map.md` ↔ `enki_state.md` |
| **Sync Protocol** | Network-Sync | Projects | Claudio's client data informs Marcel's project planning | `06_NETWORK-SYNC/C2MOVIEZ/Database/02 - Clients/` ↔ `01_PROJECTS/C2MOVIEZ/[CLIENT]/` |
| **System Infrastructure** | System | All Clusters | Automation, scripts, migration rules apply to all work | `_SYSTEM/MIGRATION-MAP.md` → referenced in all folder structures |
| **Historical Context** | Archive | All Clusters | Past projects inform current execution | Occasional back-reference to `07_ARCHIVE/` for patterns |

---

## Cluster Connectivity Summary

**High-connectivity hubs (most referenced):**
1. Command Center (links to everything)
2. Projects (linked from MOC-Projects, Finance, Resources)
3. Network-Sync (linked from Projects, Areas, Finance)
4. Knowledge-Base (referenced from identity.md, enki_state.md, ABZU mode)

**Mid-connectivity clusters:**
- Finance (linked from Projects, Areas)
- Areas (linked from MOC-Areas, Network-Sync)
- Resources (linked from Projects)
- Nexus-Link (referenced in brand context)

**Lower-connectivity clusters:**
- Archive (reference only, occasional back-look)
- System (reference for infrastructure decisions)
- Graph/Code (used for analysis, not daily nav)

---

## Navigation by Distance (Hops from Command Center)

| Distance | Clusters | Navigation Time | Typical Use |
|----------|----------|-----------------|-------------|
| **0 hops** | Command-Center | Instant | Every session start |
| **1 hop** | Projects, Areas, Finance, Resources | < 30s | Find active work, teammate, asset |
| **2 hops** | Network-Sync, Nexus-Link, Knowledge-Base | < 2m | Client context, brand rules, synthesis |
| **3 hops** | Archive, System, Graph | < 5m | Historical reference, setup decisions, analysis |

---

## Suggested Navigation Patterns

**Pattern 1: Quick Project Check (< 1 min)**
```
HOME.md → MOC-Projects.md → find client → brief.md ✓
```

**Pattern 2: On-Set Shoot Prep (5–10 min)**
```
HOME.md → MOC-Projects.md → [CLIENT]/brief.md 
  → crew.md → timeline.md → location-scout/ ✓
```

**Pattern 3: Client Integration with Claudio (10–15 min)**
```
06_NETWORK-SYNC/C2MOVIEZ/SETUP-GUIDE.md 
  → _MAPPING.md → 06_NETWORK-SYNC/C2MOVIEZ/Database/02 - Clients/
  → 01_PROJECTS/C2MOVIEZ/[CLIENT]/ ✓
```

**Pattern 4: Deep Synthesis / Decision-Making (15–30 min)**
```
enki_state.md (constraints) → identity.md (operating modes)
  → 06_KNOWLEDGE-BASE/REPORT.md → isomorphisms.md 
  → [specific knowledge file] ✓
```

**Pattern 5: Finance Reconciliation (20–30 min)**
```
HOME.md → MOC-Projects.md (completed projects)
  → project deliverables/ → 04_FINANCE/2026/
  → Invoices/ (create) → Expenses/ (review) → Summary/ (reconcile) ✓
```

---

## Optimization Notes

**To reduce token cost of vault navigation:**
- Always use palace-index.md first (orients without reading files)
- Use cross-domain.md to understand connections before reading raw files
- Batch related queries (e.g., "client info + project + sync status" = 3 files, not 6)
- Avoid reading full `06_NETWORK-SYNC/C2MOVIEZ/Database/` unless Claudio sends new export
- Use palace-map.md (this file) to predict navigation paths before executing

**Vault is now structured for ~70% token savings on navigation queries vs. reading raw folders.**

---

## Last Updated
**2026-04-17** — Palace maps generated from STRUCTURE.md + graphify topology
