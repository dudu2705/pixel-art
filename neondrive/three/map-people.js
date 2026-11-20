import { VANTA_BAY, frameOn, nearestOnPath, path } from './map.js';
import { WALKWAYS } from './map-walkways.js';
import { NEON, hsl, mulberry } from './world.js';

const rng = mulberry(4242);
const TAU = Math.PI * 2;
const SPACING = 9;
const routes = [];
export const WALKERS = [];

function addRoute(points, spacing = SPACING) {
  const route = path(points);
  if (route.length < 8) return;
  const start = WALKERS.length, count = Math.max(1, Math.round(route.length / spacing));
  for (let i = 0; i < count; i++) {
    WALKERS.push({ route, s0: (i + rng() * 0.7) * route.length / count, v: 0.9 + rng() * 0.8,
      umb: rng() < 0.7 ? NEON[(rng() * 6) | 0] : null, coat: hsl(rng() * 360, 0.2, 0.12 + rng() * 0.1), ph: rng() * 6 });
  }
  routes.push({ start, end: WALKERS.length,
    x0: Math.min(...points.map(p => p.x)), x1: Math.max(...points.map(p => p.x)),
    z0: Math.min(...points.map(p => p.z)), z1: Math.max(...points.map(p => p.z)) });
}

function sidewalk(road, center, start, end, side) {
  const setback = n => Math.min(center.length * 0.24, Math.max(8, n.discR + 4, n.trim + 1));
  const a = setback(start), b = center.length - setback(end), count = Math.ceil((b - a) / 5);
  return Array.from({ length: count + 1 }, (_, i) => {
    const f = frameOn(center, a + (b - a) * i / count), lat = side * (road.halfWidth + 1.65);
    return { x: f.x + f.rx * lat, y: f.y, z: f.z + f.rz * lat };
  });
}

// Walk the perimeter of each street block. Each incoming sidewalk takes the next
// outside corner, leaving the crosswalks to the separately signalled pedestrians.
const oriented = [];
const outgoing = new Map();
const incident = new Map();
for (const road of VANTA_BAY.roads) {
  if (road.lift) continue;
  for (const n of [road.a, road.b]) {
    if (!incident.has(n)) incident.set(n, []);
    incident.get(n).push(road);
  }
  if (road.level !== 0 || road.link || road.tube || road.liftApproach) continue;
  for (const [a, b, center] of [[road.a, road.b, road.path], [road.b, road.a, road.edges[1]?.path ?? path([...road.path.points].reverse())]]) {
    const edge = { road, a, b, center, heading: frameOn(center, 0).th };
    oriented.push(edge);
    if (!outgoing.has(a)) outgoing.set(a, []);
    outgoing.get(a).push(edge);
  }
}
const angleFrom = (heading, reference) => ((heading - reference) % TAU + TAU) % TAU;

function walkCorner(from, to, node) {
  const start = Math.atan2(from.x - node.x, from.z - node.z);
  const delta = angleFrom(Math.atan2(to.x - node.x, to.z - node.z), start);
  const radius0 = Math.hypot(from.x - node.x, from.z - node.z);
  const radius1 = Math.hypot(to.x - node.x, to.z - node.z);
  const count = Math.max(2, Math.ceil(delta * Math.max(radius0, radius1) / 1.75));
  return Array.from({ length: count - 1 }, (_, i) => {
    const t = (i + 1) / count, h = start + delta * t, radius = radius0 + (radius1 - radius0) * t;
    return { x: node.x + Math.sin(h) * radius, z: node.z + Math.cos(h) * radius, y: node.y };
  });
}

