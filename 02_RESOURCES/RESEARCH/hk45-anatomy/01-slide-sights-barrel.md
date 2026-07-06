# HK45 Tactical — Slide / Sights / Barrel Subsystem for Holster-Blocking

**Purpose:** per-part anatomy of the TOP/SLIDE subsystem so each feature can be converted into a
front-to-back **TUNNEL** along the draw axis (scan Y) so the gun slides in/out of the Kydex holster
without snagging. Companion to `02_RESOURCES/RESEARCH/hk45-gun-anatomy-and-blocking-theory-2026-06-23.md`
(gun-agnostic theory) and `_SYSTEM/blender/BLOCKING-BUILD-LOG.md` (the live build).

**Gun:** Heckler & Koch **HK45 Tactical (HK45T)**, V1 DA/SA or V7 LEM. .45 ACP. NOT the base HK45 —
the Tactical adds (a) a protruding threaded barrel and (b) suppressor-height sights. These two deltas
are the entire reason the top/front of the holster needs dedicated tunnels.

**Scan convention (this gun, `HK45_block_prep`):** muzzle = LOW Y, grip = HIGH Y, **draw axis = Y**
(gun draws OUT toward +Y). Z = up (sights +Z), X = lateral width. All mm.

**Confidence legend:** [P] = primary/authoritative (HK-USA, HK operator's manual, heckler-koch.com).
[2src] = ≥2 independent sources. [M] = measured from our scan. [–] = unverifiable from primary sources;
stated as an estimate with the reasoning given.

---

## 1. Slide body

| Field | Value |
|---|---|
| (a) Location | Dominant top element; runs nearly the full gun length. Slide top ≈ flat crown at Z≈+82 (scan-local), sides drop to the slide/frame parting line. Muzzle face of slide sits behind the protruding barrel; rear face meets the beavertail/tang. |
| (b) Protrusion | The slide IS the gun's upper body — nothing sticks "out" of it except the sights, barrel, ejection port lip, and serrations (each below). Slide top crown is the highest gun metal between the sights. |
| (c) Material / mechanism | Hardened steel, nitride/Melonite finish (HK spec). Cold-hammer-forged polygonal bore in the barrel underneath. Recoil-operated, modified Browning linkless lockup (barrel cams up into slide ejection-port lugs on lockup — the O-ring improves barrel-to-slide lockup repeatability [P, HK-USA]). Top crown: **narrow flat** (~5 mm wide at muzzle/third → ~18 mm at rear [M, build-log v7]); steep ~45–48° faceted shoulders falling to vertical side walls. Side flats: machined flat panels both sides for weight reduction + cocking-serration recesses. |
| (d) Retention relevance / tunnel | The slide IS the primary tunnel envelope — its cross-section sets the holster's main cavity. Build the **slide block** as a beveled box following the measured cross-section (flat crown + faceted shoulders + walls), full draw-axis length. NOT a retention point itself; it is the reference every other tunnel sits on. |

---

## 2. Front cocking serrations

| Field | Value |
|---|---|
| (a) Location | Forward third of the slide, both sides. On the HK45T roughly **~25–45 mm aft of the muzzle face of the slide** (serration band sits ahead of the ejection port, behind the front sight block). [– exact mm band — not in HK spec; estimate from proportional photos + our scan serration cutter placement.] |
| (b) Protrusion | **Lateral, ~0.2–0.4 mm** per groove (shallow). They are recessed cuts INTO the slide flat, not raised ridges — the ridge crests sit at the slide-flat plane, the grooves cut below it. So net protrusion above the slide body ≈ 0; they create a **friction texture**, not a bump. |
| (c) Mechanism | Static friction aids — fine transverse grooves (~2 mm pitch, ~12–15 grooves per side on this class) for racking the slide by hand. Non-moving, non-adjustable. |
| (d) Retention relevance / tunnel | **Snag risk = LOW individually, but they break the draw-axis monotonicity if the Kydex is formed tight.** Block method: a **flat side-wall tunnel** at or just outside the slide-flat plane (the slide block wall) buries them — they sit in the swept-shadow volume. Do NOT model them as grooves in the mold; the blocking wall must be flat-full-length past the slide-flat width. (Our build-log serration cutter adds them as visual detail on the clone, but the RETENTION-correct method is to flatten the wall past them.) |

---

## 3. Rear cocking serrations

| Field | Value |
|---|---|
| (a) Location | Rear third of the slide, both sides, forward of the rear sight and aft of the ejection port. Roughly **~150–175 mm from the muzzle face of the slide** (behind the ejection port, ahead of the rear sight dovetail). [– same caveat: exact band from scan, not HK spec.] |
| (b) Protrusion | Same as front: **lateral ~0.2–0.4 mm groove depth, net ~0 protrusion above slide flat** (recessed cuts). |
| (c) Mechanism | Identical friction-aid function to front serrations. Often slightly coarser pitch (~2.5 mm) and fewer count (~8–10). Non-moving. |
| (d) Retention relevance / tunnel | Same as front serrations — buried by the flat side-wall tunnel. The rear band matters slightly more because it sits between the two tallest snag points (ejection port lip and rear sight); the tunnel wall must be continuous and flat across this whole region so nothing catches mid-draw. |

---

## 4. Front sight

| Field | Value |
|---|---|
| (a) Location | Top of slide, forward third — dovetailed into the slide's front sight block. Roughly **~30–40 mm aft of the muzzle face of the slide**, ahead of the ejection port. |
| (b) Protrusion | **UPWARD (+Z).** Height above slide crown: the factory Truglo high-profile suppressor sight sits ~**6 mm proud of the slide top** (our prior doc + scan top Z≈+49 vs slide crown Z≈+82 → ~6 mm delta after re-centering; [M, approximate]). For the directly-comparable **TruGlo TFX Dimension** suppressor sight line, total front-sight height (slide-top to tallest sight point) = **0.425" ≈ 10.8 mm** [P, TruGlo spec FAQ]. Front-sight WIDTH ~0.154" ≈ 3.9 mm [P, TruGlo]. |
| (c) Mechanism | **Dovetail mount** (front = press-in transverse dovetail, drift-adjustable for windage zero only — not user-adjustable in elevation). Type: **suppressor-height tritium/fiber-optic** (TruGlo, HK-exclusive; the "high profile" lets the shooter see the front sight OVER a mounted suppressor body). Fixed blade once drifted; tritium vial + fiber-optic rod for low-light visibility. |
| (d) Retention relevance / tunnel | **Snag risk = HIGH.** A tall vertical blade on the draw path will catch the Kydex on draw if the mold roof is flat at slide-crown height. Block method: a **raised sight tunnel / roof slab** running the FULL draw-axis length at the tallest-sight height (+6 mm above crown, +clearance). This is the "sight channel" tunnel — it must extend from ahead of the front sight to BEHIND the rear sight so both blades pass through continuously. The roof must clear the **taller of front/rear** (rear is taller — see §5) → set roof height from the REAR sight, then the front passes under it for free. Width of the channel ≥ front-sight blade width + 2× clearance (~3.9 mm + 1–2 mm). |

---

## 5. Rear sight

| Field | Value |
|---|---|
| (a) Location | Top of slide, rear — dovetailed into the slide's rear sight block. Roughly **~175–185 mm from the muzzle face of the slide**, just forward of the beavertail/tang junction. |
| (b) Protrusion | **UPWARD (+Z), and slightly REARWARD.** This is the **tallest single point on the gun** (scan top Z≈+53 vs front sight Z≈+49 → rear is ~4 mm taller than front [M]). For TruGlo TFX Dimension: rear sight OAH (bottom of dovetail to tallest point) = **0.504" ≈ 12.8 mm** [P, TruGlo]. Approx **~8–10 mm proud of the slide crown**. The rear overhangs slightly aft (a flat or notch blade facing the shooter). |
| (c) Mechanism | **Dovetail mount, USER-ADJUSTABLE for windage** (drift in the dovetail with a sight pusher; elevation adjustable via a set-screw or replaceable blade on the Truglo high-profile variant — HK-exclusive). Type: tall U-notch (or square-notch) tritium rear, suppressor-height, co-witnesses with the front over a suppressor. Two tritium dots flanking the notch. |
| (d) Retention relevance / tunnel | **Snag risk = HIGHEST on the top surface** — tallest point + a rearward-facing vertical face that a tight Kydex roof would hook on draw. Block method: the **sight-channel roof slab (§4) must be set at REAR-sight height + clearance, running the full draw axis past the rear sight's rear face.** Because the rear sight overhangs aft, the tunnel roof must extend BEHIND the rear sight by at least the overhang + draw clearance, tapering down only at the holster's rear mouth (grip cut). This single tunnel buries BOTH front and rear sights. The rear-sight rearward lip is why the sight channel is a tunnel, not a slot — it needs axial clearance fore-and-aft. |

---

## 6. Threaded barrel + muzzle thread

| Field | Value |
|---|---|
| (a) Location | Runs the full gun length inside the slide; protrudes **FORWARD (−Y, toward muzzle)** past the slide muzzle face. Barrel length **5.20 in = 132 mm** [P, HK-USA]; std HK45 (non-Tactical) barrel = 4.46 in = 113 mm [P, HK-USA]. **Protrusion past slide = 132 − 113 ≈ 18.8 mm** [2src: HK spec subtraction + scan muzzle-bin geometry]. The threaded portion itself is the forward ~15 mm of that, with a short unthreaded relief behind. |
| (b) Protrusion | **AXIAL forward ~18.8 mm**, radial = barrel OD (~16 mm at the thread crest, M16). Thread crest sits flush-to-slightly-proud of the slide muzzle bore. |
| (c) Mechanism / thread | **M16×1 LH (left-hand)** [P ×3: HK-USA product page + HK-USA operator's manual PDF + heckler-koch.com; corroborated by HKParts thread guide]. **Pitch = 1.0 mm. Direction = LEFT-HAND** (tightens counter-clockwise, loosens clockwise — opposite of standard). ⚠️ **Common error killed:** the **HK Mark 23** uses M16×1 **RH**; do NOT confuse the two. The HK45/HK45T/USP45T family is uniformly **LH** [2src]. O-ring barrel (synthetic ring in a groove under the muzzle) for repeatable slide-to-barrel lockup [P, HK-USA]. Cold-hammer-forged polygonal bore. Thread protector (see §7) is factory-installed over the threads. |
| (d) Retention relevance / tunnel | **Snag risk = HIGH (forward).** The protruding barrel is the **front bore/tunnel** — the holster must have an open or blind cylindrical channel at the muzzle that the barrel passes through. Block method: model the barrel protrusion as a **cylinder (24-sided, ~16 mm OD)** extending forward from the slide muzzle face by ~18.8 mm + clearance, union with the slide block. For a threaded-barrel holster the muzzle end is typically **open** (no front cap) so a mounted suppressor could pass, but the blocking still bridges the barrel's radial silhouette so Kydex ramps smoothly onto it. The O-ring bulge (~0.5 mm radial) is inside the slide, not on the protruding portion — irrelevant to the tunnel. |

---

## 7. Muzzle device / thread protector

| Field | Value |
|---|---|
| (a) Location | Threaded onto the M16×1 LH protruding section, covering the threads when no suppressor is mounted. Factory ships with a **thread protector** cap installed [P, HK-USA manual]. |
| (b) Protrusion | The thread protector is a short knurled cap, OD ~16–17 mm (flush with thread crest), length ~12–15 mm forward of the slide muzzle face. It sits ON the already-protruding barrel, so it does not add much beyond the barrel's own 18.8 mm — it covers the threaded portion. With a **suppressor mounted**, a much larger tube (typical .45 can OD ~35–45 mm, length 150–250 mm) extends forward — that becomes the dominant front tunnel dimension. |
| (c) Mechanism | Thread protector = simple knurled M16×1 LH cap (loosens clockwise — see §6). Suppressor = booster/neilson assembly with an M16×1 LH piston. No ratchet, no set screw on the factory cap. |
| (d) Retention relevance / tunnel | **For an un-suppressed holster (the René use-case):** the thread protector is the actual muzzle object. Treat the front tunnel as covering a **~16–17 mm OD cylinder extending ~18.8 mm forward of the slide** (same as §6 — the protector is within that envelope). **For a suppressed holster:** the holster must clear the suppressor body — a much larger front bore, often the holster is designed around the can's OD and the slide sits inside it. **Decision for our pipeline: assume NO suppressor mounted (thread protector only)** unless Marcel/René specify otherwise; the barrel-protrusion cylinder from §6 handles it. Flag this as a per-gun parameter (`muzzle_device_present`). |

---

## SUMMARY — the tunnels this subsystem forces

The top/slide subsystem demands **three distinct front-to-back tunnels** in the blocking, each a
draw-axis monotonic channel:

1. **Sight-channel roof slab** — runs full draw-axis at **REAR-sight height** (~8–10 mm above slide
   crown, ~12.8 mm OAH per TruGlo TFX Dimension), width ≥ front-blade width + clearance (~4 mm + 1–2 mm),
   extending fore of the front sight and AFT of the rear sight's rear overhang. **Buries front + rear
   sights in one tunnel.** This is the single most dimension-critical tunnel — set the roof height from
   the REAR sight (taller of the two).

2. **Barrel / muzzle front bore** — cylindrical tunnel, ~16 mm OD, extending **~18.8 mm forward of the
   slide muzzle face** (Tactical barrel 132 mm − std 113 mm), M16×1 LH threads underneath. Open at the
   muzzle end for suppressor clearance.

3. **Flat side-wall tunnel** — slide-flat plane full-length, past the front + rear serrations (so their
   groove crests don't catch). Serrations are recessed (~0.2–0.4 mm grooves), net-zero protrusion, so a
   flat wall at the slide-flat width buries them. (The ejection-port lip on the right side is the worse
   lateral snag — handled in the separate ejection-port part doc, not here.)

The slide body itself is NOT a tunnel — it is the **reference envelope** the tunnels sit on.

---

## KEY DIMENSIONS (tunnel-setting numbers)

| Dimension | Value | Source | Use |
|---|---|---|---|
| Front sight height above slide crown | ~6 mm (approx) / 10.8 mm total (TruGlo TFX Dimension) | [M] / [P TruGlo] | sight-channel roof (front) |
| **Rear sight height above slide crown** | **~8–10 mm (approx) / 12.8 mm OAH (TruGlo TFX Dimension)** | [M] / [P TruGlo] | **sight-channel roof (sets the taller of the two)** |
| Front sight blade width | ~3.9 mm (0.154") | [P TruGlo] | sight-channel width floor |
| **Barrel thread** | **M16×1 LH** | [P HK-USA ×2, HK manual, heckler-koch.com; 2src] | front-bore ID |
| Barrel length (Tactical) | 132 mm (5.20") | [P HK-USA] | muzzle position |
| Std HK45 barrel (for delta) | 113 mm (4.46") | [P HK-USA] | protrusion subtraction |
| **Barrel protrusion past slide** | **~18.8 mm** | [2src: HK spec subtraction + scan] | front-bore length |
| Thread pitch | 1.0 mm | [P] | (reference only — no blocking impact) |
| Thread direction | LEFT-HAND (LH) | [P ×3 + 2src] | (reference; do NOT confuse with MK23 RH) |
| Thread protector OD | ~16–17 mm | [– estimate] | front-bore OD (same envelope as barrel) |
| Slide top crown width | ~5 mm (fwd) → ~18 mm (rear) | [M build-log] | slide-block crown profile |
| Slide shoulder angle | ~45–48° | [M build-log] | slide-block shoulder facets |
| Serration depth (front + rear) | ~0.2–0.4 mm (recessed) | [– estimate] | flat-wall tunnel buries them |
| Overall length / height / width | 215.9 / 150 / 39.1 mm | [P HK-USA] | envelope sanity |

---

## SOURCES (cited, primary-preferred)

1. **HK-USA — HK45 Tactical product page** (official, primary)
   https://hk-usa.com/product/hk45-tactical/
   — confirms: barrel 5.20", M16×1 LH (accessory P/N 226351 "HK45 Tactical threaded barrel, 5.20 inches, M16x1 LH"), adjustable high-profile Truglo sights, O-ring barrel, Picatinny rail, 8.50" OAL, 5.91" height, 1.54" width, 10+1.

2. **HK-USA — HK45 Series Operator's Manual (PDF)** (official, primary)
   https://hk-usa.com/wp-content/uploads/2025/01/HK45-Series-Operators-Manual.pdf
   — confirms: "left hand threads used on the barrel of the HK45 Tactical pistol barrels will accept only those accessories designed for the pistol."

3. **heckler-koch.com — HK45 product page** (official HK global, primary)
   https://www.heckler-koch.com/en/Products/Hunting%20and%20Sport/Pistols/HK45
   — confirms: "special threaded barrel protrudes from the slide… and has an M16x1LH thread for mounting a silencer."

4. **HKParts — HK Barrel Thread Pitch Guide** (specialist reference, 2nd source)
   https://hkparts.net/blog/hk-barrel-thread-pitch-guide/
   — explicitly distinguishes HK45/HK45C/USP/USPC (.45) = **16x1 LH** vs **MK23 = 16x1 RH**. Kills the common confusion error.

5. **TruGlo — TFX Dimension Suppressor Sights FAQ** (sight OEM, primary for sight dims)
   https://www.truglo.com/faq/firearm/tfx-dimension-suppressor-sights/
   — front sight height .425" (~10.8 mm), front width .154" (~3.9 mm), rear OAH .504" (~12.8 mm). Suppressor-height sight class directly comparable to the HK45T factory Truglo high-profile.

6. **HKPRO Forums — Suppressing the HK45** (community corroboration)
   https://www.hkpro.com/threads/suppressing-the-hk45.168280/
   — "The HK45 uses M16x1LH threads." Independent 2nd-source for thread direction.

7. **Wikipedia — Heckler & Koch HK45** (tertiary, corroboration)
   https://en.wikipedia.org/wiki/Heckler_%26_Koch_HK45
   — general specs, development history (JCP program 2005-06).

8. **YURI local — HK45 anatomy + blocking theory (prior session, 2026-06-23)**
   `02_RESOURCES/RESEARCH/hk45-gun-anatomy-and-blocking-theory-2026-06-23.md`
   — gun-agnostic blocking theory, scan cross-check (221.7×144.2×37.3 mm scan vs 215.9×150×39.1 published), feature-to-scan-coordinate map, prefix-union swept-silhouette method.

9. **YURI local — Blender build log (live build, 2026-06-24)**
   `_SYSTEM/blender/BLOCKING-BUILD-LOG.md`
   — measured CAD answer-key: slide crown ~5mm fwd→18mm rear, shoulders ~45–48°, roof flat Z82.3 full length, trigger guard solid-filled, lateral X-split. Method: block the scan, reference the CAD, clean-box synthesis.

---

## UNVERIFIABLE / ESTIMATED DIMENSIONS (honest gaps)

The following are NOT published in primary HK sources and are marked [–] above. They should be
**measured from our scan** (the authoritative input per the textbook method) rather than guessed:

- Exact **front/rear serration bands** (mm from muzzle) — HK does not publish; derive from scan serration geometry.
- Exact **front-sight height above slide crown for the FACTORY HK-exclusive Truglo** — HK only says "high profile"; the TruGlo TFX Dimension number (10.8 mm total) is the same sight CLASS, not the exact HK SKU. **Measure from scan** (front-sight Z peak − slide-crown Z).
- Exact **rear-sight height above slide crown** — same caveat; 12.8 mm OAH is the TruGlo TFX Dimension analog. **Measure from scan.**
- **Thread protector exact OD** — estimate ~16–17 mm from thread crest; measure from scan muzzle bin.
- **Serration groove depth + count** — estimate from photos; measure from scan.

For all tunnel-setting dimensions, the **scan measurement is the ground truth** (per the owner's
textbook-method correction in the build log). The published numbers here set the sanity envelope + the
method; the scan sets the exact tunnel geometry.
