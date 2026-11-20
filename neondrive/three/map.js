// Vanta Bay's fixed street layout. A road owns its surface and has one or two
// directed edges. Every driving route uses those edges and their lane offsets.
export const LANE_WIDTH = 3.5;
export const PLAZA_RADIUS = 43;
const R = PLAZA_RADIUS;

const node = (id, x, z, y = 0) => ({ id, x, y, z, exits: [] });
const nodes = Object.fromEntries([
  node('plaza-west', -R, 0), node('plaza-north', 0, R),
  node('plaza-east', R, 0), node('plaza-south', 0, -R),
  node('west', -128, 0), node('east', 128, 0),
  node('northwest', -128, 109), node('north', 0, 109), node('northeast', 128, 109),
  node('southwest', -128, -109), node('south', 0, -109), node('southeast', 128, -109),
  node('gateway', -322, 0), node('east-end', 240, 0),
  node('sky-arrival', 242, 332, 35), node('sky-outlook', 54, 252, 35),
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
  out.th = Math.atan2(s.dx, s.dz);
  out.rx = -Math.cos(out.th);
  out.rz = Math.sin(out.th);
  out.elev = out.y;
  return out;
}

const roads = [], edges = [];
function road(id, name, start, end, lanes, options = {}) {
  const a = nodes[start], b = nodes[end];
  const { interior = [], oneWay = false, speed = 140, elevated = false } = options;
  const points = [a, ...interior, b];
  const r = {
    id, name, a, b, lanes, oneWay, speed: speed / 3.6, elevated,
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
road('east-north', 'Sky Avenue', 'east', 'northeast', 2, { speed: 110 });
road('east-south', 'Arcade Row', 'east', 'southeast', 1, { speed: 75 });

function smoothRamp(points) {
  const result = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i], c = points[i + 1], d = points[Math.min(points.length - 1, i + 2)];
    for (let j = 1; j <= 12; j++) {
      if (i === points.length - 2 && j === 12) break;
      const t = j / 12;
      const coord = k => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t
        + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t);
      result.push({ x: coord('x'), y: Math.min(35, Math.max(0, coord('y'))), z: coord('z') });
    }
  }
  return result;
}

const rampPoints = [
  nodes.northeast, { x: 164, y: 1, z: 119 }, { x: 211, y: 8, z: 152 },
  { x: 249, y: 17, z: 212 }, { x: 266, y: 27, z: 272 }, nodes['sky-arrival'],
];
road('ramp', 'Sky Ramp', 'northeast', 'sky-arrival', 1, {
  interior: smoothRamp(rampPoints), speed: 85, elevated: true,
});
road('sky-deck', 'Sky Avenue Deck', 'sky-arrival', 'sky-outlook', 2, {
  interior: [{ x: 208, y: 35, z: 335 }, { x: 158, y: 35, z: 314 }, { x: 107, y: 35, z: 285 }], speed: 100, elevated: true,
});

for (const n of Object.values(nodes)) {
  n.halfWidth = Math.max(...roads.filter(r => r.a === n || r.b === n).map(r => r.halfWidth));
  n.trim = n.id.startsWith('plaza-') ? 8 : n.halfWidth + 3;
}

export const VANTA_BAY = { nodes, roads, edges };

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
  const options = edge.to.exits.filter(next => next.road !== edge.road);
  return options.length ? options : edge.to.exits;
}

export function turnAngle(edge, next) {
  const a = frameOn(edge.path, edge.path.length), b = frameOn(next.path, 0);
  return Math.atan2(Math.sin(a.th - b.th), Math.cos(a.th - b.th));
}

export function routeTo(start, goal, incoming = null) {
  const queue = [{ node: start, route: [], incoming }];
  const seen = new Set(incoming ? [incoming] : []);
  for (const item of queue) {
    if (item.node === goal) return item.route;
    const exits = item.incoming ? legalTurns(item.incoming) : item.node.exits;
    for (const edge of exits) {
      if (seen.has(edge)) continue;
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
