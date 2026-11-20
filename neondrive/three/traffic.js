// traffic.js — cars, pedestrians, hover cars and the monorail train.
// These use the generator's own pools (380 cars, 980 people, 280 flyers) so the
// streets are populated exactly as the original populated them.

import * as THREE from './vendor/three.module.js';
import { SEGL, NSEG, LEN, RW, SW, LH, D, district, train, skyT, ST_H, ST_LAT, ST_LEN, TRANS_AT, zoneAt, hash, coasterHeight, NEON, airOk, LAYERED, ELEV, IX, IXZ, nextIx } from './world.js';
import { CARS, PEDS, FLYERS, crossers, S } from './sim.js';
import { frameAt } from './road.js';
import { unitBox, unitSphere } from './props.js';
import { EMITTER_LAYER } from './glow.js';

const NEAR_SPAN = 620, BEHIND_SPAN = 180;

function pool(base, n, mat) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.attributes.position = base.attributes.position;
  g.attributes.normal = base.attributes.normal;
  g.attributes.uv = base.attributes.uv;
  const a = {
    iPos: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    iSize: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    iRot: new THREE.InstancedBufferAttribute(new Float32Array(n), 1),
    iCol: new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3),
    iMeta: new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4),
  };
  for (const k in a) { a[k].setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, a[k]); }
  g.instanceCount = 0;
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  if (mat.userData.lightKind) m.layers.enable(EMITTER_LAYER);
  return { mesh: m, a, g, i: 0, cap: n };
}

function push(p, pos, size, rot, col, meta) {
  if (p.i >= p.cap) return;
  const i = p.i++;
  p.a.iPos.array.set(pos, i * 3);
  p.a.iSize.array.set(size, i * 3);
  p.a.iRot.array[i] = rot;
  p.a.iCol.array.set([col[0] / 255, col[1] / 255, col[2] / 255], i * 3);
  p.a.iMeta.array.set([meta[0], meta[1] || 0, meta[2] || 0, meta[3] || 0], i * 4);
}

function flush(p) {
  p.g.instanceCount = p.i;
  for (const k in p.a) p.a[k].needsUpdate = true;
  p.i = 0;
}

// shortest signed distance from camZ to z around the loop
function rel(z, camZ) { return ((z - camZ) % LEN + LEN * 1.5) % LEN - LEN / 2; }

function makeCarBody() {
  const geometry = new THREE.BoxGeometry(1, 1, 1, 1, 14, 1).translate(0, 0.5, 0);
  const pos = geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getY(i);
    if (v <= 0.58) continue;
    const t = (v - 0.58) / 0.42;
    pos.setX(i, pos.getX(i) * (0.8 - 0.37 * t));
    pos.setZ(i, pos.getZ(i) * (1 - 0.55 * t));
  }
  return geometry;
}

function drawGroundCar(body, glow, c, x, y, z, yaw) {
  const len = 4, wid = 1.9, hgt = 1.35;
  const tail = c.tail.map(Math.round);
  const tailRGB = tail[0] * 65536 + tail[1] * 256 + tail[2];
  push(body, [x, y, z], [wid, hgt, len], yaw, c.body, [0, 0, tailRGB]);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const fx = Math.sin(yaw) * (len / 2 + 0.02), fz = Math.cos(yaw) * (len / 2 + 0.02);
  for (const side of [-1, 1]) {
    const lx = rx * side * wid * 0.36, lz = rz * side * wid * 0.36;
    push(glow, [x + fx + lx, y + hgt * 0.42, z + fz + lz],
      [0.01, 0.01, 0.01], yaw, [230, 240, 255], [0, 0.85, wid * 0.9, 60]);
    push(glow, [x - fx + lx, y + hgt * 0.42, z - fz + lz],
      [0.01, 0.01, 0.01], yaw, c.tail, [0, c.brk ? 0.95 : 0.5, wid * (c.brk ? 0.7 : 0.45), 40]);
  }
  if (c.neon) push(glow, [x, y + 0.06, z - fz], [0.01, 0.01, 0.01],
    yaw, c.under, [0, 0.4, wid * 0.75, 48]);
}

export class Traffic {
  constructor(scene, mats) {
    this.body = pool(unitBox, 420, mats.metal);
    this.car = pool(makeCarBody(), 420, mats.car);
    this.glow = pool(unitBox, 2600, mats.emit);
    this.ped = pool(unitBox, 900, mats.metal);
    this.umb = pool(unitBox, 460, mats.emit);
    this.flyer = pool(unitBox, 420, mats.metal);
    this.lamp = pool(unitSphere, 300, mats.emit);
    scene.add(this.car.mesh, this.body.mesh, this.glow.mesh, this.ped.mesh, this.umb.mesh, this.flyer.mesh, this.lamp.mesh);
    this.pools = [this.car, this.body, this.glow, this.ped, this.umb, this.flyer, this.lamp];
  }

