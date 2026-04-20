# Claude Palace — NUDIMMUD Vault Index
**Generated:** 2026-04-17 | **Vault size:** 837 files, ~7M words, 6866 nodes

This is a **structure-first navigation index** — use it to understand the vault topology without reading raw files. Read the other palace docs (palace-map.md, cross-domain.md) after this for deeper navigation.

---

## Entry Points (Start Here)

**Navigation entry points by purpose:**

| Purpose | File | Cluster | Use When |
|---------|------|---------|----------|
| **Current status** | `00_COMMAND-CENTER/HOME.md` | Command Center | First thing each session — shows active projects, blockers, next steps |
| **All projects** | `00_COMMAND-CENTER/MOC-Projects.md` | Command Center | Need to find a project or understand project state |
| **Network/partners** | `00_COMMAND-CENTER/MOC-Network.md` | Command Center | Working with Claudio, planzerfilms, MACL-ONE, or external contacts |
| **Marcel's identity** | `identity.md` (root) | Core Self | Need Marcel's cognitive model, operating modes, or personal constraints |
| **System state** | `enki_state.md` (root) | Core Self | Understanding energy, time, money constraints; personal development priorities |
| **Public repo** | `README.md` (root) | Core Self | Explaining vault to externals; understanding public-facing philosophy |
| **C2MOVIEZ sync** | `06_NETWORK-SYNC/C2MOVIEZ/SETUP-GUIDE.md` | Network Sync | Integrating Claudio's vault; understanding sync protocol |
| **Finance** | `04_FINANCE/2026/` (root) | Finance | Invoicing, expenses, reconciliation |
| **Knowledge base** | `06_KNOWLEDGE-BASE/REPORT.md` | Esoteric | Cross-domain synthesis; cosmology, consciousness, operational patterns |

---

## Vault Clusters (11 Domains)

**The vault has 11 natural clusters based on folder structure + graphify communities:**

### 1. **Command Center** (00_COMMAND-CENTER/)
- **Nodes:** 15–20 files
- **Cohesion:** Daily notes, MOCs, session logs, inbox
- **Key files:** HOME.md, MOC-Projects.md, MOC-Areas.md, MOC-Network.md
- **Purpose:** Operational hub for current status, navigation, daily capture
- **Access pattern:** Read HOME.md first each session; reference MOCs for specific domains

### 2. **Projects** (01_PROJECTS/)
- **Nodes:** 50+ folders (8 C2MOVIEZ client + 2 other pipelines)
- **Cohesion:** Active client work organized by pipeline
- **Key patterns:** `[Client]_[YYYY-MM]` slugs; each project has brief/budget/crew/timeline/footage/deliverables
- **Subdomains:** C2MOVIEZ (40 folders), MACL-ONE (3–5), others (2–3)
- **Access pattern:** Use MOC-Projects.md to find, then navigate folder structure

### 3. **Areas** (02_AREAS/)
- **Nodes:** 30–40 folders
- **Cohesion:** Ongoing responsibilities (not projects) — Network, Health, Learning, Clients, Tech-Setup, Personal-Brand
- **Key files:** C2MOVIEZ-TEAM.md, partner profiles, client contracts
- **Purpose:** Long-term responsibilities, skills, relationships, infrastructure
- **Access pattern:** MOC-Areas.md links to specific areas

### 4. **Resources** (03_RESOURCES/)
- **Nodes:** 100+ files
- **Cohesion:** Templates, LUTs, presets, stock, reference, legal
- **Key patterns:** Versioned and clearly named; linked from projects that use them
- **Purpose:** Reusable assets, tools, inspiration
- **Access pattern:** Search by project need; reference from project brief

### 5. **Finance** (04_FINANCE/)
- **Nodes:** 50+ files + 2026/ substructure
- **Cohesion:** Austrian EPU bookkeeping, invoicing, expenses, contracts, taxes
- **Key patterns:** Encrypted sensitive data; annual archival after tax filing
- **Access pattern:** Monthly reconciliation; invoice → expense → summary flow

### 6. **Nexus Link Company** (05_NEXUS-LINK/)
- **Nodes:** 15–20 files
- **Cohesion:** Company brand, identity, positioning, legal, website, social
- **Key files:** identity.md (also in root), brand-standards.md, services.md
- **Purpose:** Public-facing company definition
- **Access pattern:** Reference for all external-facing docs; informs project positioning

### 7. **Network Sync** (06_NETWORK-SYNC/)
- **Nodes:** 250+ files (mostly C2MOVIEZ Database/)
- **Cohesion:** Cross-vault collaboration, partner integrations, sync protocols
- **Key subdomains:** C2MOVIEZ (240+ files: clients, projects, team, processes, templates, CI:CD), planzerfilms (TBD), iC2M (planned)
- **Access pattern:** _MAPPING.md for path alignment; SETUP-GUIDE.md for Claudio; Database/ is read-only reference

