// Hover cars in the two air lanes (17 m and 57 m) over Vanta Bay's long avenues, and the lit gates that mark the
// lanes, generated and drawn as the loop's flyers and aerial gates are.
import { CITIES, NEON, hsl, mulberry, smooth } from './world.js';
import { Batch, unitTorus } from './props.js';

const rng = mulberry(5151);
const FLY_H = [17, 57];
// each lane: a straight run over a street, from (x0, z0) to (x1, z1); traffic flows both ways, one side each
const LANES = [
  { x0: -330, z0: 0, x1: 250, z1: 0 },                 // Vanta Boulevard, through Prism Plaza
  { x0: 128, z0: -300, x1: 128, z1: 320 },             // Sky Avenue Street, under and over the deck
].map(l => ({ ...l, len: Math.hypot(l.x1 - l.x0, l.z1 - l.z0), th: Math.atan2(l.x1 - l.x0, l.z1 - l.z0) }));

export const FLYERS = [];
for (const [li, lane] of LANES.entries()) {
  for (let i = 0; i < 36; i++) {
    const dir = rng() < 0.5 ? 1 : -1;
    FLYERS.push({ lane: li, s0: rng() * lane.len, h: FLY_H[rng() < 0.6 ? 1 : 0] + (rng() - 0.5) * 3,
      x: dir * (1.5 + rng() * 4.5), dir, v: 22 + rng() * 26,
      body: hsl(rng() * 360, 0.3, 0.2 + rng() * 0.12), glow: NEON[(rng() * 6) | 0], bob: rng() * 6 });
  }
}

// low traffic over the boulevard climbs over the plaza's fountain instead of flying through it
const lift = (lane, x, z, h) => lane === 0 && h < 30 ? h + 22 * (1 - smooth(45, 85, Math.hypot(x, z))) : h;

export function flyersNow(T, out = []) {
  out.length = 0;
  for (const fl of FLYERS) {
    const l = LANES[fl.lane], s = ((fl.s0 + fl.dir * fl.v * T) % l.len + l.len) % l.len;
    const rx = -Math.cos(l.th), rz = Math.sin(l.th);
    const x = l.x0 + Math.sin(l.th) * s + rx * fl.x, z = l.z0 + Math.cos(l.th) * s + rz * fl.x;
    const y = lift(fl.lane, x, z, fl.h + Math.sin(T * 1.7 + fl.bob) * 0.3);
    out.push({ x, y, z, yaw: l.th + (fl.dir < 0 ? Math.PI : 0), dir: fl.dir, body: fl.body, glow: fl.glow, bob: fl.bob });
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
        const x = cx + rx * sg * 3.8, z = cz + rz * sg * 3.8;
        ring.add([x, lift(li, x, z, h), z], [6.6, 6.6, 6.6], l.th, neon[k % 6], [k, 0.5]);
      }
    }
  }
  return ring.build(mats.emit);
}
