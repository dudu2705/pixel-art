// Traffic lights at Vanta Bay's street junctions, on the reference's cycle, drawn like signals.js draws the loop's.
import * as THREE from './vendor/three.module.js';
import { VANTA_BAY, frameInLane } from './map.js';
import { SW, hash } from './world.js';
import { Batch, unitBox } from './props.js';
import { EMITTER_LAYER } from './glow.js';

const { nodes, edges } = VANTA_BAY;
export const LIGHT_PERIOD = 30, GREEN = 12, AMBER = 3;     // per axis: 12 s green, 3 s amber, 15 s red
const SIGNAL_COLORS = [[255, 40, 40], [255, 190, 40], [60, 255, 120]];

// street junctions where three or more roads meet; the plaza ring and ramp ends run free
export const SIGNALLED = Object.values(nodes).filter(n => n.level === 0 && !n.ramp && !n.id.startsWith('plaza-') &&
  new Set(edges.filter(e => e.to === n || e.from === n).map(e => e.road)).size >= 3);
SIGNALLED.forEach((n, i) => { n.signal = { offset: hash(i, 7, 3) * LIGHT_PERIOD }; });

// each approach belongs to an axis (east-west or north-south by its heading at the stop line); the axes alternate
const APPROACHES = edges.filter(e => e.to.signal);
for (const e of APPROACHES) {
  const f = frameInLane(e, e.path.length - e.to.trim, 0);
  e.axis = Math.abs(Math.sin(f.th)) > Math.abs(Math.cos(f.th)) ? 0 : 1;
}

// 0 green, 1 amber, 2 red; -1 where the approach has no light
export function signalState(edge, T) {
  const s = edge.to.signal;
  if (!s) return -1;
  const p = ((T + s.offset + (edge.axis ? LIGHT_PERIOD / 2 : 0)) % LIGHT_PERIOD + LIGHT_PERIOD) % LIGHT_PERIOD;
  return p < GREEN ? 0 : p < GREEN + AMBER ? 1 : 2;
}

// a mast on the kerb at each stop line, its arm over the lanes, plus the far-side pole, as in the loop
export function buildMapSignals(mats) {
  const metal = new Batch(unitBox);
  for (const e of APPROACHES) {
    const mast = e.road.halfWidth + SW * 0.4, s = e.path.length - e.to.trim;
    const f = frameInLane(e, s, 0);
    const put = (lat, up, size, color) =>
      metal.add([f.x + f.rx * lat, f.y + up, f.z + f.rz * lat], size, f.th, color, [0, 0]);
    const pole = [30, 30, 40], head = [16, 16, 22];
    put(mast, 0, [0.24, 6.2, 0.24], pole);
    put((mast + 3) / 2, 5.95, [mast - 3, 0.25, 0.24], pole);
    put(3, 4.55, [0.5, 1.4, 0.34], head);
    put(mast - 0.4, 2.5, [0.44, 0.6, 0.28], [12, 12, 16]);
  }
  return metal.build(mats.metal);
}

export class MapSignals {
  constructor(scene, mats) {
    const static_ = buildMapSignals(mats);
    if (static_) scene.add(static_);
    const g = new THREE.InstancedBufferGeometry();
    g.index = unitBox.index;
    g.attributes.position = unitBox.attributes.position;
    g.attributes.normal = unitBox.attributes.normal;
    g.attributes.uv = unitBox.attributes.uv;
    this.cap = APPROACHES.length * 4;
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
    this.frames = APPROACHES.map(e => ({ e, f: frameInLane(e, e.path.length - e.to.trim, 0), mast: e.road.halfWidth + SW * 0.4 }));
  }

  update(T) {
    let i = 0;
    for (const [k, { e, f, mast }] of this.frames.entries()) {
      const state = signalState(e, T);
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
      SIGNAL_COLORS.forEach((color, row) => {
        const on = state === 2 - row;
        place(3, 5.65 - row * 0.4, 0.32, on ? color : color.map(c => c * 0.18), on ? 0.6 : 0, 1.3);
      });
      place(mast - 0.4, 2.8, 0.2, state === 2 ? [120, 255, 200] : [255, 80, 40], 0.3, 0.6);   // walk / don't walk
    }
    this.g.instanceCount = i;
    for (const attribute of Object.values(this.a)) attribute.needsUpdate = true;
  }
}
