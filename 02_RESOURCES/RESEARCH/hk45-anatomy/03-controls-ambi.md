# HK45 Tactical — External Lateral Controls (TUNNEL-CRITICAL)

Subsys of the automated Kydex holster-blocking pipeline (custom-gear.ch, René Spatz). This is the
**side-clearance-tunnel** spec: every lateral protrusion that can snag a holster on the draw becomes a
tunnel at exactly its Y-station and side, OR a mold wall that extends past it for the full draw length.

Scan orientation (matches `_SYSTEM/blender/BLOCKING-BUILD-LOG.md` + `holster_prep_phase1.py`):
- **Y** = draw/long axis. Muzzle = LOW Y (−Y end), grip/rear = HIGH Y (+Y end). Gun draws OUT toward +Y.
- **X** = lateral. LEFT side = X negative, RIGHT side = X positive.
- **Z** = up. Slide on top (+Z), grip hangs −Z.
- Scan overall: 37.3 (X) × 221.7 (Y) × 144.2 (Z) mm, 118,495 faces.

Verification: LOCAL-FIRST (existing `hk45-gun-anatomy-and-blocking-theory-2026-06-23.md` + build-log),
then ONLINE ≥2 primary sources. [P] = primary/authoritative. Advisory until verified on the live scan.

---

## 1. SIDE-CLEARANCE-TUNNEL SPEC TABLE

