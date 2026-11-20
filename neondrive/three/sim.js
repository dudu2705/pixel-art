// sim.js — the game, ported from the original's update(). This is the part the
// first pass skipped: steering physics and lean, autopilot with lane changes and
// cornering speed, traffic that queues and brakes, traffic lights you must stop
// at, people crossing on red, collisions, the three-level system, the day-night
// cycle and the weather state machine.

import {
  SEGL, NSEG, LEN, RW, SW, LH, D, CITIES, ZONES, ZONE_NAMES, LINK_NAMES, LAYER_NAMES,
  curve, LAYER, LAYERED, ELEV, TRANS, TRANS_AT, IX, IXZ, IXR, NEON,
  district, zoneAt, lightState, lightPhase, setPhase, nextIx, maxV,
  CRUISE, CRUISE_KMH, cars, peds, flyers, train, skyT,
  hash, hsl, clamp, smooth, mix, LIGHT_PERIOD, setTime,
} from './world.js';

// The reference's traffic, pedestrian and flyer pools.
export const CARS = cars, PEDS = peds, FLYERS = flyers;
for (const c of CARS) c.cur = c.speed;     // a car queueing behind one not yet updated would read undefined

// ---------- state ----------
export const S = {
  z: 0, px: 3.5, speed: 30, steer: 0, roll: 0,
  auto: true, autoLane: 5.25, laneCool: 0, idle: 0, cruise: 2,
  shake: 0, crashFlash: 0, waitLight: false,
  wet: 1, fogK: 1, flash: 0, gloom: 0, rainOn: true,
  wx: 'rain', night: 0, TH: {}, FOG: [0, 0, 0], SKY: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
  zoneText: '', zoneT: 0, curZone: -1, shownLayer: -1,
  T: 0, lastHit: 0,
};

const DAY = 3600, DAY0 = Math.random() * DAY;
const LINK_TINT = {
  [D.VOLCANO]: { fog: [80, 26, 12], sky: [[20, 4, 4], [70, 20, 10], [170, 60, 20]] },
  [D.CLOUDS]: { fog: [54, 62, 96], sky: [[4, 6, 20], [20, 30, 64], [80, 96, 150]] },
};
const LINK_WX = { [D.VOLCANO]: 'ash', [D.CLOUDS]: 'clear', [D.SALT]: 'clear', [D.VAC]: 'none' };

const rel = z => ((z - S.z) % LEN + LEN) % LEN;
const segAt = z => ((Math.floor(z / SEGL) % NSEG) + NSEG) % NSEG;

// only about one car in five takes the crown; the rest are not up there at all
const onCrown = z => { const n = segAt(z); return LAYERED[n] && ELEV[n] > LH[1] + 5; };
const ghost = c => !c.sky && onCrown(c.z);

// ---------- a spatial index, so the car AI stays linear ----------
// The original compared every car with every other (380^2). At the density a 3D
// view needs that is 12 million pairs a frame, so cars are binned by position
// and each one only looks at the bins it could reach.
const BIN = 24, NBIN = Math.ceil(LEN / BIN);
const bins = Array.from({ length: NBIN }, () => []);
function reindex() {
  for (const b of bins) b.length = 0;
  for (const c of CARS) bins[Math.floor(((c.z % LEN) + LEN) % LEN / BIN) % NBIN].push(c);
}
function* nearCars(z, span) {
  const b0 = Math.floor(((z % LEN) + LEN) % LEN / BIN);
  const n = Math.ceil(span / BIN) + 1;
  for (let k = -1; k <= n; k++) yield* bins[((b0 + k) % NBIN + NBIN) % NBIN];
}

