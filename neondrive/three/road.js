// road.js — turns the generator's per-segment curve/hill arrays into a real
// world-space centreline, plus the frame (position, tangent, right vector) at
// any continuous distance along it. The old renderer only ever needed screen
// space; a free camera needs the actual 3D curve.

import { NSEG, SEGL, LEN, curve, hill, ELEV, LAYERED } from './world.js';

// heading integrates curve; position integrates heading. Same small-angle maths
// the pseudo-3D build used, just kept in world space instead of screen space.
export const PX = new Float32Array(NSEG + 1);
export const PY = new Float32Array(NSEG + 1);
export const PZ = new Float32Array(NSEG + 1);
export const TH = new Float32Array(NSEG + 1);   // heading, radians

{
  let th = 0, x = 0, z = 0;
  for (let n = 0; n <= NSEG; n++) {
    const i = n % NSEG;
    PX[n] = x; PY[n] = hill[i]; PZ[n] = z; TH[n] = th;
    x += Math.sin(th) * SEGL;
    z += Math.cos(th) * SEGL;
    th -= curve[i] / SEGL;  // the legacy curve changes lateral displacement per segment
  }
}

const _p = { x: 0, y: 0, z: 0, th: 0, rx: 0, rz: 0, elev: 0 };

// frame at world distance d (metres along the road, wraps)
export function frameAt(d, out = _p) {
  let t = (d % LEN + LEN) % LEN / SEGL;
  const n = Math.floor(t), f = t - n, m = n + 1 > NSEG ? 0 : n + 1;
  out.x = PX[n] + (PX[m] - PX[n]) * f;
  out.y = PY[n] + (PY[m] - PY[n]) * f;
  out.z = PZ[n] + (PZ[m] - PZ[n]) * f;
  out.th = TH[n] + (TH[m] - TH[n]) * f;
  out.rx = -Math.cos(out.th);         // camera right when looking down the +Z road
  out.rz = Math.sin(out.th);
  const i = n % NSEG;
  out.elev = LAYERED[i] ? ELEV[i] : 0;
  return out;
}

// a point `lat` metres to the right of the road centre, `up` metres above it
export function onRoad(d, lat, up, out = {}) {
  const f = frameAt(d);
  out.x = f.x + f.rx * lat;
  out.y = f.y + up;
  out.z = f.z + f.rz * lat;
  return out;
}
