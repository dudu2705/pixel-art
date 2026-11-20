// The monorail: a beam 12.6 m up on pylons, round the ring of streets that frames downtown Vanta Bay (x = ±128,
// z = ±109), over the inner sidewalk; one train of ten cars, drawn as the loop's monorail train is.
import { Batch, unitBox } from './props.js';
import { VANTA_BAY } from './map.js';

// over the inner sidewalk (the east side is Sky Avenue Street, two lanes each way, so its sidewalk sits further in)
const H = 12.6, XE = 128 - 7 - 1.6, XW = 128 - 5.2, Z = 109 - 5.2, R = 16;
const pts = [];
const corner = (cx, cz, a0) => { for (let i = 0; i <= 8; i++) { const a = a0 + i / 8 * Math.PI / 2; pts.push({ x: cx + R * Math.cos(a), z: cz + R * Math.sin(a) }); } };
corner(XE - R, Z - R, 0); corner(-XW + R, Z - R, Math.PI / 2); corner(-XW + R, -Z + R, Math.PI); corner(XE - R, -Z + R, 1.5 * Math.PI);
pts.push(pts[0]);
const seg = [];
let LEN = 0;
for (let i = 1; i < pts.length; i++) {
  const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.z - a.z);
  seg.push({ a, dx: b.x - a.x, dz: b.z - a.z, at: LEN, d }); LEN += d;
}
function at(s, out = {}) {
  s = ((s % LEN) + LEN) % LEN;
  let g = seg[0];
  for (const q of seg) { if (q.at <= s) g = q; else break; }
  const t = (s - g.at) / g.d;
  out.x = g.a.x + g.dx * t; out.z = g.a.z + g.dz * t; out.th = Math.atan2(g.dx, g.dz);
  return out;
}

export function buildRail(mats) {
  const metal = new Batch(unitBox), f = {};
  for (let s = 0; s < LEN; s += 4) {
    at(s + 2, f);
    metal.add([f.x, H - 1.1, f.z], [1.0, 0.9, 4.1], f.th, [44, 48, 64], [0, 0]);          // the beam
  }
  for (let s = 0; s < LEN; s += 26) {
    at(s, f);
    if (Object.values(VANTA_BAY.nodes).some(n => n.level === 0 && Math.hypot(f.x - n.x, f.z - n.z) < n.discR + 3)) continue;
    metal.add([f.x, 0, f.z], [0.8, H - 1.1, 0.8], f.th, [36, 38, 52], [0, 0]);            // pylons on the sidewalk, clear of junctions
  }
  return metal.build(mats.metal);
}

const train = { s: 0, v: 26, cars: 10 };
export function trainNow(T, out = []) {
  out.length = 0;
  const f = {};
  for (let i = 0; i < train.cars; i++) {
    at(train.v * T - i * 6, f);
    out.push({ x: f.x, y: H, z: f.z, th: f.th, i });
  }
  return out;
}
