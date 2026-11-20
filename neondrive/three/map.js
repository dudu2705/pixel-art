// Vanta Bay's fixed street layout. A road owns its surface and has one or two
// directed edges. Every driving route uses those edges and their lane offsets.
import { SEGL, SW } from './world.js';

export const LANE_WIDTH = 3.5;
export const PLAZA_RADIUS = 43;
export const RAMP_BORE_HALF_WIDTH = 5.1;
const R = PLAZA_RADIUS;
const SKY_HEIGHT = 35;
const DECK_X = 128;
const DECK_SOUTH = -305;
const DECK_NORTH = 325;

const node = (id, x, z, level = 0) => ({ id, x, y: level * SKY_HEIGHT, z, level, exits: [] });
const nodes = Object.fromEntries([
  node('plaza-west', -R, 0), node('plaza-north', 0, R),
  node('plaza-east', R, 0), node('plaza-south', 0, -R),
  node('west', -128, 0), node('east', 128, 0),
  node('northwest', -128, 109), node('north', 0, 109), node('northeast', 128, 109),
  node('southwest', -128, -109), node('south', 0, -109), node('southeast', 128, -109),
  node('gateway', -322, 0), node('east-end', 240, 0),
  node('street-up', DECK_X, 182), node('street-down', DECK_X, -235),
  node('street-north', DECK_X, 300), node('street-south', DECK_X, -285),
  node('sky-arrival', DECK_X, 272, 1), node('sky-departure', DECK_X, -145, 1),
  node('sky-north', DECK_X, DECK_NORTH, 1), node('sky-south', DECK_X, DECK_SOUTH, 1),
].map(n => [n.id, n]));

function path(points) {
  let length = 0;
  const segments = [];
  points.slice(1).forEach((end, i) => {
    const start = points[i], dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
    const size = Math.hypot(dx, dy, dz);
    if (size < 0.001) return;
    segments.push({ start, dx, dy, dz, at: length, size });
    length += size;
  });
  return { length, points, segments };
}

export function frameOn(path, distance, out = {}) {
  const d = Math.max(0, Math.min(path.length, distance));
  let lo = 0, hi = path.segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1, s = path.segments[mid];
    if (d > s.at + s.size) lo = mid + 1;
    else hi = mid;
  }
  const s = path.segments[lo], t = (d - s.at) / s.size;
  out.x = s.start.x + s.dx * t;
  out.y = s.start.y + s.dy * t;
  out.z = s.start.z + s.dz * t;
  // the heading turns continuously: halfway between neighbouring segments at each joint, the segment's own at its middle
  const th = Math.atan2(s.dx, s.dz), n = t < 0.5 ? path.segments[lo - 1] : path.segments[lo + 1];
  if (n) {
    const nth = Math.atan2(n.dx, n.dz), w = 0.5 - Math.abs(t - 0.5);
    out.th = th + Math.atan2(Math.sin(nth - th), Math.cos(nth - th)) * (0.5 - w);
  } else out.th = th;
  out.rx = -Math.cos(out.th);
  out.rz = Math.sin(out.th);
  out.elev = out.y;
  return out;
}

const roads = [], edges = [];
function road(id, name, start, end, lanes, options = {}) {
  const a = nodes[start], b = nodes[end];
  const { interior = [], oneWay = false, speed = 140 } = options;
  const points = [a, ...interior, b];
  const r = {
    id, name, a, b, lanes, oneWay, speed: speed / 3.6,
    level: a.level === b.level ? a.level : null,
    halfWidth: (oneWay ? lanes * 0.5 : lanes) * LANE_WIDTH,
    path: path(points), edges: [],
  };
  const addEdge = (from, to, center) => {
    const edge = { id: from.id + '/' + to.id, from, to, road: r, path: center };
    edges.push(edge);
    r.edges.push(edge);
    from.exits.push(edge);
  };
  addEdge(a, b, r.path);
  if (!oneWay) addEdge(b, a, path([...points].reverse()));
  roads.push(r);
  return r;
}

