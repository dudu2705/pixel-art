// The big static set pieces between and in the two cities: the bay's open water, the skybridge's towers and
// suspension cables (as the reference's skybridge), lantern boats on the water, and Aurum Heights' space elevator,
// a tether of light rising out of sight with pods climbing it.
import * as THREE from './vendor/three.module.js';
import { VANTA_BAY, frameOn, AURUM, BRIDGE } from './map.js';
import { FONT } from './cockpit.js';
import { CITIES, SW } from './world.js';
import { Batch, unitBox, unitSphere, unitPlane, unitPlaneFlat } from './props.js';

export function buildSetPieces(mats, groundMat) {
  const out = [];
  // the bay: one flat sheet, drawn by the ground shader's water band
  const water = new THREE.Mesh(new THREE.PlaneGeometry(BRIDGE.x1 - BRIDGE.x0, 1400).rotateX(-Math.PI / 2), groundMat);
  water.position.set((BRIDGE.x0 + BRIDGE.x1) / 2, -0.04, 0);
  out.push(water);

  const metal = new Batch(unitBox), emit = new Batch(unitBox), lamp = new Batch(unitSphere);
  const road = VANTA_BAY.roads.find(r => r.id === 'skybridge'), L = road.path.length, hw = road.halfWidth + SW - 0.3;
  const vanta = CITIES.find(c => c.name === 'VANTA BAY'), aurum = CITIES.find(c => c.name === 'AURUM HEIGHTS');
  const steel = [46, 50, 66];
  // two towers, a third and two thirds of the way across, each a pair of legs joined at the top
  const TOP = 92, towers = [L / 3, 2 * L / 3];
  for (const d of towers) {
    const f = frameOn(road.path, d);
    for (const s of [-1, 1]) metal.add([f.x + f.rx * s * (hw + 1.2), -2, f.z + f.rz * s * (hw + 1.2)], [2.2, TOP + 2, 2.2], f.th, steel, [0, 0]);
    for (const h of [TOP - 6, 48]) metal.add([f.x, h, f.z], [2 * (hw + 2.4), 2.2, 2.2], f.th + Math.PI / 2, steel, [0, 0]);
    for (const s of [-1, 1]) emit.add([f.x + f.rx * s * (hw + 1.2), TOP, f.z + f.rz * s * (hw + 1.2)], [0.7, 0.7, 0.7], f.th, [255, 40, 60], [0, 0.9, 2.5, 40]);
  }
  // main cables: from the deck at each end up over the towers and sagging between them; hangers every 12 m
  const cableY = d => {
    const [a, b] = towers;
    if (d < a) return 4 + (TOP - 4) * (d / a) ** 1.6;
    if (d > b) return 4 + (TOP - 4) * ((L - d) / (L - b)) ** 1.6;
    const t = (d - a) / (b - a);
    return TOP - (TOP - 30) * 4 * t * (1 - t);
  };
  for (const s of [-1, 1]) {
    for (let d = 0; d < L; d += 6) {
      const f0 = frameOn(road.path, d), f1 = frameOn(road.path, Math.min(L, d + 6));
      const y0 = cableY(d), y1 = cableY(Math.min(L, d + 6));
      const x0 = f0.x + f0.rx * s * (hw + 1.2), z0 = f0.z + f0.rz * s * (hw + 1.2), x1 = f1.x + f1.rx * s * (hw + 1.2), z1 = f1.z + f1.rz * s * (hw + 1.2);
      const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1), new THREE.Vector3(0, 1, 0));
      const e = new THREE.Euler().setFromRotationMatrix(m, 'YXZ');
      // a thin box along the cable; the batch only turns about y, so the slope is carried by splitting into short runs
      metal.add([(x0 + x1) / 2, (y0 + y1) / 2 - 0.2, (z0 + z1) / 2], [0.35, 0.35 + Math.abs(y1 - y0), len], e.y, [70, 74, 92], [0, 0]);
      if (d % 12 === 0 && y0 - f0.y > 3) {
        metal.add([x0, f0.y + 0.6, z0], [0.08, y0 - f0.y - 0.6, 0.08], f0.th, [80, 84, 100], [0, 0]);
        if (d % 48 === 0) emit.add([x0, y0 + 0.4, z0], [0.4, 0.4, 0.4], f0.th, d < L / 2 ? vanta.neon[1] : aurum.neon[0], [d, 0.5, 1.6, 30]);
      }
    }
  }
  // lantern boats drifting on the bay
  for (let i = 0; i < 14; i++) {
    const x = BRIDGE.x0 + 90 + ((i * 197) % (BRIDGE.x1 - BRIDGE.x0 - 180)), z = ((i * 131) % 500) - 250;
    if (Math.abs(z) < 30) continue;
    metal.add([x, 0, z], [3.2, 0.6, 6], i, [50, 34, 26], [0, 0]);
    metal.add([x, 0.6, z], [0.1, 1.3, 0.1], 0, [30, 24, 20], [0, 0]);
    lamp.add([x, 2.0, z], [0.6, 0.6, 0.6], 0, (i % 2 ? vanta : aurum).neon[i % 6], [i, 0.45, 2, 48]);
  }
  // the space elevator: a white-gold tether straight up out of the elevator block, glowing bands, climbing pods
  const E = AURUM.elevator;
  emit.add([E.x, 64, E.z], [1.6, 2400, 1.6], 0, [235, 240, 255], [0, 0]);
  for (let y = 90; y < 1400; y += 70) emit.add([E.x, y, E.z], [4.5, 0.6, 4.5], 0, [255, 210, 140], [y, 0.5, 4, 50]);
  for (const [y, s] of [[180, 1], [430, -1], [760, 1]]) {
    metal.add([E.x + s * 1.9, y, E.z], [2.2, 6, 2.2], 0, [60, 60, 80], [0, 0]);
    emit.add([E.x + s * 1.9, y + 3, E.z], [2.3, 0.4, 2.3], 0, [120, 220, 255], [y, 0.7, 6, 40]);
  }
  // the aqua tube: glass walls and a glass ceiling along the sea floor, as the loop builds its sea tube (the glass
  // shader draws the water and the fish outside), with a lit portal at each mouth
  const glass = new Batch(unitPlane), glassCeil = new Batch(unitPlaneFlat);
  const tube = VANTA_BAY.roads.find(r => r.id === 'aqua-tube'), TH = 6.5, TW = tube.halfWidth + SW;
  for (let d = tube.tube.from; d < tube.tube.to; d += 4) {
    const a = frameOn(tube.path, d), b = frameOn(tube.path, Math.min(tube.tube.to, d + 4));
    const slope = b.y - a.y, midY = (a.y + b.y) / 2;
    for (const side of [-1, 1]) {
      const x0 = a.x + a.rx * side * TW, z0 = a.z + a.rz * side * TW, x1 = b.x + b.rx * side * TW, z1 = b.z + b.rz * side * TW;
      glass.add([(x0 + x1) / 2, midY + TH / 2, (z0 + z1) / 2], [Math.hypot(x1 - x0, z1 - z0) + 0.06, TH + 0.06, 1],
        Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2, [255, 255, 255], [0, 0, d, slope]);
    }
    glassCeil.add([(a.x + b.x) / 2, midY + TH, (a.z + b.z) / 2], [TW * 2 + 0.08, 1, Math.hypot(b.x - a.x, b.z - a.z) + 0.14],
      Math.atan2(b.x - a.x, b.z - a.z), [255, 255, 255], [0, 1, d, slope]);
  }
  const accent = [0, 230, 255];
  for (const d of [tube.tube.from, tube.tube.to]) {
    const f = frameOn(tube.path, d), put = (lat, up, size, col, batch) => batch.add([f.x + f.rx * lat, f.y + up, f.z + f.rz * lat], size, f.th, col, [0, 0]);
    for (const side of [-1, 1]) put(side * (TW + 0.25), 0, [0.5, TH + 0.5, 0.35], accent, emit);
    put(0, TH, [TW * 2, 0.5, 0.35], accent, emit);
    put(0, TH + 0.5, [TW * 2 + 6, 4.2, 0.32], [24, 30, 44], metal);
    const label = 'AQUA TUBE', width = 14, cw = width / (label.length * 4 + 2), ch = 2.4 / 7;
    for (let i = 0; i < label.length; i++) {
      const glyph = FONT[label[i]] || FONT[' '];
      for (let bit = 0; bit < glyph.length; bit++) if (glyph[bit] === '1')
        emit.add([f.x + f.rx * ((i * 4 + bit % 3 + 1.5) * cw - width / 2), f.y + TH + 1.2 + (5 - Math.floor(bit / 3)) * ch, f.z + f.rz * ((i * 4 + bit % 3 + 1.5) * cw - width / 2)],
          [cw, ch, 0.5], f.th, accent, [0, 0]);
    }
  }
  for (const [b, m] of [[metal, mats.metal], [emit, mats.emit], [lamp, mats.emit], [glass, mats.glass], [glassCeil, mats.glass]]) { const mesh = b.build(m); if (mesh) out.push(mesh); }
  return out;
}
