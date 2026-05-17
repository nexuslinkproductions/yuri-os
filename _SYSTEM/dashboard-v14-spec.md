## CODEX TASK SPEC — V14

Goal: v13 → v14 incremental visual+interaction upgrade.

Lead designer: codex gpt-5.5 reasoning xhigh.

Build ON v13. Keep all working systems (importmap, scene, controls, raycaster, animation loop, starfield, nebula, CSS2D labels, hover physics, LOD, expand/collapse, info panel, UPGRADES popup, memory placement, helix symmetry, command registry, edge types, arrowheads).

Deliverables (update in place):
1. `/Users/marcelspatz/YURI-OS-MUSUBI/yuri-os-dashboard.html`
2. `/Users/marcelspatz/YURI-OS-MUSUBI/_SYSTEM/yuri-graph-state.json` (sectors metadata only — add `plane_radius` per sector)

5 coordinated changes: A–E.

---

# PART A — UPGRADES PANEL: LEFT SIDE + LIQUID GLASS

## A.1 Reposition

Move UPGRADES popup from `right: 24px` to `left: 24px`. Same vertical placement (top: 80px, bottom: 80px). Same width (~420px).

## A.2 Liquid glass styling

Replace current panel CSS with:

```css
.upgrades-panel {
  position: fixed;
  left: 24px;
  top: 80px;
  bottom: 80px;
  width: 420px;
  z-index: 200;

  background: linear-gradient(180deg, rgba(11,31,62,0.55) 0%, rgba(7,15,38,0.45) 100%);
  backdrop-filter: blur(32px) saturate(180%);
  -webkit-backdrop-filter: blur(32px) saturate(180%);

  border: 1px solid rgba(255,255,255,0.06);
  border-left: 2px solid rgba(0,212,255,0.4);

  box-shadow:
    0 12px 48px rgba(0,0,0,0.5),
    inset 0 1px 0 rgba(255,255,255,0.10),
    inset 0 -1px 0 rgba(0,0,0,0.30);

  /* Soft corner notch */
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 22px), calc(100% - 16px) 100%, 0 100%);
  padding: 26px 22px;
  overflow-y: auto;
}

.upgrades-panel::before {
  /* Subtle inner highlight at top */
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 60%;
  background: radial-gradient(ellipse at top, rgba(0,212,255,0.06), transparent 70%);
  pointer-events: none;
}

.upgrades-panel__title {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 400;
  font-size: 14px;
  letter-spacing: 0.16em;
  color: #E8F4FD;
  text-shadow: 0 0 14px rgba(0,212,255,0.4);
  margin-bottom: 18px;
}

.upgrade-item {
  background: rgba(13,21,38,0.45);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.05);
  border-left: 2px solid var(--severity-color);
  padding: 14px 16px;
  margin-bottom: 12px;
}
```

## A.3 Button position

The "UPGRADES" button that opens this panel: also move to LEFT side. Position fixed top: 80px left: 24px (above the panel slot). Same liquid glass styling but smaller.

When panel open, button hidden. When closed, button visible.

---

# PART B — DARKER RADIAL GRADIENT BACKGROUND

User intent: "center darker, periphery lighter" — graph sits in a dark well, fades brighter at edges. INVERTED vignette for stage-light focus on the graph axis.

## B.1 Update nebula shader

In the nebula shader fragment:

```glsl
varying vec3 vPos;
uniform float uTime;
void main(){
  // Distance from central Y axis (xz radius)
  float radial = length(vec2(vPos.x, vPos.z)) / 5500.0;
  radial = clamp(radial, 0.0, 1.0);

  // Vertical luminosity (unchanged from v13)
  float h = (vPos.y + 4000.0) / 8000.0;

  vec3 deepCenter = vec3(0.002, 0.010, 0.045);  // very dark navy near axis
  vec3 midRing    = vec3(0.020, 0.060, 0.155);  // mid blue
  vec3 outerLight = vec3(0.050, 0.140, 0.275);  // brighter periphery

  vec3 base = mix(deepCenter, midRing, smoothstep(0.0, 0.45, radial));
  vec3 col  = mix(base, outerLight, smoothstep(0.45, 1.0, radial));

  // Subtle vertical tint variation
  col *= mix(0.85, 1.05, smoothstep(0.0, 1.0, h));

  // Faint noise band
  col += 0.012 * sin(vPos.x*0.001 + uTime*0.05) * sin(vPos.z*0.0015);

  gl_FragColor = vec4(col, 1.0);
}
```

