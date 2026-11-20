// Hover cars in the two air lanes (17 m and 57 m) over Vanta Bay's long avenues, and the lit gates that mark the
// lanes, generated and drawn as the loop's flyers and aerial gates are.
import { CITIES, NEON, hsl, mulberry, smooth } from './world.js';
import { Batch, unitTorus } from './props.js';
import { frameOn, path } from './map.js';

const rng = mulberry(5151);
const FLY_H = [17, 57];
// each lane: a straight run over a street, from (x0, z0) to (x1, z1); traffic flows both ways, one side each
const LANES = [
  { x0: -330, z0: 0, x1: 250, z1: 0 },                 // Vanta Boulevard, through Prism Plaza
  { x0: 128, z0: -300, x1: 128, z1: 320 },             // Sky Avenue Street, under and over the deck
].map(l => ({ ...l, len: Math.hypot(l.x1 - l.x0, l.z1 - l.z0), th: Math.atan2(l.x1 - l.x0, l.z1 - l.z0) }));

for (const lane of LANES) {
  const { x0, z0, x1, z1, th } = lane, radius = 5;
  const dx = Math.sin(th), dz = Math.cos(th), rx = -dz, rz = dx;
  const point = (x, z, angle) => ({
    x: x + radius * (rx * Math.cos(angle) + dx * Math.sin(angle)),
    y: 0,
    z: z + radius * (rz * Math.cos(angle) + dz * Math.sin(angle)),
  });
  const start = point((x0 + x1) / 2, (z0 + z1) / 2, 0);
  const bend = (x, z, startAngle) => Array.from({ length: 25 }, (_, i) => point(x, z, startAngle + i * Math.PI / 24));
  lane.loop = path([start, ...bend(x1, z1, 0), ...bend(x0, z0, Math.PI), start]);
}

export const FLYERS = [];
for (const [li, lane] of LANES.entries()) {
  for (let i = 0; i < 36; i++) {
    FLYERS.push({ lane: li, s0: i / 36 * lane.loop.length, h: FLY_H[rng() < 0.6 ? 1 : 0] + (rng() - 0.5) * 3,
      x: (rng() - 0.5) * 1.4, v: 29,
      body: hsl(rng() * 360, 0.3, 0.2 + rng() * 0.12), glow: NEON[(rng() * 6) | 0], bob: rng() * 6 });
  }
}

// low traffic over the boulevard climbs over the plaza's fountain instead of flying through it
const lift = (lane, x, z, h) => lane === 0 && h < 30 ? h + 22 * (1 - smooth(45, 85, Math.hypot(x, z))) : h;

export function flyersNow(T, out = []) {
  out.length = 0;
  const f = {};
  for (const fl of FLYERS) {
    const l = LANES[fl.lane], length = l.loop.length;
    const s = ((fl.s0 + fl.v * T) % length + length) % length;
    frameOn(l.loop, s, f);
    const x = f.x + f.rx * fl.x, z = f.z + f.rz * fl.x;
    const y = lift(fl.lane, x, z, fl.h + Math.sin(T * 1.7 + fl.bob) * 0.3);
    out.push({ x, y, z, yaw: f.th, dir: Math.cos(f.th - l.th) >= 0 ? 1 : -1, body: fl.body, glow: fl.glow, bob: fl.bob });
  }
  return out;
}

// a pair of rings every 60 m at each lane height, one over each direction of flow, in the city's neon
export function buildGates(mats) {
  const ring = new Batch(unitTorus), neon = CITIES.find(c => c.name === 'VANTA BAY').neon;
  for (const [li, l] of LANES.entries()) {
    const rx = -Math.cos(l.th), rz = Math.sin(l.th);
    for (let s = 30, k = 0; s < l.len; s += 60, k++) {
      const cx = l.x0 + Math.sin(l.th) * s, cz = l.z0 + Math.cos(l.th) * s;
      for (const h of FLY_H) for (const sg of [-1, 1]) {
        const x = cx + rx * sg * 5, z = cz + rz * sg * 5;
        ring.add([x, lift(li, x, z, h), z], [6.6, 6.6, 6.6], l.th, neon[k % 6], [k, 0.5]);
      }
    }
  }
  return ring.build(mats.emit);
}
