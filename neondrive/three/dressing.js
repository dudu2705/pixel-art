// dressing.js — every structure and prop the original places per segment:
// tunnels, the sea tube, bridges, skywalks, monorails, gantries, overpasses,
// and the district set-dressing. Placement rules are copied from the original's
// draw dispatch so the same things appear in the same places.

import * as THREE from './vendor/three.module.js';
import {
  SEGL, NSEG, RW, SW, LH, D, CITIES, NEON, WARM, blocks, SIDE, ELEV, LAYERED,
  SKYW, TRANS, TRANS_AT, TUNNEL_STARTS, ST_H, ST_LAT, XROAD, airOk, zoneAt, district, hash, mix, coasterHeight,
} from './world.js';
import { frameAt } from './road.js';
import { FONT } from './cockpit.js';
import { Batch, unitBox, unitPlane, unitPlaneFlat, unitCyl, unitSphere, unitTorus, unitCone } from './props.js';

const LEAF = [[60, 255, 180], [200, 90, 255], [90, 200, 255], [255, 90, 200]];
const PINK = [[255, 170, 210], [255, 200, 228], [255, 120, 180], [240, 236, 255]];
const RUINLEAF = [[90, 160, 70], [60, 130, 60], [120, 180, 80], [70, 140, 90]];
const CORAL = [[255, 110, 160], [120, 255, 220], [255, 170, 90], [200, 120, 255]];
const BOX = [[150, 60, 40], [40, 110, 120], [190, 150, 40], [50, 70, 140], [160, 40, 60], [90, 100, 60]];
const CLOTH = [[200, 60, 60], [60, 120, 200], [230, 210, 120], [240, 240, 240], [90, 170, 90], [200, 100, 200]];
const TH_ = 6.5, TW_ = RW + 1.2;          // tunnel bore, as the original
const MLAT = -(RW + 1.4);                 // monorail beam offset
const STEAM_DISTRICTS = new Set([D.DOWNTOWN, D.SPIRES, D.DOCKS, D.STACK, D.DATA, D.BUILD, D.FORGE]);
const KOI_EXCLUDED = new Set([D.TUNNEL, D.BRIDGE, D.TUBE, D.RAMP]);