for (const [i, pair] of [
  ['plaza-west', 'plaza-north'], ['plaza-north', 'plaza-east'],
  ['plaza-east', 'plaza-south'], ['plaza-south', 'plaza-west'],
].entries()) {
  const angle = Math.PI - i * Math.PI / 2;
  const interior = Array.from({ length: 23 }, (_, j) => {
    const theta = angle - (j + 1) * Math.PI / 48;
    return { x: R * Math.cos(theta), y: 0, z: R * Math.sin(theta) };
  });
  road('plaza-' + i, 'Prism Plaza', ...pair, 2, { interior, oneWay: true, speed: 48 });
}
road('gateway', 'Vanta Boulevard', 'gateway', 'west', 3, { speed: 300 });
road('west-boulevard', 'Vanta Boulevard', 'west', 'plaza-west', 3, { speed: 140 });
road('east-boulevard', 'Vanta Boulevard', 'plaza-east', 'east', 3, { speed: 140 });
road('harbor-end', 'Vanta Boulevard', 'east', 'east-end', 3, { speed: 200 });
road('north-plaza', 'Lantern Street', 'plaza-north', 'north', 1, { speed: 70 });
road('south-plaza', 'Arcade Street', 'plaza-south', 'south', 1, { speed: 70 });
road('northwest', 'Marina Street', 'northwest', 'north', 1, { speed: 75 });
road('northeast', 'Marina Street', 'north', 'northeast', 1, { speed: 75 });
road('southwest', 'Foundry Street', 'southwest', 'south', 1, { speed: 75 });
road('southeast', 'Foundry Street', 'south', 'southeast', 1, { speed: 75 });
road('west-north', 'Lantern Row', 'west', 'northwest', 1, { speed: 75 });
road('west-south', 'Market Row', 'west', 'southwest', 1, { speed: 75 });
road('east-north', 'Sky Avenue Street', 'east', 'northeast', 2, { speed: 110 });
road('east-south', 'Arcade Row', 'east', 'southeast', 1, { speed: 75 });

road('street-north-approach', 'Sky Avenue Street', 'northeast', 'street-up', 2, { speed: 100 });
road('street-north-through', 'Sky Avenue Street', 'street-up', 'street-north', 2, { speed: 100 });
road('street-south-approach', 'Sky Avenue Street', 'southeast', 'street-down', 1, { speed: 100 });
road('street-south-through', 'Sky Avenue Street', 'street-down', 'street-south', 1, { speed: 100 });

function spiralRamp(id, name, start, end) {
  const a = nodes[start], b = nodes[end];
  const radius = 105, opening = 0.38, samples = 144;
  const direction = Math.sign(b.z - a.z);
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples, angle = opening + t * (2 * Math.PI - 2 * opening);
    return {
      x: DECK_X + radius * (Math.cos(opening) - Math.cos(angle)),
      z: a.z + (b.z - a.z) * t
        + direction * radius * (Math.sin(angle) - (1 - 2 * t) * Math.sin(opening)),
    };
  });
  const distances = [0];
  for (let i = 1; i <= samples; i++) {
    distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  // Hold the junction elevation while the branch pavement overlaps the through road.
  const length = distances.at(-1), flat = 24, easing = 10;
  const ease = distance => distance < easing ? distance ** 2 / (2 * easing) : distance - easing / 2;
  const gradeLength = length - 2 * flat - easing;
  for (let i = 1; i < samples; i++) {
    const distance = distances[i];
    const rise = ease(Math.max(0, Math.min(distance, length - distance) - flat));
    points[i].y = a.y + (b.y - a.y) * (distance < length / 2 ? rise : gradeLength - rise) / gradeLength;
  }
  const ramp = road(id, name, start, end, 1, { interior: points.slice(1, -1), oneWay: true, speed: 80 });
  ramp.bore = { from: 56, to: Math.floor((ramp.path.length - 56) / SEGL) * SEGL, mode: a.level < b.level ? 1 : 2 };
}

road('sky-south-through', 'Sky Avenues', 'sky-south', 'sky-departure', 2, { speed: 100 });
road('sky-deck', 'Sky Avenues', 'sky-departure', 'sky-arrival', 2, { speed: 110 });
road('sky-north-through', 'Sky Avenues', 'sky-arrival', 'sky-north', 2, { speed: 100 });
spiralRamp('sky-up', 'Sky Ramp Up', 'street-up', 'sky-arrival');
spiralRamp('sky-down', 'Sky Ramp Down', 'sky-departure', 'street-down');

for (const n of Object.values(nodes)) {
  n.halfWidth = Math.max(...roads.filter(r => r.a === n || r.b === n).map(r => r.halfWidth));
  n.ramp = roads.find(r => r.bore && (r.a === n || r.b === n));
  n.trim = n.ramp ? 24 : n.id.startsWith('plaza-') ? 8 : n.halfWidth + 3;
}

export const VANTA_BAY = { nodes, roads, edges };
export const DECK_COVER = { x: DECK_X, south: DECK_SOUTH, north: DECK_NORTH, halfWidth: 2 * LANE_WIDTH + SW };

export function inBore(road, distance) {
  return Boolean(road.bore && distance >= road.bore.from && distance <= road.bore.to);
}

export function underSkyDeck({ x, y, z }) {
  return y < SKY_HEIGHT - 2 && z > DECK_SOUTH && z < DECK_NORTH && Math.abs(x - DECK_X) < DECK_COVER.halfWidth;
}

