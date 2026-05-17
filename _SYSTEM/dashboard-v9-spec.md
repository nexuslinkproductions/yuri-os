## CODEX TASK SPEC

Goal: Complete rebuild of /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html as a real 3D WebGL Yuri OS instrument.

This is a Canvas2D → Three.js rebuild. Real 3D spheres, real spiral helical positioning, real bloom post-processing, real orbit camera with preset views, real physics-driven hover expansion, random energy pulse traversal, deep-space immersion with starfield + fog depth.

Design inspiration: Destiny (Bungie) — cinematic spatial depth, faint stars, luminous orbs, breathing energy. NOT cyberpunk neon. Architectural sci-fi.

Output: single file /Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html — replace entirely.

---

## DEPENDENCIES (already present in workspace node_modules)

Use importmap with relative paths to /Users/marcelspatz/YURI-OS-MUSUBI/node_modules/three/:

```html
<script type="importmap">
{
  "imports": {
    "three": "./node_modules/three/build/three.module.min.js",
    "three/addons/": "./node_modules/three/examples/jsm/"
  }
}
</script>
```

Imports inside the main `<script type="module">`:
```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
```

Remove all previous d3-* inlined scripts. Three.js replaces everything.

---

## TYPOGRAPHY

Google Fonts head links:
- "Space Grotesk" weights 300, 400, 500 — display + section headers
- "Inter" weights 300, 400, 500 — body labels, drawer content
- "Space Mono" weight 400 — technical IDs, file paths, code

Base font: Inter. NO JetBrains Mono. NO monospace by default.
Section labels in canvas/labels: Space Grotesk 500, letter-spacing 0.14em, uppercase
Body labels: Inter 400, 12px minimum
Technical (IDs, paths): Space Mono 400, only for code-like strings

All canvas-rendered text is replaced with CSS2DRenderer (HTML labels in 3D space).
NO canvas text drawing. Labels are DOM elements positioned via Three.js.

---

## SCENE SETUP

```js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x010416);
scene.fog = new THREE.FogExp2(0x010416, 0.00045);

const camera = new THREE.PerspectiveCamera(40, window.innerWidth/window.innerHeight, 1, 8000);
camera.position.set(0, 0, 1900);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);
```

Bloom composer:
```js
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.05, 0.55, 0.2);
composer.addPass(bloom);
composer.addPass(new OutputPass());
```

Lighting:
```js
scene.add(new THREE.AmbientLight(0x1B2540, 0.35));
const keyLight = new THREE.PointLight(0x00D4FF, 2.5, 4000);
keyLight.position.set(0, 100, 300);
scene.add(keyLight);
const fillLight = new THREE.PointLight(0x4A9EFF, 1.2, 3500);
fillLight.position.set(-400, -200, 200);
scene.add(fillLight);
const rimLight = new THREE.PointLight(0x9B6EFF, 0.8, 3500);
rimLight.position.set(400, 200, -200);
scene.add(rimLight);
```

---

## STARFIELD (deep space background)

Three layers of stars at varying depths for parallax:
```js
function makeStarLayer(count, range, size, opacity) {
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for(let i = 0; i < count; i++) {
    positions[i*3]   = (Math.random()-0.5) * range;
    positions[i*3+1] = (Math.random()-0.5) * range;
    positions[i*3+2] = (Math.random()-0.5) * range;
  }
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xC8D8E8, size, transparent: true, opacity,
    sizeAttenuation: true, depthWrite: false
  });
  return new THREE.Points(geom, mat);
}

scene.add(makeStarLayer(2000, 6000, 1.2, 0.45));  // near
scene.add(makeStarLayer(3000, 9000, 0.8, 0.30));  // mid
scene.add(makeStarLayer(2000, 12000, 0.5, 0.20)); // far
```

