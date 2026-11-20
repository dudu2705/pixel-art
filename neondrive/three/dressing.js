// dressing.js — every structure and prop the original places per segment:
// tunnels, the sea tube, bridges, skywalks, monorails, gantries, overpasses,
// and the district set-dressing. Placement rules are copied from the original's
// draw dispatch so the same things appear in the same places.

import * as THREE from './vendor/three.module.js';
import {
  SEGL, NSEG, RW, SW, LH, D, CITIES, NEON, WARM, blocks, SIDE, ELEV, LAYERED,
  SKYW, TRANS, TRANS_AT, XROAD, zoneAt, district, hash, mix,
} from './world.js';
import { frameAt } from './road.js';
import { Batch, unitBox, unitPlane, unitPlaneFlat, unitCyl, unitSphere, unitTorus, unitCone } from './props.js';

const LEAF = [[60, 255, 180], [200, 90, 255], [90, 200, 255], [255, 90, 200]];
const PINK = [[255, 170, 210], [255, 200, 228], [255, 120, 180], [240, 236, 255]];
const RUINLEAF = [[90, 160, 70], [60, 130, 60], [120, 180, 80], [70, 140, 90]];
const CORAL = [[255, 110, 160], [120, 255, 220], [255, 170, 90], [200, 120, 255]];
const BOX = [[150, 60, 40], [40, 110, 120], [190, 150, 40], [50, 70, 140], [160, 40, 60], [90, 100, 60]];
const CLOTH = [[200, 60, 60], [60, 120, 200], [230, 210, 120], [240, 240, 240], [90, 170, 90], [200, 100, 200]];
const TH_ = 6.5, TW_ = RW + 1.2;          // tunnel bore, as the original
const MLAT = RW + SW + 4;                 // monorail beam offset
const coH = n => 20 + 12 * Math.sin(n * 0.09) + 6 * Math.sin(n * 0.23 + 1);

