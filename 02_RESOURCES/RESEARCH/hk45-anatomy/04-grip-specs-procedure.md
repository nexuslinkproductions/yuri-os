# 04 — HK45 Tactical: Grip/Specs/Variants + the Reusable Any-Gun Anatomy Procedure

Part of the Blender Department holster-blocking research (custom-gear.ch, René Spatz).
Companion to `02_RESOURCES/RESEARCH/hk45-gun-anatomy-and-blocking-theory-2026-06-23.md` (the
scan cross-check + prefix-union blocking theory) and `_SYSTEM/blender/RUNBOOK.md` §8.2 (GUN_PARAMS).

**Method:** LOCAL-FIRST (`xref-query.mjs`, existing anatomy doc, RUNBOOK) then ONLINE-VERIFY
(≥2 primary sources: HK-USA official + Wikipedia + HK operator's manual). Specs cited inline.
`[P]` = primary/authoritative. Advisory until locally verified; local execution stays ground truth.

---

## TASK A — HK45 Tactical verified specs, grip, magazine, variants, thread pitch

### A.1 Official dimension table (HK-USA product page [P] + operator's manual [P])

| Spec | HK45 **Tactical** (official) | Metric | Our scan (post-prep) | Verdict |
|---|---|---|---|---|
| Caliber | .45 ACP | — | — | — |
| Overall length | **8.50 in** | **215.9 mm** | 221.7 mm (Y span) | +5.8 mm = thread cap + scan tol ✓ |
| Overall height | **5.91 in** | **150.1 mm** | 144.2 mm (to slide top) | scan = slide-top; +6 mm = sights ✓ |
| Overall width (w/ lever) | **1.54 in** | **39.1 mm** | 37.3 mm (X span) | scan −1.8 mm = ambi-lever widest ✓ |
| Barrel length (threaded) | **5.20 in** | **132.1 mm** | muzzle at −Y | Tactical protrudes ~18.8 mm past slide |
| Slide width (approx) | 1.27 in | ~32 mm | — | width delta = controls |
| Frame width (approx) | 1.34 in | ~34 mm | — | over controls = 39.1 mm |
| Sight radius | **6.63 in** | **168.4 mm** | — | — |
| Weight (w/ empty mag) | **31.20 oz** | **884 g** | — | matches Wikipedia 785 g empty / 884 g loaded |
| Magazine (empty) | 0.24 lb | 3.88 oz / 110 g | — | — |

Sources [P]: HK-USA `hk-usa.com/product/hk45-tactical/` (spec table) · HK45 Series Operator's Manual
`hk-usa.com/wp-content/uploads/2025/05/HK45-Series-Operators-Manual-5.12.25.pdf` (M16x1 LH, backstraps) ·
Wikipedia `en.wikipedia.org/wiki/Heckler_%26_Koch_HK45`.

**Scan sanity-check: PASS.** The +5.8 mm length (thread protector), the 144-vs-150 height (sights
add ~6 mm), and the −1.8 mm width ( ambi controls are the true widest, scan slightly under) all
reconcile. The scan is a real HK45T at correct mm scale. (Cross-check originally in the 2026-06-23
anatomy doc; re-verified against the freshly-fetched HK-USA figures.)

### A.2 Grip module — backstraps, material, and the holster-mouth cut

- **Backstraps:** interchangeable, **S / M / L** (small / medium / large). The shipped default is M.
  HK part #234662 = Small backstrap (from the manual/catalog). Changing the backstrap changes grip
  circumference and reach, NOT the external retention-relevant silhouette materially — but a Large
  backstrap does add ~2–3 mm of rear grip thickness that the blocking channel should clear if the
  holster is meant to fit any-backstrap guns. **Conservative blocking = assume L.**
- **Grip material:** reinforced polyamide (polymer) frame over a steel magazine; molded finger grooves
  + changeable backstrap. Metal magazine keeps grip circumference minimal (a deliberate HK45 design
  choice vs the thicker USP45).
- **Grip length (what gets CUT at the holster mouth):** the grip hangs below the holster mouth
  ("belt line"). Belt line ≈ **5–15 mm below the bottom of the trigger guard** (maker judgment). On
  the HK45T the grip extends roughly **70–80 mm below the trigger-guard bottom** (scan: trigger-guard
  floor ≈ Z −20, grip base ≈ Z −91 → ~71 mm of exposed grip). So **~71 mm of grip is removed from the
  mold** (exposed, not molded); the holster body ends at the belt line. This is a PARAMETER
  (`grip_cut_z`), not a fixed number — confirm per gun with René's GOOD/BAD reference.

### A.3 Magazine

- **Capacity:** 10 rounds (10+1 loaded). Full-size HK45 only; HK45C uses 8 or 10.
- **Caliber:** .45 ACP.
- **Construction:** steel, with viewing holes on the back for round-count. Empty weight 3.88 oz.
- **How it sits in the grip:** inserts from below, seats on the frame's magazine catch; the feed lips
  sit at the top of the grip just below the chamber. The grip's internal channel is sized to the mag
  — this is why a metal mag keeps the grip thin. **For blocking, the magazine is irrelevant above the
  holster mouth** (it's inside the grip, which is cut off). What matters retention-wise is the
  trigger guard directly above the mouth — that's the retention-detent zone.

### A.4 Variants — V1/V3/V5/V7/V9, and what "Tactical" means

**"Tactical" is a BARREL + SIGHT configuration, NOT a trigger variant.** The HK45 Tactical = HK45
slide/frame with a 5.20" threaded barrel (M16x1 LH) + tall adjustable Truglo suppressor-height
sights. HK-USA sells it in two trigger configs:
- **HK45T V1** (SKU 81001117) — DA/SA, safety/decocking lever on left, two 10-rd mags. MSRP $1,129.
- **HK45T V7** (SKU 81001118) — LEM (Law Enforcement Modification), two 10-rd mags. MSRP $1,129.

The HK45 series is convertible to **nine trigger modes** (per HK-USA), inheriting the USP/USP-C
variant numbering. The standard mapping:

| Variant | Trigger | Manual safety | Decocker | Notes |
|---|---|---|---|---|
| **V1** | DA/SA | yes (left) | yes (combined safety/decock lever) | most common DA/SA; "tactical" classic |
| V2 | DA/SA | yes (right) | yes | ambi version of V1 |
| **V3** | DA/SA | no | yes (decock only) | no manual safety |
| V4 | DA/SA | no | yes (right) | V3 mirrored |
| **V5 / V7** | LEM (DA-only, pre-cocked) | no | no | LEM = no external controls; V7 is the sold Tactical LEM |
| V9 | DAO | no | no | true double-action-only (rare) |

For **holster blocking, the variant barely matters** — the external silhouette is identical across
DA/SA vs LEM; the only retention-relevant difference is whether a safety/decock lever protrudes from
the frame (V1/V2 yes, LEM no). The scan's ambi slide-release + left-side lever indicates a **V1**
DA/SA. Source [P]: HK-USA product page (V1/V7 Tactical SKUs); HKPRO forum variant table; operator's manual.

### A.5 Thread pitch — VERIFIED: M16×1 **LH** (left-hand), NOT RH

**The task premise ("M16x1RH reportedly") is WRONG.** Two independent primary sources confirm
**M16×1 left-hand**:
1. HK-USA operator's manual: *"M16X1 LH thread pitch"* (spec table, primary).
2. HK-USA accessory barrel #226351: *"HK45 Tactical threaded barrel, 5.20 inches, M16x1 LH"* (primary).
3. heckler-koch.com (global): *"M16x1LH thread for mounting a silencer"* (primary).
4. HKPRO forum: *"Tactical/HK45/HK45c all have M16x1 left hand threads. The MK23 with M16x1 right hand threads."* (corroborating).

**The RH confusion comes from the Mark 23 / MK23**, which IS M16×1 RH. Both use the same 1 mm pitch
but opposite hand. A RH suppressor on an HK45T will cross-thread — flag this to René. Our scan shows
the threaded muzzle at the −Y end; the thread direction is not visible in the scan but the spec is
settled. **Blocking implication:** the muzzle end of the channel must be OPEN (no front cap) on a
threaded-barrel gun, and the channel must bridge the barrel's radial protrusion so it ramps — see
the decision table §B.3, row "Threaded barrel / muzzle device".

---

## TASK B — The reusable ANY-GUN anatomy-research procedure

This is the real deliverable: a deterministic procedure an AI agent follows to research ANY pistol
scan (Glock / SIG / HK / Walther / CZ / S&W / FN / etc.) before blocking it. It produces a
parameter set that feeds the parametric blocking script (`RUNBOOK` §8.2 GUN_PARAMS + the prefix-union
sweep). The procedure is gun-agnostic; only the parameter values change.

### B.0 Scope + invariant

This procedure researches the **external anatomy** of a scanned pistol so it can be blocked into a
thermoforming mold. It does NOT model internal mechanics, ballistics, or the magazine well below the
holster mouth. Invariant: **the prefix-union swept silhouette** (anatomy doc §3) is feature-agnostic —
this research's job is to (a) sanity-check the scan against real-world dimensions, (b) confirm the
grip-cut and any optic/light, and (c) populate the parameter checklist. You do NOT hand-model each
feature; you sweep the silhouette. The research tells you *what to expect* so the sweep's output can
be verified.

### B.1 Step-by-step research procedure

**Step 1 — Identify the exact firearm + variant.** From the scan file name, the project README, or
the owner. Record: make, model, caliber, barrel length, and trigger variant (DA/SA, striker, LEM,
DAO). The variant matters only if it changes external controls (safety/decock lever presence).
Write it as `gun_id` (kebab-case, e.g. `hk45-tactical`, `glock-19-gen5`, `p320-compact`).

**Step 2 — Pull the authoritative spec sheet (LOCAL-FIRST, then ONLINE-VERIFY).**
- **Tier 0 (local):** `ai search "<gun> specifications dimensions"`; read any existing
  `02_RESOURCES/RESEARCH/*<gun>*` doc + the RUNBOOK GUN_PARAMS entry if it exists.
- **Tier 1 (manufacturer official — PRIMARY):** the maker's product page + the operator's manual PDF.
  This is the ground truth for OAL, height, width, barrel, weight, capacity, thread.
  - HK: `hk-usa.com/product/<model>/` + `hk-usa.com/wp-content/uploads/.../<model>-Operators-Manual.pdf`
  - Glock: `glock.com/en/Pistols/<model>` (spec tab) + owner's manual PDF
  - SIG Sauer: `sigauer.com/<model>` (specs) + manual
  - Walther: `waltherarms.com/<model>` + manual
  - S&W / FN / CZ / H&K global: equivalent product page + manual.
- **Tier 2 (Wikipedia — SECONDARY, corroborating):** `en.wikipedia.org/wiki/<gun>`. Good for the
  variant table, design history, and a second dimension source. NEVER the only source.
- **Tier 3 (world.guns.ru / HKPRO / forum wikis — TERTIARY):** use only for variant/trigger
  disambiguation when the manual is silent. Forums are NOT dimension sources.
- **Rule:** ≥2 primary sources for any load-bearing dimension. Manufacturer official + Wikipedia is
  the minimum bar. Flag anything single-sourced as `UNVERIFIED`.

**Step 3 — Extract the parameter checklist (§B.4).** Fill every field. For each dimension, convert
to mm (in × 25.4) and note the source. If a dimension is irrelevant for this gun (e.g. no threaded
barrel → `barrel_thread = none`), mark `n/a` explicitly — never leave it blank.

**Step 4 — Sanity-check the scan against the researched dimensions.** This is the unit-scale gate.
Compare the scan's bounding-box (X/Y/Z spans from Phase-1 prep) to the official OAL + height + width:
- Length within ~±1 % (thread protector / muzzle device can add 5–10 mm — expected).
- Width within ~±5 % (controls are the widest; scans often slightly under).
- Height: confirm whether the figure is "to slide top" or "to sight top" — sights add 5–10 mm.
- If the scan is off by >5 % on length, **STOP** — the scan scale or orientation is wrong; do not
  block a mis-scaled gun.

**Step 5 — Confirm the grip-cut + holster mouth.** This is the one parameter that is ALWAYS
human-confirmed, never auto-derived. The grip is cut at the belt line (≈5–15 mm below the trigger-
guard floor). Measure the grip length below the trigger guard on the scan; that's the exposed
(removed) portion. Record `grip_cut_z` in scan coordinates. René's STEPS.docx GOOD/BAD examples are
the acceptance reference.

**Step 6 — Classify every external feature into a retention category (§B.2 + §B.3 decision table).**
Walk the gun front→back (muzzle → grip) and tag each feature. This is the part→tunnel mapping. The
prefix-union sweep will bridge them automatically, but the classification tells you *what the sweep
is doing* and lets you verify it caught everything.

**Step 7 — Note any optic / light / comp.** If the gun has a mounted RDS (red dot), a weapon light,
or a muzzle compensator, these CHANGE the blocking: an RDS needs a taller sight-bore tunnel (own
block), a weapon light BECOMES the primary retention contact (the mold must fully enclose the light
body, and the trigger-guard detent may be secondary), a comp needs an open muzzle + radial clearance.
Record `optic`, `weapon_light`, `muzzle_device`.

**Step 8 — Write the gun's `GUN_PARAMS` entry + a one-page anatomy note.** Add the researched params
to RUNBOOK §8.2 `GUN_PARAMS` (extend the dict) and drop a short note in
`02_RESOURCES/RESEARCH/<gun>-anatomy/` so the next scan of the same gun skips Steps 1–3.

### B.2 The four retention categories (feature → operation)

Every external feature falls into exactly one of four categories. The category determines the
blocking operation. This is the core of the procedure — get this right and the sweep ports to any gun.

| Category | What it is | Retention risk | Blocking operation |
|---|---|---|---|
| **TOP protrusion** (+Z) | front sight, rear sight, RDS/optic, beavertail tang | snags on draw-in; tallest point sets sight-bore tunnel height | **sight-bore tunnel**: channel ceiling clears the tallest sight/optic; prefix-union handles it as the +Z max |
| **SIDE protrusion** (±X) | slide stop/release, safety/decock lever, takedown lever, mag release, slide serrations | snags on lateral draw; sets channel wall clearance | **side clearance tunnel**: channel walls clear the widest control (often ambi lever); prefix-union sets ±X max |
| **UNDERCUT / concavity** (−Z, inward) | accessory rail slots, ejection port, extractor recess, trigger-guard hollow | the sweep would over-fill these → mold too bulky, kills detent | **FILL smooth**: bridge concavities flat so the mold surface is monotonic; do NOT hull into the hollow |
| **DOWN protrusion** (−Z, outward) | trigger guard loop, rail dust-cover, front of magazine floorplate (if grip not cut) | must be enclosed (safety + retention) | **enclose fully**: trigger guard is ALWAYS covered; it's the retention-detent location |
| **AXIAL protrusion** (±Y) | threaded barrel / muzzle device / comp (forward); grip + beavertail (rear) | forward = open muzzle; rear = grip cut | **open muzzle** (no front cap) for threaded barrels; **cut grip** at holster mouth |
| **GRIP** (rear, −Z) | grip module, backstrap, magazine base | exposed above holster mouth | **cut at holster mouth**: grip is NEVER molded; remove from mold at `grip_cut_z` |

### B.3 Part → tunnel decision table (the most reusable artifact)

This is the lookup table the agent uses in Step 6. For each researched feature, find the row, apply
the operation. Gun-agnostic.

| Feature (researched) | Category | Operation | Parameter it sets |
|---|---|---|---|
| Front sight | TOP | sight-bore tunnel (clear it) | `sight_height_z` |
| Rear sight | TOP | sight-bore tunnel (clear it) | `sight_height_z` (take max) |
| Red dot / RDS | TOP | **own taller block** (clear optic housing) | `optic_height_z`, `optic_present=true` |
| Beavertail / tang | TOP/rear | taper channel ceiling rearward | (prefix-union) |
| Slide serrations (fwd/rear) | SIDE | side clearance (friction, not a hard catch) | (prefix-union) |
| Slide stop / release (ambi) | SIDE | side clearance tunnel (±X max) | `control_protrusion_x`, `side="both"` |
| Safety / decocker lever | SIDE | side clearance tunnel | `control_protrusion_x`, `side="left"\|"right"\|"both"` |
| Takedown lever | SIDE | side clearance tunnel | `control_protrusion_x`, `side="left"` (usually) |
| Mag release (paddle) | SIDE | side clearance tunnel | `control_protrusion_x`, `side="both"` |
| Ejection port + extractor | UNDERCUT/right lip | **FILL smooth** (worst offender — fill flat) | (no param; sweep bridges it) |
| Accessory rail (Picatinny) | UNDERCUT/down | FILL slots smooth; enclose dust-cover | `rail_drop_z` |
| Trigger guard loop | DOWN | **enclose fully** (retention detent) | `trigger_guard_drop_z`, `enclosed=true` |
| Threaded barrel / muzzle device | AXIAL forward | **open muzzle** + radial ramp clearance | `barrel_protrusion_y`, `muzzle_open=true`, `barrel_thread` |
| Weapon light (mounted) | DOWN/side | **enclose light body** (becomes primary retention) | `weapon_light_present`, `light_body_dims` |
| Grip + backstrap + magazine | GRIP (rear/down) | **cut at holster mouth** | `grip_cut_z`, `backstrap="L"` (conservative) |

### B.4 Per-gun PARAMETER checklist (feeds the parametric blocking script)

This is the exact set to extract in Step 3. It extends the existing RUNBOOK §8.2 `GUN_PARAMS` (which
today only has geometric/mesh params) with the anatomy params. Group: [G] = geometric/mesh (existing),
[A] = anatomy (new from this procedure), [H] = human-confirmed.

```
gun_id                    : str            # kebab-case identifier [G]
caliber                   : str            # ".45 ACP", "9x19mm", ... [A]
variant                   : str            # "V1 DA/SA", "V7 LEM", "striker", ... [A]

# --- geometry / mesh (existing RUNBOOK §8.2) [G] ---
expected_length_mm        : float          # official OAL; scan sanity-check gate
target_faces_min          : int            # 115000
target_faces_max          : int            # 120000
draw_axis                 : "X"|"Y"|"Z"    # long axis of the gun in the scan
draw_out_dir              : "+1"|"-1"      # extraction direction along draw_axis
split_plane_normal        : tuple(x,y,z)   # lateral centerline (X for this scan)
kydex_clearance_mm        : float          # default 1.0–2.0 + 0.5 springback
solidify_thickness_mm     : float          # 3.0
mold_margin_mm            : float          # 5.0
voxel_res_mm              : float          # 1.0–1.5 (keeps serrations, fast)

# --- anatomy: top protrusion [A] ---
sight_height_z            : float          # tallest sight/optic above slide top (mm)
optic_present             : bool           # RDS mounted?
optic_height_z            : float          # optic housing height (mm) — own block

# --- anatomy: side protrusion [A] ---
control_protrusion_x      : float          # max lateral protrusion of controls (mm)
control_side              : "left"|"right"|"both"  # which side the levers protrude
slide_width_mm            : float          # slide-only width (frame is wider)

# --- anatomy: axial / muzzle [A] ---
barrel_protrusion_y       : float          # threaded barrel / comp past slide (mm)
muzzle_open               : bool           # True = open front (threaded/light guns)
barrel_thread             : str|"none"     # "M16x1 LH", "1/2x28", "13.5x1 LH", "none"

# --- anatomy: down / trigger guard [A] ---
trigger_guard_drop_z      : float          # guard floor below frame (mm)
enclosed                  : bool           # True (trigger guard ALWAYS enclosed)

# --- anatomy: grip (HUMAN-CONFIRMED) [H] ---
grip_cut_z                : float          # holster-mouth plane Z in scan coords
backstrap                 : "S"|"M"|"L"    # conservative = L (widest grip)

# --- accessories [A] ---
weapon_light_present      : bool           # mounted light? (becomes primary retention)
muzzle_device_present     : bool           # comp / brake / suppressor mounted?
```

**For the HK45 Tactical (filled from this research):**
```python
"hk45-tactical": {
    "gun_id": "hk45-tactical", "caliber": ".45 ACP", "variant": "V1 DA/SA (or V7 LEM)",
    "expected_length_mm": 215.9, "target_faces_min": 115000, "target_faces_max": 120000,
    "draw_axis": "Y", "draw_out_dir": "+1", "split_plane_normal": (1,0,0),
    "kydex_clearance_mm": 1.0, "solidify_thickness_mm": 3.0, "mold_margin_mm": 5.0, "voxel_res_mm": 1.2,
    "sight_height_z": 8.0, "optic_present": False, "optic_height_z": 0.0,
    "control_protrusion_x": 3.5, "control_side": "both", "slide_width_mm": 32.0,
    "barrel_protrusion_y": 18.8, "muzzle_open": True, "barrel_thread": "M16x1 LH",
    "trigger_guard_drop_z": 25.0, "enclosed": True,
    "grip_cut_z": -20.0, "backstrap": "L",
    "weapon_light_present": False, "muzzle_device_present": False,
}
```
(The `grip_cut_z` and backstrap are the only fields needing René confirmation; the rest derive from
the spec sheet + scan.)

### B.5 Coordinate-frame mapping (research → scan)

Research gives real-world dimensions; the scan has its own coordinate frame. The mapping:
1. **Draw axis = long axis.** For the HK45T scan this is **Y** (muzzle at low-Y ≈ −135, grip/rear at
   high-Y ≈ +87). Draw-OUT is **+Y** (toward grip). Set `draw_axis` + `draw_out_dir` from the scan,
   not from the spec sheet.
2. **Up = Z** (sights +Z, grip hangs −Z). Lateral = X.
3. **Align by OAL.** Match the scan's draw-axis span to `expected_length_mm`. The +5.8 mm on the
   HK45T (221.7 vs 215.9) is the thread protector — expected. If the delta is unexplained, stop.
4. **Landmarks for orientation:** muzzle (threaded barrel = forward), trigger guard (sets the grip-
   cut plane), ejection port (RIGHT side → confirms lateral handedness). Use these to verify the scan
   isn't mirrored or rotated.
5. **Record grip_cut_z, sight_height_z, control_protrusion_x, trigger_guard_drop_z in SCAN units
   (mm, scan frame), not real-world** — they're consumed by the blocking sweep in scan space.

### B.6 Online-verification discipline (applies to every gun)

- ≥2 primary sources (manufacturer official + manual) for OAL, height, width, barrel, weight, thread.
- Wikipedia is corroborating, NEVER the only dimension source (it stales; community-edited).
- Forums (HKPRO, Reddit, world.guns.ru) are for variant/trigger disambiguation only, not dimensions.
- For thread pitch specifically: the manual is authoritative; forums commonly confuse RH/LH across
  related models (the HK45T-vs-MK23 confusion is a live example). Always cite the manual.
- Re-verify before each new gun — the web stales and models get revised (e.g. "Gen 5" dims differ
  from "Gen 3"). Record the verification date in the anatomy note.

---

## SOURCES

**Primary [P]:**
1. HK-USA, *HK45 Tactical product page* — `https://hk-usa.com/product/hk45-tactical/` (spec table: OAL 8.50 in, height 5.91 in, width 1.54 in, barrel 5.20 in, sight radius 6.63 in, weight 31.20 oz w/ empty mag; V1 + V7 SKUs; M16x1 LH).
2. HK-USA, *HK45 Series Operator's Manual* (May 2025) — `https://hk-usa.com/wp-content/uploads/2025/05/HK45-Series-Operators-Manual-5.12.25.pdf` (M16x1 LH, backstraps, 10-rd steel mag, variant system).
3. Heckler & Koch global, *HK45 product page* — `https://www.heckler-koch.com/en/Products/Hunting%20and%20Sport/Pistols/HK45` ("M16x1LH thread for mounting a silencer").

**Secondary [S]:**
4. Wikipedia, *Heckler & Koch HK45* — `https://en.wikipedia.org/wiki/Heckler_%26_Koch_HK45` (884 g loaded, 10+1, variant history, JSCP origin).
5. HKPRO forum, *HK45C variants explained* — `https://www.hkpro.com/threads/hk45c-different-versions-variants-explain-it-to-me.148235/` (V1–V9 / LEM mapping).
6. HKParts, *HK barrel thread pitch guide* — `https://hkparts.net/blog/hk-barrel-thread-pitch-guide/` (M16x1 LH for HK45/T/CT; RH for MK23).
7. Lucky Gunner, *The HK LEM trigger explained* (LEM = DA-only, no safety/decocker).

**Local (this repo):**
8. `02_RESOURCES/RESEARCH/hk45-gun-anatomy-and-blocking-theory-2026-06-23.md` — the scan cross-check + prefix-union blocking theory (cited HK-USA + Wikipedia, 2026-06-23).
9. `_SYSTEM/blender/RUNBOOK.md` §8.2 — the `GUN_PARAMS` registry this procedure extends.
10. `01_PROJECTS/blender-department/hk-45-holster/README.md` — René's manual workflow + ground-truth files.