for (const edge of oriented) {
  const exits = outgoing.get(edge.b), reverse = exits.find(e => e.road === edge.road);
  const branches = exits.filter(e => e !== reverse);
  edge.next = branches.sort((a, b) => angleFrom(a.heading, reverse.heading) - angleFrom(b.heading, reverse.heading))[0] ?? reverse;
  edge.points = sidewalk(edge.road, edge.center, edge.a, edge.b, 1);
}
const seen = new Set();
for (const start of oriented) {
  if (seen.has(start)) continue;
  const cycle = [];
  for (let edge = start; !seen.has(edge); edge = edge.next) {
    seen.add(edge);
    const corner = walkCorner(edge.points.at(-1), edge.next.points[0], edge.b);
    const blocked = corner.some(point => incident.get(edge.b).some(road => {
      const nearest = nearestOnPath(road.path, point.x, point.z, {}, point.y);
      return Math.abs(nearest.y - point.y) < 1.5 && nearest.dist < road.halfWidth + 0.57;
    }));
    cycle.push({ points: edge.points, corner: blocked ? null : corner });
  }
  const gap = cycle.findIndex(part => !part.corner);
  if (gap === -1) {
    const points = cycle.flatMap(part => [...part.points, ...part.corner]);
    addRoute([...points, points[0]]);
  } else {
    let run = [];
    for (let i = 1; i <= cycle.length; i++) {
      const part = cycle[(gap + i) % cycle.length];
      run.push(...part.points);
      if (part.corner) run.push(...part.corner);
      else { outAndBack(run); run = []; }
    }
  }
}

// A narrow path has room for a turnaround on the sidewalk itself. It never
// crosses the road to get back to its start, including at elevated dead ends.
function outAndBack(points, spacing = SPACING * 2) {
  const center = path(points), w = 0.38, count = Math.ceil(center.length / 4);
  const lanes = [-1, 1].map(side => Array.from({ length: count + 1 }, (_, i) => {
    const f = frameOn(center, center.length * i / count);
    return { x: f.x + f.rx * side * w, y: f.y, z: f.z + f.rz * side * w };
  }));
  const curve = atEnd => {
    const f = frameOn(center, atEnd ? center.length : 0), dir = atEnd ? 1 : -1;
    return Array.from({ length: 6 }, (_, i) => {
      const a = (i + 1) * Math.PI / 7, side = -dir * Math.cos(a) * w, forward = dir * Math.sin(a) * w;
      return { x: f.x + f.rx * side + Math.sin(f.th) * forward, y: f.y,
        z: f.z + f.rz * side + Math.cos(f.th) * forward };
    });
  };
  addRoute([...lanes[0], ...curve(true), ...lanes[1].reverse(), ...curve(false), lanes[0][0]], spacing);
}

for (const road of VANTA_BAY.roads) {
  if (!(road.level > 0) || road.liftApproach) continue;
  for (const side of [-1, 1]) outAndBack(sidewalk(road, road.path, road.a, road.b, side));
}

for (const w of WALKWAYS) {
  const e = frameOn(w.road.path, w.s - 8), f = w.frame;
  const offset = (pose, lat) => ({ x: pose.x + pose.rx * w.side * lat, y: pose.y, z: pose.z + pose.rz * w.side * lat });
  const start = offset(e, w.road.halfWidth + 1.65);
  const corner = offset(frameOn(w.road.path, w.s - 1.05), w.gate - 0.68);
  const end = offset(f, w.face - 0.95);
  outAndBack([start, corner, offset(f, w.gate + 1.8), end], 13);
}

export function walkersNear(T, x, z, range, out) {
  const f = {}, r2 = range * range;
  for (const { start, end, x0, x1, z0, z1 } of routes) {
    if (x < x0 - range || x > x1 + range || z < z0 - range || z > z1 + range) continue;
    for (let i = start; i < end; i++) {
      const w = WALKERS[i], length = w.route.length;
      frameOn(w.route, ((w.s0 + w.v * T) % length + length) % length, f);
      if ((f.x - x) ** 2 + (f.z - z) ** 2 > r2) continue;
      out.push({ x: f.x, y: f.y, z: f.z, th: f.th, ph: w.ph, umb: w.umb, coat: w.coat });
    }
  }
}
