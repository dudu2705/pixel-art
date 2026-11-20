// Vanta Bay's district dressing on the map: each street belongs to one of the city's districts in the reference
// (downtown, lantern market, arcade row, glass spires, docklands) and gets that district's props, placed by the
// same rules dressing.js uses on the loop, every 4 m (one reference segment) along the street.
import { VANTA_BAY, frameOn, GRID_CITIES } from './map.js';
import { SEGL, SW, D, CITIES, WARM, hash } from './world.js';
import { FONT } from './cockpit.js';
import { Batch, unitBox, unitPlane, unitSphere, unitCone, unitCyl } from './props.js';

const LEAF = [[60, 255, 180], [200, 90, 255], [90, 200, 255], [255, 90, 200]];
const CORAL = [[255, 110, 160], [120, 255, 220], [255, 170, 90], [200, 120, 255]];
const BOX = [[150, 60, 40], [40, 110, 120], [190, 150, 40], [50, 70, 140], [160, 40, 60], [90, 100, 60]];
// which district each street is, by road id (unlisted street roads stay plain)
export const STREET_DISTRICT = {
  gateway: D.DOWNTOWN, 'west-boulevard': D.DOWNTOWN, 'east-boulevard': D.SPIRES,
  'west-north': D.MARKET, 'west-south': D.MARKET, 'north-plaza': D.MARKET, northwest: D.MARKET,
  'south-plaza': D.ARCADE, 'east-south': D.ARCADE, southwest: D.DOWNTOWN, southeast: D.ARCADE,
  northeast: D.SPIRES, 'east-north': D.SPIRES, 'harbor-end': D.DOCKS,
};
// the grid cities, by street role, from each city's own reference districts
const GRID_DISTRICTS = {
  'AURUM HEIGHTS': { av: D.GARDENS, r0: D.BUILD, r2: D.DOWNTOWN, c0: D.DOWNTOWN, c1: D.SPIRES, c2: D.SPIRES },
  GLACIA: { av: D.SPIRES, r0: D.MARKET, r2: D.DATA, c0: D.DOWNTOWN, c1: D.DATA, c2: D.SPIRES },
  'CORAL DEEP': { av: D.REEF, r0: D.CANALS, r2: D.GARDENS, c0: D.REEF, c1: D.GARDENS, c2: D.REEF },
  'BLACKOUT SECTOR': { av: D.STACK, r0: D.DOWNTOWN, r2: D.DATA, c0: D.STACK, c1: D.TUNNEL, c2: D.DATA },
  'NEON LAGOON': { av: D.CANALS, r0: D.CANALS, r2: D.MARKET, c0: D.CANALS, c1: D.STACK, c2: D.CANALS },
  'EMBER FOUNDRY': { av: D.FORGE, r0: D.STACK, r2: D.DOCKS, c0: D.BUILD, c1: D.FORGE, c2: D.DOCKS },
};
for (const c of GRID_CITIES) {
  const g = GRID_DISTRICTS[c.name], p = c.p;
  for (const r of ['-av', '-av-mid', '-av-east']) STREET_DISTRICT[p + r] = g.av;
  for (const i of [0, 1]) { STREET_DISTRICT[p + '-r0' + i] = g.r0; STREET_DISTRICT[p + '-r2' + i] = g.r2; }
  for (const i of [0, 1, 2]) for (const j of [0, 1]) STREET_DISTRICT[p + '-c' + i + j] = g['c' + i];
}
STREET_DISTRICT['mega-highway'] = D.HIGHWAY;