export function buildDressing(n0, n1, mats) {
  const B = {
    metal: new Batch(unitBox), emit: new Batch(unitBox), cloth: new Batch(unitPlane),
    foliage: new Batch(unitSphere), pole: new Batch(unitCyl), cone: new Batch(unitCone),
    ring: new Batch(unitTorus), tunnel: new Batch(unitPlane), glass: new Batch(unitPlane),
    tunnelCeil: new Batch(unitPlaneFlat), glassCeil: new Batch(unitPlaneFlat),
    rail: new Batch(unitPlane), below: new Batch(unitPlaneFlat),
    water: new Batch(unitPlane), lamp: new Batch(unitSphere),
  };
  const f = {}, f2 = {};

  // a slab running along the road between segment n and n+1 — the workhorse for
  // decks, beams, cables and rails
  function strip(n, lat, up, w, h, col, batch, meta = [0, 0]) {
    frameAt(n * SEGL, f); frameAt((n + 1) * SEGL, f2);
    const x0 = f.x + f.rx * lat, z0 = f.z + f.rz * lat, y0 = f.y + up;
    const x1 = f2.x + f2.rx * lat, z1 = f2.z + f2.rz * lat, y1 = f2.y + up;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, my = (y0 + y1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.05;
    // `up` is the TOP of the slab: the box hangs below it, which is how decks,
    // beams, cables and rails are all measured in the original
    batch.add([mx, my - h, mz], [w, h, len], f.th, col, meta);
  }

  for (let n = n0; n < n1; n++) {
    const zz = zoneAt(n), d = zz[2], cty = CITIES[zz[3]];
    const el = LAYERED[n] ? ELEV[n] : 0;
    const elev = el > 0.4;
    const tri = TRANS_AT[n], lift = tri >= 0 && n >= TRANS[tri].s && n < TRANS[tri].e;
    frameAt(n * SEGL, f);
    const gy = f.y;                                   // road surface here
    const put = (lat, up, size, col, batch, meta = [0, 0], rot = f.th) =>
      batch.add([f.x + f.rx * lat, gy + up, f.z + f.rz * lat], size, rot, col, meta);

    // ---------- tunnels, the sea tube, level-change bores ----------
    if (d === D.TUNNEL || d === D.VAC || lift || d === D.TUBE) {
      const bat = d === D.TUBE ? B.glass : B.tunnel;
      // 0 plain underpass, 1 climbing, 2 descending, 3 vactrain
      let mode = 0;
      if (d === D.VAC) mode = 3;
      else if (lift) mode = TRANS[tri].to > TRANS[tri].from ? 1 : 2;
      // two walls and a ceiling, as quads along the segment
      frameAt((n + 1) * SEGL, f2);
      const segLen = Math.hypot(f2.x - f.x, f2.z - f.z) + 0.05;
      for (const sg of [-1, 1]) {
        const lat = sg * TW_;
        bat.add([f.x + f.rx * lat + (f2.x - f.x) / 2, gy + TH_ / 2, f.z + f.rz * lat + (f2.z - f.z) / 2],
          [segLen, TH_, 1], f.th + Math.PI / 2, [255, 255, 255], [mode, 0, segLen, TH_]);
      }
      const ceil = d === D.TUBE ? B.glassCeil : B.tunnelCeil;
      ceil.add([f.x + (f2.x - f.x) / 2, gy + TH_, f.z + (f2.z - f.z) / 2],
        [TW_ * 2, 1, segLen], f.th, [255, 255, 255], [mode, 1, TW_ * 2, segLen]);
      continue;                                        // nothing else inside a bore
    }

    // ---------- the skybridge between cities ----------
    if (d === D.BRIDGE) {
      const l = n - zz[0];
      for (const sg of [-1, 1]) {
        strip(n, sg * (RW + SW), 1.2, 0.35, 1.2, [52, 50, 68], B.metal);     // parapet
        const cH = l => 2 + 26 * Math.pow(Math.sin(Math.PI * ((l % 200) / 200)), 0.8);
        strip(n, sg * (RW + SW + 0.6), cH(l), 0.22, 0.22, [150, 160, 190], B.metal);   // main cable
        if (l % 5 === 0) put(sg * (RW + SW + 0.6), 1.2, [0.16, cH(l) - 1.2, 0.16], [70, 74, 96], B.metal);
      }
      if (l % 100 === 50) for (const sg of [-1, 1]) {      // towers
        put(sg * (RW + SW + 1.5), -30, [3.2, 108, 3.2], [34, 32, 46], B.metal);
        put(sg * (RW + SW + 1.5), 78, [1.0, 1.0, 1.0], [255, 60, 60], B.emit, [n, 0.9]);
      }
      continue;
    }

    // ---------- elevated deck: underside and rails ----------
    const deckW = d === D.HIGHWAY ? RW + SW : RW + 1.5;
    if (elev) {
      for (const side of [-1, 1]) {
        strip(n, side * deckW, 0, 0.18, 1.4, [26, 24, 36], B.metal);
        if (n % 12 === 0) put(side * (deckW - 0.6), -el, [1.4, el, 1.4], [34, 32, 44], B.metal);
      }
      // see-through barrier, so the city below stays visible from up here
      if (d !== D.HIGHWAY) for (const sg of [-1, 1]) {
        frameAt((n + 1) * SEGL, f2);
        const segLen = Math.hypot(f2.x - f.x, f2.z - f.z) + 0.05;
        B.rail.add([f.x + f.rx * sg * deckW + (f2.x - f.x) / 2, gy + 0.55, f.z + f.rz * sg * deckW + (f2.z - f.z) / 2],
          [segLen, 1.1, 1], f.th + Math.PI / 2, [255, 255, 255], [0, 0, segLen, 1.1]);
      }
    }

    // ---------- skywalks over and under the road ----------
    const sw = SKYW.get(n);
    if (sw) {
      const span = RW + SW + 22, glow = NEON[sw.seed % 6];
      const y = sw.hb - el;
      strip(n, 0, y + 1.4, span * 2, 1.4, [38, 36, 50], B.metal);
      strip(n, 0, y + 0.18, span * 2, 0.18, glow, B.emit, [sw.seed, 0.35]);   // the neon underline
      if (n % 3 === 0) for (const lx of [-span * 0.6, 0, span * 0.6])
        put(lx, y - 0.1, [0.5, 0.3, 0.5], [255, 210, 150], B.emit, [n, 0.3]);
    }

    // ---------- monorail beside downtown and the spires ----------
    if ((d === D.DOWNTOWN || d === D.SPIRES) && !elev && !lift) {
      strip(n, MLAT, 12.6, 1.6, 1.1, [46, 44, 62], B.metal);
      if (n % 6 === 0) put(MLAT, 0, [0.7, 11.5, 0.7], [30, 26, 40], B.metal);
    }

    // ---------- overhead cables down the old downtown streets ----------
    if (d === D.DOWNTOWN && n % 7 === 3 && !elev && !lift) {
      const L = RW + SW, h0 = 9 + (n % 3);
      for (let w = 0; w < 2; w++) strip(n, 0, h0 - 1.0 + w * 0.4, L * 2, 0.08, [16, 14, 24], B.metal);
    }

    // ---------- lantern market ----------
    if (d === D.MARKET && n % 3 === 0 && !elev && !lift) {
      const L = RW + SW;
      strip(n, 0, 8, L * 2, 0.07, [14, 12, 20], B.metal);                     // the cable
      for (let i = 0, l = -L + 1.4; l < L; l += 2.4, i++) {
        const c = WARM[(n + i) % 4];
        put(l, 7.45, [0.68, 0.78, 0.68], c, B.lamp, [n + i, 0.5]);
      }
    }
    if (d === D.MARKET && n % 2 === 0 && !elev && !lift) {
      for (const sg of [-1, 1]) {
        if (hash(n, sg + 5, 31) >= 0.45) continue;
        const lat = sg * (RW + SW * 0.55);
        put(lat, 0, [2.3, 1.0, 2.0], [60, 36, 30], B.metal);                  // counter
        put(lat, 1.0, [2.1, 1.3, 1.8], [24, 16, 20], B.metal);                // body
        put(lat, 1.05, [2.2, 0.12, 1.9], [255, 190, 110], B.emit, [n, 0.4]);  // the lit shelf
        // striped awning
        B.cloth.add([f.x + f.rx * lat, gy + 2.6, f.z + f.rz * lat], [2.6, 1.9, 1], f.th,
          WARM[n % 4], [n, 1]);
      }
    }

    // ---------- stacktown laundry ----------
    if (d === D.STACK && n % 4 === 2 && !elev && !lift) {
      const L = RW + SW;
      for (const hb of [6.2, 8.8]) {
        strip(n, 0, hb - 0.45, L * 2, 0.06, [20, 16, 20], B.metal);
        for (let l = -L + 1; l < L - 1; l += 1.6) {
          if (hash(n, Math.round(l * 10 + hb), 81) >= 0.45) continue;
          const c = CLOTH[(hash(n, Math.round(l * 7 + hb), 82) * 6) | 0];
          B.cloth.add([f.x + f.rx * l, gy + hb - 0.95, f.z + f.rz * l], [0.8, 0.9, 1], f.th, c, [n, 0]);
        }
      }
    }

    // ---------- shrine street torii ----------
    if (d === D.SHRINE && n % 3 === 0 && !lift) {
      const red = [210, 46, 30], L = RW + 0.9;
      for (const sg of [-1, 1]) put(sg * L, 0, [0.7, 7.6, 0.7], red, B.metal);
      strip(n, 0, 6.3, (L + 0.6) * 2, 0.4, red, B.metal);
      strip(n, 0, 7.6, (L + 2.4) * 2, 0.45, red, B.metal);
      strip(n, 0, 8.05, (L + 2.4) * 2, 0.3, [24, 12, 12], B.metal);
      put(0, 5.2, [0.8, 1.0, 0.8], [255, 200, 120], B.lamp, [n, 0.5]);
    }

    // ---------- trees: gardens, shrine, ruin, reef ----------
    const pinkCity = cty.name === 'SAKURA GRID';
    let pal = null, every = 0;
    if ((d === D.GARDENS || d === D.SHRINE) && n % 2 === 1) { pal = d === D.SHRINE ? PINK : (pinkCity ? PINK : LEAF); every = 1; }
    else if (d === D.RUIN && n % 3 === 1) { pal = RUINLEAF; every = 0.6; }
    else if (d === D.REEF && n % 4 === 2) { pal = CORAL; every = 0.5; }
    if (pal && !elev && !lift) for (const sg of [-1, 1]) {
      if (every < 1 && hash(n, sg + (pal === RUINLEAF ? 11 : 13), pal === RUINLEAF ? 33 : 35) >= every) continue;
      const c = pal[(hash(n, sg + 3, 71) * 4) | 0], lat = sg * (RW + 0.9);
      put(lat, 0, [0.32, 3.2, 0.32], [36, 26, 40], B.metal);
      put(lat, 4.3, [3.0, 2.5, 3.0], c, B.foliage, [n * 7 + sg, 0]);
    }

    // ---------- docklands containers and cranes ----------
    if (d === D.DOCKS && n % 3 === 0 && !elev) for (const sg of [-1, 1]) {
      if (hash(n, sg + 9, 41) >= 0.6) continue;
      for (let j = 0; j < 3; j++) {
        const stack = 1 + Math.floor(hash(n, j, 51) * 4);
        for (let b = 0; b < stack; b++)
          put(sg * (RW + SW + 1.8 + j * 2.6), b * 2.6, [2.4, 2.5, 2.4],
            BOX[(hash(n, j * 7 + b, 52) * 6) | 0], B.metal);
      }
    }
    if ((d === D.DOCKS && n % 45 === 20) || (d === D.BUILD && n % 40 === 15)) {
      const sg = hash(n, 2, 43) < 0.5 ? -1 : 1, yc = [200, 120, 30];
      for (const l of [sg * (RW + SW + 9), sg * (RW + SW + 21)]) put(l, 0, [1.2, 40, 1.2], yc, B.metal);
      strip(n, 0, 41.5, 1, 1.5, yc, B.metal);
      B.metal.add([f.x + f.rx * sg * (RW + SW + 13), gy + 40.75, f.z + f.rz * sg * (RW + SW + 13)],
        [26, 1.5, 1.6], f.th + Math.PI / 2, yc, [0, 0]);
      put(sg * (RW + SW + 9), 41.5, [4, 2.5, 3], [40, 36, 50], B.metal);
      put(sg * (RW + SW + 2), 41, [0.9, 0.9, 0.9], [255, 40, 40], B.emit, [n, 0.9]);
    }

    // ---------- construction cones ----------
    if (d === D.BUILD && n % 2 === 0 && !elev) for (const sg of [-1, 1]) {
      put(sg * (RW - 0.4), 0, [0.8, 0.8, 0.8], [255, 110, 20], B.cone, [n, 0]);
    }

    // ---------- data canyon lasers ----------
    if (d === D.DATA && n % 11 === 0) {
      const sg = hash(n, 4, 4) < 0.5 ? -1 : 1, h = 30 + hash(n, 5, 5) * 20;
      put(sg * (RW + SW + 2), 0, [0.22, h, 0.22], [80, 255, 120], B.emit, [n, 0.5]);
    }

    // ---------- foundry smokestacks and furnace glow ----------
    if (d === D.FORGE && n % 30 === 12) {
      const sg = hash(n, 3, 13) < 0.5 ? -1 : 1, hgt = 70 + hash(n, 4, 14) * 50;
      put(sg * (RW + SW + 6), 0, [3.2, hgt, 3.2], [44, 30, 28], B.pole);
      put(sg * (RW + SW + 6), hgt, [3.7, 1.2, 3.7], [255, 110, 30], B.emit, [n, 0.8]);
      for (const b of [0.25, 0.6]) put(sg * (RW + SW + 6), hgt * b, [3.6, 0.5, 3.6], [90, 50, 30], B.pole);
    }
    if (d === D.FORGE && n % 3 === 0 && !elev)
      for (const L of [-5.25, -1.75, 1.75, 5.25]) put(L, 0.06, [1.1, 0.06, 2.4], [255, 110, 30], B.emit, [n, 0.25]);

    // ---------- monsoon terrace waterfalls ----------
    if (d === D.TERRACE && n % 45 < 3) {
      const sg = hash(Math.floor(n / 45), 1, 17) < 0.5 ? -1 : 1;
      const bi = SIDE[sg > 0 ? 1 : 0][n];
      if (bi >= 0) {
        const blk = blocks[bi], lat = sg * (RW + SW + blk.set - 0.4);
        B.water.add([f.x + f.rx * lat, gy + blk.h / 2 - el / 2, f.z + f.rz * lat],
          [SEGL * 1.1, blk.h, 1], f.th + (sg > 0 ? Math.PI / 2 : -Math.PI / 2), [150, 210, 230], [n, 0]);
      }
    }

    // ---------- carnival: the wheel and the coaster ----------
    if (d === D.FAIR) {
      const lat = -(RW + SW + 6), h = coH(n);
      strip(n, lat, h, 0.5, 0.35, [230, 60, 80], B.metal);                   // coaster rail
      if (n % 4 === 0) put(lat, 0, [0.5, h, 0.5], [70, 66, 90], B.metal);    // its legs
      if (n % 80 === 40) {                                                   // ferris wheel
        const cx = RW + SW + 17, cy = 17, R = 14;
        put(cx, 0, [1.0, cy, 1.0], [60, 60, 80], B.metal);
        B.ring.add([f.x + f.rx * cx, gy + cy, f.z + f.rz * cx], [R * 2, R * 2, R * 2],
          f.th + Math.PI / 2, [255, 200, 120], [n, 0.7]);
        for (let i = 0; i < 12; i++) {
          const a = i / 12 * Math.PI * 2;
          put(cx + Math.cos(a) * R, cy + Math.sin(a) * R, [1.8, 1.4, 1.4], NEON[i % 6], B.emit, [i, 0.3]);
        }
      }
    }

    // ---------- highway: barriers and the overpass ----------
    if (d === D.HIGHWAY) {
      for (const sg of [-1, 1]) strip(n, sg * (RW + SW), 1.1, 0.3, 1.1, [56, 54, 70], B.metal);
      const l = n - zz[0];
      if (l % 70 === 35 && ELEV[n] < LH[2] - 1) {
        strip(n, 0, 12.6, 240, 2.0, [30, 28, 40], B.metal);
        for (const sg of [-1, 1]) put(sg * (RW + SW + 2), -20, [1.8, 32.6, 1.8], [36, 34, 46], B.metal);
      }
    }

    // ---------- the lit gantry announcing each city ----------
    const prevZ = zoneAt(n - 3);
    const isGantry = (zz[4] && zz[2] !== D.TUBE && n === zz[0] + 4) ||
                     (!zz[4] && n === zz[0] + 2 && prevZ[4] && zz[2] !== D.TUNNEL);
    if (isGantry) {
      const c = zz[4] ? CITIES[(zz[3] + 1) % CITIES.length].neon[0] : CITIES[zz[3]].neon[0];
      const L = RW + 1;
      for (const sg of [-1, 1]) put(sg * L, 0, [0.4, 8, 0.4], [40, 40, 54], B.metal);
      strip(n, 0, 8.3, L * 2, 0.4, [40, 40, 54], B.metal);
      B.cloth.add([f.x, gy + 6.9, f.z], [12, 2, 1], f.th, c, [n, 0]);
    }

    // ---------- air-lane light gates ----------
    if (n % 60 === 30 && d !== D.RAMP) {
      const c = CITIES[zz[3]].neon[((n / 60) | 0) % 6];
      for (const h of [17, 57]) for (const sg of [-1, 1])
        B.ring.add([f.x + f.rx * sg * 3.8, gy + h - el, f.z + f.rz * sg * 3.8],
          [6.6, 6.6, 6.6], f.th + Math.PI / 2, c, [n, 0.5]);
    }
  }

  const out = [];
  const pairs = [
    [B.metal, mats.metal], [B.emit, mats.emit], [B.cloth, mats.cloth], [B.foliage, mats.foliage],
    [B.pole, mats.metal], [B.cone, mats.emit], [B.ring, mats.emit], [B.lamp, mats.emit],
    [B.tunnel, mats.tunnel], [B.glass, mats.glass], [B.water, mats.water],
    [B.tunnelCeil, mats.tunnel], [B.glassCeil, mats.glass], [B.rail, mats.rail],
  ];
  for (const [b, m] of pairs) { const mesh = b.build(m); if (mesh) out.push(mesh); }
  return out;
}
