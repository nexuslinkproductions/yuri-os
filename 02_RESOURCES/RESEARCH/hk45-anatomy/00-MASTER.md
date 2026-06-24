# HK45 Tactical — Master Anatomy & Tunnel-Build Spec

Synthesis index for the holster-blocking engineering. Research → build bridge.
Living doc. Sources + detail in the per-part files (cross-linked). Verify values against the live scan before locking offsets.

## File index (this research program)
- `01-slide-sights-barrel.md` — slide, front/rear sights (suppressor-height), serrations, M16×1 LH threaded barrel, thread protector. ✅
- `02-frame-rail-trigger.md` — polymer frame, dust cover, Picatinny rail, trigger guard loop, LEM/DA trigger. ⏳ (pending)
- `03-controls-ambi.md` — ambi slide stop, paddle mag release, variant safety/decocker, hammer, ejection port. ✅
- `04-grip-specs-procedure.md` — verified HK45T specs + variants + the reusable any-gun anatomy-research PROCEDURE + the part→tunnel decision table. ✅

## Part → tunnel decision table (THE reusable any-gun artifact — from 04)

| Feature category | Direction | Blocking operation |
|---|---|---|
| Sights / RDS / beavertail / hammer | TOP / +Z / rear | sight-bore / roof tunnel — clear the TALLEST, full draw-axis |
| Slide-stop / safety / takedown / mag-release / serrations | SIDE ±X | side clearance tunnel to ±X max (both halves if ambi) |
| Ejection port / extractor / rail slots | UNDERCUT (inward) | FILL smooth — do not hull into hollows |
| Trigger guard loop | DOWN −Z | enclose fully (retention + trigger safety) |
| Threaded barrel / comp / muzzle device | AXIAL forward | open muzzle + radial ramp |
| Weapon light (if mounted) | DOWN/side | enclose light body (becomes primary retention) |
| Grip + backstrap + magazine | GRIP (rear) | CUT at holster mouth |

## Verified geometry (scan-frame, origin; muzzle=−Y, grip=+Y, slide=+Z, draw-axis=Y)
- Envelope (matches father CAD HK45_CAD): **37.6 × 218 × 82 mm** (grip cut). With grip: z to −91 (≈144 tall).
- Slide crown baseline (median scan zmax, slide region) = **47.8**; sight-bore roof = **53.25** (CAD flat roof, ≈ front-sight +6mm; rear sight per scan ≈ same — use scan-max, not the general "rear tallest" rule).
- Barrel: M16×1 **LH**, protrudes **~18.8–19 mm** past slide front (front-bore tunnel length).
- Width-over-controls = **39.1 mm (±18.8)** — ambi slide stop is the widest point.
- Grip cut: ~71 mm removed; `grip_cut_z` ≈ −29 (trigger-guard bottom), human-confirmed per René GOOD/BAD.

## v5 BUILD SPEC (research-grounded, per-feature tunnels) — blocks scan, references CAD
Start from clean multi-part blockout (HK45_blocking_v4 base; silhouette already Δ≤2mm). ADD the real per-feature tunnel layer:

1. **Sight-bore roof** — flat slab at z=53.25, full draw-axis (Y −136→+82), span slide width. *(v4 slide already does this — keep.)*
2. **Crowned slide top** — bevel the slide-top edges to CAD profile (crown 53 → sides 46 across width). *(v4 currently flat box top — refine.)*
3. **Barrel front bore** — cylinder ~16mm OD, protrude 18.8mm past slide front. *(v4 has it — verify length.)*
4. **Ambi slide-stop side tunnels** — BOTH sides, control region (Y ≈ −15→+25, above/aft trigger guard), wall offset to **±18.8**. *(v4 frame is ±16.5 → widen to ±18.8 in this Y-band; matches CAD widest.)*
5. **Paddle mag-release clearance** — both sides, rear of trigger guard junction, within ±18.8 envelope.
6. **Safety tunnel (VARIANT)** — V1/V3/V9: LEFT-side nub tunnel ~3mm proud at Y≈slide-stop station. **V7 LEM: omit.** *(Assume V1 for this scan — has ambi lever.)*
7. **Ejection-port fill** — RIGHT side, mid-rear slide; extend/fill right wall past the port lip (#1 snag).
8. **Hammer / rear roof tunnel** — rear (+Y) roof over the beavertail. *(v4 rear blocks handle it.)*
9. **Trigger-guard enclosure** — fill the loop solid (trigger covered) [dims pending 02]. *(v4 fills it.)*
10. **Rail-slot fill** — Picatinny undercuts under dust cover filled smooth [slot count pending 02].
11. **Grip cut** — remove z<−29.3. *(v4 does it.)*
12. **Crisp pass** — bevel + weighted-normal + shade_auto_smooth (NO voxel — it rounds). *(v4 does it.)*

## Variant flag (load-bearing for René)
- "Tactical" = barrel+sight config, NOT a trigger variant. Sold as **V1 (DA/SA, left safety/decock)** or **V7 (LEM, no manual safety)**.
- Scanned gun ⇒ **V1** (ambi lever present). V7 would drop the left-safety tunnel (step 6).
- Thread **M16×1 LH** — a RH suppressor cross-threads an HK45T (RH is the Mark 23). Matters for any suppressor-can retention, not for blocking.

## Architecture: BLENDER-ONLY (owner directive 2026-06-24)
René currently uses Blender (prep) + FreeCAD/Shapr3D (blocking). Goal: **do it all in Blender alone.** Achievable because:
- Full pipeline is Blender-native: scan → `holster_prep_phase1.py` → block (v4/v5) → split → **STL** → 3D-print (PETG/ASA).
- FreeCAD/STEP only needed for CNC-machined molds or GD&T B-rep tolerances. René 3D-prints → **STL suffices, no CAD program required.**
- The blocking CRAFT (René's FreeCAD step) is what the multi-part clean-box + tunnel method replaces in Blender. v4 proves the silhouette; v5 adds the real per-feature tunnels.
- STEP fallback (if ever needed): Blender mesh → FreeCAD Part-shape → STEP, or CAD Exchanger / STEPper addon (engineering agent E4 confirming).

## Mechanical-improvement backlog (owner: "if you figure out how to mechanically improve these molds, test it")
Prototype + test on the split halves:
1. **Alignment/registration pins + bores** between the 2 halves → precise registration under press. (adding now)
2. **Draft angles 1–3°** on draw-axis (Y) walls → clean Kydex release, no part-lock.
3. **Bell-mouth / flared muzzle entry** → gun self-guides into holster mouth.
4. **Sight channel extended past muzzle** → clean draw, no sight snag at exit.
5. **Adjustable-retention detent** (tunable bump / screw boss) → per-customer retention dial-in.
6. **Inner fillets ≥1.6mm** → no Kydex stress-whitening; **parting-line optimization** (follow gun silhouette, not flat X) → less Kydex stretch.
7. **Lattice/lightweight + print-time regions** → faster, lighter mold.

## Residual / verify-live
- Exact per-control mm not vendor-published → derive from scan at the control Y-band before locking ±18.8 (scan X maxima).
- Trigger-guard loop OD + rail slot count/location → from 02 + scan.
- `grip_cut_z` + backstrap (S/M/L, default M, conservative L) → René GOOD/BAD confirmation.