### 8. **Knowledge Base — Esoteric** (06_KNOWLEDGE-BASE/)
- **Nodes:** 29 files across 5 domains (expanded 2026-04-17)
- **Cohesion:** Cosmology (Sumerian, Kabbalah, Hermetics, Alchemy, Gnosis, **Neoplatonism**, **Japanese Aesthetics**), Consciousness (Transpersonal, Individuation), Communication (Emotional, Somatic), Synthesis (Isomorphisms, Cross-References, Operational Map, **Gnostic Architecture**), Operational (Partner Memory, Mode Triggers, **Pneuma Profile**)
- **Key files:**
  - REPORT.md (god nodes + synthesis)
  - isomorphisms.md (9 pattern bridges — updated 2026-04-17 with Isomorphisms 8 and 9)
  - **gnostic-architecture.md** (cosmological map of the full NUDIMMUD system — NEW)
  - **neoplatonism.md** (Plotinus/Iamblichus/Proclus — missing bridge — NEW)
  - **japanese-aesthetics.md** (Ma, wabi-sabi, mushin, mono no aware — NEW)
  - **pneuma-profile.md** (Marcel's consciousness through all traditions — NEW)
- **Purpose:** Cross-domain meaning-making; esoteric frameworks; consciousness models; system cosmology
- **Access pattern:** Use for ABZU mode; gnostic-architecture.md as system overview; pneuma-profile.md for identity work

### 9. **Archive** (07_ARCHIVE/)
- **Nodes:** 50+ files
- **Cohesion:** Completed projects, deprecated skills, inactive work
- **Purpose:** Historical reference, learning from past, clean-up
- **Access pattern:** Search when context is historical; occasionally resurface relevant work

### 10. **System** (_SYSTEM/)
- **Nodes:** 30+ files
- **Cohesion:** Automation scripts, configuration, templates, migration map
- **Key files:** MIGRATION-MAP.md (where things belong), skill templates, Claude Code hooks
- **Purpose:** Infrastructure, tools, operational setup
- **Access pattern:** Reference when organizing new work or troubleshooting setup

### 11. **Code/Graph** (graph/, graphify-out/)
- **Nodes:** 6866+ code/graph nodes
- **Cohesion:** Knowledge graph extraction, graphify codebase, graph visualization
- **Key files:** GRAPH_REPORT.md (god nodes, communities, edge analysis), graph.json (raw graph)
- **Purpose:** Machine-readable vault structure, pattern detection, knowledge graph
- **Access pattern:** Use graphify for architecture questions; god nodes identify core abstractions

---

## Quick Navigation Rules

**Use this decision tree to find what you need:**

1. **"What am I working on right now?"** → `00_COMMAND-CENTER/HOME.md` → find project → folder
2. **"Is [X client/partner] in the system?"** → `MOC-Network.md` → search → folder
3. **"Need a template for [X]?"** → `03_RESOURCES/Templates/` + search
4. **"Where does [X new project] belong?"** → `_SYSTEM/MIGRATION-MAP.md` → copy `_TEMPLATE/`
5. **"What's the state of [X client]?"** → `01_PROJECTS/[PIPELINE]/[CLIENT]/brief.md`
6. **"Sync protocol with Claudio?"** → `06_NETWORK-SYNC/C2MOVIEZ/SETUP-GUIDE.md` + `_MAPPING.md`
7. **"Need esoteric/deep synthesis?"** → `06_KNOWLEDGE-BASE/REPORT.md` → isomorphisms.md
8. **"Infrastructure/automation/config?"** → `_SYSTEM/` + reference in CLAUDE.md

---

## Vault Topology (Summary)

```
COMMAND-CENTER (hub) 
  ↓
  ├→ PROJECTS (active work)
  ├→ AREAS (ongoing responsibilities)
  ├→ NETWORK-SYNC (partners: C2MOVIEZ primary)
  │   └→ DATABASE (read-only reference)
  ├→ FINANCE (billing, reconciliation)
  ├→ RESOURCES (templates, assets)
  ├→ KNOWLEDGE-BASE (esoteric synthesis)
  ├→ NEXUS-LINK (company brand)
  ├→ ARCHIVE (historical)
  └→ SYSTEM (infrastructure)

CORE (identity.md, enki_state.md, README.md at root)
  ↓
  └→ CLAUDEMD files (rules, context, directives)
```

---

## Token Efficiency Tips

- **First query of the session:** Read `palace-index.md` (this file) to orient
- **Second query:** Read `palace-map.md` for connection pathways
- **Find a file:** Use `cross-domain.md` to avoid reading raw folders
- **Understand connectivity:** Check `suggested-connections.md` for missing links
- **Deep research:** Use `orphaned-content.md` to find low-visibility assets worth linking
- **Raw file reads:** Only when palace doesn't answer the question

**Example efficient workflow:**
- Query: "I need to find BOVIRO project notes and link them to Claudio's vault"
- Step 1: palace-index.md → find BOVIRO in Projects cluster
- Step 2: palace-map.md → confirm path is `01_PROJECTS/C2MOVIEZ/BOV_2026/`
- Step 3: cross-domain.md → see how BOV links to Network Sync
- Step 4: read specific file (e.g., `brief.md`) only when needed
- **Total tokens saved:** ~80% vs. reading folder structure + 5 raw files

---

## Last Updated
- **Date:** 2026-04-17
- **Vault state:** 837 files, live (GitHub public), C2MOVIEZ sync active
- **Next update:** After Claudio's filesystem export + _MAPPING.md revision
