// Intersection masts and their original traffic-light cycle.
import * as THREE from './vendor/three.module.js';
import { SEGL, LEN, RW, SW, IXZ, lightState } from './world.js';
import { frameAt } from './road.js';
import { Batch, unitBox } from './props.js';
import { EMITTER_LAYER } from './glow.js';

const STOP_OFFSET = 13;
const MAST = RW + SW * 0.4;
const SIGNAL_COLORS = [[255, 40, 40], [255, 190, 40], [60, 255, 120]];

export function buildSignals(n0, n1, mats) {
  const metal = new Batch(unitBox);
  const f = {};
  for (const crossing of IXZ) {
    const z = (crossing + STOP_OFFSET) % LEN;
    const n = Math.floor(z / SEGL);
    if (n < n0 || n >= n1) continue;
    frameAt(z, f);
    const put = (lat, up, size, color) =>
      metal.add([f.x + f.rx * lat, f.y + up, f.z + f.rz * lat], size, f.th, color, [n, 0]);
    const pole = [30, 30, 40], head = [16, 16, 22];
    put(MAST, 0, [0.24, 6.2, 0.24], pole);
    put((MAST + 3) / 2, 5.95, [MAST - 3, 0.25, 0.24], pole);
    put(3, 4.55, [0.5, 1.4, 0.34], head);
    put(-MAST, 0, [0.24, 4.5, 0.24], pole);
    put(-MAST, 3.1, [0.5, 1.4, 0.34], head);
    put(MAST - 0.4, 2.5, [0.44, 0.6, 0.28], [12, 12, 16]);
  }
  const mesh = metal.build(mats.metal);
  return mesh ? [mesh] : [];
}

export class Signals {
  constructor(scene, mats) {
    const g = new THREE.InstancedBufferGeometry();
    g.index = unitBox.index;
    g.attributes.position = unitBox.attributes.position;
    g.attributes.normal = unitBox.attributes.normal;
    g.attributes.uv = unitBox.attributes.uv;
    this.cap = 240;
    this.a = {};
    for (const [name, size] of [['iPos', 3], ['iSize', 3], ['iRot', 1], ['iCol', 3], ['iMeta', 4]]) {
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * size), size);
      this.a[name] = attribute.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, attribute);
    }
    g.instanceCount = 0;
    this.g = g;
    this.mesh = new THREE.Mesh(g, mats.emit);
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(EMITTER_LAYER);
    scene.add(this.mesh);
  }

  update(camZ) {
    const f = {};
    let i = 0;
    for (let k = 0; k < IXZ.length && i <= this.cap - 7; k++) {
      const z = (IXZ[k] + STOP_OFFSET) % LEN;
      const r = (z - camZ + 1.5 * LEN) % LEN - LEN / 2;
      if (r < -80 || r > 400) continue;
      const state = lightState(k);
      frameAt(z, f);
      const place = (lat, up, size, color, strength, radius) => {
        const front = -0.21;
        this.a.iPos.setXYZ(i, f.x + f.rx * lat + Math.sin(f.th) * front, f.y + up - size / 2,
          f.z + f.rz * lat + Math.cos(f.th) * front);
        this.a.iSize.setXYZ(i, size, size, 0.14);
        this.a.iRot.setX(i, f.th);
        this.a.iCol.setXYZ(i, color[0] / 255, color[1] / 255, color[2] / 255);
        this.a.iMeta.setXYZW(i, k, strength, radius, 36);
        i++;
      };
      for (const [lat, top] of [[3, 5.65], [-MAST, 4.2]]) {
        SIGNAL_COLORS.forEach((color, row) => {
          const on = state === 2 - row;
          place(lat, top - row * 0.4, 0.32, on ? color : color.map(channel => channel * 0.18),
            on ? 0.6 : 0, 1.3);
        });
      }
      place(MAST - 0.4, 2.8, 0.2, state === 2 ? [120, 255, 200] : [255, 80, 40], 0.3, 0.6);
    }
    this.g.instanceCount = i;
    for (const attribute of Object.values(this.a)) attribute.needsUpdate = true;
  }
}
