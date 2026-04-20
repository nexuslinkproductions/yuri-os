# Migration Map — T7 SSD
# What to move WHERE (manually, when you're ready)
# Nothing has been moved automatically.

---

## ⚠️ NOTE ON ACTUAL SSD STRUCTURE
The T7 SSD structure differs from the original plan. Key corrections:
- `USER/` and `NEXUS LINK/` are inside `2026/` — NOT at root
- `CLIENTS/` and `EXPORTS/` were not found — check `2026/NEXUS LINK/` for client folders
- Obsidian vault is at `NEXUS LINK AI/OBSIDIAN/NEXUS HUB/` — NOT at root `OBSIDIAN/`
- All paths below have been corrected to reflect actual locations

---

## 2026/NEXUS LINK/ → 01_PROJECTS/C2MOVIEZ/
Client folders found here are c2moviez pipeline clients.
Move each client folder into 01_PROJECTS/C2MOVIEZ/ when ready.
Example: 2026/NEXUS LINK/ANGELIKA/ → 01_PROJECTS/C2MOVIEZ/ANGELIKA/

## CLIENTS/ (⚠️ NOT FOUND AT ROOT)
If CLIENTS/ exists somewhere on the SSD, same rule applies:
Move each client folder into 01_PROJECTS/C2MOVIEZ/
Example: CLIENTS/ANGELIKA/ → 01_PROJECTS/C2MOVIEZ/ANGELIKA/

## EXPORTS/ (⚠️ NOT FOUND AT ROOT)
If EXPORTS/ exists somewhere on the SSD:
EXPORTS/ is a flat dump zone. Match each export to its project folder.
Unmatched exports → 07_ARCHIVE/Projects/

## 2026/USER/ASSETS/ → 03_RESOURCES/
Sub-mapping:
- ARTLIST/ → 03_RESOURCES/Stock/Music/
- AUDIO/ → 03_RESOURCES/Stock/Music/ or Stock/SFX/
- Davinci Export Presets/ → 03_RESOURCES/Presets/DaVinci/
- Epidemic Sound/ → 03_RESOURCES/Stock/Music/
- Greenscreen stuff/ → 03_RESOURCES/Greenscreen/
- GTA Overlay/ → 03_RESOURCES/Overlays/
- MASTER BUNDLE/ → 03_RESOURCES/Motion-Packs/
- Ryan Herricks - Pack/ → 03_RESOURCES/Motion-Packs/
- Snap Captions V2.0.0/ → 03_RESOURCES/Plugins/Premiere/
- Stock Photos/ → 03_RESOURCES/Stock/Images/
- TEXTURES/ → 03_RESOURCES/Stock/Images/ or References/
- FOUR EDITORS/ → 03_RESOURCES/Motion-Packs/
- Music/ → 03_RESOURCES/Stock/Music/
- INSTAGRAM ACCOUNTS/ → 02_AREAS/Personal-Brand/Social-Content/
- MARCUS X CHRISTIAN/ → 01_PROJECTS/DIRECT-CLIENTS/ or C2MOVIEZ/
- BOVIRO/ → 01_PROJECTS/C2MOVIEZ/ (if c2moviez client) or DIRECT-CLIENTS/
- Technical Difficulties/ → 07_ARCHIVE/ or 03_RESOURCES/References/
- SHITPOSTS/ → 02_AREAS/Personal-Brand/Social-Content/ (or 07_ARCHIVE/)

## 2026/USER/BACKUP/Editing/ → 03_RESOURCES/
- Luts/ → 03_RESOURCES/LUTs/
- Overlays/ → 03_RESOURCES/Overlays/
- SFX/ → 03_RESOURCES/Stock/SFX/
- Snap Captions/ → 03_RESOURCES/Plugins/Premiere/

## 2026/USER/BACKUP/NLP Rechnungen/ → 04_FINANCE/
Sort by year into 04_FINANCE/[YEAR]/Invoices-Out/

## 2026/USER/PROJECT FILES/ → 01_PROJECTS/[ClientName]/04_Edit/
- AE/ → match each .aep to its project → 04_Edit/AfterEffects/
- DR/ → 04_Edit/DaVinci/
- PP/ → 04_Edit/Premiere/
- Unusual/ → investigate, likely 07_ARCHIVE/

## 2026/USER/AFTER EFFECTS/ → 01_PROJECTS/ (match to client)
- R logo.aep + R logo.aep_AME → likely 01_PROJECTS/C2MOVIEZ/[client]/04_Edit/AfterEffects/
- TEST VIDEO KAI.aep → 07_ARCHIVE/ or active project folder

## 2026/USER/PRIVATE/ → stays in 2026/USER/PRIVATE/ (personal, no change needed)

## NEXUS LINK AI/ → stays or integrate with 05_NEXUS-LINK/ when ready

## 2026/NEXUS LINK/ → contents migrate to 01_PROJECTS/C2MOVIEZ/ over time
