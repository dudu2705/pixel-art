// signals.js — intersection masts and traffic
// lights. The generator already decided where these go (IX / XROAD); the light
// cycle is the original's: 16s green, 3s amber, then red, and the ruin's
// lights just blink amber.

import * as THREE from './vendor/three.module.js';
import { SEGL, NSEG, RW, SW, IX, XROAD, D, district, lightState, hash } from './world.js';
import { frameAt } from './road.js';
import { Batch, unitBox } from './props.js';

const LIGHT_COL = [[40, 230, 90], [255, 190, 40], [255, 50, 50], [40, 36, 44]];

// Static signal masts. The road shader paints the cross streets and markings.
export function buildSignals(n0, n1, mats) {
  const metal = new Batch(unitBox);
  const f = {};
  for (let n = n0; n < n1; n++) {
    if (!XROAD[n]) continue;
    frameAt(n * SEGL, f);
    const put = (lat, up, size, col, b) =>
      b.add([f.x + f.rx * lat, f.y + up, f.z + f.rz * lat], size, f.th, col, [n, 0]);
    if (n === (IX.find(ix => ix === n) ?? -1)) {      // the mast itself
      for (const sg of [-1, 1]) {
        put(sg * (RW + 1.2), 0, [0.3, 6.4, 0.3], [34, 32, 44], metal);
        put(sg * (RW + 1.2) - sg * 1.6, 6.1, [3.4, 0.24, 0.24], [34, 32, 44], metal);
        put(sg * (RW - 0.6), 5.0, [0.6, 1.9, 0.5], [18, 16, 22], metal);   // the lamp housing
      }
    }
  }
  const mesh = metal.build(mats.metal);
  return mesh ? [mesh] : [];
}

// the lamps themselves change every frame, so they live in their own pool
export class Signals {
  constructor(scene, mats) {
    const base = unitBox;
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.attributes.position = base.attributes.position;
    g.attributes.normal = base.attributes.normal;
    g.attributes.uv = base.attributes.uv;
    const cap = 240;
    this.a = {
      iPos: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
      iSize: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
      iRot: new THREE.InstancedBufferAttribute(new Float32Array(cap), 1),
      iCol: new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3),
      iMeta: new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4),
    };
    for (const k in this.a) { this.a[k].setUsage(THREE.DynamicDrawUsage); g.setAttribute(k, this.a[k]); }
    g.instanceCount = 0;
    this.g = g;
    this.mesh = new THREE.Mesh(g, mats.emit);
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(1);
    this.cap = cap;
    scene.add(this.mesh);
  }

  update(camZ) {
    const f = {};
    let i = 0;
    for (let k = 0; k < IX.length && i < this.cap - 6; k++) {
      const n = IX[k], z = n * SEGL;
      const r = z - camZ;
      if (r < -80 || r > 700) continue;
      const st = lightState(k);
      frameAt(z, f);
      for (const sg of [-1, 1]) {
        for (let lamp = 0; lamp < 3; lamp++) {
          const on = st === lamp, dark = st === 3;
          const col = on && !dark ? LIGHT_COL[lamp] : LIGHT_COL[3];
          if (st === 3 && lamp === 1) { /* ruin: amber blinks */ }
          const lat = sg * (RW - 0.6), up = 5.6 - lamp * 0.55;
          this.a.iPos.array.set([f.x + f.rx * lat, f.y + up, f.z + f.rz * lat], i * 3);
          this.a.iSize.array.set([0.38, 0.38, 0.3], i * 3);
          this.a.iRot.array[i] = f.th;
          this.a.iCol.array.set([col[0] / 255, col[1] / 255, col[2] / 255], i * 3);
          this.a.iMeta.array.set([k, on ? 0.9 : 0, 0, 0], i * 4);
          i++;
        }
      }
    }
    this.g.instanceCount = i;
    for (const k in this.a) this.a[k].needsUpdate = true;
  }
}
