---
name: Scroll animation + 3D mastery patterns (GSAP, Lenis, Flubber, Three.js)
description: Codex-researched recipes for pinned-scrub scroll, SVG morph, line-draw, and minimal 3D used in the Kagami audit template
type: reference
originSessionId: a25a2f2f-3aa5-4be4-a52c-3799ebe85490
---
Full research lives at `/tmp/shintai-audit/research-scroll-3d.md` (140 lines, dispatched via Codex 5.5 xhigh).

## Core mechanic — pinned scrub timeline (GSAP ScrollTrigger)

```js
const tl = gsap.timeline({
  defaults: { ease: "none" },
  scrollTrigger: {
    trigger: ".pin-scene", start: "top top", end: "+=3200",
    pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true, pinSpacing: true
  }
});
tl.to(".ring", {rotate:360, scale:1, duration:1})
  .to(".label-a", {autoAlpha:1, y:0, duration:.35}, "<35%")
  .to(".shard", {x: i => [-180,140,70][i], duration:1});
```

## Lenis + GSAP integration (3-line wire)

```js
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add(time => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

## SVG line-draw on scroll (free)

GSAP 3.13 (2026) made DrawSVGPlugin + MorphSVGPlugin **FREE/public** — use them. Free pattern without plugin:

```js
document.querySelectorAll("path.draw").forEach(p => {
  const l = p.getTotalLength();
  gsap.set(p, {strokeDasharray: l, strokeDashoffset: l});
});
gsap.to("path.draw", {strokeDashoffset: 0, stagger: .06, ease: "none",
  scrollTrigger: {trigger: ".svg-pin", start: "top top", end: "+=1800", pin: true, scrub: true}});
```

## SVG path morph (Flubber, ~8KB free)

```js
const morph = flubber.interpolate(pathA, pathB, {maxSegmentLength: 8});
gsap.to({t: 0}, {t: 1, ease: "none",
  scrollTrigger: {trigger: ".morph-pin", pin: true, scrub: true, end: "+=1400"},
  onUpdate() { el.setAttribute("d", morph(this.targets()[0].t)); }
});
```

## Three.js minimal (~160KB gzip, defer to lazy-load)

```js
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.182/build/three.module.js";
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, .1, 100);
camera.position.z = 4;
const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(.8, .18, 96, 12),
  new THREE.MeshStandardMaterial({color: 0x9ad7ff, metalness: .2, roughness: .35}));
scene.add(mesh, new THREE.AmbientLight(0xffffff, .9), new THREE.DirectionalLight(0xffffff, 1.2));
renderer.setAnimationLoop(() => renderer.render(scene, camera));
gsap.to(mesh.rotation, {y: Math.PI*2, x: Math.PI*.35, ease: "none",
  scrollTrigger: {trigger: ".three-pin", pin: true, scrub: true, end: "+=2200"}});
```

## CSS scroll-driven (native, no library — 2026 browser support ~85%)

```css
.track { height: 400vh; scroll-timeline-name: --scene; }
.sticky { position: sticky; top: 0; height: 100svh; overflow: hidden; }
.ring {
  animation: assemble linear both;
  animation-timeline: --scene;
  animation-range: 0% 75%;
}
@supports not (animation-timeline: scroll()) {
  .ring { animation: none; transform: none; opacity: 1; }
}
```

Trade-off: CSS-only is tiny/compositor-friendly but poor for sub-timeline labels, SVG path drawing, Three.js uniforms, number tickers, callback choreography. Use GSAP for those.

## Integration plan (Kagami audit template)

1. Add GSAP + ScrollTrigger CDN (~70KB gzip)
2. Wrap target scenes: `<section class="pin-scene"><div class="pin-stage">…</div></section>`
3. Helper: `makePinnedScene(root, {vh=4})` returns a timeline with the standard pin+scrub config
4. Port existing `IntersectionObserver` reveals into timeline labels (remove observer for those sections)
5. Initialize SVG paths once after fonts/images load, then `ScrollTrigger.refresh()`
6. Wire Lenis + ticker
7. Mobile (<760px) + prefers-reduced-motion → disable pins, set final states, no scrub

## Kagami-specific scene recipes

| Scene | Pin distance | Stages |
|---|---|---|
| V3 ring assembly | `+=2400` | fade title · rotate ring 360 · draw 6 radial paths · labels stagger |
| V4 KV cache morph | `+=1800` | left blocks disassemble .25-.5 · Flubber morph .35-.75 · right blocks assemble .65-1 |
| V10 roster reveal | `+=2200` | stagger cards from y:60, autoAlpha:0 · active card scale 1.05 |
| Sankey flow trace | `+=3000` | draw main path 0-.35 · branches .25-.65 · labels .55-.85 · glow .85-1 |
| Results stat ticker | `+=1500` | counter onUpdate snap · bar scaleX 0→1 |

**Bundle estimate:** GSAP core+ScrollTrigger ~70KB · Lenis ~3-5KB · Flubber ~8KB · Three (lazy) ~160KB.
**Recommended v1:** GSAP + Flubber. Defer Three to one lazy-loaded hero scene.
