# HK45 Tactical — Lower-Front Subsystem (Frame · Rail · Trigger)

Anatomy research for the automated Kydex holster-BLOCKING pipeline. Scope: the polymer
lower/receiver forward of the grip — frame, dust cover, accessory rail, trigger guard, trigger.
Magazine release is covered by another agent (not here).

**Orientation key** (matches scan `HK45_block_prep`, dims 37.3 W × 221.7 L × 144.2 H mm, centered):
muzzle = LOW Y, grip = HIGH Y, draw axis = Y, slide = top (high Z), trigger guard hangs DOWN (low Z),
width = X. All mm-from-muzzle figures are APPROXIMATE, derived from published OAL/barrel + the scan,
not from an armorer blueprint (see UNVERIFIABLE at end).

Primary sources: HK-USA operator's manual (PDF, verbatim quotes below), HK-USA product page,
Wikipedia HK45. Editorial: Handguns Magazine, Lucky Gunner. Local: `BLOCKING-BUILD-LOG.md`
(scan + the decoded CAD-blocking answer key `HK45_CAD`).

---

## 1. Polymer frame / receiver (lower)

- **Location:** the full lower assembly; spans the entire gun length. Polymer with steel inserts cast
  in during molding (slide rides on the metal inserts). [manual §Frame]
- **Parting line (frame↔slide):** runs longitudinally along both sides, roughly at the Z-height where the
  slide's lower rail-groove meets the frame's upper rail-crest. In scan/build-log coordinates this is the
  flat "roof" region around Z82.3 (build-log: "Roof flat Z82.3 full length"); the slide/block sits above,
  the frame below. The parting line is a retention-IRRELEVANT seam (smooth, no snag) — no blocking needed
  for the seam itself, but the build-log adds it as a *visual detail* on the clone for fidelity.
- **Shape/size:** one-piece molded; finger recesses left/right of the magazine well; ergonomic grip with
  interchangeable backstraps. OAL 204 mm (Wikipedia), height 144 mm, width 39 mm. [manual + Wikipedia]
- **Mechanism:** static structural lower; houses trigger group, hammer, magazine, slide rails.
- **Holster-retention relevance:** the frame's external geometry sets the holster's inner cavity wall.
  The grip is CUT OFF at the holster mouth (grip stays exposed); the frame forward of the grip (dust cover,
  trigger guard, rail) is the blocked region. **Retention points on the frame = the trigger-guard loop and
  the rail-slot undercuts** (see §3, §4). The frame itself is smooth polymer — no inherent snag.
- **Block/tunnel:** frame block in the build = a smooth beveled box matching the frame's outer silhouette
  from the front of the grip forward; boolean-union with dust-cover, trigger-fill, and barrel blocks
  (build-log `HK45_blocking_v3`).

## 2. Dust cover (frame extension forward of the trigger guard)

- **Location:** the polymer frame section extending FORWARD from the trigger guard, UNDER the front of the
  slide/barrel, terminating at the muzzle end of the frame (the slide/barrel protrude further forward than
  the dust cover on the Tactical due to the extended threaded barrel). Roughly the forward ~40–55 mm of
  the lower ahead of the trigger guard (estimate from OAL/geometry, not a published spec — see UNVERIFIABLE).
- **Shape/size:** a flat-bottomed, forward-tapering polymer box, beveled on the sides. Carries the
  accessory rail on its underside (see §3). Build-log: "beveled box under slide front."
- **Mechanism:** static; houses no moving parts. Its job structurally is to carry the rail and close the
  frame's lower forward end.
- **Holster-retention relevance:** the dust-cover SIDES are smooth (no snag). The retention hazard is
  entirely the rail slots on its underside (§3). The dust-cover bottom sets the lower-forward belly contour
  of the holster ahead of the trigger guard.
- **Block/tunnel:** dust-cover block = beveled box matching the silhouette; rail edges flat-blocked
  (build-log table). **The rail-slot undercuts on the dust-cover bottom MUST be filled** (§3).

## 3. Picatinny / MIL-STD-1913 accessory rail

- **Location:** integral rail MOLDED INTO the polymer dust-cover underside, running fore-aft under the dust
  cover. Verbatim (manual): *"a MIL-STD-1913 'Picatinny' accessory rail is incorporated into the dust cover
  on the polymer frame"*; *"Integral MIL STD 1913 (Picatinny) rail molded into the polymer frame dust cover
  for mounting lights, laser aimers, and other accessories."*
