---
name: ""
metadata: 
  node_type: memory
  type: reference
  tier: 2
  scope: circuitry
  trig: 
    - chip-die
    - material-mix
    - MIX generator
    - per-tier material
    - circuitry merge
  refs: 
    - FB:CIRCUITRY-CHANGE-PROPAGATION-CONTINUITY
    - FB:CIRCUITRY-VISUAL-IS-CHIP-DIE
  originSessionId: f72be0e8-a7ee-41d8-928b-5e8c541d52ad
---

FACTS:
- build-chip-die-MIX.mjs (02_RESOURCES/RESEARCH/circuitry) is a fork of canonical build-chip-die.mjs that dispatches per-cell MATERIAL by n.tier: tier0=M4 iridescent dark-glass (6 core cells), tier1=M2 frosted glass (33 moat), tier2=M1 brushed-metal QFN (28 systems), tier3=M3 matte ceramic (16 rim). Emits yuri-chip-die-MIX.html.
- Merge method that worked: copy canonical verbatim; diff each Mx vs canonical to isolate the two changed zones (SVG <defs> + the DATA.nodes.forEach cell loop) + their Node payload additions; namespace EVERY lifted def id with a take suffix (_m1/_m2/_m3/_m4) so the four materials never collide; one merged <defs>; refactor the cell loop into an if(tier===0/1/3)else(tier2) body/face/edge branch while keeping shared leads + pin1 + LED + pad + part + name + facing-rotation + label-flip.
- Shared depth foundation = M1: a .csl contact-shadow LAYER (filter csBlur_m1) rendered behind all cells between trace layer and cell layer; plus per-cell AO + inner-shadow + bevels. Colour is INTEGRATED (gradient + rim), never a flat wash.
- Node payload additions (union): M1 layerKey/accentRim per node + layerGrads array (metalStops tint engine); M4 mat object per node (glassMaterial HSL color-math -> g0..g3 body + irA/irB/irC iridescent rim). M2 frosted + M3 ceramic build their tinted gradients per-cell in the browser from accent/glow/accentB (no extra Node tokens).
- Tier dispatch is via a class on the cell <g>: "cell t<tier>"; material CSS is scoped under .cell.tN. CSS shared classes (c-edge/c-name/c-part/c-pin1) live unscoped; material overrides under tier class.
- M3 ceramic prints the name in the UPPER field (Math.round(H*0.36)) because its recessed die-window owns lower-centre; all other tiers centre the name. M3 skips the via-pad (owns a silkscreen mark instead). Corner radius R varies: tier3 ~W*0.055, tier0 ~W*0.085, else 5.

IMPLICATION:
- Layout/wiring/shell/routing/payload-geometry is byte-identical to canonical (verified: nodes-geom/routes/bands/channels/blocks/pads all JSON-equal; 83 cells/77 traces/10 blocks/canvas 3417x3417/nets core30 moat18 feed11 rim9 sig9). Only material tokens were added.
- HEADLESS FLAKE CONFIRMED: scale-3 (force-device-scale-factor=3) full board rasters mostly BLANK under heavy filter load (tile-memory-exceeded warnings). Judge at 1.5x or 2x + sips-crop a radial slice. 2x in a 1400x1400 square window renders clean and complete. NOT an HTML defect.
- sips --cropOffset arg order is Y then X.
- Open known-weak read: tier0 glass-hero cells render dark/matte at small scale and (for the gold-hued core layer) sit close to the metal cells; the thin-film iridescence is subtle and does not pop as a jewel at default zoom. Candidate next-pass fix: boost tier0 iridescent rim opacity/width + a brighter top sky-reflection, or cool/shift the tier0 hue away from gold so it contrasts the plasma disc.

SEE: 02_RESOURCES/RESEARCH/circuitry/build-chip-die-MIX.mjs
