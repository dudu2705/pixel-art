// The monorail: a beam 12.6 m up on pylons, round the ring of streets that frames downtown Vanta Bay (x = ±128,
// z = ±109), over the inner sidewalk; one train of ten cars, drawn as the loop's monorail train is.
import { Batch, unitBox } from './props.js';
import { VANTA_BAY, frameOn, nearestOnPath, path } from './map.js';
import { SW } from './world.js';

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

const SKY_Y = 40;
const skyStart = { x: -150, y: SKY_Y, z: -176 };
const skyCorners = [[-27, -152, -Math.PI / 2], [-27, -78, 0], [-273, -78, Math.PI / 2], [-273, -152, Math.PI]];
const skyPath = path([skyStart, ...skyCorners.flatMap(([x, z, angle]) =>
  Array.from({ length: 17 }, (_, i) => {
    const a = angle + i * Math.PI / 32;
    return { x: x + 24 * Math.cos(a), y: SKY_Y, z: z + 24 * Math.sin(a) };
  })), skyStart]);
const supportRoads = VANTA_BAY.roads.filter(road => road.city === 'VANTA BAY' && !road.lift);

export function skytrainClearsLot(x, z, radius, height) {
  return height < SKY_Y - 2 || x < -297 - radius || x > -3 + radius || z < -176 - radius || z > -54 + radius ||
    nearestOnPath(skyPath, x, z).dist > radius + 2.7;
}

export function buildRail(mats) {
  const metal = new Batch(unitBox), trim = new Batch(unitBox), f = {};
  for (let s = 0; s < LEN; s += 4) {
    at(s + 2, f);
    metal.add([f.x, H - 1.1, f.z], [1.0, 0.9, 4.1], f.th, [44, 48, 64], [0, 0]);          // the beam
  }
  for (let s = 0; s < LEN; s += 26) {
    at(s, f);
    if (Object.values(VANTA_BAY.nodes).some(n => n.level === 0 && Math.hypot(f.x - n.x, f.z - n.z) < n.discR + 3)) continue;
    metal.add([f.x, 0, f.z], [0.8, H - 1.1, 0.8], f.th, [36, 38, 52], [0, 0]);            // pylons on the sidewalk, clear of junctions
  }
  const count = Math.ceil(skyPath.length / 4), step = skyPath.length / count;
  for (let i = 0; i < count; i++) {
    const a = frameOn(skyPath, i * step), b = frameOn(skyPath, (i + 1) * step);
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, th = Math.atan2(b.x - a.x, b.z - a.z);
    metal.add([x, SKY_Y - 1.15, z], [1.5, 1.0, step + 0.16], th, [37, 38, 56], [0, 0]);
    trim.add([x, SKY_Y - 0.36, z], [1.53, 0.12, step + 0.14], th, [255, 55, 175], [0, 0]);
    if (i % 7 !== 0 || supportRoads.some(road => nearestOnPath(road.path, x, z).dist < road.halfWidth + SW + 1)) continue;
    metal.add([x, 0, z], [1.25, SKY_Y - 1, 1.25], th, [38, 40, 56], [0, 0]);
  }
  return [metal.build(mats.metal), trim.build(mats.emit)];
}

const train = { s: 0, v: 26, cars: 10 };
export function trainNow(T, out = []) {
  out.length = 0;
  const f = {};
  for (let i = 0; i < train.cars; i++) {
    at(train.v * T - i * 6, f);
    out.push({ x: f.x, y: H, z: f.z, th: f.th, i });
  }
  for (let i = 0; i < 12; i++) {
    const s = ((34 * T - i * 7.1) % skyPath.length + skyPath.length) % skyPath.length;
    frameOn(skyPath, s, f);
    out.push({ x: f.x, y: SKY_Y, z: f.z, th: f.th, i, sky: true });
  }
  return out;
}