// the closest point of a path to (x, z) in plan view: distance along it, signed sideways offset (+ is the
// rider's right, as laneOffset), height and heading there, and whether the point lies past either end
export function nearestOnPath(path, x, z, out = {}) {
  let best = Infinity;
  for (const g of path.segments) {
    const len2 = g.dx * g.dx + g.dz * g.dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - g.start.x) * g.dx + (z - g.start.z) * g.dz) / len2)) : 0;
    const px = g.start.x + g.dx * t, pz = g.start.z + g.dz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < best) { best = d2; out.s = g.at + g.size * t; }
  }
  frameOn(path, out.s, out);
  out.lat = (x - out.x) * out.rx + (z - out.z) * out.rz;
  out.dist = Math.sqrt(best);
  out.end = out.s < 0.01 || out.s > path.length - 0.01;
  return out;
}

// everything the rider can ride on: each road's full width with its sidewalks, and each junction's disc.
// A surface only connects to the surfaces meeting at its nodes, so overlapping levels never swap.
export const SURFACES = (() => {
  const list = [];
  for (const road of roads) list.push({ kind: 'road', road, half: road.halfWidth + SW, nodes: [road.a, road.b], level: road.level });
  for (const n of Object.values(nodes)) {
    if (n.ramp) continue;
    list.push({ kind: 'node', node: n, radius: Math.max(n.trim + 1, n.halfWidth + 3.5), nodes: [n], level: n.level });
  }
  for (const s of list) {
    s.next = list.filter(o => o !== s && o.nodes.some(n => s.nodes.includes(n)));
    s.speed = s.kind === 'road' ? s.road.speed : Math.max(...roads.filter(r => r.a === s.node || r.b === s.node).map(r => r.speed));
  }
  return list;
})();

// where (x, z) lies on a surface: null if outside it, else its height, heading and how deep inside (0 at the edge)
export function onSurface(surface, x, z, out = {}) {
  if (surface.kind === 'node') {
    const n = surface.node, d = Math.hypot(x - n.x, z - n.z);
    if (d > surface.radius) return null;
    out.y = n.y; out.th = null; out.depth = surface.radius - d; out.s = 0; out.lat = 0;
    return out;
  }
  nearestOnPath(surface.road.path, x, z, out);
  const off = out.end ? out.dist : Math.abs(out.lat);
  if (off > surface.half) return null;
  out.depth = surface.half - off;
  return out;
}

export function laneOffset(edge, lane) {
  return (lane + 0.5) * LANE_WIDTH - (edge.road.oneWay ? edge.road.halfWidth : 0);
}

export function frameInLane(edge, distance, lateral, out = {}) {
  frameOn(edge.path, distance, out);
  out.x += out.rx * lateral;
  out.z += out.rz * lateral;
  return out;
}

export function legalTurns(edge) {
  const options = edge.to.exits.filter(next => next.road !== edge.road &&
    (!edge.to.ramp || Math.abs(turnAngle(edge, next)) < Math.PI / 2));
  return options.length ? options : edge.to.exits;
}

export function turnAngle(edge, next) {
  const a = frameOn(edge.path, edge.path.length), b = frameOn(next.path, 0);
  return Math.atan2(Math.sin(a.th - b.th), Math.cos(a.th - b.th));
}

export function routeTo(start, goal, incoming = null, throughLevel = null) {
  const queue = [{ node: start, route: [], incoming }];
  const seen = new Set(incoming ? [incoming] : []);
  for (const item of queue) {
    if (item.node === goal) return item.route;
    const exits = item.incoming ? legalTurns(item.incoming) : item.node.exits;
    for (const edge of exits) {
      if (seen.has(edge) || (throughLevel !== null && edge.road.level !== throughLevel)) continue;
      seen.add(edge);
      queue.push({ node: edge.to, route: [...item.route, edge], incoming: edge });
    }
  }
  return [];
}

export function turnPath(edge, lateral, next, nextLateral) {
  const trim = edge.to.trim;
  const from = frameInLane(edge, edge.path.length - trim, lateral);
  const to = frameInLane(next, trim, nextLateral);
  const length = Math.min(trim * 0.95, Math.hypot(to.x - from.x, to.z - from.z) * 0.75 + 3);
  const a = { x: from.x + Math.sin(from.th) * length, y: from.y, z: from.z + Math.cos(from.th) * length };
  const b = { x: to.x - Math.sin(to.th) * length, y: to.y, z: to.z - Math.cos(to.th) * length };
  return path(Array.from({ length: 21 }, (_, j) => {
    const t = j / 20, k = 1 - t;
    const coordinate = c => k * k * k * from[c] + 3 * k * k * t * a[c] + 3 * k * t * t * b[c] + t * t * t * to[c];
    return { x: coordinate('x'), y: coordinate('y'), z: coordinate('z') };
  }));
}