// ---------- people crossing on red ----------
let crossCache = new Map(), crossT = -1;
export function crossers(i) {
  if (crossT !== S.T) { crossCache.clear(); crossT = S.T; }
  if (crossCache.has(i)) return crossCache.get(i);
  const res = crossersRaw(i);
  crossCache.set(i, res);
  return res;
}
function crossersRaw(i) {
  let p = lightPhase(i); if (p < 9) p += LIGHT_PERIOD;
  const out = [], n = 3 + Math.floor(hash(IX[i], 9, 9) * 5), L = RW + SW * 0.6;
  for (let j = 0; j < n; j++) {
    const ts = 19.4 + hash(j, IX[i], 71) * 3, v = 2.1 + hash(j, IX[i], 72) * 0.5;
    const dir = hash(j, IX[i], 73) < 0.5 ? 1 : -1;
    if (p < ts) continue;
    const x = -dir * L + dir * v * (p - ts);
    if (Math.abs(x) > L) continue;
    out.push({ x, z: IXZ[i] - 2 + (hash(j, IX[i], 74) - 0.5) * 2.4, v: dir * v, ph: j * 1.7,
      umb: hash(j, IX[i], 75) < 0.6 ? NEON[(hash(j, IX[i], 76) * 6) | 0] : null,
      coat: hsl(hash(j, IX[i], 77) * 360, 0.25, 0.18) });
  }
  return out;
}
const pedsOn = i => crossers(i).some(c => Math.abs(c.x) < RW + 0.6);
export function mustStop(i, dist) {
  if (IXR[i]) return pedsOn(i);
  const st = lightState(i);
  return st === 2 || (st === 1 && dist > 20) || pedsOn(i);
}

// what is ahead in a given lane: distance to it and how fast it is going
function laneInfo(lx) {
  let d = 1e9, v = maxV(S.z), blocked = false;
  for (const c of nearCars(S.z, 420)) {
    if (Math.abs(c.x - lx) > 2.0 || ghost(c)) continue;
    const r = rel(c.z);
    if (r > LEN - 9 || r < 10) blocked = true;
    const e = c.dir < 0 ? r * 0.45 : r;
    if (r > 0.5 && r < 500 && e < d) { d = e; v = c.dir > 0 ? c.cur : 0; }
  }
  return { d, v, blocked };
}

// ---------- the theme of this place: city blend, link tint, hour of day ----------
export function blendTheme(seg) {
  const z = zoneAt(seg), a = CITIES[z[3]];
  let b = a, t = 0;
  if (z[4]) { b = CITIES[(z[3] + 1) % CITIES.length]; t = smooth(0.25, 0.85, (seg - z[0]) / (z[1] - z[0])); }
  const along = seg - z[0], length = z[1] - z[0];
  return finishTheme(a, b, t, z[4] || z[2] === D.TUBE ? z[2] : null,
    smooth(0, 18, along) * smooth(0, 18, length - along), z);
}

// the city map's blend: from one named city to another, t 0..1 (crossing a link between them)
export function blendCities(nameA, nameB, t, district = null, strength = 0) {
  const a = CITIES.find(c => c.name === nameA), b = CITIES.find(c => c.name === nameB) ?? a;
  return finishTheme(a, b, t, district, strength);
}

function finishTheme(a, b, t, district, strength, z = null) {
  let FOG = mix(a.fog, b.fog, t);
  let SKY = [0, 1, 2].map(i => mix(a.sky[i], b.sky[i], t));
  const TWC = [0, 1].map(i => mix(a.tw[i], b.tw[i], t));
  const TH = {};
  for (const k of ['aurora', 'mountains', 'elevator', 'fireworks', 'dark', 'deep', 'kites', 'shimmer'])
    TH[k] = (a[k] || 0) * (1 - t) + (b[k] || 0) * t;
  TH.water = 0;
  const tint = LINK_TINT[district];
  if (tint) {
    FOG = mix(FOG, tint.fog, strength);
    SKY = SKY.map((c, i) => mix(c, tint.sky[i], strength));
  }
  if (district === D.SALT) TH.shimmer = Math.max(TH.shimmer, strength);
  if (district === D.TUBE) {
    FOG = mix(FOG, [6, 34, 58], strength);
    SKY = SKY.map(c => mix(c, [4, 30, 52], strength));
    TH.water = strength;
  }
  const wx = TH.water > 0.5 ? 'none' : (strength > 0.5 && LINK_WX[district]) || (t > 0.5 ? b.weather : a.weather);

  // the hour: dusk, deep night, a pre-dawn glow, back to dusk
  const p = ((S.T + DAY0) / DAY) % 1, sea = 1 - TH.deep * 0.7;
  const night = smooth(0.08, 0.3, p) * (1 - smooth(0.62, 0.8, p));
  const dawn = smooth(0.66, 0.8, p) * (1 - smooth(0.86, 0.98, p));
  const dusk = 1 - smooth(0, 0.14, p) + smooth(0.94, 1, p), nk = night * 0.55 * sea;
  SKY = SKY.map(c => mix(c, [c[0] * 0.3, c[1] * 0.3, c[2] * 0.4], nk));
  SKY[2] = mix(SKY[2], [210, 96, 70], dusk * 0.3 * sea);
  SKY[1] = mix(SKY[1], [120, 50, 70], dusk * 0.15 * sea);
  SKY[2] = mix(SKY[2], [150, 140, 190], dawn * 0.45 * sea);
  SKY[1] = mix(SKY[1], [60, 60, 110], dawn * 0.3 * sea);
  FOG = mix(FOG, [FOG[0] * 0.5, FOG[1] * 0.5, FOG[2] * 0.6], nk);
  FOG = mix(FOG, [110, 100, 140], dawn * 0.2 * sea);
  TH.night = night * sea;
  return { a, b, t, z, FOG, SKY, TWC, TH, wx };
}

