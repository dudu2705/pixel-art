// traffic.js — cars, pedestrians, hover cars and the monorail train.
// These use the generator's own pools (380 cars, 980 people, 280 flyers) so the
// streets are populated exactly as the original populated them.

import * as THREE from './vendor/three.module.js';
import { SEGL, NSEG, LEN, RW, SW, LH, D, district, train, airOk, LAYERED, ELEV, IX, IXZ, nextIx } from './world.js';
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
  p.a.iMeta.array.set([meta[0], meta[1] || 0, 0, 0], i * 4);
}

function flush(p) {
  p.g.instanceCount = p.i;
  for (const k in p.a) p.a[k].needsUpdate = true;
  p.i = 0;
}

// shortest signed distance from camZ to z around the loop
function rel(z, camZ) { return ((z - camZ) % LEN + LEN * 1.5) % LEN - LEN / 2; }

export class Traffic {
  constructor(scene, mats) {
    this.body = pool(unitBox, 420, mats.metal);
    this.glow = pool(unitBox, 2600, mats.emit);
    this.ped = pool(unitBox, 900, mats.metal);
    this.umb = pool(unitBox, 460, mats.emit);
    this.flyer = pool(unitBox, 420, mats.metal);
    this.lamp = pool(unitSphere, 300, mats.emit);
    scene.add(this.body.mesh, this.glow.mesh, this.ped.mesh, this.umb.mesh, this.flyer.mesh, this.lamp.mesh);
    this.pools = [this.body, this.glow, this.ped, this.umb, this.flyer, this.lamp];
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
      const len = 4.0, wid = 1.75, hgt = 1.15;
      push(this.body, [x, f.y, z], [wid, hgt, len], yaw, c.body, [c.z]);
      push(this.body, [x, f.y + hgt, z], [wid * 0.82, 0.62, len * 0.5], yaw, c.body, [c.z]);   // cabin
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      for (const sd of [-1, 1]) {
        const hx = x + Math.sin(yaw) * (len / 2 - 0.1) + rx * sd * 0.55;
        const hz = z + Math.cos(yaw) * (len / 2 - 0.1) + rz * sd * 0.55;
        push(this.glow, [hx, f.y + 0.52, hz], [0.34, 0.18, 0.16], yaw, [255, 240, 205], [0, 0.9]);
        const tx = x - Math.sin(yaw) * (len / 2 - 0.1) + rx * sd * 0.55;
        const tz = z - Math.cos(yaw) * (len / 2 - 0.1) + rz * sd * 0.55;
        // the tail lights flare when it brakes, exactly as the original did
        push(this.glow, [tx, f.y + 0.55, tz], [0.3, 0.17, 0.14], yaw, c.tail, [0, c.brk ? 1.1 : 0.45]);
      }
      if (c.neon) push(this.glow, [x, f.y + 0.06, z], [wid * 1.05, 0.07, len * 0.92], yaw, c.under, [0, 0.35]);
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
      const MLAT = RW + SW + 4;
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
