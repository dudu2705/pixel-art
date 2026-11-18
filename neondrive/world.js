// world.js — the Neon Drive city generator, lifted verbatim from the original
// pseudo-3D build. Pure data: no canvas, no renderer, no DOM. The 3D engine reads
// these arrays and turns them into meshes.
//
// Everything is driven by one seeded RNG, so a given seed always builds the same city.

let T = 0;
export function setTime(t) { T = t; }
export function getTime() { return T; }

const SEGL = 4, DRAW = 120;

// eight cities, each a run of districts, joined by a link (skybridge, aqua tube or mega-highway)
const ZONE_NAMES = ['NEON DOWNTOWN', 'LANTERN MARKET', 'GLASS SPIRES', 'UNDERPASS', 'DOCKLANDS', 'SKYBRIDGE', 'HOLO GARDENS',
  'ARCADE ROW', 'MEGA-HIGHWAY', 'STACKTOWN', 'DATA CANYON', 'CONSTRUCTION ZONE', 'SHRINE STREET', 'AQUA TUBE', 'STILT CANALS',
  'CANYON ROAD', 'SPIRAL RAMP', 'FOUNDRY', 'TERRACES', 'REEF', 'FAIRGROUND', 'OVERGROWN', 'CITADEL', 'BAZAAR',
  'VACTRAIN', 'FERRY', 'VOLCANO RIM', 'CLOUD CAUSEWAY', 'PONTOON ROAD', 'SALT FLATS'];
const D = { DOWNTOWN: 0, MARKET: 1, SPIRES: 2, TUNNEL: 3, DOCKS: 4, BRIDGE: 5, GARDENS: 6, ARCADE: 7, HIGHWAY: 8, STACK: 9,
  DATA: 10, BUILD: 11, SHRINE: 12, TUBE: 13, CANALS: 14, CANYON: 15, RAMP: 16,
  FORGE: 17, TERRACE: 18, REEF: 19, FAIR: 20, RUIN: 21, CITADEL: 22, BAZAAR: 23,
  VAC: 24, FERRY: 25, VOLCANO: 26, CLOUDS: 27, PONTOON: 28, SALT: 29 };