| # | Control | Side(s) | Y-location (rough) | Protrusion beyond body | Mechanism | Tunnel method |
|---|---|---|---|---|---|---|
| 1 | **Slide stop / release lever (AMBI)** | **BOTH (ambidextrous)** | Frame, fwd of rear serrations, directly above trigger guard. Scan YBIN6–7 (~mid-rear of slide). | Sets the gun's max width. Published width-over-controls **1.54″ / 39.1 mm** [P, HK-USA]. Scan spreads to **X ±17.6…±18.8** at this Y → lever tip ~3–5 mm proud of the frame wall on each side. **Symmetric both sides.** | Pivot lever, rotates up/in to catch slide notch on last round; push down/in to release. **Doubles as the disassembly/takedown lever** (see #4). | **Continuous side wall offset on BOTH halves** at this Y, OR a bilateral lateral channel. Wall must clear ±18.8 mm (X) minimum. This is the dominant lateral tunnel driver. |
| 2 | **Magazine release (PADDLE, AMBI)** | **BOTH (ambidextrous, one-piece)** | **Rear of trigger guard**, at the frame/guard junction (grip front). Scan YBIN5–6. Sits up *inside/behind* the trigger guard. | Modest — a paddle nub on each side, lower than the slide-stop. Within the 39 mm width envelope but below the slide-stop plane. | One-piece ambidextrous paddle; pressed DOWN (trigger-finger or thumb) on either side to drop mag. NOT a button. | **Bilateral side clearance at the trigger-guard junction**, both halves. Lower Z-band than the slide-stop tunnel; must not block paddle travel. |
| 3 | **Safety / Decocker lever** — **VARIANT-DEPENDENT** | **V1/V3/V9 = LEFT only**; V7 LEM = **NONE**; V10 = right; ambi possible (V12 etc.) | Frame-mounted, above the trigger guard, fwd of the grip (same general station as slide-stop, slightly rearward). Scan mid YBIN6. | LEFT-side protrusion only on V1. ~3 mm proud of left frame wall (same class as slide-stop lever). | Combination lever: V1 = safety + decocker (down=fire, up=safe+decock); V3 = decocker only (no safe); V9 = safety only; V7 LEM = **no lever at all**. | **Left-half side tunnel at this Y** for V1/V3/V9 guns. **OMIT for V7 LEM** (no protrusion — scan must be checked for the actual variant). Confirm variant before blocking. |
| 4 | **Takedown / disassembly lever** | **NONE — does not exist as a separate part.** | — | — | The **slide-stop lever IS the takedown lever**: slide pulled partway back → left-side slide-stop lever pulled fully outward (removed) → slide lifts off. [P, HK-USA manual + Scribd field-strip]. | **No dedicated tunnel.** The slide-stop tunnel (#1) covers it. |
| 5 | **Slide catch (last-round hold-open)** | **BOTH (ambidextrous) — same lever as #1** | Same as #1. | Same as #1. | The ambi slide-stop lever catches the slide on the last round. There is no separate slide-catch. | **Covered by #1.** |
| 6 | **Hammer (exposed, DA/SA & LEM)** | **REAR (+Y), centered** — not a lateral (X) protrusion | Rear of slide, at the beavertail/tang junction. Scan YBIN8–9. | Protrudes **rearward (+Y) and slightly up (+Z)**, not sideways. Spurred hammer (not bobbed on stock HK45). | DA/SA: cocked by slide or thumb; LEM: pre-cocked. All HK45 variants have an **exposed hammer** [P, HK manual + YT trigger-comparison]. | **Not a side tunnel.** Covered by the **rear roof/beavertail tunnel** (the +Y grip-cut region must let the hammer pass). Snag risk is on the roof/rear, not the walls. |
| 7 | Ejection port lip + extractor (non-control, but tunnel-critical) | **RIGHT (+X)** | Mid-rear slide. | Right-side lip of the ejection port is the **#1 holster-snag offender** (per blocking theory doc). | Passive (ejection), not actuated. | **Right-half mold wall extends past the port lip**, OR the port region is flat-filled in the blocking so the lip is buried. Not a side-clearance tunnel in the control sense — it's a fill/bridge. |

---

## 2. PER-CONTROL DETAIL

### 2.1 Slide stop / slide release lever — AMBIDEXTROUS (the dominant tunnel driver)
- **Side(s): BOTH.** Confirmed by HK-USA operator's manual ("ambidextrous slide release"), Police Magazine review of the HK45CT, and the existence of a separate OEM right-side ambi control lever (HKParts). Unlike the USP (ambi only via conversion), the HK45 ships ambi.
- **Location:** frame, directly above the trigger guard, fwd of the rear slide serrations. Scan evidence (build-log s2): lateral protrusions at YBIN6–7 reaching X ±17.6 / ±18.8.
- **Protrusion:** the published **1.54″ / 39.1 mm width is measured OVER the controls** [P, HK-USA spec sheet + manual]. The scan's overall X span is 37.3 mm — slightly under the 39.1 mm figure, consistent with the controls being the widest point and a small scan-tolerance shortfall. Treat **±18.8 mm (X) as the working wall-offset floor** for the slide-stop tunnel; add Kydex clearance (≈2 mm + 0.5 mm springback, per blocking theory §4) on top.
- **Mechanism:** the lever pivots; the right-side lever is sometimes reported "noisy"/loose (AR15.com owner thread) — it has a small amount of free play, which means the tunnel should have a hair of extra clearance to avoid a tight lever binding.
- **Tunnel method:** **continuous bilateral side wall** at the slide-stop Y-station, on BOTH mold halves, offset to clear ±18.8 mm + clearance. Because the gun is asymmetric laterally (ejection port right, safety left), each half is verified independently.
- **Retention relevance:** HIGH for snag; the ambi levers are the most-cited catch point on HK pistols.

### 2.2 Magazine release — AMBIDEXTROUS PADDLE (not a button)
- **Side(s): BOTH — one-piece ambidextrous paddle.** Confirmed by HK-USA manual ("one-piece magazine release located on the trigger guard… activated from either side") and community consensus.
- **Location:** at the **rear of the trigger guard**, where the guard meets the grip/frame front. Sits *up inside/behind* the trigger guard. Scan YBIN5–6.
- **Protrusion:** the paddle is a nub on each side; **lower in Z than the slide-stop** (it lives in the trigger-guard plane, not the slide plane). Within the 39 mm width envelope but not the widest feature. No vendor publishes a per-paddle mm; derive from the scan at YBIN5–6 (X extent at trigger-guard Z).
- **Mechanism:** pressed **DOWN** (toward the mag) with the trigger finger or firing-hand thumb. Travel is downward-inward, not outward — so the holster wall must clear the resting paddle nub but does not need to accommodate large outward travel.
- **Tunnel method:** **bilateral side clearance at the trigger-guard junction**, both halves, at the YBIN5–6 station. Must be paired with the **trigger-guard full coverage** (safety absolute; the guard is the retention-detent zone — per blocking theory §3). The paddle tunnel is a sub-feature of the trigger-guard region's side clearance.
- **Retention relevance:** MEDIUM-HIGH for snag (the paddle can catch a tight holster mouth); the paddle also must not be blocked from its downward travel or the operator can't drop the mag.

### 2.3 Safety / Decocker lever — VARIANT-DEPENDENT (gate the build on the variant)
- **V1 (DA/SA):** combination **safety + decocker, LEFT side only.** [P: HK-USA manual, HKParts left-side lever part, Tactical Shit + DEGuns V1 listings all confirm "left side"]. Frame-mounted, above trigger guard.
- **V3 (DA/SA):** **decocker only (no "safe" position), LEFT side.** [P: manual + Scribd]. Same physical lever location as V1, different internal function.
- **V7 (LEM):** **NO manual safety / NO decocker — no lever at all.** The long DAO trigger pull is the safety. [P: manual + forum consensus]. **This means V7 has one fewer left-side protrusion** — the blocking must be checked against the actual variant.
- **V9 / V10:** safety only, V9=left, V10=right (ambidextrous counterpart).
- **V12 (LEM):** LEM with a right-side safety lever.
- **Protrusion:** ~3 mm proud of the left frame wall (same class as the slide-stop lever); sits slightly rearward of the slide-stop, same general Y-station.
- **Mechanism:** frame-mounted combination lever; up = safe (+decock on V1/V3), down = fire.
- **Tunnel method:** **left-half side tunnel at the safety Y-station** for V1/V3/V9/V12 guns. **OMIT the dedicated safety tunnel for V7** (no protrusion) — but the slide-stop tunnel (#1) still applies on both sides. **Confirm the variant of the scanned gun before finalizing the blocking** — this is the single most likely spec to be mis-stated. The existing scan anatomy doc assumed V1; verify against the scan's left-side geometry (is there a second lever aft of the slide-stop?).
- **Retention relevance:** MEDIUM (left-side only on V1, so only the left mold half needs the tunnel; the right half's left wall is unaffected). Snag risk if the tunnel is missed.

### 2.4 Takedown / disassembly lever — DOES NOT EXIST AS A SEPARATE PART
**Critical finding.** The HK45 has **no dedicated takedown lever.** Field-stripping uses the **slide-stop lever itself** as the disassembly lever: retract the slide to the index mark, grasp the left-side slide-stop lever, pull it fully outward (remove it), slide comes off forward. [P: HK-USA operator's manual verbatim: *"As a disassembly lever, the slide release is removed from the left side of the frame when the slide is held partially rearward."* Corroborated by Scribd field-strip PDF + HKPRO forums.]

- **Tunnel implication:** **no dedicated takedown tunnel.** The slide-stop tunnel (#1) fully covers this — there is no separate protrusion to clear. (The earlier anatomy doc's "Takedown lever — lateral (left)" row conflated this with the slide-stop; corrected here.)

### 2.5 Slide catch — SAME LEVER AS THE SLIDE STOP
The ambi slide-stop lever (#1) IS the slide catch (it holds the slide open on the last round). There is no separate slide-catch lever. **Covered by #1.**

### 2.6 Hammer — EXPOSED, REAR (+Y), not lateral
- **All HK45 variants have an exposed hammer** [P: HK-USA manual + trigger-comparison sources]. DA/SA cocks on slide/thumb; LEM is pre-cocked but the hammer is still external and visible.
- **Side:** centered (not lateral/X). Protrudes **rearward (+Y) and slightly up (+Z)** at the beavertail/tang junction. Scan YBIN8–9.
- **Snag relevance:** the spurred hammer can catch a holster's rear roof on the draw, but this is a **roof/rear-tunnel** problem, not a side-clearance-tunnel problem. The hammer must pass through the rear of the blocking channel cleanly.
- **Tunnel method:** the **rear roof tunnel / beavertail channel** (YBIN8–9) must be tall and long enough for the hammer's rear+up profile. This is in the grip-cut region (above the holster mouth, the grip is exposed), so the hammer clearance is partly in the exposed zone — verify the holster mouth doesn't clip the hammer.
- **Retention relevance:** MEDIUM (rear/roof, not wall).

### 2.7 Ejection port lip + extractor — RIGHT side, #1 overall snag (not a control, but tunnel-critical)
Not an actuated control, but per the blocking-theory doc it's the single worst holster-snag feature on most pistols. The HK45's ejection port is on the **RIGHT (+X)**, with the extractor forming a right-side lip. Per blocking theory §3 + build-log s3, the standard handling is to **flat-fill the port region in the blocking** so the lip is buried, rather than tunnel around it. The right mold half's inner wall must extend past the port lip at the mid-rear-slide Y-station.

---

## 3. NOTES FOR THE BLOCKING BUILD

1. **Two bilateral tunnel drivers** (both need wall offset on BOTH halves): slide-stop (#1) and mag-release paddle (#2).
2. **One left-only tunnel driver** (V1/V3/V9): safety/decocker (#3). Omit on V7.
3. **No separate takedown or slide-catch tunnels** — both are the slide-stop lever.
4. **Hammer is a roof/rear problem**, not a wall problem.
5. **Confirm the variant of the scanned gun.** The scan (`HK45_block_prep`) was cross-checked as a real HK45 Tactical, but the variant (V1 vs V7) was *assumed* V1 in the earlier anatomy doc. The presence/absence of a left-side safety lever aft of the slide-stop is the tell. Check the scan's left-side geometry at YBIN6 before finalizing the safety tunnel.
6. **Working wall-offset floor: ±18.8 mm (X) at the slide-stop Y-station**, derived from scan + the 39.1 mm published width-over-controls. Add Kydex clearance (≈2 mm + 0.5 mm springback) per blocking theory §4.
7. The directional prefix-union silhouette sweep (blocking theory §3, RUNBOOK §1) handles these tunnels automatically if the protrusions are in the scan — the per-control spec here is for **verification and for any manual per-feature tunnel modeling** (the CAD-decode build-log path).

---

## SOURCES (≥2 primary per load-bearing fact)

**HK-USA official (primary):**
- HK45 Series Operator's Manual (5.12.25 ed.): https://hk-usa.com/wp-content/uploads/2025/05/HK45-Series-Operators-Manual-5.12.25.pdf
  — ambi slide release, paddle mag release "one-piece… on the trigger guard", V1/V3/V7/V9/V10/V12 control-lever positions, "slide release removed from the left side" as the takedown method, exposed hammer, width 1.54″/39 mm.
- HK45 Series Operator's Manual (earlier ed.): https://hk-usa.com/wp-content/uploads/2023/10/HK45-Series-Operators-Manual-MAY-11-2021.pdf
- HK45 Color Frames Product Sheet: https://soldiersystems.net/wp-content/uploads/2015/01/http___hk-usa.com_wp-content_uploads_HK45-Color-Frames-Product-Sheet1.pdf (width-over-controls 1.54″)
- HK Webshop Handgun Parts (Slide Release Lever, Left, as a distinct part): https://us.hkwebshop.com/hkstorefront/hk/en/Handgun-Parts/c/400

**Corroborating / parts:**
- HKParts — HK45/HK45C Ambidextrous Right-Side Control Lever ($69.95 OEM): https://hkparts.net/hk-pistol-parts/hk45-hk45-compact-ambidextrous-right-side-control-lever/
- HKParts — HK45/HK45C Left-Side Safety Lever (V1): https://hkparts.net/hk-pistol-parts/hk45-hk45-compact-left-side-safety-lever/
- Police Magazine — HK45 Compact Tactical review (confirms ambi slide release + ambi mag release): https://www.policemag.com/articles/heckler-amp-koch-hk45-compact-tactical
- Tactical Shit — HK45CT V1 listing ("safety/decocking lever on left"): https://shop.tacticalshit.com/h-k-hk45-compact-tactical-v1-da-sa-safety-decocking-lever-on-left-two-10rd-magazines
- DEGuns — HK45CT V1 (left-side lever): https://www.deguns.com/hk45-compact-tactical-v1-da-sa-safety-decocking-lever-on-left-with-two-10rd-mags-suppressor-height-sights
- Scribd — HK45 Operator's Manual (readable): https://www.scribd.com/document/115156779/HK45-HK45Compact-Operators-Manual-MARCH-2011ss
- Scribd — H&K Field Stripping ("grasp the Slide Release Lever on the left side… pull outwards away from the weapon, removing it completely"): https://www.scribd.com/doc/79863280/H-K-Field-Stripping-New
- HKPRO Forums — duty holster fit (ejection-port/barrel-hood geometry): https://www.hkpro.com/threads/hk-45-duty-holster-help.198301/
- HKPRO Forums — slim levers (slide-stop serration widths): https://www.hkpro.com/threads/slim-levers-p2000-p2000sk-hk45-hk45c-hk45ct.558357/
- AR15.com — noisy ambi right-side slide release (lever free-play): https://www.ar15.com/forums/Handguns/noisey-ambi-slide-release-on-my-HK45--owners-jump-in-here/29-113454/
- YouTube — HK Pistol DA/SA vs LEM (exposed hammer on all HK45): https://www.youtube.com/watch?v=xvEENdBLPHk

**Local corpus (LOCAL-FIRST, this session):**
- `02_RESOURCES/RESEARCH/hk45-gun-anatomy-and-blocking-theory-2026-06-23.md` (controls overview table + prefix-union tunnel theory)
- `_SYSTEM/blender/BLOCKING-BUILD-LOG.md` (s2/s3 scan measurements: left −17.6/−18.8 = control side; right +11.6/++18.8; side walls past the widest = controls buried)
- `_SYSTEM/blender/RUNBOOK.md` (directional-sweep blocking, Kydex clearance, mold-half split)

## UNVERIFIED / FLAGS

- **Exact per-protrusion mm (slide-stop tip, paddle nub, safety lever) is not vendor-published.** Values here are derived from the scan's lateral extent at the control Y-bins (±18.8 mm X at YBIN6–7) + the 39.1 mm width-over-controls spec. **Verify against the actual scan mesh** at YBIN5/6/7 before locking the tunnel wall offsets.
- **Variant of the scanned gun is ASSUMED V1** in the prior anatomy doc. If the scan shows no left-side lever aft of the slide-stop, it may be V7 LEM → drop the safety tunnel. Check before finalizing.
- **Paddle-mag downward travel clearance** (how far the paddle depresses) is not published; the holster must not block it. Conservative: tunnel the paddle nub's resting profile; do NOT extend the mold wall *under* the paddle.
- **Right-side ambi slide-stop free play** (AR15.com) — allow a hair of extra clearance on the right tunnel to avoid a loose lever binding in a tight holster.