- **Slot count — FULL-SIZE HK45 = 4 slots** (Compact HK45C = 3 slots). [manual, via secondary
  confirmation — the manual text I extracted describes the rail but the "4 slots" figure is corroborated
  by the updated 2025 manual + retailer imagery; see UNVERIFIABLE note]. Rated to 5.6 oz / 160 g accessory.
- **Shape/size:** standard 1913 profile — a series of transverse undercut slots (square cross-section
  notches) with a flat rail bed between them. Slot pitch per MIL-STD-1913 = 5.0 mm recurring. Slots are
  UNDERCUT (the T-slot cross-section grabs an accessory clamp) — this undercut is the retention hazard.
- **Mechanism:** a clamp-on accessory (light/laser) slides on and latches into a slot's undercut.
- **Holster-retention relevance — CRITICAL FILL TARGET.** The rail slots are downward-facing undercut
  cavities. On a holster draw, Kydex could lip into a slot and catch. Per the task spec and build-log,
  **all rail-slot undercuts must be FILLED/SMOOTHED in the mold** — the build-log table: "rail edges
  flat-blocked." The mold surface over the rail region should be a smooth flat (or gently belly-curved)
  plane, not the slotted original.
- **Block/tunnel:** fill the slot row with a flat plane bridging the slot openings (build-log:
  "rail Z34 (front)" — the rail sits low-Z, forward). No tunnel needed here (rail is not a draw-axis
  through-hole); it's a fill-and-smooth op.

## 4. Trigger guard

- **Location:** hangs DOWNWARD (low Z) from the frame, immediately FORWARD of the grip and REAR of the
  dust cover. It is the lowest point of the lower-forward assembly and therefore **sets the lowest point
  of the holster belly** in the trigger-guard region.
- **Shape:** described in the manual as large (to accommodate gloved hands) and flared at the bottom
  to shield the trigger. The HK45 trigger guard is a roughly **rectangular/squared loop** (not oval) with
  a slightly flared/front-swept front edge; retailer spec notes a "serrated trigger guard" (front strap
  serrations for support-hand index). [manual: "large," "flared on the bottom to shield the trigger";
  retailer: "serrated trigger guard"]
- **Size:** the LOOP fully encloses the trigger. Approximate internal span: wide enough for a gloved
  trigger finger (~25–35 mm internal width, estimate). Vertical drop below the frame rail: this is the
  geometry that sets the holster belly lowest point — in scan coords the guard reaches the lowest Z of the
  blocked region (build-log: trigger guard region around Z3.3, ramping from the dust-cover belly).
  **Exact loop dimensions not published** — derive from the scan (`HK45_block_prep`) for the mold.
- **Mechanism:** static shield; its only "function" is to prevent anything entering the trigger area
  from outside the loop.
