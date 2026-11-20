// People walking Vanta Bay's sidewalks, at street level and on the Sky Avenue deck, generated as the loop's crowd is:
// a lane inside the sidewalk, either direction at 0.9-1.7 m/s, 70% with a glowing umbrella.
import { VANTA_BAY, frameInLane } from './map.js';
import { SW, NEON, hsl, mulberry } from './world.js';

const rng = mulberry(4242);
const SPACING = 9;                                      // about one walker per 9 m of sidewalk, each side

export const WALKERS = [];
for (const road of VANTA_BAY.roads) {
  if (road.bore) continue;                              // nobody walks the spiral ramps
  const e = road.edges[0], a = e.from.trim, b = e.path.length - e.to.trim;
  if (b - a < 10) continue;
  for (const side of [-1, 1]) {
    const n = Math.round((b - a) / SPACING);
    for (let i = 0; i < n; i++) {
      WALKERS.push({ e, a, b, s0: a + rng() * (b - a), lat: side * (road.halfWidth + 0.8 + rng() * (SW - 1.4)),
        v: (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.8),
        umb: rng() < 0.7 ? NEON[(rng() * 6) | 0] : null, coat: hsl(rng() * 360, 0.2, 0.12 + rng() * 0.1), ph: rng() * 6 });
    }
  }
}

// the walkers within `range` of (x, z), in world space; each wraps along its own stretch of sidewalk
export function walkersNear(T, x, z, range, out) {
  const f = {}, r2 = range * range;
  for (const w of WALKERS) {
    const L = w.b - w.a, s = w.a + (((w.s0 - w.a + w.v * T) % L) + L) % L;
    frameInLane(w.e, s, w.lat, f);
    if ((f.x - x) ** 2 + (f.z - z) ** 2 > r2) continue;
    out.push({ x: f.x, y: f.y, z: f.z, th: f.th + (w.v < 0 ? Math.PI : 0), ph: w.ph, umb: w.umb, coat: w.coat });
  }
  return out;
}
