# HK45 Tactical Anatomy + Holster-Blocking Theory (gun-agnostic) — 2026-06-23

Reference for the Blender Department holster-mold automation (custom-gear.ch, René Spatz). Purpose:
**understand the real object + the general craft so the blocking pipeline replicates onto ANY gun scan.**
Two cited Sonnet research lanes + cross-check against the actual scan (`HK45_block_prep`, 118,495 polys).
[P]=primary/authoritative. Advisory until locally verified; local execution stays ground truth.

## 1. What the object IS — HK45 Tactical (V1), validated vs scan

Published specs (HK-USA + Wikipedia, in→mm ×25.4):

| Spec | HK45 std | HK45 **Tactical** | Scan (`HK45_block_prep`) | Verdict |
|---|---|---|---|---|
| Overall length | 204 mm (8.03") | **215.9 mm (8.50")** | **221.7 mm** (Y span) | +6mm = thread-protector cap + scan tol ✓ |
| Height | 150 mm to sight tops / **144 mm to slide top** | same frame | **144.2 mm** (Z span) | matches slide-top figure ✓ (sights add the rest) |
| Width (over controls) | 39.1 mm (1.54") | same | **37.3 mm** (X span) | scan ~2mm under = ambi controls are the widest point ✓ |
| Barrel | 113 mm (4.46") | **132 mm (5.20")** | muzzle = −Y end | Tactical barrel protrudes ~18.8 mm past slide |
| Sight radius | 168 mm | 168 mm | — | — |
| Weight / cap | 884 g / 10+1 | 884 g / 10+1 | — | — |

**Conclusion: the scan IS a real HK45 Tactical at correct mm scale and orientation.** The +6mm length and
the 144-vs-150 height both reconcile cleanly (thread cap; sight-height reference). This cross-check is the
unit-scale sanity gate from the risk list — PASSED.

HK45T specifics [P, 2-source]: factory thread **M16×1 LH** (NOT .578×28 — that's aftermarket); O-ring barrel;
**tall suppressor-height / co-witness sights** (Truglo adjustable, tritium) — the reason sights are a real catch
point; **no factory optic cut**; ambi by design.

## 2. Feature layout → mapped to scan coordinates

Scan axes: **Y = draw/long axis** (muzzle −Y≈−135 → grip/rear +Y≈+87), **Z = up** (sights +Z≈+53, grip hangs
−Z≈−91), **X = lateral** (±~21 over controls). Gun **draws OUT toward +Y** (rear/grip), inserts toward −Y.

| Feature | Long. pos | Protrudes | Scan slab evidence |
|---|---|---|---|
| Threaded muzzle | front (−Y) | forward (axial) | YBIN0: Z[16..49] X[−12..11], no grip below = barrel only |
| Accessory rail (Picatinny, ~4 slot) | under dust cover, fwd of trigger | down/lateral within frame | YBIN1–3 |
| Front sight (tall) | top, fwd third | **up (+Z)** | top Z≈+49 |
| Front + rear slide serrations | fwd & rear of slide | lateral (friction) | both sides of slide |
| Takedown lever | dust-cover/guard junction | **lateral (left)** | mid |
| Slide stop/release (ambi) | frame, fwd of rear serr | **lateral (both)** | YBIN6–7 X→±17..21 |
| Mag release (ambi paddle) | rear of trigger guard | lateral (both) | YBIN5–6 |
| Safety/decocker (V1) | frame above guard | lateral (left) | mid |
| Ejection port + extractor | mid-rear slide | **RIGHT side lip** = #1 snag | right of slide |
| Rear sight (tall U) | top, rear | **up (+Z)** | top Z≈+53 (YBIN8–9) |
| Beavertail/tang | slide-frame rear junction | rear/up | YBIN8–9 |
| Grip + backstrap | rear (+Y), hangs down | exposed | YBIN7–9 Z down to −91 |

## 3. What "blocking" IS — general theory (any pistol) [P]

Goal: build a **mold (positive)** for thermoforming a Kydex holster. **Blocking = a smooth channel running the
full length** that bridges every protruding feature so the gun slides in/out along the draw axis without catching.
A missed point = BAD (René's acceptance criteria).

**Catch points a channel MUST bridge** (gun-agnostic): front sight, rear sight, RDS/optic (taller — own block),
slide serrations, **ejection-port lip (worst offender — fill flat)**, extractor, slide stop, takedown lever,
mag release, safety/decocker, beavertail, rail edges, **threaded barrel/comp/muzzle device**, mounted light/laser
(if present, the light *becomes* the primary retention contact, not the trigger guard).

**Exposed vs covered:** grip + backstrap = **exposed** above the holster mouth ("belt line"). **Trigger guard =
MUST be fully covered** (safety absolute; also the retention-detent location). Belt line ≈ **5–15 mm below the top
of the trigger guard** (maker judgment, not a fixed number → parameter). Threaded-barrel guns → **open muzzle**
(no front cap), but the blocking still bridges the barrel's radial protrusion so it ramps.

**Channel geometry — the core principle (independently confirmed):** the cavity cross-section must be **monotonic
along the draw-out direction** — at every slice it must contain everything in front of it that has to pass through
on the way out. Formally = **prefix-union swept silhouette**: section(Y) ⊇ ∪ of all gun sections from the muzzle up
to Y. This is the *minimum* non-catching channel. It is NOT a convex hull (a hull over-fills the bore, ejection
port interior, trigger-guard hollow → too bulky, kills the trigger-guard detent) and NOT a constant-section prism
(wastes material). The taper in René's GOOD example — slim at muzzle, full-height at rear — is exactly the
prefix-union signature. **This is our improvement over the naïve approaches and over a manual per-feature block.**

## 4. Kydex thermoforming tolerances [P, Kydex-T datasheet]

- Sheet: 0.060" (1.52 mm) / 0.080" (2.03 mm); IWB ≥0.080", OWB ≥0.093" (2.36 mm).
- Forming temp 165–196 °C (PLA molds melt — use PETG/ASA/PC + aluminum tape); cool under pressure 5–15 min.
- Mold shrinkage 0.4–0.8%.
- **Clearance: no universal published number.** Pros form onto the taped gun (~0.05–0.3 mm of tape) and set
  retention with screws post-form. René/brief spec **≈2 mm clearance + 0.5 mm spring-back** → treat as the default
  `offset_thickness` knob; pro practice says it can go tighter (tune on retention feel). Expose, don't hardcode.

## 5. Two-half mold — split convention [P]

**Lateral centerline split**: parting plane through the long + bore axis, dividing **left | right** (normal =
scan **X**), mirroring the gun's bilateral symmetry. Confirmed universal. Rationale: gun is asymmetric laterally
(ejection port right, controls left); each half releases cleanly in one lateral direction; the flat-filled
ejection port removes the worst undercut. Draft 1–3° on channel walls/blocked edges aids release.
NB: René's doc says "split along the **Y**-axis" — that is his name for *the seam runs lengthwise (along Y)*; the
actual **cut-plane normal is lateral (X)**, per his image9/image10. Build on X.

## 6. GENERALIZATION — parameters for a gun-agnostic blocking script

```
draw_axis            : long axis of the gun           (this scan: Y)
draw_out_dir         : extraction direction           (this scan: +Y, toward grip/rear)
offset_thickness_mm  : outward clearance on channel   (default 2.0 + 0.5 springback; tune by retention)
grip_cut             : holster-mouth plane; above=exposed grip, below=enclosed
                       (≈ trigger-guard-bottom − 5..15 mm; human-confirmed per gun)
split_plane_normal   : lateral centerline             (this scan: X, at mass-center X)
sight_bridge         : channel must clear tallest sight/optic (auto from prefix-union; RDS = taller knob)
voxel_res_mm         : sweep/voxel resolution (1.0–1.5 mm keeps serrations, fast)
keep_features        : trigger guard ALWAYS covered; grip ALWAYS exposed
```

Per-gun, only a few knobs change: **draw axis + out-direction** (from scan orientation), **grip-cut height**
(human-confirmed), **offset** (retention feel), **optic present?** (taller sight bridge). The prefix-union sweep
itself is feature-agnostic — it bridges whatever protrudes, so it ports to any pistol scan without per-feature
modeling. That is the whole point: **don't model "a sight"; sweep the silhouette and every protrusion is handled.**

## Sources
HK-USA HK45 Tactical / HK45 product pages · en.wikipedia.org/wiki/Heckler_%26_Koch_HK45 · hkparts.net thread guide ·
gun-tests.com HK45T review · heckler-koch.com · Kydex-T datasheet (kydex.com / rapidmade) · The Armory Life,
Triangle Tactical, Vedder, PHLster (retention/click), Knightfall Customs + Cults3D BranchWorks3D (prepped CAD mold
block list) · USPTO US10393477 (retention geometry). Full URLs in session research lanes (2026-06-23).