const CITIES = [
  { name: 'VANTA BAY', weather: 'rain', storm: 1, link: [5, 200],
    zones: [[0, 220], [3, 50], [1, 190], [7, 170], [2, 190], [4, 150]],
    sky: [[6, 4, 16], [30, 10, 46], [104, 32, 96]], fog: [44, 16, 56], tw: [[40, 20, 60], [22, 12, 36]], hue: [200, 300],
    neon: [[255, 46, 170], [0, 234, 255], [255, 214, 64], [170, 90, 255], [70, 255, 150], [255, 110, 50]] },
  { name: 'AURUM HEIGHTS', weather: 'clear', fireworks: 1, elevator: 1, link: [13, 180],
    zones: [[6, 200], [0, 170], [8, 220], [2, 180], [11, 150]],
    sky: [[10, 6, 10], [52, 22, 22], [176, 84, 40]], fog: [74, 38, 28], tw: [[62, 34, 28], [34, 18, 16]], hue: [5, 50],
    neon: [[255, 170, 40], [255, 80, 50], [0, 220, 200], [255, 225, 120], [255, 60, 110], [120, 255, 200]] },
  { name: 'GLACIA', weather: 'fog', link: [5, 200],
    zones: [[2, 190], [1, 170], [16, 170], [10, 170], [3, 50], [0, 160]],
    sky: [[4, 8, 22], [14, 30, 62], [64, 116, 156]], fog: [30, 54, 80], tw: [[32, 46, 72], [16, 24, 42]], hue: [190, 250],
    neon: [[140, 220, 255], [200, 140, 255], [240, 250, 255], [80, 170, 255], [255, 120, 220], [120, 255, 240]] },
  { name: 'NEON LAGOON', weather: 'clear', link: [8, 200],
    zones: [[14, 210], [9, 170], [14, 170], [7, 150]],
    sky: [[2, 10, 20], [8, 40, 60], [30, 120, 130]], fog: [14, 52, 64], tw: [[16, 60, 70], [8, 30, 40]], hue: [160, 200],
    neon: [[0, 255, 220], [255, 70, 200], [180, 255, 80], [80, 160, 255], [255, 220, 90], [200, 120, 255]] },
  { name: 'RUST MESA', weather: 'sand', link: [8, 200],
    zones: [[15, 230], [0, 150], [11, 140], [15, 190]],
    sky: [[20, 8, 8], [90, 30, 20], [220, 110, 50]], fog: [120, 60, 34], tw: [[90, 40, 26], [50, 22, 16]], hue: [0, 30],
    neon: [[255, 120, 40], [255, 200, 90], [60, 220, 255], [255, 60, 60], [255, 240, 180], [180, 90, 255]] },
  { name: 'SAKURA GRID', weather: 'petals', fireworks: 1, link: [5, 200],
    zones: [[12, 210], [6, 170], [1, 170], [12, 150]],
    sky: [[14, 6, 20], [60, 20, 60], [200, 90, 140]], fog: [80, 36, 70], tw: [[70, 30, 60], [40, 16, 36]], hue: [320, 360],
    neon: [[255, 150, 200], [255, 255, 255], [255, 90, 150], [160, 220, 255], [255, 200, 120], [200, 120, 255]] },
  { name: 'BLACKOUT SECTOR', weather: 'rain', storm: 1, dark: 1, link: [13, 180],
    zones: [[9, 190], [0, 180], [10, 170], [3, 50], [9, 140]],
    sky: [[2, 2, 4], [8, 8, 12], [30, 26, 32]], fog: [14, 12, 16], tw: [[14, 14, 18], [8, 8, 10]], hue: [200, 260],
    neon: [[255, 40, 40], [255, 200, 60], [80, 255, 120], [0, 200, 255], [255, 255, 255], [255, 90, 30]] },
  { name: 'AURORA PASS', weather: 'snow', aurora: 1, mountains: 1, link: [5, 200],
    zones: [[0, 170], [2, 150], [6, 140], [3, 60], [11, 120]],
    sky: [[2, 6, 16], [10, 30, 50], [40, 90, 110]], fog: [36, 60, 76], tw: [[40, 60, 80], [22, 34, 48]], hue: [190, 230],
    neon: [[120, 255, 200], [160, 120, 255], [220, 250, 255], [60, 200, 255], [255, 150, 220], [120, 255, 120]] },
  { name: 'MONSOON TERRACES', weather: 'monsoon', storm: 1, link: [5, 200],
    zones: [[D.TERRACE, 220], [1, 160], [D.TERRACE, 180], [6, 150], [12, 130]],
    sky: [[4, 10, 10], [16, 40, 36], [60, 110, 96]], fog: [30, 60, 54], tw: [[30, 56, 50], [16, 30, 28]], hue: [100, 160],
    neon: [[120, 255, 170], [255, 200, 90], [90, 200, 255], [255, 120, 160], [200, 255, 120], [255, 240, 200]] },
  { name: 'EMBER FOUNDRY', weather: 'ash', link: [8, 200],
    zones: [[D.FORGE, 220], [9, 160], [11, 150], [D.FORGE, 180], [4, 150]],
    sky: [[12, 4, 2], [50, 16, 6], [160, 60, 20]], fog: [70, 30, 14], tw: [[50, 24, 16], [26, 12, 8]], hue: [10, 35],
    neon: [[255, 120, 30], [255, 200, 60], [255, 60, 20], [80, 220, 255], [255, 240, 200], [255, 90, 60]] },
  { name: 'CORAL DEEP', weather: 'bubbles', deep: 1, link: [13, 180],
    zones: [[D.REEF, 220], [14, 160], [D.REEF, 180], [6, 150]],
    sky: [[0, 8, 20], [2, 30, 56], [10, 80, 110]], fog: [4, 40, 66], tw: [[10, 50, 70], [4, 26, 40]], hue: [170, 220],
    neon: [[80, 255, 230], [255, 120, 200], [120, 180, 255], [255, 200, 120], [180, 255, 120], [200, 140, 255]] },
  { name: 'CARNIVAL ISLE', weather: 'clear', fireworks: 1, link: [5, 200],
    zones: [[D.FAIR, 230], [7, 170], [D.FAIR, 180], [1, 150]],
    sky: [[10, 4, 24], [40, 14, 70], [140, 60, 150]], fog: [60, 24, 80], tw: [[60, 30, 80], [34, 16, 46]], hue: [270, 330],
    neon: [[255, 80, 80], [255, 220, 60], [80, 200, 255], [255, 120, 220], [120, 255, 140], [255, 255, 255]] },
  { name: 'VERDANT RUIN', weather: 'fireflies', dark: 1, link: [5, 200],
    zones: [[D.RUIN, 240], [6, 170], [D.RUIN, 180], [3, 50], [9, 140]],
    sky: [[2, 8, 6], [10, 30, 20], [40, 80, 56]], fog: [20, 44, 32], tw: [[22, 40, 30], [12, 22, 16]], hue: [90, 150],
    neon: [[200, 255, 120], [255, 180, 80], [120, 255, 200], [255, 90, 90], [180, 140, 255], [240, 255, 200]] },
  { name: 'STORM CITADEL', weather: 'rain', storm: 2, link: [5, 200],
    zones: [[D.CITADEL, 230], [0, 170], [2, 170], [D.CITADEL, 160]],
    sky: [[4, 4, 14], [16, 16, 40], [50, 50, 90]], fog: [26, 26, 50], tw: [[30, 30, 56], [16, 16, 30]], hue: [220, 260],
    neon: [[150, 180, 255], [255, 255, 255], [120, 255, 255], [200, 120, 255], [255, 220, 120], [255, 80, 120]] },
  { name: 'MIRAGE BAZAAR', weather: 'clear', kites: 1, shimmer: 1, link: [8, 200],
    zones: [[D.BAZAAR, 230], [1, 170], [D.BAZAAR, 170], [15, 140]],
    sky: [[8, 4, 20], [40, 20, 50], [200, 110, 80]], fog: [90, 50, 50], tw: [[80, 40, 40], [44, 22, 26]], hue: [20, 50],
    neon: [[255, 190, 90], [60, 220, 255], [255, 100, 160], [255, 240, 170], [140, 255, 180], [200, 120, 255]] },
];
const LINK_NAMES = { 5: 'SKYBRIDGE', 13: 'AQUA TUBE', 8: 'MEGA-HIGHWAY', 24: 'VACTRAIN', 25: 'FERRY', 26: 'VOLCANO RIM',
  27: 'CLOUD CAUSEWAY', 28: 'PONTOON ROAD', 29: 'SALT FLATS' };