export function setCruise(i) { S.cruise = ((i % CRUISE.length) + CRUISE.length) % CRUISE.length; }
export function cruiseKmh() { return CRUISE_KMH[S.cruise]; }
export function setAuto(on) {
  S.auto = on; S.idle = 0;
  if (on) S.autoLane = S.px < 3.5 ? 1.75 : 5.25;
}

let decidedIx = -1;

export function update(dt, keys) {
  S.T += dt; setTime(S.T);
  reindex();

  const n = segAt(S.z);
  const kappa = curve[n] / (SEGL * SEGL);
  const latMax = 8.5 * Math.min(1, S.speed / 12 + 0.05);
  let steerT;

  if (!S.auto) { S.idle += dt; if (S.idle > 10) setAuto(true); }

  if (S.auto) {
    S.laneCool -= dt;
    const other = S.autoLane > 3 ? 1.75 : 5.25;
    const cur = laneInfo(S.autoLane), alt = laneInfo(other);
    const look = Math.max(80, S.speed * S.speed / 12 + 30);
    if (S.laneCool <= 0 && cur.d < look + 10 && alt.d > cur.d + 20 && !alt.blocked) { S.autoLane = other; S.laneCool = 2.5; }
    let target = Math.min(maxV(S.z), CRUISE[S.cruise] * (district(n) === D.VAC ? 1.6 : 1));
    let kmax = 0;                                   // ease off before a bend: keep sideways grip under about 0.7g
    for (let i = 0; i < 40; i++) kmax = Math.max(kmax, Math.abs(curve[(n + i) % NSEG]));
    if (kmax > 0) target = Math.min(target, Math.sqrt(7 / (kmax / (SEGL * SEGL))));
    const now = laneInfo(S.autoLane);
    if (now.d < look) target = Math.min(target, now.v + Math.sqrt(2 * 6 * Math.max(0, now.d - 16)));
    if (IX.length) {
      const i = nextIx(S.z), dist = ((IXZ[i] - 5 - S.z) % LEN + LEN) % LEN;
      if (dist < Math.max(120, look + 40) && mustStop(i, dist))
        target = Math.min(target, Math.sqrt(2 * 6 * Math.max(0, dist - 6)));
    }
    S.speed += clamp(target - S.speed, -22 * dt, 9 * dt);
    const want = (S.autoLane - S.px) * 1.8 + kappa * S.speed * S.speed * 0.35;
    steerT = clamp(want / latMax, -1, 1);
  } else {
    steerT = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (keys.gas) S.speed += 17 * dt * (1 - 0.6 * S.speed / maxV(S.z));
    else if (keys.brake) S.speed -= 26 * dt;
    else S.speed -= 2.5 * dt;
  }
  S.speed = Math.max(0, Math.min(S.speed, Math.max(maxV(S.z), S.speed - 25 * dt)));
  S.steer += (steerT - S.steer) * Math.min(1, dt * 6);
  S.px += S.steer * latMax * dt;
  S.px -= kappa * S.speed * S.speed * dt * 0.35;
  // a motorcycle leans into turns: the angle whose tangent is sideways acceleration over gravity
  const rollT = clamp(Math.atan((S.steer * latMax * Math.min(S.speed, 40) * 0.05 + kappa * S.speed * S.speed) / 9.8), -0.42, 0.42);
  S.roll += (rollT - S.roll) * Math.min(1, dt * 4);
  if (Math.abs(S.px) > RW - 1) {                      // scraping the kerb slows you and shakes the view
    S.px = Math.sign(S.px) * (RW - 1);
    S.speed *= 1 - dt * 1.5;
    S.shake = Math.max(S.shake, 0.15 * Math.min(1, S.speed / 20));
  }

  S.z = (S.z + S.speed * dt) % LEN;

  // ---------- the other cars ----------
  for (const c of CARS) {
    let tgt = c.speed * (district(segAt(c.z)) === D.VAC ? 3 : 1);
    if (IX.length) {
      if (c.dir > 0) {
        const i = nextIx(c.z), dist = ((IXZ[i] - 5 - c.z) % LEN + LEN) % LEN;
        if (dist < 60 && mustStop(i, dist)) tgt = Math.min(tgt, Math.sqrt(2 * 5 * Math.max(0, dist - 1)));
      } else {
        let j = IXZ.length - 1;
        for (let q = 0; q < IXZ.length; q++) if (IXZ[q] + 17 < c.z) j = q;
        const dist = ((c.z - (IXZ[j] + 17)) % LEN + LEN) % LEN;
        if (dist < 60 && mustStop(j, dist)) tgt = Math.min(tgt, Math.sqrt(2 * 5 * Math.max(0, dist - 1)));
      }
    }
    for (const o of nearCars(c.dir > 0 ? c.z : c.z - 40, 40)) {    // queue behind the car in front
      if (o === c || o.dir !== c.dir || Math.abs(o.x - c.x) > 1) continue;
      const gap = ((c.dir * (o.z - c.z)) % LEN + LEN) % LEN;
      if (gap > 0 && gap < 16) tgt = Math.min(tgt, Math.max(0, o.cur + (gap - 8) * 1.2));
    }
    if (c.dir > 0 && Math.abs(c.x - S.px) < 1.6 && !ghost(c)) {     // and behind you
      const gap = ((S.z - c.z) % LEN + LEN) % LEN;
      if (gap > 0 && gap < 16) tgt = Math.min(tgt, Math.max(0, S.speed + (gap - 8) * 1.2));
    }
    const prev = c.cur;
    c.cur = Math.max(0, c.cur + clamp(tgt - c.cur, -9 * dt, 4 * dt));
    c.brk = c.cur < prev - 0.01 || c.cur < 0.5;
    c.z = ((c.z + c.dir * c.cur * dt) % LEN + LEN) % LEN;

    // ---------- you hit it ----------
    const r = rel(c.z);
    if (r < 3.2 && Math.abs(c.x - S.px) < 1.3 && !ghost(c)) {
      if (c.dir > 0) {
        if (S.speed > c.cur) { S.speed = c.cur * 0.6; c.z = (S.z + 5) % LEN; S.shake = 0.7; S.crashFlash = 0.6; S.lastHit = S.T; }
      } else {
        S.speed *= 0.25; c.z = (S.z - 6 + LEN) % LEN; S.shake = 1; S.crashFlash = 1; S.lastHit = S.T;
      }
    }
  }

  // when an intersection comes into view, roll the dice: about one in four turns red for you
  if (IX.length) {
    const i = nextIx(S.z), dist = ((IXZ[i] - 5 - S.z) % LEN + LEN) % LEN;
    if (dist < 320 && decidedIx !== i) { decidedIx = i; setPhase(i, Math.random() < 0.25 ? 14.5 : 2); }
  }
  S.waitLight = false;
  if (IX.length) {
    const i = nextIx(S.z - 8), dist = ((IXZ[i] - 5 - S.z) % LEN + LEN) % LEN;
    S.waitLight = dist < 22 && S.speed < 4 && mustStop(i, dist);
    for (const c of crossers(i)) {                   // and you can run someone over
      if (Math.abs(((c.z - S.z - 1.5) % LEN + LEN) % LEN) < 1.2 && Math.abs(c.x - S.px) < 0.8 && S.speed > 3) {
        S.speed = 0; S.shake = 0.8; S.crashFlash = 0.5; S.lastHit = S.T;
      }
    }
  }
  S.shake *= Math.exp(-dt * 4);
  S.crashFlash *= Math.exp(-dt * 5);

  for (const p of PEDS) p.z = ((p.z + p.v * dt) % LEN + LEN) % LEN;
  for (const f of FLYERS) f.z = ((f.z + f.dir * f.v * dt) % LEN + LEN) % LEN;
  train.z = ((train.z + train.v * dt) % LEN + LEN) % LEN;
  if (rel(train.z) > LEN - 90) train.z = (S.z + 500 + Math.random() * 300) % LEN;

  skyT.z = (skyT.z + skyT.v * dt + LEN) % LEN;
  const trainGap = (skyT.z - S.z + LEN * 1.5) % LEN - LEN / 2;
  if (trainGap < -400 || trainGap > 1800) {
    skyT.v = (Math.random() < 0.5 ? 1 : -1) * (40 + Math.random() * 25);
    skyT.z = (S.z + (skyT.v > 0 ? -300 : 900 + Math.random() * 600) + LEN) % LEN;
  }

  // ---------- theme, weather and the level system ----------
  const th = blendTheme(Math.floor(S.z / SEGL));
  // under a roof nothing falls, but the road outside stays wet
  const trw = TRANS_AT[n];
  const dw = district(n);
  const covered = dw === D.TUNNEL || dw === D.VAC || dw === D.TUBE
    || (trw >= 0 && n >= TRANS[trw].s && n < TRANS[trw].e);
  updateClimate(dt, th, covered);

  // the announcement board: each new zone, and each level you arrive on
  const zn = ZONES.indexOf(th.z);
  if (zn !== S.curZone) {
    S.curZone = zn;
    S.zoneText = th.z[4]
      ? LINK_NAMES[th.z[2]] + ' → ' + CITIES[(th.z[3] + 1) % CITIES.length].name
      : CITIES[th.z[3]].name + ' · ' + ZONE_NAMES[th.z[2]];
    S.zoneT = 3.5;
  }
  const Lk = LAYER[n];
  if (LAYERED[n] && Math.abs(ELEV[n] - LH[Lk]) < 0.5 && Lk !== S.shownLayer) {
    if (S.shownLayer >= 0) {
      S.zoneText = (Lk > S.shownLayer ? '▲ ' : '▼ ') + 'LEVEL ' + (Lk + 1) + ' · ' + LAYER_NAMES[Lk];
      S.zoneT = 3.5;
    }
    S.shownLayer = Lk;
  }
  S.layer = Lk;
  const gT = LAYERED[n] && ELEV[n] < 3 && zoneAt(n)[2] !== D.TUNNEL ? 1 : 0;
  S.gloom += (gT - S.gloom) * Math.min(1, dt * 0.5);
  S.zoneT -= dt;
}

