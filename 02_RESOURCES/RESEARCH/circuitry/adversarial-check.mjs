import { readFileSync } from "node:fs";
import { buildFloorplan } from "./K1-floorplan.mjs";
const g = JSON.parse(readFileSync("/Users/marcelspatz/YURI-OS-MUSUBI/02_RESOURCES/RESEARCH/yuri-circuitry-graph.json","utf8"));
const fp = buildFloorplan(g.nodes);
const cx = fp.canvas.w/2, cy = fp.canvas.h/2;
const ctr = b => ({x:b.x+b.w/2, y:b.y+b.h/2});

// A) Which block is closest to centre? Should be Energy & Math (central die region).
const ranked = fp.blocks.map(b=>{const c=ctr(b);return {layer:b.layer, moat:b.moat, d:+Math.hypot(c.x-cx,c.y-cy).toFixed(1)};}).sort((a,b)=>a.d-b.d);
console.log("A) blocks by distance from centre (closest first):");
ranked.forEach(r=>console.log(`   ${r.d.toString().padStart(7)}  ${r.moat?"MOAT":"    "}  ${r.layer}`));
console.log("   => central die region is:", ranked[0].layer, ranked[0].layer==="Energy & Math"?"OK (matches spec)":"!! NOT Energy&Math");

// B) worst-case cell slack to block right/bottom inner edge (must be >=0, want >0 margin)
const blByL = new Map(fp.blocks.map(b=>[b.layer,b]));
let minSlackR=1e9, minSlackB=1e9, minSlackL=1e9, minSlackT=1e9;
for(const [id,c] of Object.entries(fp.cells)){
  const b=blByL.get(c.layer);
  minSlackR=Math.min(minSlackR, (b.x+b.w)-(c.x+c.w));
  minSlackB=Math.min(minSlackB, (b.y+b.h)-(c.y+c.h));
  minSlackL=Math.min(minSlackL, c.x-b.x);
  minSlackT=Math.min(minSlackT, c.y-(b.y+b.labelH));
}
console.log(`B) min cell slack -> right=${minSlackR} bottom=${minSlackB} left=${minSlackL} top=${minSlackT} (all must be >=0)`);

// C) gutter centre-lines must fall in empty space: no block rect spans the line
function blocksAcrossX(x){return fp.blocks.filter(b=>b.x < x && x < b.x+b.w).map(b=>b.layer);}
function blocksAcrossY(y){return fp.blocks.filter(b=>b.y < y && y < b.y+b.h).map(b=>b.layer);}
console.log("C) vGutters:", fp.channels.vGutters, "-> blocks crossing each (want []):", fp.channels.vGutters.map(blocksAcrossX));
console.log("   hGutters:", fp.channels.hGutters, "-> blocks crossing each (want []):", fp.channels.hGutters.map(blocksAcrossY));

// D) minimum gap between any two blocks (must be >0; should be ~gutter where adjacent)
function gap(a,b){
  const dx = Math.max(0, Math.max(b.x-(a.x+a.w), a.x-(b.x+b.w)));
  const dy = Math.max(0, Math.max(b.y-(a.y+a.h), a.y-(b.y+b.h)));
  if(dx>0&&dy>0) return Math.hypot(dx,dy);
  return dx+dy; // axis-aligned separation
}
let mg=1e9, pair="";
for(let i=0;i<fp.blocks.length;i++)for(let j=i+1;j<fp.blocks.length;j++){const gp=gap(fp.blocks[i],fp.blocks[j]);if(gp<mg){mg=gp;pair=fp.blocks[i].layer+" / "+fp.blocks[j].layer;}}
console.log(`D) min inter-block gap = ${mg.toFixed(1)} between [${pair}] (want >0; touching=0 would be a fail)`);