Subtle nebula skybox (radial gradient): use ShaderMaterial on a large background sphere:
```js
const nebulaGeom = new THREE.SphereGeometry(6000, 64, 64);
const nebulaMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    varying vec3 vPos;
    uniform float uTime;
    void main(){
      float h = (vPos.y + 4000.0) / 8000.0;
      vec3 deep = vec3(0.004, 0.016, 0.086);
      vec3 mid  = vec3(0.000, 0.052, 0.130);
      vec3 high = vec3(0.027, 0.108, 0.218);
      vec3 col = mix(deep, mix(mid, high, smoothstep(0.5,1.0,h)), smoothstep(0.0,0.5,h));
      // very faint horizontal noise band
      col += 0.018 * sin(vPos.x*0.001 + uTime*0.05) * sin(vPos.z*0.0015);
      gl_FragColor = vec4(col, 1.0);
    }
  `
});
scene.add(new THREE.Mesh(nebulaGeom, nebulaMat));
```

This creates the "deep space" luminosity gradient from top (lighter) to bottom (darker).

---

## NODE LAYOUT — 3D SPIRAL HELIX

Stage Y positions (vertical axis is gravity, top=USER, bottom=RESPONSE):

```js
const STAGES = [
  { id: 'USER',         y:  1300, twist: 0 },
  { id: 'USER_INPUT',   y:  1100, twist: Math.PI/12 },
  { id: 'ENKI',         y:   880, twist: Math.PI/6 },
  { id: 'SESSION_INIT', y:   620, twist: Math.PI/4 },
  { id: 'PROMPT_HOOKS', y:   360, twist: Math.PI/3 },
  { id: 'NEXUSPULSE',   y:   100, twist: 5*Math.PI/12 },
  { id: 'CLASSIFIER',   y:  -160, twist: Math.PI/2 },
  { id: 'ADVISORS',     y:  -420, twist: 7*Math.PI/12 },
  { id: 'PULSE_BUS',    y:  -680, twist: 2*Math.PI/3 },
  { id: 'ENKI_DECIDES', y:  -880, twist: 3*Math.PI/4 },
  { id: 'ROUTING',      y: -1080, twist: 5*Math.PI/6 },
  { id: 'CODEX_GATE',   y: -1240, twist: 11*Math.PI/12 },
  { id: 'MEMORY',       y: -1400, twist: Math.PI },
  { id: 'SERVICES',     y: -1560, twist: 13*Math.PI/12 },
  { id: 'RESPONSE',     y: -1720, twist: 7*Math.PI/6 }
];
```

Section nodes (large orbs) at: `(0, stage.y, 0)` — all on central spine.

Sub-nodes arranged on a circle in the xz plane around section. For a stage with N sub-nodes:
```js
const radius = 220;  // distance from spine
const arc = Math.PI * 0.85; // ~153° spread
for (let i = 0; i < N; i++) {
  const t = N === 1 ? 0 : (i / (N-1)) - 0.5; // -0.5 .. +0.5
  const angle = stage.twist + t * arc;
  const sub.x = radius * Math.cos(angle);
  const sub.z = radius * Math.sin(angle);
  const sub.y = stage.y - 70;
}
```

Each stage's sub-nodes are rotated by `stage.twist` — viewed from above the system forms a clear spiral.

### Node Data

Use the same node definitions from v8 (SECTION + SUB nodes), but with these 3D radii:
- SECTION node radius: 45–60 (scale by importance: ENKI=60, ENKI_DECIDES=55, USER=42, RESPONSE=42, others 48-52)
- SUB node radius: 18–26
- USER and RESPONSE: large white-ish (#E8F4FD), no twist offset (centered on spine)

Full node list — same systems as v8: USER, USER_INPUT, ENKI, SESSION_INIT (+soul/palace/mnemosyne/token), PROMPT_HOOKS (+aeonic/protocol-guard/scout/tirith), NEXUSPULSE (+orchestrator/pulse-plan), CLASSIFIER (+trivial/standard/complex/critical), ADVISORS (+6 advisors), PULSE_BUS, ENKI_DECIDES, ROUTING (+6 lanes), CODEX_GATE (+propose/approved/apply), MEMORY (+hot/warm/cold/kernel/mlm), SERVICES (+shell/runtime/rag/health/eot), RESPONSE.

---

## SPHERE MATERIALS

Each node = THREE.Mesh with:
1. Core sphere — high detail, emissive
2. Atmosphere shell — bigger, BackSide, transparent halo

```js
function makeOrb(r, hex) {
  const group = new THREE.Group();

  // Core
  const coreGeom = new THREE.SphereGeometry(r, 48, 48);
  const coreMat = new THREE.MeshPhysicalMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: 0.85,
    metalness: 0.25,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.3,
    transparent: false
  });
  group.add(new THREE.Mesh(coreGeom, coreMat));

  // Atmosphere halo
  const atmGeom = new THREE.SphereGeometry(r * 1.45, 32, 32);
  const atmMat = new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: 0.18,
    side: THREE.BackSide, depthWrite: false
  });
  group.add(new THREE.Mesh(atmGeom, atmMat));

  // Outer faint glow
  const farGeom = new THREE.SphereGeometry(r * 2.2, 24, 24);
  const farMat = new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity: 0.05,
    side: THREE.BackSide, depthWrite: false
  });
  group.add(new THREE.Mesh(farGeom, farMat));

  return group;
}
```

Node colors (match v8 palette): #00D4FF (cyan/flow), #4A9EFF (blue/data), #9B6EFF (violet/advisors), #FF5252 (quarantine), #00C896 (emerald/services), #FF6835 (flame/gates), #74B9FF (cold mem), #FFB347 (warm mem), #FF6B6B (hot mem), #94A3B8 (slate/hooks).

OPENCLAW gets an extra THREE.RingGeometry at radius r+8 with dashed red material rotating slowly around y axis.

---

## EDGES — 3D BEZIER TUBES + ARC CONNECTORS

Edges are CubicBezierCurve3 → TubeGeometry for crisp 3D lines.

For section→section main spine: vertical bezier, control points pull toward midpoint
For section→sub: short bezier from section to sub-node
For sub→pulse_bus (advisor returns): bezier with z-axis lift for spiral arc feel

Special "spiral arc" connectors (user loved the orange CODEX_GATE arc): for the codex gate sub-nodes (propose/approved/apply) and any cross-connections, use a SemiCircular arc instead of straight bezier:

```js
function arcCurve(start, end, archHeight, archDir) {
  // Generates a semicircular arc between two points, bulging in archDir direction
  const mid = start.clone().add(end).multiplyScalar(0.5);
  const offsetVec = archDir.clone().normalize().multiplyScalar(archHeight);
  const apex = mid.clone().add(offsetVec);
  return new THREE.QuadraticBezierCurve3(start, apex, end);
}
```

Tube geometry per edge:
```js
const tubeGeom = new THREE.TubeGeometry(curve, 64, edge.weight, 8, false);
const tubeMat = new THREE.MeshBasicMaterial({
  color: edgeColorByType[edge.type],
  transparent: true,
  opacity: edgeOpacityByType[edge.type],
  depthWrite: false
});
const mesh = new THREE.Mesh(tubeGeom, tubeMat);
scene.add(mesh);
```

Weight (tube radius): flow=1.5, branch=0.6, data=0.7, advises=0.5, gates=1.0, memory=0.4.
Opacity: flow=0.85, branch=0.45, data=0.55, advises=0.35, gates=0.65, memory=0.30.

---

## RANDOM PULSE TRAVERSAL SYSTEM

Every 2.5 seconds, spawn a new pulse:
1. Pick a random start node (weighted toward upstream nodes: USER, USER_INPUT, ENKI weighted higher)
2. From start, traverse outgoing edges via random walk (3-7 steps)
3. The traversal path is randomized — never same path twice
4. Pulse = small bright sphere (r=4, color #00FFFF, emissive=1.0, no shadow, additive blend)
5. Animate along each edge's curve over 600ms per segment
6. Trail: spawn smaller fading copies behind the pulse (5 trail orbs at decreasing opacity)
7. When pulse enters a node: briefly boost the node's emissive intensity by +0.6 over 300ms then back

Implementation:
```js
class Pulse {
  constructor(path) { this.path = path; this.segment = 0; this.t = 0; ... }
  update(dt) {
    this.t += dt / 600;
    if (this.t >= 1) { this.segment++; this.t = 0; /* boost target node */ }
    if (this.segment >= this.path.length-1) return false; // done
    const curve = edgesByPair[path[seg]+'->'+path[seg+1]].curve;
    const pos = curve.getPointAt(this.t);
    this.mesh.position.copy(pos);
    return true;
  }
}