export function updateClimate(dt, th, covered) {
  S.FOG = th.FOG; S.SKY = th.SKY; S.TWC = th.TWC;
  S.neon = (th.t > 0.5 ? th.b : th.a).neon;
  S.TH = th.TH; S.wx = th.wx; S.night = th.TH.night;

  S.covered = covered;
  const Wsky = S.rainOn ? th.wx : 'off';
  S.fall = covered ? 'none' : Wsky;
  const wetT = { rain: 1, monsoon: 1, snow: 0.5, fog: 0.6, clear: 0.3, sand: 0.12, petals: 0.35,
                 ash: 0.15, bubbles: 0.5, fireflies: 0.45, none: 0.4, off: 0.3 }[Wsky] ?? 0.3;
  S.wet += (wetT - S.wet) * Math.min(1, dt * 0.6);
  const fogT = S.rainOn && (th.wx === 'fog' || th.wx === 'sand') ? 0.42
             : S.rainOn && th.wx === 'monsoon' ? 0.65 : 1;
  S.fogK += (fogT - S.fogK) * Math.min(1, dt * 0.5);

  // lightning in the stormy cities
  const storm = (th.t > 0.5 ? th.b : th.a).storm || 0;
  if (S.rainOn && !covered && (th.wx === 'rain' || th.wx === 'monsoon') && storm && Math.random() < dt / 9 * storm) S.flash = 1;
  S.flash *= Math.exp(-dt * 4);
}
