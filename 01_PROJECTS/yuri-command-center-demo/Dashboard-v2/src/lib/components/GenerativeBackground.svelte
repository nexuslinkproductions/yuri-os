<script lang="ts">
  // Phase N4 — #6 Generative ambient background
  //
  // Layered, slow-shifting gradient mesh in the EXEO cyan/violet palette:
  //   • 3 large radial blobs that drift on independent timelines
  //   • 1 fine SVG noise overlay (1% opacity) for texture
  //   • 1 conic sweep that rotates ultra-slowly (3-min cycle)
  //
  // Pinned to viewport, behind everything (z-index: 0). All glass surfaces
  // sit on top via their own z-stack. Pointer-events: none so it never
  // captures clicks. Honors prefers-reduced-motion.
</script>

<div class="bg-mesh" aria-hidden="true">
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="blob b3"></div>
  <div class="sweep"></div>
  <svg class="noise" xmlns="http://www.w3.org/2000/svg">
    <filter id="exeo-noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
    <rect width="100%" height="100%" filter="url(#exeo-noise)"/>
  </svg>
</div>

<style>
  .bg-mesh {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
    /* the mesh is BEHIND all UI; navbar/cards/rail sit at z-index >= 40 */
  }

  .blob {
    position: absolute;
    border-radius: 50%;
    filter: blur(110px);
    will-change: transform, opacity;
  }
  .b1 {
    width: 52vmax; height: 52vmax;
    top: -18%; left: -14%;
    background: radial-gradient(circle, rgba(0,200,255,0.42) 0%, rgba(0,200,255,0.10) 38%, transparent 65%);
    animation: drift-a 42s ease-in-out infinite alternate;
    opacity: 0.55;
  }
  .b2 {
    width: 46vmax; height: 46vmax;
    bottom: -22%; right: -16%;
    background: radial-gradient(circle, rgba(123,92,255,0.48) 0%, rgba(123,92,255,0.12) 40%, transparent 66%);
    animation: drift-b 54s ease-in-out infinite alternate;
    opacity: 0.55;
  }
  .b3 {
    width: 36vmax; height: 36vmax;
    top: 38%; left: 48%;
    background: radial-gradient(circle, rgba(34,211,238,0.30) 0%, rgba(34,211,238,0.08) 40%, transparent 65%);
    animation: drift-c 64s ease-in-out infinite alternate;
    mix-blend-mode: screen;
    opacity: 0.40;
  }

  .sweep {
    position: absolute;
    top: 50%; left: 50%;
    width: 180vmax; height: 180vmax;
    margin-left: -90vmax; margin-top: -90vmax;
    background: conic-gradient(
      from 0deg,
      transparent 0deg,
      rgba(0,200,255,0.04) 60deg,
      transparent 120deg,
      transparent 240deg,
      rgba(123,92,255,0.05) 300deg,
      transparent 360deg
    );
    animation: sweep-rotate 180s linear infinite;
    opacity: 0.85;
  }

  .noise {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0.012;
    mix-blend-mode: overlay;
  }

  /* Light theme — pull amplitude back so cards remain crisp on white. */
  :root:not([data-theme="dark"]) .b1 { opacity: 0.32; }
  :root:not([data-theme="dark"]) .b2 { opacity: 0.30; }
  :root:not([data-theme="dark"]) .b3 { opacity: 0.20; }
  :root:not([data-theme="dark"]) .sweep { opacity: 0.55; }
  :root:not([data-theme="dark"]) .noise { opacity: 0.018; }

  @keyframes drift-a {
    0%   { transform: translate3d(0, 0, 0) scale(1); }
    50%  { transform: translate3d(6vmax, 4vmax, 0) scale(1.08); }
    100% { transform: translate3d(-3vmax, 7vmax, 0) scale(1.02); }
  }
  @keyframes drift-b {
    0%   { transform: translate3d(0, 0, 0) scale(1); }
    50%  { transform: translate3d(-5vmax, -4vmax, 0) scale(1.10); }
    100% { transform: translate3d(4vmax, -2vmax, 0) scale(0.96); }
  }
  @keyframes drift-c {
    0%   { transform: translate3d(-50%, -50%, 0) scale(1); }
    50%  { transform: translate3d(-44%, -56%, 0) scale(1.14); }
    100% { transform: translate3d(-56%, -44%, 0) scale(0.92); }
  }
  @keyframes sweep-rotate {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .blob, .sweep { animation: none; }
  }
  @media (prefers-reduced-transparency: reduce) {
    .bg-mesh { display: none; }
  }
  /* Defensive: never let the mesh outrun the document */
  @media print {
    .bg-mesh { display: none; }
  }
</style>