## B.2 Scene background color

Update `scene.background = new THREE.Color(0x040A1C)` — slightly darker than v13's #0B1F3E base.

## B.3 Camera vignette via subtle DOM overlay

Add a fixed full-viewport CSS layer with a radial gradient that fades EDGES to lighter (matches the nebula direction):

```css
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 3;  /* above 3D canvas, below HUD */
  background: radial-gradient(
    ellipse at center,
    rgba(0,0,0,0.0) 0%,
    rgba(0,0,0,0.0) 30%,
    rgba(80,140,200,0.04) 70%,
    rgba(120,180,240,0.06) 100%
  );
}
```

---

# PART C — HEXAGONAL DISTRICT PLANES

For each section node, render a horizontal hexagonal plane at its y level, in xz plane. The plane has a 6-vertex outline (LineLoop) and a near-invisible fill. Each section's plane gets the sector's color.

## C.1 Plane dimensions per section

Each plane's outer radius (hex apothem ≈ radius * 0.866) needs to encompass the section + its sub-nodes' orbit.

Sub-node orbit radius is 220 from spine. Plane outer radius: 320 (gives 100u breathing room). For sections without sub-nodes (USER, USER_INPUT, RESPONSE): plane radius 140.

Per-section radii (override in graph state sectors[]):
```
USER         140
USER_INPUT   140
ENKI         360  (larger — central authority + many incoming)
MEMORY       360
SESSION_INIT 320
PROMPT_HOOKS 340
NEXUSPULSE   300
CLASSIFIER   340
ADVISORS     400  (6 advisor subs spread wide)
PULSE_BUS    280
ENKI_DECIDES 300
ROUTING      400
CODEX_GATE   300
GITNEXUS     280
SELF_IMPROVE 300
SERVICES     360
RESPONSE     140
```

Add `plane_radius` field per node entry in graph state OR per sector. Easier: per section node.

## C.2 Geometry + material

```js
function makeDistrictPlane(stageY, radius, colorHex) {
  // Hexagon shape on xz plane
  const shape = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    const angle = (i * 60 + 30) * Math.PI / 180;
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    if (i === 0) shape.moveTo(x, z);
    else shape.lineTo(x, z);
  }
  shape.closePath();

  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(Math.PI / 2);  // lay flat in xz plane

  // Translucent fill
  const fillMat = new THREE.MeshBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.025,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const fillMesh = new THREE.Mesh(geometry, fillMat);
  fillMesh.position.y = stageY;

  // Hex outline (visible)
  const outlineGeom = new THREE.EdgesGeometry(geometry);
  const outlineMat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 0.30,
    depthWrite: false
  });
  const outline = new THREE.LineSegments(outlineGeom, outlineMat);
  outline.position.y = stageY;

  // Tag for click detection / focus
  fillMesh.userData.isDistrictPlane = true;
  outline.userData.isDistrictPlane = true;

  return { fill: fillMesh, outline };
}
```

## C.3 Add planes to scene at boot

```js
const districtPlanes = {};
nodes.filter(n => n.tier === 'section').forEach(section => {
  const sectorColor = parseInt(section.color.replace('#',''), 16);
  const radius = section.plane_radius || 320;
  const { fill, outline } = makeDistrictPlane(section.position.y, radius, sectorColor);
  scene.add(fill);
  scene.add(outline);
  districtPlanes[section.id] = { fill, outline };
});
```

## C.4 Twist alignment

Each district plane rotates around its y axis by the section's twist value (matching the helix). Add:
```js
fillMesh.rotation.y = section.twist;
outline.rotation.y = section.twist;
```

## C.5 Subtle pulse animation

In animate loop, breathing the outline opacity by 0.05 amplitude:
```js
const breath = 0.30 + 0.05 * Math.sin(time * 0.0008 + sectionIndex * 0.5);
outline.material.opacity = breath;
```

This gives the planes a quiet living feel without competing with the orbs.

---

# PART D — CLICK-TO-FOCUS CAMERA

Click on a node → camera tweens to center that node, highlights its family (same as current hover but persistent). Click outside the focused family or press ESC → unfocus, tween back.

## D.1 State

```js
let focusedNode = null;   // currently focused node
let savedCameraPos = null;  // stored camera pos before focus
let savedTarget = null;
```

## D.2 On click handler

Distinguish from double-click (which toggles expand/collapse — already exists):

