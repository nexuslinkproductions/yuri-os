# C2MOVIEZ ↔ NUDIMMUD — Setup & Collaboration Guide

**For:** Claudio Tinner (c2moviez GmbH)  
**Purpose:** Connect two vaults, enable seamless cross-pipeline workflow  
**Status:** Ready for implementation

---

## What This Enables

When both vaults are synced:

✅ **Unified project references** — Same project slug in both vaults  
✅ **Bi-directional links** — Your post-production links back to Marcel's capture logs  
✅ **Shared briefs** — Single source of truth for client deliverables  
✅ **Media pipeline** — Footage → edits → final deliverables, all tracked  
✅ **No duplicate data** — Each vault owns its domain (capture vs. post)  

---

## Step 1: Export Your Filesystem (Claudio)

You send Marcel a snapshot of your vault structure.

**What to export:**
- Your main project folders (names, structure)
- Active client list with current projects
- Folder naming conventions you use
- Any standardized templates or processes

**Format:** ZIP or directory listing is fine. Marcel doesn't need the actual files yet.

**Where it goes:** Marcel drops it in `06_NETWORK-SYNC/C2MOVIEZ/Database/`

---

## Step 2: Create Mapping (Marcel)

Marcel creates `_MAPPING.md` showing how c2moviez paths map to NUDIMMUD paths.

**Example:**
```
# C2MOVIEZ → NUDIMMUD Path Mapping

| c2moviez Structure | NUDIMMUD Path | Notes |
|---|---|---|
| `/Clients/ANGELIKA/` | `01_PROJECTS/C2MOVIEZ/ANGELIKA/` | Client folder |
| `/Assets/LUTs/` | `03_RESOURCES/LUTs/` | Shared resources |
| `/Templates/Brief/` | `03_RESOURCES/Templates/` | Project templates |
| `/Archive/2025/` | `07_ARCHIVE/Completed-Projects/2025/` | Completed work |
```

This prevents name collisions and makes cross-linking predictable.

---

## Step 3: Sync Active Projects

For each active client project:

1. **Project slug convention:** `[CLIENT]_[YYYY-MM]`
   - Example: `ANGELIKA_2026-02` (February 2026 Angelika project)
   - Both vaults use the same slug for the same project
   
2. **Ownership split:**
   - **NUDIMMUD owns:** Shoot logs, location info, raw footage references, crew notes
   - **C2MOVIEZ owns:** Edit timelines, motion graphics, final deliverables, client proofs
   - **Shared:** Project brief, client contact, budget, timeline
   
3. **File structure per project:**
   ```
   01_PROJECTS/C2MOVIEZ/ANGELIKA/
   ├── brief.md                    # Shared: deliverables, creative direction
   ├── budget.md                   # Shared: costs, invoicing
   ├── timeline.md                 # Shared: milestones
   ├── [NUDIMMUD OWNS]:
   │   ├── location-scout/         # Location photos, access notes
   │   ├── shot-list/              # Scene breakdown
   │   ├── crew.md                 # On-set team
   │   └── shoot-log.md            # What happened on set
   └── [C2MOVIEZ OWNS]:
       ├── edit-timeline/          # Premiere/Resolve projects
       ├── motion-graphics/        # AE files, final comps
       ├── client-proofs/          # Review links, approvals
       └── final-deliverables/     # Exported files, specs
   ```

4. **Wikilink references:**
   ```markdown
   # ANGELIKA — February 2026
   
   **Project Slug:** ANGELIKA_2026-02
   **Lead (Capture):** [[NUDIMMUD/01_PROJECTS/C2MOVIEZ/ANGELIKA/shoot-log|Marcel's Shoot Log]]
   **Lead (Post):** [[C2MOVIEZ/ANGELIKA/timeline|Claudio's Edit Timeline]]
   **Client Brief:** [[brief|Shared Brief]]
   ```

---

## Step 4: Bi-Directional Sync

**Monthly sync meeting (or async):**

1. **Status check:** What projects moved from capture → post → delivery?
2. **Update shared files:** Brief changes, new deliverables, client feedback
3. **Archive completed:** Move to `07_ARCHIVE` with completion date
4. **Log the sync:** Update `_SYNC-STATUS.md` with date and what changed

**_SYNC-STATUS.md example:**
```markdown
| Date | Action | Project | Details |
|------|--------|---------|---------|
| 2026-04-17 | Sync | ANGELIKA_2026-02 | Shoot complete, footage uploaded to shared drive |
| 2026-04-20 | Delivery | ANGELIKA_2026-02 | Final edit approved, watermarked export ready |
| 2026-05-01 | Archive | ANGELIKA_2026-02 | Completed, filed to 07_ARCHIVE/Completed-Projects/ |
```

---

## Step 5: Cross-Vault Integration (iC2M) — [LIVE]

The integrated vault `iC2M` is now live in the root of NUDIMMUD.

**iC2M contains:**
- **Operational Brain**: Clients, Work Items, Daily Briefings (Claudio's authority)
- **Shared Projects**: Sales Pipeline + Meetings
- **Asset Library**: LUTs, presets, music, stock
- **Automation**: Plane.so sync, Telegram COO bot, Netlify Dashboards

**Navigation:**
- Access via `iC2M/` folder in the root directory.
- Bi-directional sync is active via Obsidian Sync + GitHub.
- Operational metrics are visible in the Aeonic Conclave command center.

---

## Benefits for c2moviez

### 1. See How a Videographer Operates
- Shot planning, crew coordination, location scouting
- Risk management for on-set execution
- How to scale capture across multiple pipelines

### 2. Reference the Knowledge Base
NUDIMMUD includes a 06_KNOWLEDGE-BASE with:
- **Cosmology & consciousness frameworks** — useful for brand/creative briefs
- **Communication patterns** — apply to client management, sales
- **Operational systems** — your own production can adopt similar structures

### 3. Build Your Own Vault
This vault is a **template**. You can fork/adapt:
- The folder structure (02_AREAS for ongoing roles)
- The naming conventions (consistent across projects)
- The collaboration model (bi-directional syncing)
- The knowledge synthesis approach

### 4. Unified Pipeline Visibility
- See capture → post → delivery in one place
- Faster context switching between projects
- Reduced miscommunication (everything is documented, linked)

---

## How to Access

**Right now:**
- Clone NUDIMMUD repo: `git clone https://github.com/[Marcel]/nudimmud-vault`
- Read `README.md` for overview
- Check `06_NETWORK-SYNC/C2MOVIEZ/` for sync protocol

**When synced:**
- Both vaults share reference to same projects
- Wikilinks point across vaults (using full paths)
- Changes are documented in `_SYNC-STATUS.md`

---

## Questions?

**Structure questions?** Read `STRUCTURE.md` (complete directory map)  
**Philosophy?** Check `identity.md` (who Marcel is, operationally)  
**How to use:** Start with `HOME.md` and follow wikilinks  

---

## Next Actions — [FINALIZED]

**Marcel:**
1. ✅ Push NUDIMMUD to GitHub (integrated with iC2M)
2. ✅ Finalize semantic mapping (`palace-rebuild.py`)
3. ✅ Update `Home.md` with unified breadcrumbs

**Claudio:**
1. ✅ Integrated live sync via Obsidian Sync
2. ✅ Shared GitHub access for version safety
3. ✅ Active use of Plane.so for work item tracking

---

**Timeline:** Integration complete as of 2026-04-20.

**Version:** 2.0 — 2026-04-20
