// K2 -- ORTHOGONAL MANHATTAN EDGE ROUTER
// Routes GRAPH edges as axis-aligned PCB/silicon traces through inter-block channels.
//
// Approach: CHANNEL-ASSIGNMENT + LANE-OFFSET orthogonal routing (PCB autorouter style),
// with a Lee/BFS maze fallback for the hard cases a direct channel route can't reach
// without cutting a block.
//
//   Source domain : VLSI/PCB detailed routing (Lee 1961 maze, channel routers).
//   Target domain : circuit-die graph viz.
//   Shared mechanism: global route picks channels (the floorplan gutters); detailed
//                     route assigns a per-net LANE within the channel so parallel
//                     nets never overdraw. Snapping every trace to a regular channel
//                     pitch is what reads as a real die instead of a diagram.
//
// Pure deterministic Node ESM, zero deps. No RNG except seeded mulberry32 (fixed seed)
// used ONLY for stable tie-breaking, never for geometry that must be reproducible.
//
// EXPORT: routeOrthogonal(blocks, cells, graphEdges, channels, opts)
//   -> { routes: [{ from, to, kind, path, bends }] }

const SEED = 0x59555249; // "YURI"
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------------
// geometry helpers
// ----------------------------------------------------------------------------
const EPS = 1e-6;
function approx(a, b, t = EPS) { return Math.abs(a - b) <= t; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Is point (px,py) strictly inside rect interior (with margin shrink)?
function pointInRectInterior(px, py, r, margin = 0) {
  return (
    px > r.x + margin + EPS &&
    px < r.x + r.w - margin - EPS &&
    py > r.y + margin + EPS &&
    py < r.y + r.h - margin - EPS
  );
}

// Snap a coordinate to the nearest value in a sorted gutter list.
function nearestGutter(v, gutters) {
  if (!gutters || gutters.length === 0) return v;
  let best = gutters[0], bd = Math.abs(v - gutters[0]);
  for (let i = 1; i < gutters.length; i++) {
    const d = Math.abs(v - gutters[i]);
    if (d < bd) { bd = d; best = gutters[i]; }
  }
  return best;
}

// Pick the boundary anchor on a cell, on the side facing direction (dx,dy).
// Returns { x, y, side }.
function cellAnchor(cell, dx, dy, laneFrac) {
  const { x, y, w, h } = cell;
  // Decide dominant side: horizontal vs vertical move dominance.
  const ax = Math.abs(dx), ay = Math.abs(dy);
  let side;
  if (ax >= ay) side = dx >= 0 ? "E" : "W";
  else side = dy >= 0 ? "S" : "N";
  // laneFrac in (0,1) spreads multiple anchors along the chosen edge so
  // fan-out from a hub doesn't all exit one point.
  const f = clamp(laneFrac, 0.12, 0.88);
  switch (side) {
    case "E": return { x: x + w, y: y + h * f, side };
    case "W": return { x: x, y: y + h * f, side };
    case "S": return { x: x + w * f, y: y + h, side };
    case "N": return { x: x + w * f, y: y, side };
  }
}

// Build an SVG path string from a list of [x,y] waypoints, with rounded corners.
// r = corner radius. Pure string; render rounds visually too but we encode arcs
// so the geometry stays axis-aligned between corners.
function pathFromPoints(pts, r) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  let d = `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    // incoming + outgoing unit dirs
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const rr = Math.max(0, Math.min(r, inLen / 2, outLen / 2));
    if (rr < 0.5) { d += ` L ${fmt(cx)} ${fmt(cy)}`; continue; }
    const ux = inLen > 0 ? (cx - px) / inLen : 0;
    const uy = inLen > 0 ? (cy - py) / inLen : 0;
    const vx = outLen > 0 ? (nx - cx) / outLen : 0;
    const vy = outLen > 0 ? (ny - cy) / outLen : 0;
    const sx = cx - ux * rr, sy = cy - uy * rr; // start of arc
    const ex = cx + vx * rr, ey = cy + vy * rr; // end of arc
    d += ` L ${fmt(sx)} ${fmt(sy)}`;
    d += ` Q ${fmt(cx)} ${fmt(cy)} ${fmt(ex)} ${fmt(ey)}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${fmt(last[0])} ${fmt(last[1])}`;
  return d;
}
function fmt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(2); }

// Count bends (direction changes) in a waypoint list.
function countBends(pts) {
  let bends = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const d1x = Math.sign(cx - px), d1y = Math.sign(cy - py);
    const d2x = Math.sign(nx - cx), d2y = Math.sign(ny - cy);
    if (d1x !== d2x || d1y !== d2y) bends++;
  }
  return bends;
}

// Collapse collinear / duplicate waypoints so the path is minimal & clean.
function simplify(pts) {
  const out = [];
  for (const p of pts) {
    if (out.length === 0) { out.push(p); continue; }
    const last = out[out.length - 1];
    if (approx(last[0], p[0]) && approx(last[1], p[1])) continue; // dup
    out.push(p);
  }
  // remove collinear interior points
  const res = [];
  for (let i = 0; i < out.length; i++) {
    if (i === 0 || i === out.length - 1) { res.push(out[i]); continue; }
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const collinearH = approx(a[1], b[1]) && approx(b[1], c[1]);
    const collinearV = approx(a[0], b[0]) && approx(b[0], c[0]);
    if (collinearH || collinearV) continue;
    res.push(out[i]);
  }
  return res;
}

// ----------------------------------------------------------------------------
// obstacle test: does a segment cross any non-endpoint block interior?
// segments are axis-aligned. We test against shrunk block rects (margin) so
// traces hugging a gutter that grazes a block edge are allowed.
// ----------------------------------------------------------------------------
function segHitsBlocks(p0, p1, blocks, allowSet, margin) {
  const [x0, y0] = p0, [x1, y1] = p1;
  for (const b of blocks) {
    if (allowSet.has(b)) continue;
    // shrink block by margin -> only the true interior is forbidden
    const rx = b.x + margin, ry = b.y + margin;
    const rw = b.w - 2 * margin, rh = b.h - 2 * margin;
    if (rw <= 0 || rh <= 0) continue;
    if (segIntersectsRect(x0, y0, x1, y1, rx, ry, rw, rh)) return true;
  }
  return false;
}
// axis-aligned segment vs rect (interior) intersection.
function segIntersectsRect(x0, y0, x1, y1, rx, ry, rw, rh) {
  const rxe = rx + rw, rye = ry + rh;
  if (approx(y0, y1)) {
    // horizontal segment at y0
    if (y0 <= ry + EPS || y0 >= rye - EPS) return false;
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    // overlap of [lo,hi] with (rx,rxe) open interval
    return hi > rx + EPS && lo < rxe - EPS;
  } else {
    // vertical segment at x0
    if (x0 <= rx + EPS || x0 >= rxe - EPS) return false;
    const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
    return hi > ry + EPS && lo < rye - EPS;
  }
}

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------
export function routeOrthogonal(blocks, cells, graphEdges, channels, opts = {}) {
  const o = {
    cornerRadius: 4,
    laneGap: 6,           // px between parallel lanes in a channel
    blockMargin: 2,       // interior shrink for obstacle test (must match invariant tol)
    stubMin: 8,           // min escape stub off a cell before turning
    bendPenalty: 30,      // maze cost per corner (favors straight, low-bend traces)
    congestPenalty: 5000, // maze cost for riding an already-claimed lane (forces fan-out)
    ...opts,
  };
  const rng = mulberry32(SEED);

  const vGutters = (channels && channels.vGutters ? channels.vGutters.slice() : []).sort((a, b) => a - b);
  const hGutters = (channels && channels.hGutters ? channels.hGutters.slice() : []).sort((a, b) => a - b);

  // Only route edges whose BOTH endpoints are present cells.
  const present = (id) => Object.prototype.hasOwnProperty.call(cells, id);
  const live = graphEdges.filter((e) => present(e.from) && present(e.to) && e.from !== e.to);

  // ---- deterministic ordering: longest-manhattan first (route hard nets early),
  //      tie-broken by a CONTENT hash of the edge, so the routing order -- and thus
  //      the greedy lane occupancy and final geometry -- is invariant to the order
  //      edges arrive in. (A call-order rng() tie would make output input-order
  //      dependent; the edge key must come from the edge itself.)
  const edgeKeyStr = (e) => `${e.from} ${e.to} ${e.kind}`;
  const fnv = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
  const keyed = live.map((e) => {
    const a = cells[e.from], b = cells[e.to];
    const md = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
    const ks = edgeKeyStr(e);
    return { e, md, tie: fnv(ks), ks };
  });
  keyed.sort((p, q) => (q.md - p.md) || (p.tie - q.tie) || (p.ks < q.ks ? -1 : p.ks > q.ks ? 1 : 0));
  void rng; // seeded rng retained for any future stable jitter; not used for ordering.

  // ---- lane bookkeeping: per gutter coordinate, how many traces already used it.
  // We hash each net deterministically into a lane index, then resolve collisions
  // by incrementing until a free lane on that exact gutter segment is found.
  // occupancy keyed by `${orient}:${gutterCoord}:${laneIdx}` mapped to list of [lo,hi] spans.
  const occupancy = new Map();
  function laneCoord(orient, base, laneIdx) {
    // alternate lanes outward from base: 0, +g, -g, +2g, -2g ...
    const k = laneIdx;
    const step = Math.ceil(k / 2) * o.laneGap;
    const sign = k % 2 === 1 ? 1 : -1;
    return base + (k === 0 ? 0 : sign * step);
  }
  function spanOverlap(spans, lo, hi) {
    for (const s of spans) {
      if (hi > s.lo + EPS && lo < s.hi - EPS) return true;
    }
    return false;
  }
  // claimLane is callable AND carries .release / .recordFixed helpers.
  // It searches lanes outward from a deterministic hint for the first whose
  // existing spans don't overlap the requested [lo,hi], then reserves it.
  const claimLane = function (orient, base, lo, hi, hint) {
    const LO = Math.min(lo, hi), HI = Math.max(lo, hi);
    for (let attempt = 0; attempt < 96; attempt++) {
      const laneIdx = hint + attempt;
      const coord = laneCoord(orient, base, laneIdx);
      const key = `${orient}:${coord.toFixed(2)}`;
      const spans = occupancy.get(key) || [];
      if (!spanOverlap(spans, LO, HI)) {
        spans.push({ lo: LO, hi: HI });
        occupancy.set(key, spans);
        return coord;
      }
    }
    // fallback: push a fresh far lane (still records occupancy)
    const coord = laneCoord(orient, base, hint + 1000);
    const key = `${orient}:${coord.toFixed(2)}`;
    const spans = occupancy.get(key) || [];
    spans.push({ lo: LO, hi: HI });
    occupancy.set(key, spans);
    return coord;
  };
  // Remove a previously-claimed span (used when a candidate skeleton is rejected).
  claimLane.release = function (orient, coord, lo, hi) {
    const LO = Math.min(lo, hi), HI = Math.max(lo, hi);
    const key = `${orient}:${coord.toFixed(2)}`;
    const spans = occupancy.get(key);
    if (!spans) return;
    const i = spans.findIndex((s) => approx(s.lo, LO, 0.01) && approx(s.hi, HI, 0.01));
    if (i >= 0) spans.splice(i, 1);
  };
  // Record occupancy at a FIXED coordinate without re-laning (approach stubs,
  // maze runs). Used so the overdraw checker's accounting stays consistent.
  claimLane.recordFixed = function (orient, coord, lo, hi) {
    const LO = Math.min(lo, hi), HI = Math.max(lo, hi);
    const key = `${orient}:${coord.toFixed(2)}`;
    const spans = occupancy.get(key) || [];
    spans.push({ lo: LO, hi: HI });
    occupancy.set(key, spans);
  };
  // Non-mutating overlap probe at a coordinate (used by segment-level laneAssign).
  claimLane.wouldOverlap = function (orient, coord, lo, hi) {
    const key = `${orient}:${coord.toFixed(2)}`;
    const spans = occupancy.get(key);
    if (!spans) return false;
    return spanOverlap(spans, Math.min(lo, hi), Math.max(lo, hi));
  };

  // deterministic per-edge hash -> lane hint (so parallel nets fan into distinct lanes)
  function edgeHash(e) {
    const s = `${e.from}->${e.to}:${e.kind}`;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }

  // For hub fan-out: spread exit anchors along the source/target edge.
  // Count how many live edges touch each cell, assign each its ordinal.
  const touchOrder = new Map(); // nodeId -> array of edgeKeys in deterministic order
  for (const { e } of keyed) {
    for (const id of [e.from, e.to]) {
      if (!touchOrder.has(id)) touchOrder.set(id, []);
      touchOrder.get(id).push(`${e.from}->${e.to}`);
    }
  }
  // Per-cell deterministic phase so two grid-aligned cells don't pick identical
  // escape coordinates (which would make a stub into one cell collide with a
  // through-track grazing the other). Kept small so the clean channel router still
  // finds 2-bend routes for most nets; the maze + congestion resolves the rest.
  function cellPhase(nodeId) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < nodeId.length; i++) { h ^= nodeId.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return ((h % 1000) / 1000 - 0.5) * 0.18; // in [-0.09, 0.09]
  }
  function anchorFrac(nodeId, edgeKey) {
    const arr = touchOrder.get(nodeId);
    const n = arr.length;
    const idx = arr.indexOf(edgeKey);
    const base = n <= 1 ? 0.5 : (idx + 1) / (n + 1);
    return clamp(base + cellPhase(nodeId) / Math.max(1, n), 0.12, 0.88);
  }

  const routes = [];

  for (const { e } of keyed) {
    const src = cells[e.from];
    const dst = cells[e.to];
    const ek = `${e.from}->${e.to}`;
    const hHint = edgeHash(e) % 7;

    const dx = dst.cx - src.cx;
    const dy = dst.cy - src.cy;

    const sFrac = anchorFrac(e.from, ek);
    const tFrac = anchorFrac(e.to, ek);
    const aSrc = cellAnchor(src, dx, dy, sFrac);
    const aDst = cellAnchor(dst, -dx, -dy, tFrac);

    // allowSet: the two endpoint blocks are permitted to be entered (their cells
    // live inside them). We identify blocks by reference; match via geometry.
    const allow = endpointBlocks(blocks, src, dst);

    const pts = routeNet(
      aSrc, aDst, src, dst, vGutters, hGutters, blocks, allow,
      o, claimLane, hHint
    );

    const clean = simplify(pts);
    const bends = countBends(clean);
    const route = {
      from: e.from,
      to: e.to,
      kind: e.kind,
      path: pathFromPoints(clean, o.cornerRadius),
      bends,
    };
    // _pts (raw waypoints) is exposed for tests/debug but kept NON-ENUMERABLE so
    // the shipped payload serializes to exactly {from,to,kind,path,bends}.
    Object.defineProperty(route, "_pts", { value: clean, enumerable: false });
    routes.push(route);
  }

  return { routes };
}

// Which blocks contain the endpoint cells (allowed to be traversed at endpoints).
function endpointBlocks(blocks, src, dst) {
  const set = new Set();
  for (const b of blocks) {
    if (rectContainsCell(b, src) || rectContainsCell(b, dst)) set.add(b);
  }
  return set;
}
function rectContainsCell(b, c) {
  return (
    c.cx >= b.x - EPS && c.cx <= b.x + b.w + EPS &&
    c.cy >= b.y - EPS && c.cy <= b.y + b.h + EPS
  );
}

// ----------------------------------------------------------------------------
// route a single net from anchor aSrc to aDst.
// Strategy:
//   1. push a short escape stub off each cell to clear the block edge.
//   2. travel to a chosen vertical gutter (claim a lane), then a horizontal
//      gutter (claim a lane), forming an orthogonal staircase that lives in
//      channels.
//   3. validate against block interiors; if any segment cuts a block, fall
//      back to a Lee/BFS maze on the gutter-grid.
// ----------------------------------------------------------------------------
function routeNet(aSrc, aDst, src, dst, vGutters, hGutters, blocks, allow, o, claimLane, hHint) {
  const stub = o.stubMin;
  // escape points: move outward from the cell edge by `stub`.
  const eSrc = escape(aSrc, stub);
  const eDst = escape(aDst, stub);

  const midX = (eSrc.x + eDst.x) / 2;
  const midY = (eSrc.y + eDst.y) / 2;
  const gx0 = nearestGutter(midX, vGutters);
  const gy0 = nearestGutter(midY, hGutters);

  // Build anchor-aware Z-skeletons. The cell connection direction is dictated by
  // the anchor side (E/W -> horizontal stub; N/S -> vertical stub). After each
  // stub the route immediately hops onto a LANED track, so it never rides a long
  // run pinned to a fixed escape coordinate. We try the side-consistent orders.
  const candidates = [];
  for (const order of skeletonOrders(aSrc, aDst)) {
    const skeleton = buildSkeleton(order, aSrc, aDst, eSrc, eDst, gx0, gy0, midX, midY, vGutters, hGutters);
    const laned = laneAssign(skeleton, aSrc, aDst, eSrc, eDst, o, claimLane, hHint, blocks, allow);
    if (laned && pathIsClean(laned.pts, blocks, allow, o.blockMargin)) {
      candidates.push(laned);
    } else if (laned) {
      laned.commit.forEach((c) => claimLane.release(c.orient, c.coord, c.lo, c.hi));
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => countBends(a.pts) - countBends(b.pts) || pathLen(a.pts) - pathLen(b.pts));
    // release the loser's committed lanes; keep winner's.
    for (let i = 1; i < candidates.length; i++) {
      candidates[i].commit.forEach((c) => claimLane.release(c.orient, c.coord, c.lo, c.hi));
    }
    return candidates[0].pts;
  }

  // ---- fallback: lane-aware Lee/Dijkstra maze (handles long multi-block crossings
  // and congested regions; fans onto distinct sublanes via the congestion cost).
  const maze = mazeRoute(eSrc, eDst, aSrc, aDst, vGutters, hGutters, blocks, allow, o, claimLane);
  if (maze) { recordInteriorRuns(maze, claimLane); return maze; }

  // last resort: direct L (still axis-aligned). Records its runs so later nets
  // still see the occupancy.
  const lpts = simplify([
    [aSrc.x, aSrc.y], [eSrc.x, eSrc.y],
    [eDst.x, eSrc.y],
    [eDst.x, eDst.y], [aDst.x, aDst.y],
  ]);
  recordInteriorRuns(lpts, claimLane);
  return lpts;
}

// Record every INTERIOR run (skip the first/last cell stubs) of an arbitrary
// polyline so later nets avoid these lanes.
function recordInteriorRuns(pts, claimLane) {
  const runs = polylineRuns(pts);
  for (let i = 0; i < runs.length; i++) {
    if (i === 0 || i === runs.length - 1) continue;
    const r = runs[i];
    if (r.len > 1.0) claimLane.recordFixed(r.orient, r.coord, r.lo, r.hi);
  }
}

// Pick the skeleton orders to try, given the anchor sides. We try the MINIMAL
// (2-bend) Z first for a clean low-bend trace, then the dogleg variant which has
// more freedom to dodge congestion. The stub at each cell must point along the
// anchor's axis (E/W -> H stub; N/S -> V stub).
function skeletonOrders(aSrc, aDst) {
  const sH = aSrc.side === "E" || aSrc.side === "W";
  const dH = aDst.side === "E" || aDst.side === "W";
  const base = `${sH ? "H" : "V"}s${dH ? "H" : "V"}d`;
  return [base + "-MIN", base]; // minimal Z first, then the dogleg
}

// A skeleton is the ideal polyline as a function of FOUR laned-track coordinates:
//   gx  = V track carrying the source's horizontal escape onto a vertical channel
//   gy  = H track carrying the main horizontal transition
//   gx2 = V track descending to the target row, laned just outside the target col
//   gy2 = H track for the source's vertical escape (VsXd orders)
// Cell stubs (S->eS and eD->D) are the ONLY fixed runs; every transition run rides
// a laned track, so a free-lane search makes the whole trace overdraw-free. This is
// the dogleg channel-router move: enter/leave each block on a short stub, ride
// channels in between.
function buildSkeleton(order, aSrc, aDst, eSrc, eDst, gx0, gy0, midX, midY, vGutters, hGutters) {
  const gxBase = vGutters.length ? gx0 : midX;
  const gyBase = hGutters.length ? gy0 : midY;
  const S = [aSrc.x, aSrc.y], eS = [eSrc.x, eSrc.y];
  const D = [aDst.x, aDst.y], eD = [eDst.x, eDst.y];
  // dogleg track bases hugging the cells so the final stub stays short.
  const gx2Base = eDst.x; // V descent track just outside the target's H-escape edge
  const gy2Base = eSrc.y; // H track at source row for HsXd
  let build;
  switch (order) {
    case "HsHd-MIN":
      // minimal 2-bend Z: src H-stub -> V track gx -> short H stub into dst.
      // Works when src and dst rows differ and a single V track gx connects them.
      build = (gx) => [
        S, eS,
        [gx, eSrc.y],  // H jog onto V track gx
        [gx, eDst.y],  // ride V track gx to target row
        eD, D,         // short H stub into dst
      ];
      break;
    case "VsVd-MIN":
      build = (gx, gy) => [
        S, eS,
        [eSrc.x, gy],  // V jog onto H track gy
        [eDst.x, gy],  // ride H track gy to target col
        eD, D,         // short V stub into dst
      ];
      break;
    case "HsVd-MIN":
      build = (gx, gy) => [
        S, eS,
        [gx, eSrc.y],
        [gx, gy],
        [eDst.x, gy],
        eD, D,
      ];
      break;
    case "VsHd-MIN":
      build = (gx, gy) => [
        S, eS,
        [eSrc.x, gy],
        [gx, gy],
        [gx, eDst.y],
        eD, D,
      ];
      break;
    case "HsHd":
      // src H-stub -> V track gx -> H track gy -> V track gx2 -> short H stub -> dst
      build = (gx, gy, gx2) => [
        S, eS,
        [gx, eSrc.y],   // H jog from eS onto V track gx (at src row)
        [gx, gy],       // ride V track gx to H track gy
        [gx2, gy],      // ride H track gy to descent track gx2
        [gx2, eDst.y],  // descend V track gx2 to target row
        eD, D,          // short H stub into dst
      ];
      break;
    case "VsVd":
      // src V-stub -> H track gy -> V track gx -> H track gy2 -> short V stub -> dst
      build = (gx, gy, gx2, gy2) => [
        S, eS,
        [eSrc.x, gy],   // V jog from eS onto H track gy (at src col)
        [gx, gy],       // ride H track gy to V track gx
        [gx, gy2],      // ride V track gx to H track gy2
        [eDst.x, gy2],  // ride H track gy2 to target col
        eD, D,          // short V stub into dst
      ];
      break;
    case "HsVd":
      // src H-stub -> V track gx -> H track gy -> short V stub -> dst
      build = (gx, gy) => [
        S, eS,
        [gx, eSrc.y],
        [gx, gy],
        [eDst.x, gy],   // ride H track gy to target col (eDst.x is dst's V-escape)
        eD, D,
      ];
      break;
    case "VsHd":
      // src V-stub -> H track gy -> V track gx -> short H stub -> dst
      build = (gx, gy) => [
        S, eS,
        [eSrc.x, gy],
        [gx, gy],
        [gx, eDst.y],   // ride V track gx to target row (eDst.y is dst's H-escape)
        eD, D,
      ];
      break;
    default:
      build = (gx, gy) => [S, eS, [gx, eSrc.y], [gx, gy], [eDst.x, gy], eD, D];
  }
  return { order, gxBase, gyBase, gx2Base, gy2Base, build };
}

// Segment-level lane assignment. Searches (gx, gy) lane coordinates outward from
// the gutter base until EVERY long run of the resulting polyline is overdraw-free
// against the occupancy map. Short cell stubs (<= stubMax) are exempt: anchorFrac
// makes them per-edge distinct, and they touch a shared endpoint cell legitimately.
function laneAssign(skeleton, aSrc, aDst, eSrc, eDst, o, claimLane, hHint, blocks, allow) {
  const stub = o.stubMin; // exempt-stub length near each anchor
  const lanesToTry = 18;
  const { gxBase, gyBase, gx2Base, gy2Base } = skeleton;

  // Track how many laned coords this skeleton's build needs (by arity).
  const arity = skeleton.build.length;

  // Iterate lane indices for each needed track, expanding outward from the base.
  // Order of nesting keeps the deterministic preference: small lane indices first.
  for (let gi = 0; gi < lanesToTry; gi++) {
    const gx = laneCoordPub("V", gxBase, hHint + gi, o.laneGap);
    for (let hj = 0; hj < lanesToTry; hj++) {
      const gy = laneCoordPub("H", gyBase, hHint + hj, o.laneGap);
      // For 2-track orders, gx2/gy2 unused -> single pass.
      const need2 = arity >= 3;
      const need2b = arity >= 4;
      const range3 = need2 ? lanesToTry : 1;
      for (let k = 0; k < range3; k++) {
        const gx2 = need2 ? laneCoordPub("V", gx2Base, hHint + k, o.laneGap) : 0;
        const range4 = need2b ? lanesToTry : 1;
        for (let m = 0; m < range4; m++) {
          const gy2 = need2b ? laneCoordPub("H", gy2Base, hHint + m, o.laneGap) : 0;
          const pts = simplify(skeleton.build(gx, gy, gx2, gy2));
          // Decompose into runs, trimming a `stub`-length exempt segment off any run
          // that touches an anchor (aSrc/aDst). The trimmed (track) portion is the
          // shared real estate that MUST be overdraw-free; the stub portion touches
          // the cell at a per-edge-distinct coord and is allowed to converge there.
          // simplify() can merge a stub with its collinear track run, so trimming by
          // distance-from-anchor (not by run index) is what makes the clean 2-bend
          // Z survive the overdraw gate.
          const laneRuns = trimAnchorStubs(polylineRuns(pts), aSrc, aDst, stub);
          if (laneRuns.every((r) => !claimLane.wouldOverlap(r.orient, r.coord, r.lo, r.hi))) {
            if (!pathIsClean(pts, blocks, allow, o.blockMargin)) continue;
            const commit = [];
            for (const r of laneRuns) { claimLane.recordFixed(r.orient, r.coord, r.lo, r.hi); commit.push(r); }
            return { pts, commit };
          }
        }
      }
    }
  }
  return null; // no clean lane assignment within the search window
}

// Trim a `stub`-length exempt segment off the end of any run that touches an
// anchor point, returning only the laned (shared-track) portions for overdraw
// checking + claiming. A run reduced below ~1px is dropped (pure stub).
function trimAnchorStubs(runs, aSrc, aDst, stub) {
  const anchors = [aSrc, aDst];
  const out = [];
  for (const r of runs) {
    let lo = r.lo, hi = r.hi;
    // endpoints of this run in 2D
    const e0 = r.orient === "H" ? { x: r.lo, y: r.coord } : { x: r.coord, y: r.lo };
    const e1 = r.orient === "H" ? { x: r.hi, y: r.coord } : { x: r.coord, y: r.hi };
    for (const a of anchors) {
      if (approx(e0.x, a.x, 0.5) && approx(e0.y, a.y, 0.5)) lo += stub; // trim from low end
      if (approx(e1.x, a.x, 0.5) && approx(e1.y, a.y, 0.5)) hi -= stub; // trim from high end
    }
    if (hi - lo > 1.0) out.push({ orient: r.orient, coord: r.coord, lo, hi, len: hi - lo });
  }
  return out;
}

// public lane-coordinate generator (mirror of internal laneCoord, exported shape).
function laneCoordPub(orient, base, laneIdx, gap) {
  const k = laneIdx;
  if (k === 0) return base;
  const step = Math.ceil(k / 2) * gap;
  const sign = k % 2 === 1 ? 1 : -1;
  return base + sign * step;
}

// decompose a polyline into straight runs with orientation/coord/span/length.
function polylineRuns(pts) {
  const runs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    if (Math.abs(y0 - y1) < EPS && Math.abs(x0 - x1) >= EPS) {
      runs.push({ orient: "H", coord: y0, lo: Math.min(x0, x1), hi: Math.max(x0, x1), len: Math.abs(x1 - x0) });
    } else if (Math.abs(x0 - x1) < EPS && Math.abs(y0 - y1) >= EPS) {
      runs.push({ orient: "V", coord: x0, lo: Math.min(y0, y1), hi: Math.max(y0, y1), len: Math.abs(y1 - y0) });
    }
  }
  return runs;
}

function escape(anchor, stub) {
  switch (anchor.side) {
    case "E": return { x: anchor.x + stub, y: anchor.y };
    case "W": return { x: anchor.x - stub, y: anchor.y };
    case "S": return { x: anchor.x, y: anchor.y + stub };
    case "N": return { x: anchor.x, y: anchor.y - stub };
  }
  return { x: anchor.x, y: anchor.y };
}

function pathIsClean(pts, blocks, allow, margin) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (segHitsBlocks(pts[i], pts[i + 1], blocks, allow, margin)) return false;
  }
  return true;
}
function pathLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
  return L;
}

// ----------------------------------------------------------------------------
// Lane-aware Lee/Dijkstra maze. The reliable universal router for any net the
// fast channel-assignment couldn't place (long multi-block crossings, congested
// regions). Grid = gutter sublanes (each channel split into parallel tracks at
// base +/- k*laneGap) + escape coords + block-edge offsets. Cost = manhattan
// length + bend penalty + a CONGESTION penalty for riding an already-claimed
// lane. This makes parallel nets fan onto distinct sublanes (the PCB detailed
// router move) instead of overdrawing, while strictly avoiding block interiors.
// ----------------------------------------------------------------------------
function mazeRoute(eSrc, eDst, aSrc, aDst, vGutters, hGutters, blocks, allow, o, claimLane) {
  const gap = o.laneGap;
  const SUBLANES = 4; // sublanes each side of a gutter base
  // Clip gridlines to the route's bounding box plus a detour corridor, so the
  // maze grid stays small (Dijkstra is O(W*H*log) -- bounding the window keeps the
  // one-time bake fast without hurting reachability for realistic detours).
  const corridor = 3 * 160; // generous detour margin (~3 cell widths)
  const xLo = Math.min(eSrc.x, eDst.x, aSrc.x, aDst.x) - corridor;
  const xHi = Math.max(eSrc.x, eDst.x, aSrc.x, aDst.x) + corridor;
  const yLo = Math.min(eSrc.y, eDst.y, aSrc.y, aDst.y) - corridor;
  const yHi = Math.max(eSrc.y, eDst.y, aSrc.y, aDst.y) + corridor;
  const inX = (v) => v >= xLo - EPS && v <= xHi + EPS;
  const inY = (v) => v >= yLo - EPS && v <= yHi + EPS;

  const xset = new Set();
  for (const gv of vGutters) for (let k = -SUBLANES; k <= SUBLANES; k++) { const v = round2(gv + k * gap); if (inX(v)) xset.add(v); }
  for (const v of [eSrc.x, eDst.x, aSrc.x, aDst.x]) xset.add(round2(v)); // always keep endpoints
  for (const b of blocks) { const a = round2(b.x - gap), c = round2(b.x + b.w + gap); if (inX(a)) xset.add(a); if (inX(c)) xset.add(c); }
  const yset = new Set();
  for (const gh of hGutters) for (let k = -SUBLANES; k <= SUBLANES; k++) { const v = round2(gh + k * gap); if (inY(v)) yset.add(v); }
  for (const v of [eSrc.y, eDst.y, aSrc.y, aDst.y]) yset.add(round2(v));
  for (const b of blocks) { const a = round2(b.y - gap), c = round2(b.y + b.h + gap); if (inY(a)) yset.add(a); if (inY(c)) yset.add(c); }

  const xs = uniqSorted([...xset]);
  const ys = uniqSorted([...yset]);
  const W = xs.length, H = ys.length;
  if (W * H > 200000) return null; // safety bound
  const idx = (ix, iy) => iy * W + ix;

  const startIx = nearestIndex(eSrc.x, xs), startIy = nearestIndex(eSrc.y, ys);
  const goalIx = nearestIndex(eDst.x, xs), goalIy = nearestIndex(eDst.y, ys);
  const start = idx(startIx, startIy), goal = idx(goalIx, goalIy);

  const dist = new Float64Array(W * H).fill(Infinity);
  const prev = new Int32Array(W * H).fill(-1);
  const prevDir = new Int8Array(W * H).fill(-1); // 0=H,1=V
  dist[start] = 0;
  // simple binary-heap Dijkstra (deterministic: tie-break by node id)
  const heap = new MinHeap();
  heap.push(0, start);
  const segOk = (x0, y0, x1, y1) => !segHitsBlocks([x0, y0], [x1, y1], blocks, allow, o.blockMargin);

  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    const cd = dist[cur];
    const cix = cur % W, ciy = (cur - cix) / W;
    const dir = prevDir[cur];
    const neigh = [
      [cix + 1, ciy, 0], [cix - 1, ciy, 0], [cix, ciy + 1, 1], [cix, ciy - 1, 1],
    ];
    for (const [nix, niy, ndir] of neigh) {
      if (nix < 0 || nix >= W || niy < 0 || niy >= H) continue;
      const nid = idx(nix, niy);
      const x0 = xs[cix], y0 = ys[ciy], x1 = xs[nix], y1 = ys[niy];
      if (!segOk(x0, y0, x1, y1)) continue;
      const segLen = Math.abs(x1 - x0) + Math.abs(y1 - y0);
      const bend = (dir !== -1 && dir !== ndir) ? o.bendPenalty : 0;
      // congestion: does this grid edge overlap an already-claimed lane?
      let congest = 0;
      if (claimLane) {
        if (ndir === 0) { if (claimLane.wouldOverlap("H", y0, Math.min(x0, x1), Math.max(x0, x1))) congest = o.congestPenalty; }
        else { if (claimLane.wouldOverlap("V", x0, Math.min(y0, y1), Math.max(y0, y1))) congest = o.congestPenalty; }
      }
      const nd = cd + segLen + bend + congest;
      if (nd < dist[nid] - EPS) {
        dist[nid] = nd; prev[nid] = cur; prevDir[nid] = ndir;
        heap.push(nd, nid);
      }
    }
  }
  if (!isFinite(dist[goal])) return null;
  const grid = [];
  let c = goal;
  while (c !== -1) { const ix = c % W, iy = (c - ix) / W; grid.push([xs[ix], ys[iy]]); c = prev[c]; }
  grid.reverse();
  // Force grid endpoints to the EXACT escape points (the nearest gridline may be a
  // hair off after round2). Then prepend/append the cell stubs. The stub aSrc->eSrc
  // is axis-aligned because the anchor and its escape share one coordinate.
  if (grid.length) { grid[0] = [eSrc.x, eSrc.y]; grid[grid.length - 1] = [eDst.x, eDst.y]; }
  const path = simplify([[aSrc.x, aSrc.y], [eSrc.x, eSrc.y], ...grid, [eDst.x, eDst.y], [aDst.x, aDst.y]]);
  // Guarantee axis-alignment: if any consecutive pair is diagonal (can happen if a
  // forced endpoint snap left a jog), insert an L-corner to rectify.
  return rectify(path);
}

// Ensure every consecutive pair is axis-aligned; insert an L-corner where a
// diagonal slipped in (defensive -- the grid is rectilinear, this is belt+braces).
function rectify(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = out[out.length - 1];
    const [cx, cy] = pts[i];
    if (Math.abs(px - cx) > EPS && Math.abs(py - cy) > EPS) {
      out.push([cx, py]); // horizontal then vertical corner
    }
    out.push([cx, cy]);
  }
  return simplify(out);
}
function round2(v) { return Math.round(v * 100) / 100; }

// Deterministic binary min-heap keyed by (cost, node). Ties broken by node id so
// the search order -- and therefore the output -- is fully reproducible.
class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(cost, node) {
    const a = this.a; a.push([cost, node]); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (less(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; const n = a.length;
      for (;;) { let l = 2 * i + 1, r = l + 1, m = i;
        if (l < n && less(a[l], a[m])) m = l;
        if (r < n && less(a[r], a[m])) m = r;
        if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top[1];
  }
}
function less(x, y) { return x[0] < y[0] - 1e-9 || (Math.abs(x[0] - y[0]) <= 1e-9 && x[1] < y[1]); }

function uniqSorted(arr) {
  const s = arr.slice().sort((a, b) => a - b);
  const out = [];
  for (const v of s) { if (out.length === 0 || Math.abs(out[out.length - 1] - v) > EPS) out.push(v); }
  return out;
}
function nearestIndex(v, sortedVals) {
  let best = 0, bd = Math.abs(v - sortedVals[0]);
  for (let i = 1; i < sortedVals.length; i++) { const d = Math.abs(v - sortedVals[i]); if (d < bd) { bd = d; best = i; } }
  return best;
}

export default routeOrthogonal;