```js
canvas.addEventListener('click', e => {
  if (clickTimer) {
    // Double click — handled by expand/collapse
    return;
  }
  clickTimer = setTimeout(() => {
    clickTimer = null;
    const picked = raycastPick(e);
    if (picked) {
      focusNode(picked);
    } else if (focusedNode) {
      unfocusNode();
    }
  }, 250);
});
```

## D.3 focusNode

```js
function focusNode(node) {
  if (focusedNode === node) return;

  if (!focusedNode) {
    // Store original camera state on first focus
    savedCameraPos = camera.position.clone();
    savedTarget = controls.target.clone();
  }
  focusedNode = node;

  // Compute target position (node center) and camera position (offset from node)
  const nodePos = node.position.clone();
  const familyExtent = computeFamilyExtent(node);  // radius of family bounding sphere
  const camDistance = Math.max(familyExtent * 2.5, 400);

  // Offset camera along current forward direction (preserve viewing angle)
  const forward = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  const targetCamPos = nodePos.clone().add(forward.multiplyScalar(camDistance));

  tweenCamera(targetCamPos, nodePos, 900);

  // Persistent family highlight (same logic as hover)
  setHoverHighlight(node);
}

function computeFamilyExtent(node) {
  // Family = node + its children + linked nodes via edges
  const family = new Set([node.id]);
  if (node.children) node.children.forEach(c => family.add(c.id));
  edges.forEach(e => {
    if (e.source === node.id) family.add(e.target);
    if (e.target === node.id) family.add(e.source);
  });

  let maxDist = node.r || 50;
  family.forEach(id => {
    const other = nodeById[id];
    if (!other) return;
    const dist = node.position.distanceTo(other.position);
    if (dist > maxDist) maxDist = dist;
  });
  return maxDist + 100;
}

function unfocusNode() {
  if (!focusedNode) return;
  focusedNode = null;
  setHoverHighlight(null);
  if (savedCameraPos) {
    tweenCamera(savedCameraPos, savedTarget, 900);
    savedCameraPos = null;
    savedTarget = null;
  }
}

function tweenCamera(targetPos, targetLook, duration) {
  const startTime = performance.now();
  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  function tick() {
    const t = Math.min(1, (performance.now() - startTime) / duration);
    const e = 0.5 - 0.5 * Math.cos(Math.PI * t);  // easeInOutSine
    camera.position.lerpVectors(startPos, targetPos, e);
    controls.target.lerpVectors(startTarget, targetLook, e);
    controls.update();
    if (t < 1) requestAnimationFrame(tick);
  }
  tick();
}
```

## D.4 ESC key unfocus

```js
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (focusedNode) unfocusNode();
    else closeDrawer();  // existing behavior
  }
});
```

## D.5 Click outside family unfocuses

When click hits empty space (no node picked) AND focusedNode exists → unfocus.
When click hits a node IN the focused family → keep focus, but maybe info panel updates to that node.
When click hits a node OUTSIDE the focused family → re-focus to that node.

```js
function isInFocusedFamily(nodeId) {
  if (!focusedNode) return false;
  if (nodeId === focusedNode.id) return true;
  if (focusedNode.children && focusedNode.children.some(c => c.id === nodeId)) return true;
  return edges.some(e =>
    (e.source === focusedNode.id && e.target === nodeId) ||
    (e.target === focusedNode.id && e.source === nodeId)
  );
}
```

## D.6 Visual indicator

When focused, the focused district plane gets a brighter outline (opacity 0.6 vs 0.3 baseline). Other district planes dim to 0.10.

---

# PART E — VERIFICATION

After implementation:
1. `node /tmp/yuri-introspect.mjs` → DEAD_ENDS:0, CLOSED_LOOPS:12+, no regression
2. Browser screenshot at default view → hex planes visible at each stage level
3. Click ENKI → camera centers on ENKI, all linked nodes brighten, ENKI plane outline brightens
4. ESC → returns to default view
5. UPGRADES panel: left side, blurred glass background, content readable
6. Background: noticeably darker center, lighter periphery (subtle but present)

---

# RULES

- Incremental — preserve v13 state.
- Update both yuri-graph-state.json (sector plane_radius) and embedded GRAPH_STATE.
- Do not break hover/expand-collapse interactions.
- Hex planes are visual only; not raycast targets for node picking.
- Reduced motion: disable hex plane breathing.
- Color tokens stay in CSS variables / graph-state sector colors.
- Each district plane uses its sector color (not a generic one).
