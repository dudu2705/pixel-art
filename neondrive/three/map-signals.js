// Traffic lights at Vanta Bay's street junctions, on the reference's cycle, drawn like signals.js draws the loop's.
import * as THREE from './vendor/three.module.js';
import { VANTA_BAY, frameInLane } from './map.js';
import { SW, hash, hsl, NEON } from './world.js';
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
APPROACHES.forEach((e, i) => {
  e.index = i;
  // in order along the approach: the hold line, the zebra (painted by the road shader just outside the junction
  // disc), then the junction; cars on a light hold before the zebra, holdBack metres short of the usual trim
  e.zebraS = e.path.length - e.to.discR - 1.55;
  e.holdBack = e.to.discR + 5.4 - e.to.trim;                // 2.6 m short of the zebra, so the bike's nose stays off it
});
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

// people crossing each signalled approach while its traffic is held: they set off in the first seconds of red and
// walk the full width at their own pace, as crossersRaw does in the reference; late ones finish into the green
export function crossers(e, T, out = []) {
  out.length = 0;
  const s0 = e.to.signal;
  if (!s0) return out;
  const p = ((T + s0.offset + (e.axis ? LIGHT_PERIOD / 2 : 0)) % LIGHT_PERIOD + LIGHT_PERIOD) % LIGHT_PERIOD;
  const t = p >= GREEN + AMBER ? p - GREEN - AMBER : p + LIGHT_PERIOD - GREEN - AMBER;
  const id = e.index, n = 3 + Math.floor(hash(id, 9, 9) * 5), L = e.road.halfWidth + SW * 0.6;
  for (let j = 0; j < n; j++) {
    // off the kerb once the junction has had a moment to clear
    const ts = 1.5 + hash(j, id, 71) * 3, v = 2.1 + hash(j, id, 72) * 0.5, dir = hash(j, id, 73) < 0.5 ? 1 : -1;
    if (t < ts) continue;
    const x = -dir * L + dir * v * (t - ts);
    if (Math.abs(x) > L) continue;
    out.push({ lat: x, s: e.zebraS + (hash(j, id, 74) - 0.5) * 1.6, dir, ph: j * 1.7,
      umb: hash(j, id, 75) < 0.6 ? NEON[(hash(j, id, 76) * 6) | 0] : null, coat: hsl(hash(j, id, 77) * 360, 0.25, 0.18) });
  }
  return out;
}
const scratch = [];
export function pedsOn(e, T) { return crossers(e, T, scratch).some(c => Math.abs(c.lat) < e.road.halfWidth + 0.6); }
// a car turning into road e leaves on its outbound lanes, the other side of e's centre line (lat < 0)
export function pedsOnOutbound(e, T) { return crossers(e, T, scratch).some(c => c.lat < 0.6 && c.lat > -e.road.halfWidth - 0.6); }

// every crosser in world space, for drawing and for the rider's collisions
export function allCrossers(T) {
  const out = [], f = {};
  for (const e of APPROACHES) for (const c of crossers(e, T, [])) {
    frameInLane(e, c.s, c.lat, f);
    out.push({ x: f.x, y: f.y, z: f.z, th: f.th - c.dir * Math.PI / 2, ph: c.ph, umb: c.umb, coat: c.coat });
  }
  return out;
}

// a mast on the kerb at each hold line, its arm over the lanes, as in the loop
const holdS = e => e.path.length - e.to.trim - e.holdBack;
export function buildMapSignals(mats) {
  const metal = new Batch(unitBox);
  for (const e of APPROACHES) {
    const mast = e.road.halfWidth + SW * 0.4, f = frameInLane(e, holdS(e), 0);
    const put = (lat, up, size, color) =>
      metal.add([f.x + f.rx * lat, f.y + up, f.z + f.rz * lat], size, f.th, color, [0, 0]);
    const pole = [30, 30, 40], head = [16, 16, 22];
    put(mast, 0, [0.24, 6.2, 0.24], pole);
    put((mast + 3) / 2, 5.95, [mast - 3, 0.25, 0.24], pole);
    put(3, 4.55, [0.5, 1.4, 0.34], head);
    put(mast - 0.4, 2.5, [0.44, 0.6, 0.28], [12, 12, 16]);
  }
  const mesh = metal.build(mats.metal);
  return mesh ? [mesh] : [];
}

export class MapSignals {
  constructor(scene, mats) {
    for (const mesh of buildMapSignals(mats)) scene.add(mesh);
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
    this.frames = APPROACHES.map(e => ({ e, f: frameInLane(e, holdS(e), 0), mast: e.road.halfWidth + SW * 0.4 }));
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