- **Holster-retention relevance — PRIMARY BELLY DEFINER + SAFETY LOOP.** (a) The guard's downward extent
  sets the holster's lowest belly curve in the mid-gun region. (b) The guard forms an ENCLOSED LOOP around
  the trigger — the mold must reproduce this loop as an **enclosed cutout** (build-log table: "Trigger-guard
  | block + enclosed loop cutout | trigger guard must be covered (safety)"). See §5 for the safety logic.
- **Block/tunnel:** build-log v3 currently SOLID-FILLS the trigger guard (vertical raycast = exactly 2
  surface crossings — i.e. the loop is filled, not pierced). Remaining-fidelity item: model the exact
  trigger-guard LOOP outline (an enclosed tunnel through which the trigger is visible but not accessible
  to Kydex), not a solid blob.

## 5. Trigger (and the enclosed-cutout safety requirement)

- **Location:** inside the trigger-guard loop, pivoting on a pin in the frame, directly above/behind the
  guard's front-upper region. Manual nomenclature: *"TRIGGER — Located in the trigger guard."*
- **Shape/size:** a curved face trigger (HK45 pattern), pivoting. Travel distance: DAO-class long take-up
  (LEM) — see variants below.
- **Variants (HK45 trigger systems):**
  - **LEM (Law Enforcement Modification) — the DAO/pre-cocked system.** Verbatim (manual): *"The LEM is a
    series of unique trigger parts created specifically to improve the quality and reduce the weight of the
    Double-Action Only trigger pull... With these parts installed, the HK45 Pistol can be fired like a
    standard DAO pistol where every round is fired by simply pulling the trigger fully rearward with the
    hammer starting at the forward rest position."* Two-piece hammer (external visible bobbed hammer +
    internal cocking piece); the slide passing over the hammer pre-cocks the hammer spring, so the trigger
    pull is light despite a strong hammer spring. *"LEM (DAO) pistols have bobbed hammers."*
    - **Light LEM:** ~4.5–5.5 lb pull (manual: *"An optional 4.5-5.5 pound trigger pull is also available
      for the HK45 LEM model"*). This is the V7 LEM DAO variant listed for the HK45 Tactical.
    - **Standard LEM / DAO:** ~7.5–8.5 lb pull (manual: *"the weight of the DAO trigger pull has been
      reduced to 7.5-8.5 pounds when new"*).
  - **DA/SA (traditional):** a double/single-action variant with external decocker/safety lever (available
    as an option; the Tactical ships LEM V7 by default per retailer listings).
  - **Failure-mode fallback:** if a round fails to fire and the slide does NOT cycle, the LEM falls back to
    a true DAO pull (operator must fully compress the hammer strut spring via the trigger) — manual §LEM.
- **Mechanism (LEM):** pre-cocked hammer-fired DAO. Slide recoil cocks the internal cocking piece; trigger
  releases the pre-cocked hammer. Every shot is the same pull weight/travel (constant from first to last
  round). No external decocker/safety required (optional).
- **Holster-retention relevance — #1 SAFETY ITEM. THE TRIGGER MUST BE FULLY COVERED/ENCLOSED BY THE
  BLOCKING. NO KYDEX MAY REACH THE TRIGGER.**
  - **Why:** the trigger is the only thing that fires the gun. A holster that leaves Kydex exposed into the
    trigger area risks (a) snagging the trigger on draw/reholster → negligent discharge, and (b) debris/
    cord/finger ingress. The LEM's pre-cocked DAO nature means a trigger pull of ~4.5 lb (Light) will fire
    the chambered round — there is no manual safety to save you on the default V7. The trigger guard's job
    is to make the trigger unreachable from outside its loop; the holster's job is to preserve that.
  - **The enclosed-cutout requirement:** the mold's trigger-guard region must be an **enclosed tunnel/cutout
    that mirrors the trigger guard loop** — the trigger is visible through the loop but the Kydex forms a
    continuous shield AROUND the loop, never crossing into it. Build-log table: *"Trigger-guard | block +
    enclosed loop cutout | trigger guard must be covered (safety)."* A SOLID fill (v3 current state) is
    geometrically safe but loses the loop definition; the target is the loop reproduced as an enclosed
    through-tunnel so the Kydex shell wraps the guard's exterior while leaving the guard's interior hollow.
  - **Draw-axis consequence:** the trigger guard is NOT a retention point (the gun is not held by the guard);
    it is a SAFETY-EXCLUSION zone. The blocking covers it completely on the exterior; the "cutout" is the
    negative space inside the guard, preserved as a void.

## 6. Where the front of the trigger guard meets the magazine release (boundary note)

- The HK45 has an **extended ambidextrous magazine release lever** shielded by the trigger-guard design.
  Verbatim (manual): *"the HK45 has an extended ambidextrous magazine release lever which is shielded from
  inadvertent actuation by the design of the trigger guard."* The mag release sits at the **rear-upper
  junction of the trigger guard and the grip frame** (the "trigger guard to grip" transition, above/behind
  the guard loop). The front of the trigger guard meets the frame/dust-cover junction (forward); the mag
  release is at the GUARD'S REAR junction with the grip. **Mag-release handling is another agent's scope**;
  this section only notes the seam so this agent's trigger-guard block does not collide with the mag-release
  block at that rear junction.

---

## SUMMARY (retention-critical takeaways for the blocking pipeline)

1. **Trigger-guard loop = holster belly lowest point + safety enclosure.** The guard hangs lowest in the
   mid-gun region and sets the belly curve. The mold must reproduce the guard as an **enclosed cutout**:
   Kydex wraps the guard exterior, the trigger stays inside the void, NO Kydez crosses into the trigger
   space. This is the #1 safety item — the LEM V7 has no manual safety and fires on a ~4.5 lb pull.
   Derive exact loop dims from the scan, not specs (unpublished).
2. **Rail slots = FILL target, not a tunnel.** The dust-cover underside carries a **MIL-STD-1913 rail with
   4 slots (full-size HK45; Compact has 3)**. The slot undercuts face down and would catch Kydex on draw.
   Fill/flat-block the entire rail region to a smooth plane. Build-log: "rail edges flat-blocked," rail
   sits low-Z forward (Z34 front).
3. **Dust-cover length ≈ forward 40–55 mm of the lower ahead of the trigger guard** (estimate; not a
   published spec). It's a smooth beveled box — only its rail underside is a retention hazard.
4. **Frame/dust-cover sides are smooth — no snag, no fill needed** beyond silhouette matching. Frame↔slide
   parting line is a non-retention visual seam (build-log adds it for clone fidelity only).
5. **Mag-release seam:** front of trigger guard meets frame/dust-cover junction (forward); the ambidextrous
   mag release is at the guard's REAR junction with the grip — out of this agent's scope, but the trigger-
   guard block must not collide with the mag-release block there.

## UNVERIFIABLE / flagged

- **Exact number of rail slots:** the 2023 manual text I extracted describes the rail but does not state
  "4 slots" in the verbatim passage; the figure is corroborated by the updated 2025 manual + retailer
  imagery (full-size = 4, Compact = 3). **Confirm against the physical gun or `HK45_CAD` scan** before
  locking the mold.
- **Exact dust-cover length, trigger-guard loop internal dimensions, and slot positions (mm-from-muzzle):**
  not in any published spec located. **Derive from the scan** (`HK45_block_prep`, 37.3×221.7×144.2 mm) or
  the answer-key `HK45_CAD` for mold-accurate values. The build-log already raycasts the scan for belly-Z
  (trigger region ~Z3.3) — use those measurements, not the estimates here.
- **Barrel length discrepancy:** Wikipedia lists 113 mm barrel for the base HK45; the Tactical has a
  threaded extension (M16×1 LH per build-log, R2 research) making the protruding barrel longer. OAL 204 mm
  (Wikipedia) vs scan L=221.7 mm — the scan includes the threaded muzzle/sights; use the scan for mold
  geometry, published OAL for sanity-check only.

## SOURCES

- [HK45 / HK45 Compact Operator's Manual (PDF, 2021)](https://hk-usa.com/wp-content/uploads/2023/10/HK45-Series-Operators-Manual-MAY-11-2021.pdf) — verbatim quotes on rail, frame, trigger, LEM, mag release. Downloaded to `/tmp/hk45_manual.pdf`.
- [HK45 Series Operator's Manual (updated 2025)](https://hk-usa.com/wp-content/uploads/2025/05/HK45-Series-Operators-Manual-5.12.25.pdf) — slot-count + accessory-weight corroboration.
- [HK USA — HK45 Tactical product page](https://hk-usa.com/product/hk45-tactical/) — Picatinny 1913 rail molded into polymer frame, 10-round mag, threaded barrel.
- [Wikipedia — Heckler & Koch HK45](https://en.wikipedia.org/wiki/Heckler_%26_Koch_HK45) — OAL 204 mm, barrel 113 mm, width 39 mm, height 144 mm.
- [Handguns Magazine — Review: Heckler & Koch HK45 LEM](https://www.handgunsmag.com/editorial/review-heckler-koch-hk45-lem/138229) — Light LEM 4.5–5.5 lb, Heavy 7.5–8.5 lb.
- [Lucky Gunner — The HK LEM trigger explained](https://www.luckygunner.com/lounge/hks-weird-trigger-system-and-the-p30sk/) — pre-cocked DAO mechanism.
- [HKPRO Forums — LEM, Light LEM and DAO](https://www.hkpro.com/threads/lem-light-lem-and-dao.152147/) — LEM vs SA pull-weight discussion.
- Local: `_SYSTEM/blender/BLOCKING-BUILD-LOG.md` — scan `HK45_block_prep` (37.3×221.7×144.2 mm, 95564V/118495F), decoded CAD answer-key `HK45_CAD`, part-decomposition table, Z-heights (rail Z34 front, trigger region Z3.3, roof Z82.3).
- Local: `02_RESOURCES/RESEARCH/claude-blender-holster-blocking-2026-06-23.md` — holster-blocking process + retention-point philosophy (directional silhouette sweep, not convex hull).