const activePulses = [];
setInterval(() => {
  if (activePulses.length < 4) activePulses.push(new Pulse(randomPath()));
}, 2500);
```

Adjacency map built from edges. Random walk: at each node, pick a random outgoing edge.

---

## ORBIT CONTROLS + PRESET VIEWS

OrbitControls for free rotation:
```js
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 200;
controls.maxDistance = 4000;
controls.target.set(0, -200, 0);
```

Preset view buttons (fixed DOM bottom-right): FRONT, BACK, TOP, SIDE.
Each animates camera position + target over 1200ms via simple lerp tween.

```js
const views = {
  FRONT: { pos: [0, -200, 2200], target: [0, -200, 0] },
  BACK:  { pos: [0, -200, -2200], target: [0, -200, 0] },
  TOP:   { pos: [0, 2400, 0], target: [0, 0, 0] },
  SIDE:  { pos: [2200, -200, 0], target: [0, -200, 0] }
};

function animateToView(v) {
  const start = { px: camera.position.x, py: camera.position.y, pz: camera.position.z,
                  tx: controls.target.x, ty: controls.target.y, tz: controls.target.z };
  const end = { px: v.pos[0], py: v.pos[1], pz: v.pos[2],
                tx: v.target[0], ty: v.target[1], tz: v.target[2] };
  const startTime = performance.now();
  function tick() {
    const t = Math.min(1, (performance.now() - startTime) / 1200);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * t); // easeInOut
    camera.position.set(
      start.px + (end.px - start.px) * e,
      start.py + (end.py - start.py) * e,
      start.pz + (end.pz - start.pz) * e
    );
    controls.target.set(
      start.tx + (end.tx - start.tx) * e,
      start.ty + (end.ty - start.ty) * e,
      start.tz + (end.tz - start.tz) * e
    );
    controls.update();
    if (t < 1) requestAnimationFrame(tick);
  }
  tick();
}
```

Buttons styled: position fixed bottom 24px right 24px, vertical column. 1px solid rgba(0,212,255,0.25) borders, 8px 14px padding, Space Mono 11px tracking 0.14em uppercase, #C8D8E8 color, background rgba(13,21,38,0.85), hover: border #00D4FF, color #00D4FF.

---

## LABELS (CSS2DRenderer)

Every node has a CSS2DObject child:
```js
const labelDiv = document.createElement('div');
labelDiv.className = 'node-label';
labelDiv.innerHTML = `<div class="lbl-id">${node.id}</div><div class="lbl-role">${node.role}</div>`;
const lbl = new CSS2DObject(labelDiv);
lbl.position.set(0, -(node.r + 28), 0); // below the orb
nodeMesh.add(lbl);
```

Label CSS (on body, not in canvas):
```css
.node-label { text-align: center; pointer-events: none; user-select: none; transition: opacity 280ms ease, transform 280ms ease; }
.lbl-id { font-family: 'Space Grotesk', sans-serif; font-weight: 500; font-size: 13px; color: #E8F4FD; letter-spacing: 0.08em; text-shadow: 0 0 12px rgba(0,212,255,0.4); }
.lbl-role { font-family: 'Inter', sans-serif; font-weight: 400; font-size: 10px; color: rgba(168,188,198,0.7); letter-spacing: 0.04em; margin-top: 2px; }
.node-label.expanded .lbl-role { font-size: 11px; color: #C8D8E8; }
.node-label.expanded .lbl-detail { font-family: 'Inter'; font-size: 10px; color: rgba(168,188,198,0.6); margin-top: 4px; max-width: 220px; }
```

For sub-nodes (r<28): label is smaller — Space Mono 9px id + Inter 8px role.

---

## HOVER EXPANSION WITH PHYSICS

Raycast on mouse move to detect node under cursor.
On hover:
1. Tween hovered node's group scale from 1.0 → 1.45 over 280ms (Quad ease)
2. Tween adjacent nodes (within 350 units) AWAY from hovered node by 30 units along the (node - hovered) vector
3. Show expanded label: add `.expanded` class which reveals `.lbl-detail` content
4. Increase emissiveIntensity from 0.85 to 1.4
5. Show ring outline (extra THREE.RingGeometry briefly)

On hover end: reverse all of the above with 280ms tween back to original positions.

Use a simple lerp per frame:
```js
function updateHoverPhysics() {
  nodes.forEach(n => {
    const target = n === hovered ? 1.45 : 1.0;
    n.group.scale.x += (target - n.group.scale.x) * 0.15;
    n.group.scale.y = n.group.scale.x;
    n.group.scale.z = n.group.scale.x;

    // Position springs
    let tx = n.origPos.x, ty = n.origPos.y, tz = n.origPos.z;
    if (hovered && n !== hovered) {
      const dx = n.origPos.x - hovered.origPos.x;
      const dy = n.origPos.y - hovered.origPos.y;
      const dz = n.origPos.z - hovered.origPos.z;
      const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
      if (d < 350 && d > 0) {
        const push = (350 - d) * 0.08;
        tx += (dx/d) * push;
        ty += (dy/d) * push;
        tz += (dz/d) * push;
      }
    }
    n.group.position.x += (tx - n.group.position.x) * 0.15;
    n.group.position.y += (ty - n.group.position.y) * 0.15;
    n.group.position.z += (tz - n.group.position.z) * 0.15;
  });
}
```

No click drawer. Hover IS the expanded info display. Information is read by hovering.

---

## BREATHING ANIMATION (subtle life)

Each node has a slight breathing scale anchored to a per-node random phase:
```js
const breathPhase = Math.random() * Math.PI * 2;
// In update:
const breath = 1.0 + Math.sin(time*0.0008 + breathPhase) * 0.025;
// Multiplied onto the hover scale
```

This is ON TOP of the hover scale lerp — combined as: finalScale = hoverScale * breath.

---

## HUD OVERLAYS (fixed DOM, top corner)

Top-left (Space Grotesk 14px #E8F4FD weight 400 tracking 0.08em):
  "YURI OS"
  "NUDIMMUD · main · 2e6380d8" (Inter 10px #4A6080)

Top-right (Inter 11px #C8D8E8):
  Soak ring SVG (r=14, 32% fill, stroke #00D4FF)
  "16/50 SOAK"
  "5/5 ●" #FF5252 with breathing opacity 0.6↔1.0 every 1.4s

Bottom-left: legend with line swatches (Inter 9px tracking 0.14em):
  FLOW / DATA / ADVISES / GATES / MEMORY
  Each with a small line preview

Bottom-right: view buttons stacked vertically: FRONT / SIDE / TOP / BACK
  Each: 1px solid border, 8px 14px padding, Space Mono 10px tracking 0.14em uppercase

Bottom-center: status strip (Space Mono 10px #4A6080):
  "TIER CRITICAL · PROTOCOL-CHANGE · 44 NODES · 52 EDGES · v9"

---

## ANIMATION LOOP

```js
function animate(time) {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  controls.update();

  // Update breathing on each node
  nodes.forEach(n => {
    const breath = 1.0 + Math.sin(time*0.0008 + n.breathPhase) * 0.025;
    n.group.userData.breathScale = breath;
  });

  updateHoverPhysics(); // includes breath in final scale

  // Update pulses
  for (let i = activePulses.length - 1; i >= 0; i--) {
    if (!activePulses[i].update(dt)) {
      scene.remove(activePulses[i].mesh);
      activePulses.splice(i, 1);
    }
  }

  // Nebula shader time
  nebulaMat.uniforms.uTime.value = time * 0.001;

  composer.render();
  labelRenderer.render(scene, camera);
}
animate(0);
```

---

## RESPONSIVE

On window resize:
```js
camera.aspect = window.innerWidth / window.innerHeight;
camera.updateProjectionMatrix();
renderer.setSize(window.innerWidth, window.innerHeight);
composer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.setSize(window.innerWidth, window.innerHeight);
```

---

## RULES

- Real WebGL only. No Canvas2D. No D3.
- Use Three.js + addons via importmap (paths above).
- ES modules. `<script type="module">` for the main script.
- Background body color #010416 to prevent flash before WebGL renders.
- prefers-reduced-motion: disable breathing, disable pulse traversal, set controls.autoRotate=false, reduce camera dampingFactor to 0.
- All numbers must hit the values specified above (radii, colors, intensities).
- One single HTML file output.