  updateMap(vehicles) {
    for (const vehicle of vehicles) {
      const { x, y, z, th } = vehicle.pose;
      const style = vehicle.style;
      style.brk = vehicle.brake;
      drawGroundCar(this.car, this.glow, style, x, y, z, th);
    }
    for (const pool of this.pools) flush(pool);
  }

  update(camZ, dt, time) {
    const f = {};

    // ---------- ground traffic ----------
    for (const c of CARS) {
      const r = rel(c.z, camZ);
      if (r > NEAR_SPAN || r < -BEHIND_SPAN) continue;
      const n = ((Math.floor(c.z / SEGL) % NSEG) + NSEG) % NSEG;
      const d = district(n);
      if (d === D.FERRY || d === D.VAC) continue;
      if (!c.sky && LAYERED[n] && ELEV[n] > LH[1] + 5) continue;   // few cars take the crown
      frameAt(c.z, f);
      const x = f.x + f.rx * c.x, z = f.z + f.rz * c.x;
      const yaw = f.th + (c.dir < 0 ? Math.PI : 0);
      drawGroundCar(this.car, this.glow, c, x, f.y, z, yaw);
    }

    // ---------- people on the pavements ----------
    for (const p of PEDS) {
      const r = rel(p.z, camZ);
      if (r > 260 || r < -70) continue;
      const n = ((Math.floor(p.z / SEGL) % NSEG) + NSEG) % NSEG;
      const d = district(n);
      if (d === D.TUNNEL || d === D.VAC || d === D.SALT || d === D.VOLCANO || d === D.CLOUDS) continue;
      if (LAYERED[n] && ELEV[n] > 0.3) continue;
      frameAt(p.z, f);
      const bob = Math.abs(Math.sin(time * 6 * Math.abs(p.v) + p.ph)) * 0.09;
      const x = f.x + f.rx * p.x, z = f.z + f.rz * p.x;
      push(this.ped, [x, f.y + bob, z], [0.5, 1.5, 0.38], f.th, p.coat, [p.ph]);
      push(this.ped, [x, f.y + bob + 1.5, z], [0.3, 0.28, 0.3], f.th, [30, 24, 34], [p.ph]);   // head
      if (p.umb) {
        push(this.umb, [x, f.y + bob + 2.0, z], [1.25, 0.16, 1.25], f.th, p.umb, [p.ph, 0.5]);
      }
    }

    // ---------- hover cars in the two air lanes ----------
    for (const fl of FLYERS) {
      const r = rel(fl.z, camZ);
      if (r > 520 || r < -140) continue;
      const n = ((Math.floor(fl.z / SEGL) % NSEG) + NSEG) % NSEG;
      if (!airOk(n)) continue;
      frameAt(fl.z, f);
      const el = LAYERED[n] ? ELEV[n] : 0;
      const h = fl.h + Math.sin(time * 1.7 + fl.bob) * 0.3;
      const x = f.x + f.rx * fl.x, z = f.z + f.rz * fl.x, y = f.y - el + h;
      const yaw = f.th + (fl.dir < 0 ? Math.PI : 0);
      push(this.flyer, [x, y, z], [2.0, 0.7, 4.6], yaw, fl.body, [fl.bob]);
      push(this.glow, [x, y + 0.72, z], [1.5, 0.3, 2.2], yaw, fl.body, [0, 0]);
      push(this.glow, [x, y - 0.12, z], [1.7, 0.1, 3.6], yaw, fl.glow, [0, 0.4]);
      const lc = fl.dir < 0 ? [230, 240, 255] : [255, 40, 70];
      push(this.glow, [x + Math.sin(yaw) * 2.3, y + 0.3, z + Math.cos(yaw) * 2.3], [1.2, 0.2, 0.2], yaw, lc, [0, 0.8]);
    }

    // ---------- the monorail train ----------
    const tr = rel(train.z, camZ);
    if (tr < 600 && tr > -220) {
      const MLAT = -(RW + 1.4);
      for (let i = 0; i < 10; i++) {
        const zz = train.z + i * 6;
        const nn = ((Math.floor(zz / SEGL) % NSEG) + NSEG) % NSEG;
        const dd = district(nn);
        if (dd !== D.DOWNTOWN && dd !== D.SPIRES) continue;
        frameAt(zz, f);
        const x = f.x + f.rx * MLAT, z2 = f.z + f.rz * MLAT;
        push(this.flyer, [x, f.y + 12.6, z2], [2.4, 3.0, 6.0], f.th, [60, 64, 86], [i]);
        push(this.glow, [x, f.y + 14.3, z2], [2.5, 0.8, 5.0], f.th, [255, 200, 140], [0, 0.5]);
      }
    }

    const skyGap = rel(skyT.z, camZ);
    if (skyGap > -ST_LEN - 70 && skyGap < 440) {
      for (let z = 0; z < ST_LEN; z += 4) {
        const distance = (skyT.z + z + 2) % LEN, n = Math.floor(distance / SEGL);
        if (zoneAt(n)[4] || TRANS_AT[n] >= 0 || district(n) === D.RAMP || district(n) === D.TUNNEL) continue;
        frameAt(distance, f);
        const x = f.x + f.rx * ST_LAT, zz = f.z + f.rz * ST_LAT, y = f.y - f.elev + ST_H;
        push(this.body, [x, y, zz], [2.2, 3.2, 4], f.th, [214, 218, 230], [z]);
        push(this.glow, [x, y + 0.5, zz], [2.25, 0.2, 4], f.th, [0, 220, 255], [0, 0]);
        const light = z === 0 || z + 4 >= ST_LEN ? [230, 245, 255]
          : hash(z / 4, 1, 88) < 0.8 ? [255, 220, 170] : [40, 50, 70];
        push(this.glow, [x, y + 1.3, zz], [2.25, 1.1, 3.2], f.th, light, [z, 0.25]);
      }
    }

    const racer = camZ + 25 + Math.sin(time * 0.12) * 45;
    for (let z = 0; z < 90; z += 6) {
      const distance = (racer + z + 3 + LEN) % LEN, n = Math.floor(distance / SEGL);
      if (district(n) !== D.HIGHWAY) continue;
      frameAt(distance, f);
      const lat = RW + SW + 6, x = f.x + f.rx * lat, zz = f.z + f.rz * lat;
      push(this.body, [x, f.y + 0.4, zz], [2.5, 3.8, 6], f.th, [220, 226, 236], [z]);
      push(this.glow, [x, f.y + 1.4, zz], [2.55, 0.2, 6], f.th, [0, 230, 255], [z, 0]);
      push(this.glow, [x, f.y + 2, zz], [2.55, 1, 5], f.th, [255, 220, 170], [z, 0.3]);
    }

    const fair = zoneAt(Math.floor(camZ / SEGL));
    if (fair[2] === D.FAIR) {
      const start = fair[0] + Math.floor(time * 9 % (fair[1] - fair[0]));
      for (let n = start; n < Math.min(start + 4, fair[1]); n++) {
        frameAt(n * SEGL, f);
        const lat = -(RW + SW + 6), y = f.y - f.elev + coasterHeight(n);
        push(this.glow, [f.x + f.rx * lat, y, f.z + f.rz * lat], [1.8, 1.4, 3.5],
          f.th, NEON[n % 6], [n, 0.4, 2, 36]);
      }
    }

    // traffic on the street below an elevated road, seen through the glass deck
    // (the original's drawBelow: four lanes of head and tail lights)
    {
      const start = Math.floor(camZ / SEGL);
      for (let k = 0; k < 110; k += 2) {
        const nn = ((start + k) % NSEG + NSEG) % NSEG;
        const el = LAYERED[nn] ? ELEV[nn] : 0;
        if (el < 6) continue;
        frameAt((start + k) * SEGL, f);
        const floorY = f.y - el;
        for (const L of [-5.25, -1.75, 1.75, 5.25]) {
          const dir = L > 0 ? 1 : -1, sp = 22 + Math.abs(L) * 4;
          const off = (((time * 13 * dir + L * 17) % sp) + sp) % sp;
          const zz = Math.ceil(((start + k) * SEGL - off) / sp) * sp + off;
          if (zz >= (start + k + 2) * SEGL) continue;
          frameAt(zz, f);
          const col = dir > 0 ? [255, 40, 50] : [230, 235, 255];
          push(this.glow, [f.x + f.rx * L, floorY + 0.6, f.z + f.rz * L],
               [1.3, 0.22, 0.5], f.th, col, [k, 0.6]);
        }
      }
    }

    // people crossing the road while the light holds traffic
    if (IX.length) {
      const i0 = nextIx(camZ - 8);
      for (let k = 0; k < 3; k++) {
        const i = (i0 + k) % IX.length;
        const r = rel(IXZ[i], camZ);
        if (r < -40 || r > 420) continue;
        for (const c of crossers(i)) {
          frameAt(c.z, f);
          const bob = Math.abs(Math.sin(time * 6 + c.ph)) * 0.09;
          const x = f.x + f.rx * c.x, z = f.z + f.rz * c.x;
          push(this.ped, [x, f.y + bob, z], [0.5, 1.5, 0.38], f.th, c.coat, [c.ph]);
          push(this.ped, [x, f.y + bob + 1.5, z], [0.3, 0.28, 0.3], f.th, [30, 24, 34], [c.ph]);
          if (c.umb) push(this.umb, [x, f.y + bob + 2.0, z], [1.25, 0.16, 1.25], f.th, c.umb, [c.ph, 0.5]);
        }
      }
    }

    for (const p of this.pools) flush(p);
  }
}