// every run is a new journey: cities in a new order, districts reshuffled, links picked at random
const rng = mulberry((Math.random() * 2 ** 31) | 0);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (rng() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
shuffle(CITIES);
const LINKS = [[5, 200], [13, 180], [8, 200], [24, 160], [25, 180], [26, 200], [27, 200], [28, 170], [29, 200]];
// every connector type shows up at least once per loop; the leftover links are random
const linkDeck = shuffle([...LINKS, ...CITIES.slice(LINKS.length).map(() => LINKS[(rng() * LINKS.length) | 0])]);
// each connector runs at a level (0 street, 1 sky avenues, 2 crown); the city before it ends on that level and the
// next city starts on it, so you leave a city, cross and arrive all on the same level
const LINK_LV = { 13: [0], 24: [0], 25: [0], 28: [0], 29: [0], 27: [2], 5: [1, 2], 8: [1, 2], 26: [1, 2] };
CITIES.forEach((c, i) => {
  shuffle(c.zones);
  // the spiral always runs street to crown, so it never opens or closes a city (that would break the level hand-over)
  const ri = c.zones.findIndex(z => z[0] === 16), mid = c.zones.length >> 1;
  if (ri === 0 || ri === c.zones.length - 1) [c.zones[ri], c.zones[mid]] = [c.zones[mid], c.zones[ri]];
  c.link = linkDeck[i]; const o = LINK_LV[c.link[0]]; c.endLv = o[(rng() * o.length) | 0];
});
const CITY_SCALE = 3.5, LINK_SCALE = 1.5;            // how long each district and each link between cities runs
const ZONES = [];                       // [start, end, district, city, isLink]
const NSEG = (() => {
  let n = 0;
  CITIES.forEach((c, ci) => {
    for (const [d, len0] of c.zones) { const len = Math.round(len0 * CITY_SCALE * (0.7 + rng() * 0.6)); ZONES.push([n, n + len, d, ci, false]); n += len; }
    const ll = Math.round(c.link[1] * LINK_SCALE);
    ZONES.push([n, n + ll, c.link[0], ci, true]); n += ll;
  });
  return n;
})();
const LEN = NSEG * SEGL;
const ZONE_OF = new Int16Array(NSEG);
ZONES.forEach((z, i) => { for (let n = z[0]; n < z[1]; n++) ZONE_OF[n] = i; });
function zoneAt(n) { return ZONES[ZONE_OF[((n % NSEG) + NSEG) % NSEG]]; }
function district(n) { return zoneAt(n)[2]; }
function zoneEnd(n) { return zoneAt(n)[1]; }
const TUNNEL_STARTS = ZONES.filter(z => z[2] === 3).map(z => z[0]);
let FOG = CITIES[0].fog.slice(), SKY = CITIES[0].sky, TWC = CITIES[0].tw;
const TH = { aurora: 0, mountains: 0, elevator: 0, fireworks: 0, dark: 0, water: 0, deep: 0, kites: 0, shimmer: 0, night: 0 };
let fogK = 1;
const RW = 7, SW = 3.2, NEAR = 0.7;
let roll = 0;
const BIKE_NAMES = ['LIGHT CYCLE', 'NO BIKE'];
const CRUISE = [22, 36, 53, 69], CRUISE_KMH = [80, 130, 190, 250];   // autopilot cruise speeds, V cycles them
let cruise = 2, wakeLock = null, lightOn = true;
const DAY = 3600, DAY0 = rng() * DAY;                  // one slow day-night cycle per hour, starting anywhere in it
let bikeStyle = 0, bikeGeo = {}, horizY = 0, crownK = 0;   // crownK: 0 below level 3, 1 riding the crown          // the chopper is the default ride
const maxV = z => district(Math.floor(z / SEGL) % NSEG) === D.VAC ? 125 : 83;   // 300 km/h, and 450 in the vactrain
// the camera: 0 back/up/lat is the cockpit; fixed pins it beside the road (trackside); pitch tips the view down
const CAM = { back: 0, up: 0, lat: 0, pitch: 0, fixed: null };
const outside = () => CAM.back > 0.05 || CAM.fixed !== null || CAM.lat * CAM.lat > 0.01;
const eye = () => 1.4 + CAM.up;
const NEON = [[255, 46, 170], [0, 234, 255], [255, 214, 64], [170, 90, 255], [70, 255, 150], [255, 110, 50]];
const WIN = [[255, 200, 120], [255, 170, 90], [120, 220, 255], [255, 120, 200], [200, 190, 255], [255, 236, 190]];


// ---------- helpers ----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
function bay(x, y) { return BAYER[(y & 3) * 4 + (x & 3)]; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function smooth(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hsl(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  const f = n => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
}
function fogAt(z) { return smooth(50 * fogK, DRAW * SEGL * (0.42 + 0.4 * fogK), z) * 0.97; }

// ---------- the city (generated once) ----------
const curve = new Float32Array(NSEG), hill = new Float32Array(NSEG);
for (let n = 0; n < NSEG;) {
  const len = Math.min(NSEG - n, 40 + Math.floor(rng() * 90));
  const c = rng() < 0.4 ? 0 : (rng() < 0.5 ? -1 : 1) * (0.008 + rng() * 0.028);
  for (let i = 0; i < len; i++) curve[n + i] = c * Math.sin(Math.PI * i / len);
  n += len;
}
// ---- the layered city: street level, sky avenues (35 m) and the crown (80 m) ----
const LH = [0, 35, 100], LAYER_NAMES = ['STREET LEVEL', 'SKY AVENUES', 'CROWN LEVEL'];
const LAYER = new Int8Array(NSEG), ELEV = new Float32Array(NSEG), LAYERED = new Uint8Array(NSEG), BASE = new Float32Array(NSEG);
const TRANS = [], TRANS_AT = new Int16Array(NSEG).fill(-1);
{
  const fixed = new Int8Array(NSEG).fill(-1), TAIL = 300;
  const cityEnd = CITIES.map((c, ci) => ZONES.reduce((a, z) => z[3] === ci && !z[4] ? Math.max(a, z[1]) : a, 0));
  for (const z of ZONES) {
    const L = z[1] - z[0], lv = CITIES[z[3]].endLv;
    for (let n = z[0]; n < z[1]; n++) {
      if (z[4]) fixed[n] = lv;                         // the connector holds its level
      else {
        LAYERED[n] = 1;
        if (z[2] === D.RAMP) fixed[n] = (n - z[0]) < L * 0.62 ? 0 : 2;   // the spiral climbs from the street to the crown
        else if (n >= cityEnd[z[3]] - TAIL) fixed[n] = lv;   // the city's last stretch is already on the connector's level
      }
    }
  }
  const lr = rng;
  const nextFixed = new Int32Array(NSEG);
  for (let n = NSEG - 1, d = 1e9; n >= 0; n--) { d = fixed[n] >= 0 ? 0 : d + 1; nextFixed[n] = d; }
  let cur = CITIES[CITIES.length - 1].endLv, left = 300 + lr() * 300;   // the loop wraps on the last connector's level
  const seen = CITIES.map(() => new Set());           // levels each city has used so far
  const cityLen = CITIES.map((c, ci) => ZONES.reduce((a, z) => a + (z[3] === ci && !z[4] ? z[1] - z[0] : 0), 0));
  // long stays on each level, cut short only when the levels a city hasn't shown yet would no longer fit
  const run = (ci, n) => {
    const r = clamp(cityLen[ci] / 3.3 * (0.8 + lr() * 0.4), 500, 1200), todo = 3 - seen[ci].size;
    return todo > 0 ? Math.min(r, Math.max(200, (cityEnd[ci] - n - 450) / (todo + 0.3))) : r;   // 450: room before a raised link
  };
  let lastCi = -1;
  for (let n = 0; n < NSEG; n++) {
    const ci = zoneAt(n)[3];
    if (ci !== lastCi && !zoneAt(n)[4]) { lastCi = ci; seen[ci].add(cur); left = Math.min(left, run(ci, n)); }   // a new city begins
    if (fixed[n] >= 0) { cur = fixed[n]; seen[ci].add(cur); left = run(ci, n); LAYER[n] = cur; continue; }
    if (left <= 0) {
      if (nextFixed[n] < 300) left = nextFixed[n] + 1;   // the city's last stretch or the spiral is coming and sets the level anyway
      else {
        let o = [0, 1, 2].filter(v => v !== cur);
        const fresh = o.filter(v => !seen[ci].has(v));
        if (fresh.length) o = fresh;                    // make sure every city shows all three levels
        cur = o[(lr() * o.length) | 0]; seen[ci].add(cur); left = run(ci, n);
      }
    }
    left--; LAYER[n] = cur; seen[ci].add(cur);
  }
  CITIES.forEach((c, ci) => {                          // a level still missing? carve it out of the city's longest stretch
    const has = new Set();
    for (const z of ZONES) if (z[3] === ci && !z[4]) for (let n = z[0]; n < z[1]; n++) has.add(LAYER[n]);
    for (const L of [0, 1, 2]) {
      if (has.has(L)) continue;
      let best = null, st = -1;
      for (let n = 0; n <= NSEG; n++) {
        const ok = n < NSEG && zoneAt(n)[3] === ci && !zoneAt(n)[4] && fixed[n] === -1;
        if (st >= 0 && (!ok || LAYER[n] !== LAYER[st])) { if (!best || n - st > best[1] - best[0]) best = [st, n]; st = -1; }
        if (ok && st < 0) st = n;
      }
      if (best && best[1] - best[0] > 500) {
        const cut = Math.round((best[1] - best[0]) * 0.3);
        for (let n = best[0] + cut; n < best[1] - cut; n++) LAYER[n] = L;
      }
    }
  });
  { let r = NSEG - 1; while (r > 0 && LAYER[r - 1] === LAYER[NSEG - 1]) r--;   // the loop must end on the level it starts on
    if (LAYER[NSEG - 1] !== LAYER[0] && fixed[NSEG - 1] < 0) for (let n = r; n < NSEG; n++) LAYER[n] = LAYER[0]; }
  for (let n = 0; n < NSEG; n++) ELEV[n] = LH[LAYER[n]];
  // every level change is its own ramp that splits off the road you're on, then merges into the new level
  let prevC = 0;
  for (let n = 1; n < NSEG; n++) if (LAYER[n] !== LAYER[n - 1]) {
    const a = LAYER[n - 1], b = LAYER[n], want = clamp(Math.abs(LH[b] - LH[a]) * 4, 130, 420);   // ~16 m of road per metre of height: no steep dives
    const len = Math.max(40, Math.min(want, n - prevC - 130));
    for (let i = 0; i < len; i++) ELEV[n - len + i] = LH[a] + (LH[b] - LH[a]) * smooth(0, 1, (i + 1) / len);
    TRANS.push({ s: n - len, e: n, from: a, to: b, side: lr() < 0.5 ? -1 : 1, curv: lr() < 0.5 ? 0 : (lr() < 0.5 ? -1 : 1) * (0.008 + lr() * 0.012) });
    prevC = n;
  }
  TRANS.forEach((tr, i) => { for (let n = tr.s - 70; n < tr.e + 70; n++) TRANS_AT[(n + NSEG) % NSEG] = i; });
}
for (let n = 0; n < NSEG; n++) { BASE[n] = 4 * Math.sin(n * 2 * Math.PI * 28 / NSEG) + 1.5 * Math.sin(n * 2 * Math.PI * 90 / NSEG); hill[n] = BASE[n] + ELEV[n]; }
for (const z of ZONES) {
  const L = z[1] - z[0];
  for (let n = z[0]; n < z[1]; n++) {
    const t = (n - z[0]) / L, edge = smooth(0, 0.15, t) * smooth(0, 0.15, 1 - t);
    if (z[2] === D.BRIDGE) { hill[n] += 14 * Math.sin(Math.PI * t); curve[n] *= 0.3; }
    else if (z[2] === D.HIGHWAY) curve[n] *= 0.6;
    else if (z[2] === D.TUBE) { hill[n] -= 10 * edge; curve[n] *= 0.5; }
    else if (z[2] === D.CANYON) curve[n] *= 1.5;
    else if (z[2] === D.VOLCANO) curve[n] *= 1.7;
    else if (z[2] === D.CLOUDS) curve[n] *= 0.4;
    else if (z[2] === D.VAC) curve[n] *= 0.3;
    else if (z[2] === D.FERRY || z[2] === D.SALT) curve[n] = 0;
    else if (z[2] === D.PONTOON) curve[n] *= 0.5;
    else if (z[2] === D.RAMP) curve[n] = 0.05 * smooth(0, 0.08, t) * smooth(0, 0.08, 1 - t);   // a tight spiral around a tower
  }
}
for (const tr of TRANS) {                              // ramps are straight or sweep in a curve, at random
  if (zoneAt(tr.s)[2] === D.RAMP || zoneAt(tr.s)[4]) continue;
  for (let n = tr.s; n < tr.e; n++) curve[n] = tr.curv * Math.sin(Math.PI * (n - tr.s) / (tr.e - tr.s));
}

// intersections with traffic lights and a zebra crossing; buildings leave a gap for the cross street
const LIGHT_D = new Set([0, 1, 2, 6, 7, 9, 10, 12, 14, 17, 18, 19, 20, 21, 22, 23]);
const IX = [];
const XROAD = new Uint8Array(NSEG);
for (const z of ZONES) {
  if (z[4] || !LIGHT_D.has(z[2])) continue;
  for (let n = z[0] + 40; n < z[1] - 30; n += ELEV[n] === 0 ? 80 + Math.floor(rng() * 60) : 20) {
    let street = true;                                // traffic lights only down at street level
    for (let m = n - 30; m < n + 12; m++) if (ELEV[(m + NSEG) % NSEG] > 0 || TRANS_AT[(m + NSEG) % NSEG] >= 0) { street = false; break; }
    if (!street) continue;
    IX.push(n);
    for (let i = 0; i < 3; i++) XROAD[n + i] = 1;
  }
}
const IXZ = IX.map(n => n * SEGL);
const LIGHT_PERIOD = 30;
const LOFF = IX.map(n => hash(n, 3, 3) * LIGHT_PERIOD);
const IXR = IX.map(n => district(n) === D.RUIN);
function lightPhase(i) { return ((T + LOFF[i]) % LIGHT_PERIOD + LIGHT_PERIOD) % LIGHT_PERIOD; }
function setPhase(i, p) { LOFF[i] = p - T; }
let decidedIx = -1;
function lightState(i) {                             // 0 green, 1 yellow, 2 red, 3 dark (the ruin's lights just blink yellow)
  if (IXR[i]) return (T * 1.5) % 1 < 0.5 ? 1 : 3;
  const p = lightPhase(i); return p < 16 ? 0 : p < 19 ? 1 : 2;
}
function nextIx(z) {                                  // index of the first intersection whose stop line is ahead of world z
  for (let i = 0; i < IXZ.length; i++) if (IXZ[i] - 5 > z) return i;
  return 0;
}

const WARM = [[255, 60, 40], [255, 150, 40], [255, 214, 64], [255, 90, 140]];
const COOL = [[180, 210, 255], [140, 200, 255], [210, 230, 255], [120, 180, 240]];

// the new districts: height range, setback from the sidewalk (room for props), facade colour, lit windows
const STYLE_NEW = {
  [D.FORGE]: { h0: 20, hr: 40, set: 9, base: () => hsl(14 + rng() * 12, 0.25, 0.07 + rng() * 0.04), winP: 0.4 },
  [D.TERRACE]: { h0: 18, hr: 30, set: 4, base: () => hsl(30 + rng() * 20, 0.15, 0.16 + rng() * 0.06), winP: 0.45 },
  [D.REEF]: { h0: 20, hr: 40, set: 0, base: () => hsl(rng() < 0.5 ? 340 + rng() * 30 : 170 + rng() * 30, 0.4, 0.16 + rng() * 0.08), winP: 0.4 },
  [D.FAIR]: { h0: 16, hr: 30, set: 32, base: () => hsl(rng() * 360, 0.35, 0.16), winP: 0.5 },
  [D.RUIN]: { h0: 20, hr: 60, set: 1, base: () => hsl(80 + rng() * 60, 0.08, 0.12 + rng() * 0.06), winP: 0.3, noCrown: 1 },
  [D.CITADEL]: { h0: 30, hr: 60, set: 2, base: () => hsl(225 + rng() * 25, 0.12, 0.1 + rng() * 0.05), winP: 0.5, noCrown: 1 },
  [D.BAZAAR]: { h0: 14, hr: 26, set: 1, base: () => hsl(28 + rng() * 14, 0.35, 0.24 + rng() * 0.08), winP: 0.55 },
};
const blocks = [];
const SIDE = [new Int32Array(NSEG).fill(-1), new Int32Array(NSEG).fill(-1)];
const NOBLD = new Set([D.TUNNEL, D.BRIDGE, D.TUBE, D.RAMP, D.VAC, D.FERRY, D.VOLCANO, D.CLOUDS, D.PONTOON, D.SALT]);
for (let side = 0; side < 2; side++) {
  for (let n = 0; n < NSEG;) {
    const zz = zoneAt(n), d = zz[2], city = CITIES[zz[3]], cn = city.neon, dark = city.dark ? 1 : 0;
    if (NOBLD.has(d) || XROAD[n]) { n++; continue; }
    if (d === D.HIGHWAY && city.elevator && side === 0 && n - zz[0] > 40 && n - zz[0] < 150) { n++; continue; }
    const gapP = d === 2 ? 0.08 : d === 4 ? 0.25 : d === 8 ? 0.45 : d === 15 ? 0.02 : d === 11 ? 0.22 : 0.17;
    if (rng() < gapP) { n += 1 + Math.floor(rng() * (d === 8 ? 6 : 2)); continue; }
    let len = (d === 2 || d === 4 || d === 10 ? 8 : d === 15 ? 12 : 4) + Math.floor(rng() * 12);
    len = Math.min(zz[1] - n, len);
    for (let i = 0; i < len; i++) if (XROAD[n + i]) { len = i; break; }
    if (len <= 0) { n++; continue; }
    const r1 = rng(), r2 = rng();
    const h = d === 1 ? 8 + Math.pow(r1, 1.5) * 22 : d === 2 ? 50 + r1 * 90 : d === 4 ? 9 + r1 * 9
      : d === 6 ? 14 + r1 * 26 : d === 7 ? 18 + r1 * 30 : d === 8 ? 60 + r1 * 110 : d === 9 ? 12 + r1 * 20
      : d === 10 ? 25 + r1 * 30 : d === 11 ? 25 + r1 * 50 : d === 12 ? 7 + r1 * 7 : d === 14 ? 11 + r1 * 14
      : d === 15 ? 35 + r1 * 60 : 12 + Math.pow(r1, 1.7) * 75;
    const pal = d === 1 || d === 12 ? WARM : cn;
    const hue = city.hue[0] + r2 * (city.hue[1] - city.hue[0]);
    // the skyline tops out between level 2 and level 3, so the crown rides over rooftops; a few landmark spires
    // (more in the supertall districts) rise past it, and some blocks stay low podiums
    const el = ELEV[n], landmark = rng() < (d === 2 || d === 8 ? 0.4 : 0.12);
    const tower = landmark ? LH[1] + 40 + Math.pow(rng(), 1.3) * (LH[2] - LH[1] - 48) : rng() < 0.85 ? LH[1] + 10 + rng() * 30 : 0;
    const fitH = hh => Math.min(Math.max(hh, tower), LH[2] - 8);   // nothing reaches the crown: level 3 rides above the whole city
    const base = d === 1 ? hsl(10 + rng() * 30, 0.28, 0.1 + rng() * 0.07)
      : d === 2 || d === 8 ? hsl(hue, 0.35, 0.12 + rng() * 0.06)
      : d === 4 ? hsl(rng() < 0.5 ? 15 + rng() * 20 : 170 + rng() * 30, 0.3, 0.13 + rng() * 0.06)
      : d === 6 ? hsl(140 + rng() * 60, 0.25, 0.1 + rng() * 0.06)
      : d === 9 ? hsl(10 + rng() * 40, 0.25, 0.12 + rng() * 0.05)
      : d === 10 ? [10, 12, 16]
      : d === 11 ? [150, 80, 30]
      : d === 12 ? hsl(15 + rng() * 15, 0.45, 0.14 + rng() * 0.05)
      : d === 14 ? hsl(170 + rng() * 40, 0.3, 0.13 + rng() * 0.06)
      : d === 15 ? hsl(8 + rng() * 18, 0.5, 0.22 + rng() * 0.08)
      : hsl(hue, 0.22, 0.09 + rng() * 0.08);
    const styleOf = { 8: 2 };
    const B = {
      id: blocks.length, start: n, len, h: fitH(h), landmark, style: styleOf[d] !== undefined ? styleOf[d] : d, seed: (rng() * 1e6) | 0, base, dark,
      set: d === 1 || d === 9 || d === 12 ? rng() * 0.6 : d === 2 ? 1 + rng() * 3 : d === 4 ? 3 + rng() * 4 : d === 8 ? 45 + rng() * 40
        : d === 14 ? 3 + rng() * 4 : d === 15 ? rng() * 3 : rng() * 2.5,
      winP: (d === 2 || d === 8 ? 0.45 + rng() * 0.3 : d === 1 || d === 6 || d === 9 ? 0.35 + rng() * 0.3 : d === 4 ? 0.08
        : d === 15 ? 0.06 : 0.15 + rng() * 0.4) * (dark ? 0.12 : 1),
      crown: (d === 2 || d === 8 || d === 7 || rng() < (d === 1 || d === 4 ? 0.15 : 0.45)) && !(dark && rng() < 0.8) && d !== 12 && d !== 15 && d !== 11
        ? cn[(rng() * 6) | 0] : null,
      shop: [pal[(rng() * pal.length) | 0], WIN[(rng() * 6) | 0], pal[(rng() * pal.length) | 0]],
      bbs: [], signs: [],
    };
    if (B.style === 2 && !B.crown) B.crown = cn[0];
    B.lobby = cn[(rng() * 6) | 0];
    const sn = STYLE_NEW[d];
    if (sn) {
      B.h = fitH(sn.h0 + r1 * sn.hr); B.base = sn.base(); B.set = sn.set + rng() * 3; B.winP = sn.winP * (dark ? 0.12 : 1);
      if (sn.noCrown) B.crown = null;
    }
    if (el > LH[1] + 5) B.set += 14 + rng() * 16;     // the crown keeps well clear, so you look down over the roofs
    else if (el > 1) B.set += 5 + rng() * 10;         // a gap beside the elevated road so you can see down
    B.roof = (rng() * 4) | 0;
    B.roofKind = (rng() * 6) | 0;                     // 0-1 mixed, 2 helipad, 3 rooftop bar, 4 neon sign facing the sky, 5 solar farm
    const wc = d === 2 || d === 8 ? [150, 190, 235] : d === 10 ? [40, 120, 80] : [220, 170, 120];
    B.avg = mix(B.base, wc, B.winP * 0.35);
    const L = len * SEGL;
    if (rng() < (d === 2 || d === 8 ? 0.5 : d === 1 || d === 4 ? 0.2 : d === 0 || d === 6 || d === 9 ? 0.55 : 0) * (dark ? 0.3 : 1) && h > 16 && L > 10) {
      const big = d === 2 || d === 8 ? 2 : 1;
      const w = Math.min(L - 2, (6 + rng() * 10) * big), hh = Math.min(h - 8, (4 + rng() * 6) * big), v0 = 6 + rng() * Math.max(0, h - hh - 9);
      const u0 = 1 + rng() * (L - w - 2);
      B.bbs.push({ u0, u1: u0 + w, v0, v1: v0 + hh, kind: (rng() * 3) | 0, c1: cn[(rng() * 6) | 0], c2: cn[(rng() * 6) | 0], seed: (rng() * 1e6) | 0 });
    }
    if (B.h > LH[1] + 26 && L > 14 && rng() < 0.55 * (dark ? 0.4 : 1)) {   // a video wall facing the sky avenue
      const w = Math.min(L - 2, 12 + rng() * 14), u0 = 1 + rng() * (L - w - 2), v0 = LH[1] + 4 + rng() * 4;
      B.bbs.push({ u0, u1: u0 + w, v0, v1: v0 + 10 + rng() * 8, kind: (rng() * 5) | 0, c1: cn[(rng() * 6) | 0], c2: cn[(rng() * 6) | 0], seed: (rng() * 1e6) | 0 });
    }
    const ns = [2, 4, 8, 10, 11, 15].includes(d) ? (d === 15 && rng() < 0.4 ? 1 : 0) : d === 1 || d === 9 ? 2 + ((rng() * 3) | 0)
      : d === 12 ? 1 : rng() < 0.65 ? 1 + ((rng() * 2) | 0) : 0;
    for (let i = 0; i < ns; i++) {
      const v0 = 4.2 + rng() * 3, v1 = Math.min(h - 0.5, v0 + 5 + rng() * 9);
      if (v1 - v0 > 3) B.signs.push({ u: 0.5 + rng() * (L - 1), v0, v1, c: pal[(rng() * pal.length) | 0], seed: (rng() * 1e6) | 0,
        dead: dark && rng() < 0.6 });
    }
    blocks.push(B);
    for (let i = 0; i < len; i++) SIDE[side][n + i] = B.id;
    n += len;
  }
}

// footbridges and crossing roads strung between the towers, above and below you
const SKYW = new Map();
for (const z of ZONES) {
  if (z[4] || z[2] === D.TUNNEL || z[2] === D.RAMP) continue;
  for (let n = z[0] + 20; n < z[1] - 10; n += ELEV[n] === 0 ? 14 + Math.floor(rng() * 16) : ELEV[n] === LH[1] ? 10 + Math.floor(rng() * 14) : 28 + Math.floor(rng() * 30)) {
    if (XROAD[n] || XROAD[n + 1] || XROAD[n + 2] || XROAD[n + 3] || XROAD[n - 1] || TRANS_AT[n] >= 0) continue;
    const e = Math.max(ELEV[n], ELEV[n + 2]), e0 = Math.min(ELEV[n], ELEV[n + 2]);
    const cands = [12, 20, 27, 50, 58, 66].filter(h => h > e + 7 || h + 1.4 < e0 - 3);
    if (!cands.length) continue;
    SKYW.set(n, { hb: cands[Math.floor(rng() * cands.length)], kind: rng() < 0.6 ? 0 : 1, seed: (rng() * 1e6) | 0 });
  }
}

// people with glowing umbrellas walking the sidewalks
const peds = [];
for (let i = 0; i < 980; i++) {
  const side = rng() < 0.5 ? -1 : 1;
  peds.push({ z: rng() * LEN, x: side * (RW + 0.8 + rng() * (SW - 1.4)), v: (rng() < 0.5 ? -1 : 1) * (0.9 + rng() * 0.8),
    umb: rng() < 0.7 ? NEON[(rng() * 6) | 0] : null, coat: hsl(rng() * 360, 0.2, 0.12 + rng() * 0.1), ph: rng() * 6 });
}
let train = { z: 500, v: -26 };
const ST_H = 40, ST_LAT = RW + SW - 1, ST_LEN = 80;
const skyT = { z: 900, v: -50 };
let stEL = 0;

// traffic
const cars = [];
for (let i = 0; i < 380; i++) {
  const dir = rng() < 0.68 ? 1 : -1;
  cars.push({
    z: rng() * LEN, dir, x: dir * (rng() < 0.5 ? 1.75 : 5.25),
    speed: dir > 0 ? 13 + rng() * 13 : 16 + rng() * 10,
    body: hsl(rng() * 360, 0.25 + rng() * 0.3, 0.14 + rng() * 0.12),
    tail: rng() < 0.6 ? [255, 36, 60] : [255, 40, 170],
    under: NEON[(rng() * 6) | 0], neon: rng() < 0.4, sky: rng() < 0.2,
  });
}
for (const c of cars) c.cur = c.speed;              // set up front: a car queueing behind one not yet updated read undefined and went NaN

// hover cars in two air lanes between the levels (never above the crown)
const FLY_H = [17, 57];
const flyers = [];
for (let i = 0; i < 280; i++) {
  const dir = rng() < 0.5 ? 1 : -1;
  flyers.push({ z: rng() * LEN, h: FLY_H[rng() < 0.6 ? 1 : 0] + (rng() - 0.5) * 3, x: dir * (1.5 + rng() * 4.5), dir, v: 22 + rng() * 26,
    body: hsl(rng() * 360, 0.3, 0.2 + rng() * 0.12), glow: NEON[(rng() * 6) | 0], bob: rng() * 6 });
}
function airOk(n) {                                   // no air traffic inside tunnels, the sea tube, ramps or the spiral
  const d = district(n);
  return d !== D.TUNNEL && d !== D.TUBE && d !== D.RAMP && TRANS_AT[n] < 0;
}

// ---------- buffers ----------

// ---------- exports ----------
export {
  SEGL, DRAW, D, ZONE_NAMES, LINK_NAMES, CITIES, ZONES, NSEG, LEN,
  LH, LAYER_NAMES, LAYER, ELEV, LAYERED, BASE, TRANS, TRANS_AT,
  curve, hill, blocks, SIDE, IX, IXZ, XROAD, NEON, WIN, WARM, COOL,
  SKYW, peds, cars, flyers, train, skyT, airOk, FLY_H, ST_H, ST_LAT, ST_LEN, LIGHT_PERIOD,
  RW, SW, NEAR, zoneAt, district, zoneEnd, lightState, lightPhase, nextIx,
  hash, vnoise, mulberry, clamp, smooth, mix, hsl, rng,
  CRUISE, CRUISE_KMH, maxV, IXR, setPhase, TUNNEL_STARTS, LOFF,
};
