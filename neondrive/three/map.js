// Vanta Bay's fixed street layout. A road owns its surface and has one or two
// directed edges. Every driving route uses those edges and their lane offsets.
import { D, LINK_NAMES, SEGL, SW } from './world.js';

export const LANE_WIDTH = 3.5;
export const PLAZA_RADIUS = 43;
export const RAMP_BORE_HALF_WIDTH = 5.1;
const R = PLAZA_RADIUS;
const SKY_HEIGHT = 35;
export const LEVEL_Y = [0, SKY_HEIGHT, 100];          // street, Sky Avenues, Crown
export const LEVEL_NAMES = ['STREET', 'SKY AVENUES', 'CROWN'];
const DECK_X = 128;
const DECK_SOUTH = -305;
const DECK_NORTH = 325;
// the Crown helix: from the north end of the Sky Avenues, 3 turns round a 280 m tower, out heading north above
// where it began
export const CROWN_HELIX = { cx: DECK_X - 70, cz: DECK_NORTH, r: 70, turns: 3 };

const node = (id, x, z, level = 0) => ({ id, x, y: LEVEL_Y[level], z, level, exits: [] });
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
  node('crown-arrival', DECK_X, DECK_NORTH, 2), node('crown-outlook', -262, 480, 2),
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
  const { interior = [], oneWay = false, speed = 140, city = 'VANTA BAY' } = options;
  const points = [a, ...interior, b];
  const r = {
    id, name, a, b, lanes, oneWay, speed: speed / 3.6, city,
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

function spiralRamp(id, name, start, end, city) {
  const a = nodes[start], b = nodes[end];
  const radius = 105, opening = 0.38, samples = 144;
  const direction = Math.sign(b.z - a.z);
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples, angle = opening + t * (2 * Math.PI - 2 * opening);
    return {
      x: a.x + radius * (Math.cos(opening) - Math.cos(angle)),
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
  const ramp = road(id, name, start, end, 1, { interior: points.slice(1, -1), oneWay: true, speed: 80, city });
  ramp.bore = { from: 56, to: Math.floor((ramp.path.length - 56) / SEGL) * SEGL, mode: a.level < b.level ? 1 : 2 };
}

// Two-way and open to the sky. Three turns at 70 m radius ease the 65 m climb.
function crownHelix(id, start, end, { cx, cz, r, turns }, city) {
  const a = nodes[start], b = nodes[end];
  const samples = Math.round(turns * 64), sweep = turns * 2 * Math.PI, flat = 0.04;
  const points = [];
  for (let i = 1; i < samples; i++) {
    const t = i / samples, phi = t * sweep;
    // a steady grade, eased over the first and last 6% of the climb
    const k = Math.min(1, Math.max(0, (t - flat) / (1 - 2 * flat))), e = 0.06;
    const rise = k < e ? k * k / (2 * e * (1 - e)) : k > 1 - e ? 1 - (1 - k) ** 2 / (2 * e * (1 - e)) : (k - e / 2) / (1 - e);
    points.push({ x: cx + r * Math.cos(phi), y: a.y + (b.y - a.y) * rise, z: cz + r * Math.sin(phi) });
  }
  const helix = road(id, 'Crown Helix', start, end, 1, { interior: points, speed: 90, city });
  helix.helix = true;
}
road('sky-south-through', 'Sky Avenues', 'sky-south', 'sky-departure', 2, { speed: 100 });
road('sky-deck', 'Sky Avenues', 'sky-departure', 'sky-arrival', 2, { speed: 110 });
road('sky-north-through', 'Sky Avenues', 'sky-arrival', 'sky-north', 2, { speed: 100 });
spiralRamp('sky-up', 'Sky Ramp Up', 'street-up', 'sky-arrival');
spiralRamp('sky-down', 'Sky Ramp Down', 'sky-departure', 'street-down');
crownHelix('crown-helix', 'sky-north', 'crown-arrival', CROWN_HELIX);
// north off the helix, one wide 120 m bend (holdable at the 120 km/h limit), then west between the Crown towers
road('crown-way', 'Crown Way', 'crown-arrival', 'crown-outlook', 2, { speed: 120, interior:
  Array.from({ length: 16 }, (_, i) => { const a = (i + 0.5) / 16 * Math.PI / 2;
    return { x: DECK_X - 120 + 120 * Math.cos(a), y: 100, z: 360 + 120 * Math.sin(a) }; }) });

// ---------- the grid cities beyond Vanta Bay, and the links that join them ----------
// Each is the same template: a gate road off the incoming link onto a central avenue (3 lanes each way) through a
// 3x3 grid of streets (rows at z0/z1, columns at x0/xm/x1). Only names, districts and landmarks differ.
export const GRID_CITIES = [
  { name: 'AURUM HEIGHTS', p: 'au', gate: 1150, x0: 1300, xm: 1450, x1: 1600, z0: -130, z1: 130,
    avenue: 'Sun Avenue', rows: ['Ember Row', 'Halo Row'], cols: ['Gilt Street', 'Spire Street', 'Tether Street'],
    elevator: { x: 1525, z: 65 } },
  { name: 'GLACIA', p: 'gl', gate: 2450, x0: 2600, xm: 2750, x1: 2900, z0: -130, z1: 130,
    avenue: 'Frost Avenue', rows: ['Rime Row', 'Aurora Row'], cols: ['Shard Street', 'Lattice Street', 'Beacon Street'] },
  { name: 'CORAL DEEP', p: 'cd', gate: 3700, x0: 3850, xm: 4000, x1: 4150, z0: -130, z1: 130,
    avenue: 'Tide Avenue', rows: ['Kelp Row', 'Pearl Row'], cols: ['Anemone Street', 'Current Street', 'Lantern Street'] },
  { name: 'BLACKOUT SECTOR', p: 'bs', gate: 5150, x0: 5300, xm: 5450, x1: 5600, z0: -130, z1: 130,
    avenue: 'Blackout Avenue', rows: ['Relay Row', 'Stack Row'], cols: ['Switch Street', 'Node Street', 'Failsafe Street'],
    underpass: 'c10', incoming: { id: 'vactrain', district: D.VAC, speed: 450, lanes: 2 } },
  { name: 'NEON LAGOON', p: 'nl', gate: 6400, x0: 6550, xm: 6700, x1: 6850, z0: -130, z1: 130,
    avenue: 'Lagoon Avenue', rows: ['Canal Row', 'Market Row'], cols: ['Stilt Street', 'Stack Street', 'Marina Street'],
    incoming: { id: 'ferry', district: D.FERRY, speed: 120, lanes: 2, height: 4 } },
  { name: 'EMBER FOUNDRY', p: 'ef', gate: 7850, x0: 8000, xm: 8150, x1: 8300, z0: -130, z1: 130,
    avenue: 'Furnace Avenue', rows: ['Slag Row', 'Container Row'], cols: ['Stack Street', 'Casting Street', 'Crane Street'],
    incoming: { id: 'volcano-rim', district: D.VOLCANO, speed: 140, lanes: 2, height: 10, bend: 96 } },
  { name: 'AURORA PASS', p: 'ap', gate: 9800, x0: 9950, xm: 10100, x1: 10250, z0: -130, z1: 130,
    avenue: 'Aurora Avenue', rows: ['Snow Row', 'Summit Row'], cols: ['Pine Street', 'Glacier Street', 'Beacon Street'],
    underpass: 'c10',
    incoming: { id: 'cloud-causeway', district: D.CLOUDS, speed: 180, lanes: 2, height: 42, ascent: 550, bend: -60 } },
  { name: 'MONSOON TERRACES', p: 'mt', gate: 11150, x0: 11300, xm: 11450, x1: 11600, z0: -130, z1: 130,
    avenue: 'Terrace Avenue', rows: ['Rain Row', 'Temple Row'], cols: ['Cascade Street', 'Garden Street', 'Spire Street'],
    incoming: { id: 'pontoon-road', district: D.PONTOON, speed: 120, lanes: 2, height: 2, bend: 32 } },
  { name: 'MIRAGE BAZAAR', p: 'mb', gate: 12600, x0: 12750, xm: 12900, x1: 13050, z0: -130, z1: 130,
    avenue: 'Mirage Avenue', rows: ['Canopy Row', 'Dune Row'], cols: ['Lantern Street', 'Oasis Street', 'Spire Street'],
    incoming: { id: 'salt-flats', district: D.SALT, speed: 250, lanes: 2 } },
];
export const AURUM = GRID_CITIES[0];
export const BRIDGE = { x0: 240, x1: AURUM.gate, top: 22, ramp: 350 };
// along the map, west to east: each link joins city a (west) to city b (east) between x0 and x1
export const LINKS = [
  { id: 'skybridge', name: 'SKYBRIDGE', a: 'VANTA BAY', b: 'AURUM HEIGHTS', x0: BRIDGE.x0, x1: BRIDGE.x1 },
  { id: 'mega-highway', name: 'MEGA-HIGHWAY', a: 'AURUM HEIGHTS', b: 'GLACIA', x0: AURUM.x1, x1: GRID_CITIES[1].gate },
  { id: 'aqua-tube', name: 'AQUA TUBE', district: D.TUBE, a: 'GLACIA', b: 'CORAL DEEP', x0: GRID_CITIES[1].x1, x1: GRID_CITIES[2].gate },
  ...GRID_CITIES.flatMap((c, i) => {
    if (!c.incoming) return [];
    const previous = GRID_CITIES[i - 1];
    return [{ ...c.incoming, name: LINK_NAMES[c.incoming.district], a: previous.name, b: c.name,
      x0: previous.x1, x1: c.gate, from: previous.p + '-21', to: c.p + '-gate' }];
  }),
];
for (const c of GRID_CITIES) {
  const { p } = c, add = (id, x, z) => { nodes[id] = node(id, x, z); };
  add(p + '-gate', c.gate, 0);
  for (const [i, x] of [c.x0, c.xm, c.x1].entries()) for (const [j, z] of [c.z0, 0, c.z1].entries()) add(p + '-' + i + j, x, z);
  const A = { city: c.name };
  road(p + '-av', c.avenue, p + '-gate', p + '-01', 3, { ...A, speed: 140 });
  road(p + '-av-mid', c.avenue, p + '-01', p + '-11', 3, { ...A, speed: 140 });
  road(p + '-av-east', c.avenue, p + '-11', p + '-21', 3, { ...A, speed: 140 });
  for (const j of [0, 2]) for (const i of [0, 1]) road(p + '-r' + j + i, c.rows[j / 2], p + '-' + i + j, p + '-' + (i + 1) + j, 1, { ...A, speed: 80 });
  for (const i of [0, 1, 2]) for (const j of [0, 1]) {
    const id = 'c' + i + j;
    const r = road(p + '-' + id, c.cols[i], p + '-' + i + j, p + '-' + i + (j + 1), 1, { ...A, speed: 80 });
    if (id === c.underpass) r.tube = { from: 28, to: Math.floor((r.path.length - 28) / SEGL) * SEGL, mode: 0 };
  }
}

export const DECK_COVER = { x: DECK_X, south: DECK_SOUTH, north: DECK_NORTH, halfWidth: 2 * LANE_WIDTH + SW };
const deckCovers = new Map([['VANTA BAY', DECK_COVER]]);
export const deckCoverFor = city => deckCovers.get(city);

for (const city of GRID_CITIES) {
  const { p, xm: x, name } = city, prefix = id => p + '-' + id;
  const cover = { x, south: -350, north: 360, halfWidth: DECK_COVER.halfWidth };
  deckCovers.set(name, cover);
  city.helix = { ...CROWN_HELIX, cx: x - CROWN_HELIX.r, cz: cover.north };
  for (const [id, dx, z, level] of [
    ['street-up', 0, 208, 0], ['street-down', 0, -274, 0],
    ['street-north', 0, 349, 0], ['street-south', 0, -344, 0],
    ['sky-arrival', 0, 298, 1], ['sky-departure', 0, -184, 1],
    ['sky-north', 0, cover.north, 1], ['sky-south', 0, cover.south, 1],
    ['crown-arrival', 0, cover.north, 2], ['crown-outlook', -342, 548, 2],
  ]) nodes[prefix(id)] = node(prefix(id), x + dx, z, level);
  for (const [id, a, b] of [
    ['street-north-approach', '12', 'street-up'], ['street-north-through', 'street-up', 'street-north'],
    ['street-south-approach', '10', 'street-down'], ['street-south-through', 'street-down', 'street-south'],
  ]) road(prefix(id), city.cols[1], prefix(a), prefix(b), 2, { city: name, speed: 95 });
  for (const [id, a, b] of [
    ['sky-south-through', 'sky-south', 'sky-departure'], ['sky-deck', 'sky-departure', 'sky-arrival'],
    ['sky-north-through', 'sky-arrival', 'sky-north'],
  ]) road(prefix(id), 'Sky Avenues', prefix(a), prefix(b), 2, { city: name, speed: 110 });
  spiralRamp(prefix('sky-up'), 'Sky Ramp Up', prefix('street-up'), prefix('sky-arrival'), name);
  spiralRamp(prefix('sky-down'), 'Sky Ramp Down', prefix('sky-departure'), prefix('street-down'), name);
  crownHelix(prefix('crown-helix'), prefix('sky-north'), prefix('crown-arrival'), city.helix, name);
  const radius = 120, interior = Array.from({ length: 16 }, (_, i) => {
    const angle = (i + 0.5) / 16 * Math.PI / 2;
    return { x: x - radius + radius * Math.cos(angle), y: LEVEL_Y[2], z: 428 + radius * Math.sin(angle) };
  });
  road(prefix('crown-way'), 'Crown Way', prefix('crown-arrival'), prefix('crown-outlook'), 2, { interior, city: name, speed: 120 });
}
{
  // the skybridge: up off Vanta Boulevard's harbour end, 22 m over the water, and down onto Sun Avenue; ~16 m of road
  // per metre at the ends, eased like the helix
  const { x0, x1, top, ramp } = BRIDGE, pts = [];
  for (let x = x0 + 8; x < x1 - 7; x += 8) {
    const r = Math.min(x - x0, x1 - x, ramp) / ramp, e = 0.12;
    const k = r < e ? r * r / (2 * e * (1 - e)) : r > 1 - e ? 1 - (1 - r) ** 2 / (2 * e * (1 - e)) : (r - e / 2) / (1 - e);
    pts.push({ x, y: top * Math.min(1, k), z: 0 });
  }
  const br = road('skybridge', 'Skybridge', 'east-end', 'au-gate', 2, { interior: pts, speed: 180, city: 'link' });
  br.bridge = true; br.link = LINKS[0];
  // the mega-highway: straight and fast from the east end of Sun Avenue to Glacia's gate, barriers and overpasses
  const hw = road('mega-highway', 'Mega-Highway', 'au-21', 'gl-gate', 3, { speed: 300, city: 'link' });
  hw.highway = true; hw.link = LINKS[1];
  // the aqua tube: a glass tunnel across the sea floor from Glacia's east end to Coral Deep, sheltered all the way
  const tube = road('aqua-tube', 'Aqua Tube', 'gl-21', 'cd-gate', 2, { speed: 200, city: 'link' });
  tube.tube = { from: 32, to: tube.path.length - 32 }; tube.link = LINKS[2];
  for (const link of LINKS.filter(link => link.from)) {
    const interior = [];
    if (link.height || link.bend) {
      const span = link.x1 - link.x0, easeLength = Math.min(link.ascent ?? 350, span / 2);
      for (let x = link.x0 + 4; x <= link.x1 - 4; x += 4) {
        const t = Math.min(1, (x - link.x0) / easeLength, (link.x1 - x) / easeLength);
        interior.push({ x, y: (link.height ?? 0) * t * t * (3 - 2 * t),
          z: (link.bend ?? 0) * Math.sin(Math.PI * (x - link.x0) / span) ** 2 });
      }
    }
    const r = road(link.id, link.name, link.from, link.to, link.lanes, { interior, speed: link.speed, city: 'link' });
    r.link = link;
    if (link.district === D.VAC) r.tube = { from: 32, to: r.path.length - 32, mode: 3 };
  }
}
export function inTube(road, distance) { return Boolean(road.tube && distance >= road.tube.from && distance <= road.tube.to); }

for (const n of Object.values(nodes)) {
  n.halfWidth = Math.max(...roads.filter(r => r.a === n || r.b === n).map(r => r.halfWidth));
  n.ramp = roads.find(r => r.bore && (r.a === n || r.b === n));
  n.trim = n.ramp ? 24 : n.id.startsWith('plaza-') ? 8 : n.halfWidth + 3;
  n.discR = n.ramp ? 0 : Math.max(n.trim + 1, n.halfWidth + 3.5);   // the junction disc map-city draws
}

export const VANTA_BAY = { nodes, roads, edges };

export function inBore(road, distance) {
  return Boolean(road.bore && distance >= road.bore.from && distance <= road.bore.to);
}

export function underSkyDeck({ x, y, z }) {
  if (y >= SKY_HEIGHT - 2) return false;
  for (const cover of deckCovers.values()) {
    if (z > cover.south && z < cover.north && Math.abs(x - cover.x) < cover.halfWidth) return true;
  }
  return false;
}

// the closest point of a path to (x, z) in plan view: distance along it, signed sideways offset (+ is the
// rider's right, as laneOffset), height and heading there, and whether the point lies past either end
export function nearestOnPath(path, x, z, out = {}, y = null) {
  let best = Infinity, bestPlan = 0;
  for (const g of path.segments) {
    const len2 = g.dx * g.dx + g.dz * g.dz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - g.start.x) * g.dx + (z - g.start.z) * g.dz) / len2)) : 0;
    const px = g.start.x + g.dx * t, pz = g.start.z + g.dz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
    // with a height, a pass of the road far above or below doesn't count as near
    const score = y === null ? d2 : d2 + 25 * (g.start.y + g.dy * t - y) ** 2;
    if (score < best) { best = score; bestPlan = d2; out.s = g.at + g.size * t; }
  }
  best = bestPlan;
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
    list.push({ kind: 'node', node: n, radius: n.discR, nodes: [n], level: n.level });
  }
  for (const s of list) {
    s.next = list.filter(o => o !== s && o.nodes.some(n => s.nodes.includes(n)));
    s.speed = s.kind === 'road' ? s.road.speed : Math.max(...roads.filter(r => r.a === s.node || r.b === s.node).map(r => r.speed));
  }
  return list;
})();

// where (x, z) lies on a surface: null if outside it, else its height, heading and how deep inside (0 at the edge)
export function onSurface(surface, x, z, out = {}, y = null) {
  if (surface.kind === 'node') {
    const n = surface.node, d = Math.hypot(x - n.x, z - n.z);
    if (d > surface.radius) return null;
    out.y = n.y; out.th = null; out.depth = surface.radius - d; out.s = 0; out.lat = 0;
    return out;
  }
  nearestOnPath(surface.road.path, x, z, out, y);
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