export function buildDressing(n0, n1, mats) {
  const B = {
    metal: new Batch(unitBox), emit: new Batch(unitBox), cloth: new Batch(unitPlane),
    foliage: new Batch(unitPlane), pole: new Batch(unitCyl), cone: new Batch(unitCone),
    ring: new Batch(unitTorus), tunnel: new Batch(unitPlane), glass: new Batch(unitPlane),
    tunnelCeil: new Batch(unitPlaneFlat), glassCeil: new Batch(unitPlaneFlat),
    rail: new Batch(unitPlane), below: new Batch(unitPlaneFlat),
    water: new Batch(unitPlane), lamp: new Batch(unitSphere),
    effect: new Batch(unitPlane), towers: new Batch(unitBox), wheel: new Batch(unitPlane), track: new Batch(unitBox), skywalk: new Batch(unitBox),
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

    const steam = (lat, height, width, rise, seed, rate = 0.35, color = [170, 150, 190]) => {
      const phase = hash(seed, 3, 3);
      for (let i = 0; i < 5; i++) put(lat, height, [width, rise, 1], color, B.effect, [0, seed + i, phase + i / 5, rate]);
    };
    const text = (label, height, width, panelHeight, color) => {
      const cellWidth = width / (label.length * 4 + 2);
      const cellHeight = panelHeight / 7;
      for (let i = 0; i < label.length; i++) {
        const glyph = FONT[label[i]] || FONT[' '];
        for (let bit = 0; bit < glyph.length; bit++) {
          if (glyph[bit] !== '1') continue;
          const lat = (i * 4 + bit % 3 + 1.5) * cellWidth - width * 0.5;
          put(lat, height + (5 - Math.floor(bit / 3)) * cellHeight,
            [cellWidth, cellHeight, 0.50], color, B.emit);
        }
      }
    };
    const lanternBoat = () => {
      const side = hash(n, 1, 63) < 0.5 ? -1 : 1;
      const lat = side * (RW + SW + 1.5 + hash(n, 2, 64) * 3);
      put(lat, 0, [3.2, 0.5, 5.6], [50, 34, 26], B.metal);
      put(lat, 0.5, [0.1, 1.3, 0.1], [30, 24, 20], B.metal);
      put(lat, 1.9, [0.5, 0.6, 0.5], cty.neon[n % 6], B.lamp, [n, 0.45, 2, 48]);
    };

    const incoming = !zz[4] && n === zz[0] + 2 && n >= 3 && zoneAt(n - 3)[4] && d !== D.TUNNEL;
    if ((zz[4] && d !== D.TUBE && n === zz[0] + 4) || incoming) {
      const announced = zz[4] ? CITIES[(zz[3] + 1) % CITIES.length] : cty;
      for (const side of [-1, 1]) put(side * (RW + 1), 0, [0.4, 8, 0.4], [40, 40, 54], B.metal);
      put(0, 7.9, [(RW + 1) * 2, 0.4, 0.45], [40, 40, 54], B.metal);
      put(0, 5.9, [12, 2, 0.28], [10, 10, 18], B.metal);
      text(announced.name, 5.9, 12, 2, announced.neon[0]);
      put(0, 6.89, [0.01, 0.01, 0.01], announced.neon[0], B.emit, [n, 0.3, 5, 60]);
    }

    // ---------- tunnels, the sea tube, level-change bores ----------
    if (d === D.TUNNEL || d === D.VAC || lift || d === D.TUBE) {
      const bat = d === D.TUBE ? B.glass : B.tunnel;
      // 0 plain underpass, 1 climbing, 2 descending, 3 vactrain
      let mode = 0;
      if (d === D.VAC) mode = 3;
      else if (lift) mode = TRANS[tri].to > TRANS[tri].from ? 1 : 2;
      // two walls and a ceiling, as quads along the segment
      frameAt((n + 1) * SEGL, f2);
      const slope = f2.y - f.y, midY = (f.y + f2.y) * 0.5;
      const dx = f2.x - f.x, dz = f2.z - f.z;
      for (const side of [-1, 1]) {
        const lat = side * TW_;
        const x0 = f.x + f.rx * lat, z0 = f.z + f.rz * lat;
        const x1 = f2.x + f2.rx * lat, z1 = f2.z + f2.rz * lat;
        const width = Math.hypot(x1 - x0, z1 - z0) + 0.06;
        const yaw = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
        bat.add([(x0 + x1) / 2, midY + TH_ / 2, (z0 + z1) / 2],
          [width, TH_ + 0.06, 1], yaw, [255, 255, 255], [mode, 0, n * SEGL, slope]);
      }
      const ceil = d === D.TUBE ? B.glassCeil : B.tunnelCeil;
      ceil.add([(f.x + f2.x) / 2, midY + TH_, (f.z + f2.z) / 2],
        [TW_ * 2 + 0.08, 1, Math.hypot(dx, dz) + 0.14], Math.atan2(dx, dz),
        [255, 255, 255], [mode, 1, n * SEGL, slope]);
      if (d !== D.TUBE && n % (mode === 3 ? 7 : 2) === 0) {
        const c = mode === 3 ? [80, 210, 255] : mode === 1 ? [90, 255, 170] : mode === 2 ? [255, 170, 80] : [255, 170, 90];
        put(0, mode === 3 ? TH_ * 0.5 : TH_ - 0.12, [0.01, 0.01, 0.01], c, B.emit,
          [n, mode === 3 ? 0.35 : 0.28, mode === 3 ? 5 : 1.6, mode === 3 ? 60 : 28]);
      }
      const transition = TRANS[tri];
      if ((lift && n === transition.s) || (d === D.VAC && n === zz[0]) || TUNNEL_STARTS.includes(n)) {
        const label = lift ? 'TO LEVEL ' + (transition.to + 1) + (mode === 1 ? ' ^' : ' _')
          : d === D.VAC ? 'VACTRAIN' : '';
        const accent = mode === 1 ? [80, 255, 150] : mode === 2 ? [255, 170, 60] : mode === 3 ? [90, 210, 255] : [255, 46, 170];
        for (const side of [-1, 1]) {
          put(side * (TW_ + 0.25), 0, [0.5, TH_ + 0.5, 0.35], accent, B.emit);
          put(side * (TW_ + 0.5 + 18), 0, [36, TH_, 0.32], [46, 42, 54], B.metal);
        }
        put(0, TH_, [TW_ * 2, 0.5, 0.35], accent, B.emit);
        put(0, TH_ + 0.5, [100, 17, 0.32], [46, 42, 54], B.metal);
        put(0, 8, [26, 4.5, 0.4], [12, 12, 18], B.metal);
        if (label) text(label, 8, 26, 4.5, accent);
        else for (let col = 0; col < 30; col++) for (let row = 0; row < 5; row++) {
          if (col % 4 !== 3 && hash(col >> 2, (col & 3) + row * 3, 4242) < 0.55)
            put((col + 0.5) * 20 / 30 - 10, 8 + row * 0.7, [20 / 30, 0.7, 0.5], [0, 230, 255], B.emit);
        }
        put(0, 10.2, [0.01, 0.01, 0.01], label ? accent : [0, 230, 255], B.emit, [n, 0.32, 10, 60]);
      }
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
      if (l % 4 === 0) {
        const light = mix(cty.neon[1], [255, 255, 255], 0.3);
        const height = 2 + 26 * Math.pow(Math.sin(Math.PI * ((l % 200) / 200)), 0.8);
        for (const side of [-1, 1]) put(side * (RW + SW + 0.6), height,
          [0.15, 0.15, 0.15], light, B.emit, [n, 0.35, 0.9, 40]);
      }
      if (l % 100 === 50 && el < LH[2] - 1) {
        for (const height of [44, 72]) put(0, height, [(RW + SW + 3) * 2, 2.5, 1.1], [30, 28, 42], B.metal);
      }
      if (n % 23 === 0) {
        const side = hash(n, 1, 61) < 0.5 ? -1 : 1;
        const lat = side * (40 + hash(n, 2, 62) * 140);
        put(lat, -1.25, [6, 0.8, 9], [20, 18, 30], B.metal);
        put(lat, 0, [0.25, 0.25, 0.25], cty.neon[(n >> 1) % 6], B.lamp, [n, 0.4, 2, 50]);
      }
      continue;
    }

    if (d === D.CANALS && !elev && n % 7 === 0) lanternBoat();
    if (d === D.PONTOON) {
      if (n % 7 === 0) lanternBoat();
      if (n % 6 === 0) for (const side of [-1, 1])
        put(side * (RW + SW - 0.3), 0, [0.5, 0.7, 0.5], [30, 30, 34], B.pole);
    }
    if (d === D.SALT && n % 10 === 0) {
      put(RW + SW + 2, 0, [0.3, 9, 0.3], [50, 40, 36], B.pole);
      put(RW + SW + 2, 8.1, [2.8, 0.3, 0.3], [50, 40, 36], B.metal);
    }
    if (d === D.FERRY) {
      const l = n - zz[0];
      for (const side of [-1, 1]) {
        const edge = side * (RW + SW + 0.3), funnel = side * (RW + SW + 4);
        strip(n, edge, 1.6, 0.2, 1.6, [160, 30, 36], B.metal);
        strip(n, edge, 1.9, 0.2, 0.3, [40, 40, 50], B.metal);
        strip(n, edge, 2.2, 0.2, 0.3, [230, 230, 235], B.metal);
        if (l % 5 !== 0) put(edge - side * 0.12, 0.6, [0.15, 0.6, 1.0], [255, 220, 150], B.emit);
        if (l % 60 === 30) {
          put(funnel, 0, [4.4, 22, 4.4], [200, 40, 40], B.pole);
          put(funnel, 19, [4.5, 3, 4.5], [20, 20, 26], B.pole);
          put(funnel, 15.5, [4.5, 1.5, 4.5], [235, 235, 240], B.pole);
          steam(funnel, 22, 12, 10, n + side, 0.2, [90, 90, 100]);
        }
        if (l % 15 === 7) {
          put(side * (RW + SW + 0.6), 2.6, [1.6, 1, 5], [255, 130, 30], B.metal);
          put(edge, 2.2, [0.22, 0.22, 0.22], [255, 220, 160], B.lamp, [n, 0.35, 2, 36]);
        }
      }
    }
    if (d === D.VOLCANO) {
      for (const side of [-1, 1]) strip(n, side * (RW + SW), 1.1, 0.25, 1.1, [70, 70, 82], B.metal);
      if (n % 13 === 0) {
        const side = hash(n, 1, 91) < 0.5 ? -1 : 1, h = 8 + hash(n, 3, 93) * 30;
        const lat = side * (RW + SW + 8 + hash(n, 2, 92) * 40), w = 4 + hash(n, 4, 94) * 6;
        put(lat, 0, [w, h, w], [46, 26, 22], B.cone);
        put(lat, 0, [w, h * 0.12, w], [200, 70, 20], B.pole);
      }
      if (n % 4 === 2) put((n % 8 === 2 ? -1 : 1) * (RW + SW + 16), 0,
        [0.01, 0.01, 0.01], [255, 90, 20], B.emit, [n, 0.35, 8, 60]);
    }
    if (d === D.CLOUDS && n % 11 === 5) {
      const side = hash(n, 1, 95) < 0.5 ? -1 : 1;
      const lat = side * (RW + SW + 12 + hash(n, 2, 96) * 60);
      const width = 10 + hash(n, 3, 97) * 12, height = 6 + hash(n, 4, 98) * 26;
      put(lat, -2, [width, height, width], [24, 26, 44], B.towers, [n * SEGL, height, width, 1]);
      put(lat, height - 2.4, [width + 0.1, 0.4, width + 0.1], cty.neon[n % 6], B.emit);
      steam(lat, -2, width * 2, 1.5, n, 0.1, [180, 190, 220]);
    }
    if (d === D.RAMP) {
      put(RW + SW + 7, -el - 2, [8, 162 + el, SEGL + 0.25], [26, 30, 44],
        B.towers, [n * SEGL, 162 + el, SEGL, 0]);
    }
    if (STEAM_DISTRICTS.has(d) && !elev && hash(n, 7, 77) < 0.05)
      steam(hash(n, 8, 78) < 0.5 ? -3.5 : 3.5, 0, 1.4, 3.5, n);
    if (!KOI_EXCLUDED.has(d) && n % 300 === 150)
      put(0, 17, [16, 5, 1], [180, 120, 255], B.effect, [1, n]);
    if (!zz[4] && d !== D.RAMP) {
      strip(n, ST_LAT, ST_H - el, 1.3, 1.2, [40, 38, 54], B.metal);
      strip(n, ST_LAT, ST_H - el, 1.35, 0.15, [255, 46, 170], B.emit);
      if (n % 10 === 0) put(ST_LAT, -el, [1.8, ST_H - 1.2, 1.8], [34, 32, 44], B.metal);
    }

    if (d === D.HIGHWAY && cty.elevator && n === zz[0] + 130) {
      for (let tier = 0; tier < 7; tier++) {
        const width = 84 - tier * 1.5, up = -el - 6 + tier * 4;
        put(-62, up, [width, 4, 55], [30, 26, 40], B.pole);
        put(-62, up + 3.65, [width + 0.1, 0.35, 55.1], [255, 200, 120], B.pole);
      }
      put(-62, 22 - el, [73.5, 1.6, 54], [245, 240, 240], B.pole);
      put(-62, 24 - el, [0.01, 0.01, 0.01], [255, 220, 160], B.emit, [n, 0.3, 30, 60]);
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
      const midpoint = frameAt(n * SEGL + 2.75, f2);
      const y = midpoint.y - midpoint.elev + sw.hb;
      B.skywalk.add([midpoint.x, y, midpoint.z], [span * 2, 1.4, 5.5],
        midpoint.th, glow, [sw.seed, sw.kind]);
      B.emit.add([midpoint.x, y - 0.03, midpoint.z], [0.01, 0.01, 0.01],
        midpoint.th, [255, 200, 140], [n, 0.25, 6, 56]);
      B.emit.add([f.x, y + 0.05, f.z], [0.01, 0.01, 0.01],
        f.th, glow, [n, 0.2, 5, 60]);
    }

    // ---------- monorail beside downtown and the spires ----------
    if ((d === D.DOWNTOWN || d === D.SPIRES) && !elev && !lift) {
      strip(n, MLAT, 12.6, 1.6, 1.1, [46, 44, 62], B.metal);
      if (n % 6 === 0) put(MLAT, 0, [0.7, 11.5, 0.7], [30, 26, 40], B.metal);
    }

    // ---------- overhead cables down the old downtown streets ----------
    if (d === D.DOWNTOWN && n % 7 === 3 && !elev && !lift) {
      const L = RW + SW, h0 = 9 + n % 3, h1 = 10 + (n >> 1) % 3;
      const span = Math.ceil(L * 2);
      const height = t => h0 + (h1 - h0) * t - 1.1 * Math.sin(Math.PI * t);
      for (let i = 0; i < span; i++) {
        const a = i / span, b = (i + 1) / span;
        const lat = (a + b - 1) * L;
        for (const layer of [0, 0.4]) put(lat, (height(a) + height(b)) / 2 + layer,
          [L * 2 / span + 0.02, 0.045, 0.05], [10, 8, 16], B.metal);
      }
    }

    // ---------- lantern market ----------
    if (d === D.MARKET && n % 3 === 0 && !elev && !lift) {
      const L = RW + SW;
      put(0, 8, [L * 2, 0.07, 0.06], [14, 12, 20], B.metal);                     // the cable
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
        steam(lat, 2.9, 1, 2.45, n);
        // striped awning
        B.cloth.add([f.x + f.rx * lat, gy + 2.6, f.z + f.rz * lat], [2.86, 0.6, 1], f.th,
          WARM[n % 4], [n, 1]);
      }
    }

    // ---------- stacktown laundry ----------
    if (d === D.STACK && n % 4 === 2 && !elev && !lift) {
      const L = RW + SW;
      for (const hb of [6.2, 8.8]) {
        put(0, hb - 0.51, [L * 2, 0.06, 0.06], [20, 16, 20], B.metal);
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
      put(0, 5.9, [(L + 0.6) * 2, 0.4, 0.5], red, B.metal);
      put(0, 7.15, [(L + 2.4) * 2, 0.45, 0.7], red, B.metal);
      put(0, 7.75, [(L + 2.4) * 2, 0.3, 0.75], [24, 12, 12], B.metal);
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
      put(lat, 4.3, [3, 2.5, 1], c, B.foliage, [n, 0]);
      put(lat, 4.3, [0.01, 0.01, 0.01], c, B.emit, [n, 0.4, 2.6, 60]);
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
      put(sg * (RW + SW + 2), h - el, [120, 80, 1], [80, 255, 120], B.effect, [3, n]);
    }

    // ---------- foundry smokestacks and furnace glow ----------
    if (d === D.FORGE && n % 30 === 12) {
      const sg = hash(n, 3, 13) < 0.5 ? -1 : 1, hgt = 70 + hash(n, 4, 14) * 50;
      put(sg * (RW + SW + 6), -el, [3.2, hgt, 3.2], [44, 30, 28], B.pole);
      put(sg * (RW + SW + 6), hgt - el - 1.2, [3.7, 1.2, 3.7], [255, 110, 30], B.emit, [n, 0.5, 4, 56]);
      for (const b of [0.25, 0.6]) put(sg * (RW + SW + 6), hgt * b - el, [3.6, 0.5, 3.6], [90, 50, 30], B.pole);
      steam(sg * (RW + SW + 6), hgt - el + 1, 12, 14, n, 0.25, [70, 50, 46]);
    }
    if (d === D.FORGE && n % 3 === 0 && !elev)
      for (const L of [-5.25, -1.75, 1.75, 5.25]) put(L, 0.06, [1.1, 0.06, 2.4], [255, 110, 30], B.emit, [n, 0.25]);

    // ---------- monsoon terrace waterfalls ----------
    if (d === D.TERRACE && n % 45 < 3) {
      const sg = hash(Math.floor(n / 45), 1, 17) < 0.5 ? -1 : 1;
      const bi = SIDE[sg > 0 ? 1 : 0][n];
      if (bi >= 0) {
        const blk = blocks[bi], lat = sg * (RW + SW + blk.set - 0.4);
        B.water.add([f.x + f.rx * lat, gy + blk.h / 2 - el, f.z + f.rz * lat],
          [SEGL * 1.1, blk.h, 1], f.th + Math.PI / 2, [150, 210, 230], [n * SEGL, 0, blk.h]);
        if (n % 45 === 1) {
          steam(lat, 0.5 - el, 6, 3, n, 0.5, [200, 230, 240]);
          put(lat, 2 - el, [0.01, 0.01, 0.01], [160, 220, 255], B.emit, [n, 0.3, 5, 60]);
        }
      }
    }

    // ---------- carnival: the wheel and the coaster ----------
    if (d === D.FAIR) {
      const lat = -(RW + SW + 6), h = coasterHeight(n);
      frameAt((n + 1) * SEGL, f2);
      const nextY = f2.y - f2.elev + coasterHeight(n + 1), railY = gy - el + h;
      const x0 = f.x + f.rx * lat, z0 = f.z + f.rz * lat;
      const x1 = f2.x + f2.rx * lat, z1 = f2.z + f2.rz * lat;
      B.track.add([(x0 + x1) / 2, (railY + nextY) / 2, (z0 + z1) / 2],
        [0.5, 0.35, Math.hypot(x1 - x0, z1 - z0) + 0.08], Math.atan2(x1 - x0, z1 - z0),
        [230, 60, 80], [0, 1, 0, nextY - railY]);
      if (n % 4 === 0) put(lat, -el, [0.5, h, 0.5], [70, 66, 90], B.metal);
      if (n % 80 === 40) {
        const center = RW + SW + 17;
        for (const dir of [-1, 1]) put(center + dir * 5, -el, [0.6, 17, 0.6], [60, 60, 80], B.metal);
        put(center, 17 - el, [34, 34, 1], [255, 200, 120], B.wheel, [n, 0]);
        put(center, 17 - el, [0.06, 0.06, 0.06], [255, 200, 120], B.emit, [n, 0.25, 7, 60]);
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

    // ---------- aerial lane gates ----------
    if (n % 60 === 30 && airOk(n)) {
      const c = CITIES[zz[3]].neon[((n / 60) | 0) % 6];
      for (const h of [17, 57]) for (const sg of [-1, 1])
        B.ring.add([f.x + f.rx * sg * 3.8, gy + h - el, f.z + f.rz * sg * 3.8],
          [6.6, 6.6, 6.6], f.th, c, [n, 0.5]);
    }
  }

  const out = [];
  const pairs = [
    [B.metal, mats.metal], [B.emit, mats.emit], [B.cloth, mats.cloth], [B.foliage, mats.foliage],
    [B.pole, mats.metal], [B.cone, mats.emit], [B.ring, mats.emit], [B.lamp, mats.emit],
    [B.tunnel, mats.tunnel], [B.glass, mats.glass], [B.water, mats.water],
    [B.tunnelCeil, mats.tunnel], [B.glassCeil, mats.glass], [B.rail, mats.rail],
    [B.effect, mats.effect], [B.towers, mats.tower], [B.wheel, mats.wheel], [B.track, mats.track], [B.skywalk, mats.skywalk],
  ];
  for (const [b, m] of pairs) { const mesh = b.build(m); if (mesh) out.push(mesh); }
  return out;
}