export function buildMapDressing(mats) {
  const B = { metal: new Batch(unitBox), emit: new Batch(unitBox), cloth: new Batch(unitPlane),
    lamp: new Batch(unitSphere), effect: new Batch(unitPlane), foliage: new Batch(unitPlane), cone: new Batch(unitCone),
    pole: new Batch(unitCyl) };
  for (const road of VANTA_BAY.roads) {
    const d = STREET_DISTRICT[road.id], city = CITIES.find(c => c.name === road.city) ?? (road.link && CITIES.find(c => c.name === road.link.b));
    if (d === undefined || road.level !== 0) continue;
    const linkCity = road.link ? CITIES.find(c => c.name === road.link.b) : null;
    const RW = road.halfWidth, from = (road.a.discR || 0) + 3, to = road.path.length - (road.b.discR || 0) - 3;
    const seed = road.id.length * 977 + Math.round(road.path.length);
    for (let s = from, i = 0; s < to; s += SEGL, i++) {
      const n = seed + i, f = frameOn(road.path, s), gy = f.y;
      const put = (lat, up, size, col, batch, meta = [0, 0], rot = f.th) =>
        batch.add([f.x + f.rx * lat, gy + up, f.z + f.rz * lat], size, rot, col, meta);
      const steam = (lat, height, width, rise, sd, rate = 0.35, color = [170, 150, 190]) => {
        const phase = hash(sd, 3, 3);
        for (let k = 0; k < 5; k++) put(lat, height, [width, rise, 1], color, B.effect, [0, sd + k, phase + k / 5, rate]);
      };

      // ---------- overhead cables down the old downtown streets ----------
      if (d === D.DOWNTOWN && i % 7 === 3) {
        const L = RW + SW, h0 = 9 + n % 3, h1 = 10 + (n >> 1) % 3, span = Math.ceil(L * 2);
        const height = t => h0 + (h1 - h0) * t - 1.1 * Math.sin(Math.PI * t);
        for (let k = 0; k < span; k++) {
          const a = k / span, b = (k + 1) / span, lat = (a + b - 1) * L;
          for (const layer of [0, 0.4]) put(lat, (height(a) + height(b)) / 2 + layer, [L * 2 / span + 0.02, 0.045, 0.05], [10, 8, 16], B.metal);
        }
      }
      // ---------- lantern market: strings of lanterns, and stalls on the sidewalks ----------
      if (d === D.MARKET && i % 3 === 0) {
        const L = RW + SW;
        put(0, 8, [L * 2, 0.07, 0.06], [14, 12, 20], B.metal);
        for (let k = 0, l = -L + 1.4; l < L; l += 2.4, k++) put(l, 7.45, [0.68, 0.78, 0.68], WARM[(n + k) % 4], B.lamp, [n + k, 0.5]);
      }
      if (d === D.MARKET && i % 2 === 0) for (const sg of [-1, 1]) {
        if (hash(n, sg + 5, 31) >= 0.45) continue;
        const lat = sg * (RW + SW * 0.55);
        put(lat, 0, [2.3, 1.0, 2.0], [60, 36, 30], B.metal);
        put(lat, 1.0, [2.1, 1.3, 1.8], [24, 16, 20], B.metal);
        put(lat, 1.05, [2.2, 0.12, 1.9], [255, 190, 110], B.emit, [n, 0.4]);
        steam(lat, 2.9, 1, 2.45, n);
        B.cloth.add([f.x + f.rx * lat, gy + 2.6, f.z + f.rz * lat], [2.86, 0.6, 1], f.th, WARM[n % 4], [n, 1]);
      }
      // ---------- arcade row: neon signs hung over the sidewalk ----------
      if (d === D.ARCADE && i % 4 === 1) for (const sg of [-1, 1]) {
        if (hash(n, sg + 3, 21) >= 0.6) continue;
        const lat = sg * (RW + SW - 0.4), c = city.neon[(n + (sg > 0 ? 1 : 0)) % 6];
        put(lat, 3.4, [0.12, 3.2, 0.12], [30, 28, 40], B.metal);
        put(lat - sg * 0.9, 5.2, [1.9, 1.1, 0.16], [12, 10, 18], B.metal, [0, 0], f.th + Math.PI / 2);
        put(lat - sg * 0.9, 5.2, [1.6, 0.8, 0.2], c, B.emit, [n, 0.5], f.th + Math.PI / 2);
      }
      // ---------- vents steaming in the old downtown, the spires and the docks ----------
      if ((d === D.DOWNTOWN || d === D.SPIRES || d === D.DOCKS) && hash(n, 4, 4) < 0.06)
        steam((hash(n, 5, 5) < 0.5 ? -1 : 1) * (RW - 1.5), 0, 1.4, 3.5, n);
      // ---------- holo gardens and the reef: glowing trees, or coral, along the kerb ----------
      const reef = d === D.REEF && i % 4 === 2;
      if ((d === D.GARDENS && i % 2 === 1) || reef) for (const sg of [-1, 1]) {
        if (reef && hash(n, sg + 13, 35) >= 0.5) continue;
        const c = (reef ? CORAL : LEAF)[(hash(n, sg + 3, 71) * 4) | 0], lat = sg * (RW + 0.9);
        put(lat, 0, [0.32, 3.2, 0.32], [36, 26, 40], B.metal);
        put(lat, 4.3, [3, 2.5, 1], c, B.foliage, [n, 0]);
        put(lat, 4.3, [0.01, 0.01, 0.01], c, B.emit, [n, 0.4, 2.6, 60]);
      }
      // ---------- stilt canals: lantern boats moored beside the street ----------
      if (d === D.CANALS && i % 7 === 0) {
        const side = hash(n, 1, 63) < 0.5 ? -1 : 1, lat = side * (RW + SW + 1.5 + hash(n, 2, 64) * 3);
        put(lat, 0, [3.2, 0.5, 5.6], [50, 34, 26], B.metal);
        put(lat, 0.5, [0.1, 1.3, 0.1], [30, 24, 20], B.metal);
        put(lat, 1.9, [0.5, 0.6, 0.5], city.neon[n % 6], B.lamp, [n, 0.45, 2, 48]);
      }
      // ---------- construction zone: cones on the kerb, flashing barriers ----------
      if (d === D.BUILD && i % 2 === 0) for (const sg of [-1, 1]) {
        put(sg * (RW + 0.4), 0, [0.8, 0.8, 0.8], [255, 110, 20], B.cone, [n, 0]);
        if (i % 6 === 0) put(sg * (RW + 0.6), 0.9, [0.25, 0.25, 0.25], [255, 160, 40], B.emit, [n, 0.8, 1.5, 30]);
      }
      // ---------- data canyon: green lasers fanning from the rooftops ----------
      if (d === D.DATA && i % 11 === 0) {
        const sg = hash(n, 4, 4) < 0.5 ? -1 : 1, h = 30 + hash(n, 5, 5) * 20;
        put(sg * (RW + SW + 2), h, [120, 80, 1], [80, 255, 120], B.effect, [3, n]);
      }
      if (d === D.STACK && i % 5 === 2) for (const side of [-1, 1]) {
        const lat = side * (RW + SW * 0.72), height = 2 + hash(n, side + 1, 12) * 5;
        put(lat, 0, [1.8, height, 3.6], [26, 28, 38], B.metal);
        put(lat - side * 0.92, height * 0.68, [0.05, 0.24, 2.8], city.neon[1], B.emit, [n, 0.38]);
      }
      if (d === D.FORGE) {
        if (i % 20 === 9) {
          const side = hash(n, 3, 13) < 0.5 ? -1 : 1, h = 70 + hash(n, 4, 14) * 50;
          const lat = side * (RW + SW + 6);
          put(lat, 0, [3.2, h, 3.2], [44, 30, 28], B.pole);
          put(lat, h - 1.2, [3.7, 1.2, 3.7], [255, 110, 30], B.emit, [n, 0.5, 4, 56]);
          for (const fraction of [0.25, 0.6]) put(lat, h * fraction, [3.6, 0.5, 3.6], [90, 50, 30], B.pole);
          steam(lat, h + 1, 12, 14, n, 0.25, [70, 50, 46]);
        }
        if (i % 3 === 0) for (let lane = -road.lanes; lane < road.lanes; lane++)
          put((lane + 0.5) * 3.5, 0.062, [1.1, 0.06, 2.4], [255, 110, 30], B.emit, [n, 0.25]);
      }
      // ---------- mega-highway: barriers along both edges, an overpass every 280 m ----------
      if (d === D.HIGHWAY) {
        for (const sg of [-1, 1]) put(sg * (RW + SW), 0, [0.3, 1.1, SEGL + 0.05], [56, 54, 70], B.metal);
        if (i % 70 === 35) {
          put(0, 10.6, [240, 2.0, 9], [30, 28, 40], B.metal);              // the deck spans across the road
          for (const sg of [-1, 1]) put(sg * (RW + SW + 2), 0, [1.8, 10.6, 1.8], [36, 34, 46], B.metal);
          for (let k = -6; k <= 6; k++) put(k * 1.8, 12.7, [0.5, 0.2, 0.5], linkCity ? linkCity.neon[(k + 6) % 6] : [255, 200, 120], B.emit, [n + k, 0.5, 1.5, 30]);
        }
      }
      // ---------- docklands: container stacks behind the sidewalk, and a gantry crane ----------
      if (d === D.DOCKS && i % 3 === 0) for (const sg of [-1, 1]) {
        if (hash(n, sg + 9, 41) >= 0.6) continue;
        for (let j = 0; j < 3; j++) {
          const stack = 1 + Math.floor(hash(n, j, 51) * 4);
          for (let b = 0; b < stack; b++) put(sg * (RW + SW + 1.8 + j * 2.6), b * 2.6, [2.4, 2.5, 2.4], BOX[(hash(n, j * 7 + b, 52) * 6) | 0], B.metal);
        }
      }
      if (d === D.DOCKS && i === Math.floor((to - from) / SEGL / 2)) {
        const sg = 1, yc = [200, 120, 30];
        for (const l of [sg * (RW + SW + 9), sg * (RW + SW + 21)]) put(l, 0, [1.2, 40, 1.2], yc, B.metal);
        B.metal.add([f.x + f.rx * (RW + SW + 13), gy + 40.75, f.z + f.rz * (RW + SW + 13)], [26, 1.5, 1.6], f.th + Math.PI / 2, yc, [0, 0]);
        put(RW + SW + 9, 41.5, [4, 2.5, 3], [40, 36, 50], B.metal);
        put(RW + SW + 2, 41, [0.9, 0.9, 0.9], [255, 40, 40], B.emit, [n, 0.9]);
      }
    }
  }
  // the gantry that announces each city, over the road where you ride in
  for (const [rid, at, name] of [['gateway', 40, 'VANTA BAY'], ...GRID_CITIES.map(c => [c.p + '-av', 30, c.name])]) {
    const road = VANTA_BAY.roads.find(r => r.id === rid), f = frameOn(road.path, at), RW = road.halfWidth;
    const city = CITIES.find(c => c.name === name);
    const put = (lat, up, size, col, batch, meta = [0, 0]) => batch.add([f.x + f.rx * lat, f.y + up, f.z + f.rz * lat], size, f.th, col, meta);
    for (const side of [-1, 1]) put(side * (RW + 1), 0, [0.4, 8, 0.4], [40, 40, 54], B.metal);
    put(0, 7.9, [(RW + 1) * 2, 0.4, 0.45], [40, 40, 54], B.metal);
    put(0, 5.9, [12, 2, 0.28], [10, 10, 18], B.metal);
    const label = city.name, width = 12, cw = width / (label.length * 4 + 2), ch = 2 / 7;
    for (let i = 0; i < label.length; i++) {
      const glyph = FONT[label[i]] || FONT[' '];
      for (let bit = 0; bit < glyph.length; bit++) if (glyph[bit] === '1')
        put((i * 4 + bit % 3 + 1.5) * cw - width * 0.5, 5.9 + (5 - Math.floor(bit / 3)) * ch, [cw, ch, 0.5], city.neon[0], B.emit);
    }
    put(0, 6.89, [0.01, 0.01, 0.01], city.neon[0], B.emit, [0, 0.3, 5, 60]);
  }
  const out = [];
  for (const [b, m] of [[B.metal, mats.metal], [B.emit, mats.emit], [B.cloth, mats.cloth], [B.lamp, mats.emit], [B.effect, mats.effect], [B.foliage, mats.foliage], [B.cone, mats.emit], [B.pole, mats.metal]]) {
    const mesh = b.build(m); if (mesh) out.push(mesh);
  }
  return out;
}
