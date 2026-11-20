// The big static set pieces between and in the two cities: the bay's open water, the skybridge's towers and
// suspension cables (as the reference's skybridge), lantern boats on the water, and Aurum Heights' space elevator,
// a tether of light rising out of sight with pods climbing it.
import * as THREE from './vendor/three.module.js';
import { VANTA_BAY, frameOn, AURUM, BRIDGE } from './map.js';
import { FONT } from './cockpit.js';
import { CITIES, D, SW, hash } from './world.js';
import { Batch, unitBox, unitCone, unitCyl, unitSphere, unitPlane, unitPlaneFlat } from './props.js';

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
  for (const [batch, material] of [[metal, mats.metal], [emit, mats.emit], [lamp, mats.emit]]) {
    const mesh = batch.build(material);
    if (mesh) out.push(mesh);
  }
  for (const tube of VANTA_BAY.roads.filter(road => road.tube)) out.push(...buildTube(tube, mats));
  for (const ferry of VANTA_BAY.roads.filter(road => road.link?.district === D.FERRY)) out.push(...buildFerry(ferry, mats));
  for (const rim of VANTA_BAY.roads.filter(road => road.link?.district === D.VOLCANO)) out.push(...buildVolcano(rim, mats));
  for (const causeway of VANTA_BAY.roads.filter(road => road.link?.district === D.CLOUDS)) out.push(...buildCloudTowers(causeway, mats));
  for (const pontoon of VANTA_BAY.roads.filter(road => road.link?.district === D.PONTOON)) out.push(...buildPontoon(pontoon, mats));
  return out;
}

function buildPontoon(road, mats) {
  const floats = new Batch(unitBox), lamps = new Batch(unitSphere);
  const width = road.halfWidth + SW, colors = CITIES.find(city => city.name === road.link.b).neon;
  for (let d = 12; d + 12 <= road.path.length; d += 24) {
    const f = frameOn(road.path, d);
    const put = (batch, lat, y, size, color, meta = [0, 0]) => batch.add(
      [f.x + f.rx * lat, y, f.z + f.rz * lat], size, f.th, color, meta);
    for (const side of [-1, 1]) {
      put(floats, side * (width - 2.5), -0.65, [6, f.y + 0.57, 23.45], [57, 43, 45]);
      put(floats, side * width, f.y, [0.52, 0.72, 0.52], [43, 39, 42]);
      const color = colors[(d / 12 + (side + 1) / 2) % colors.length];
      put(lamps, side * width, f.y + 0.78, [0.32, 0.35, 0.32], color, [d, 0.55, 1.6, 35]);
    }
    if (d % 72 === 12) {
      const lat = (hash(d, 3, 6) < 0.5 ? -1 : 1) * (width + 8 + hash(d, 5, 8) * 33);
      put(floats, lat, -0.12, [3.2, 0.68, 5.6], [50, 34, 26]);
      put(floats, lat, 0.5, [0.1, 1.3, 0.1], [30, 24, 20]);
      put(lamps, lat, 1.95, [0.5, 0.6, 0.5], colors[(d / 12) % colors.length], [d, 0.45, 2, 48]);
    }
  }
  return [floats.build(mats.metal), lamps.build(mats.emit)].filter(Boolean);
}

function buildCloudTowers(road, mats) {
  const towers = new Batch(unitBox), lights = new Batch(unitBox), mist = new Batch(unitPlane);
  const palette = CITIES.find(city => city.name === road.link.b).neon;
  for (let d = 168; d < road.path.length - 168; d += 44) {
    const f = frameOn(road.path, d), side = hash(d, 1, 95) < 0.5 ? -1 : 1;
    const lat = side * (road.halfWidth + SW + 16 + hash(d, 2, 96) * 56);
    const width = 10 + hash(d, 3, 97) * 12, height = f.y + 6 + hash(d, 4, 98) * 26;
    const x = f.x + f.rx * lat, z = f.z + f.rz * lat, color = palette[(d / 4) % palette.length];
    towers.add([x, -1, z], [width, height, width], f.th, [24, 26, 44], [d, height, width, 1]);
    lights.add([x, height - 1.4, z], [width + 0.18, 0.35, width + 0.18], f.th, color, [d, 0.4, 2, 48]);
    for (let phase = 0; phase < 4; phase++)
      mist.add([x, f.y - 6, z], [width * 3.4, 4, 1], f.th, [180, 190, 220], [0, d + phase, phase / 4, 0.12]);
  }
  return [towers.build(mats.tower), lights.build(mats.emit), mist.build(mats.effect)].filter(Boolean);
}

function buildVolcano(road, mats) {
  const rock = new Batch(unitCone), metal = new Batch(unitBox), glow = new Batch(unitBox);
  const edge = road.halfWidth + SW;
  for (let d = 12; d < road.path.length - 12; d += 4) {
    const f = frameOn(road.path, d);
    const put = (batch, lat, y, size, color, meta = [0, 0]) => batch.add(
      [f.x + f.rx * lat, y, f.z + f.rz * lat], size, f.th, color, meta);
    put(metal, 0, -0.2, [2 * edge + 0.5, f.y + 0.15, 4.25], [43, 27, 25]);
    for (const side of [-1, 1]) {
      put(metal, side * edge, f.y - 0.45, [0.3, 1.6, 4.25], [70, 68, 80]);
      if (d % 20 === 12) put(glow, side * (edge - 0.1), f.y + 0.72, [0.24, 0.24, 0.42], [255, 124, 45], [d, 0.5, 1, 35]);
    }
    if (d % 52 === 12) {
      const side = hash(d, 1, 91) < 0.5 ? -1 : 1, h = 8 + hash(d, 3, 93) * 30;
      const lat = side * (edge + 8 + hash(d, 2, 92) * 40), w = 4 + hash(d, 4, 94) * 6;
      put(rock, lat, -1, [w, h, w], [46, 26, 22]);
      put(glow, lat, 0.3, [0.01, 0.01, 0.01], [255, 90, 20], [d, 0.35, 8, 60]);
      put(rock, -side * (edge + 88), -2, [44 + w, h * 2.8, 44 + w], [34, 22, 24]);
    }
  }
  return [rock.build(mats.metal), metal.build(mats.metal), glow.build(mats.emit)].filter(Boolean);
}

function buildFerry(road, mats) {
  const hull = new Batch(unitBox), stacks = new Batch(unitCyl), lights = new Batch(unitBox), smoke = new Batch(unitPlane);
  const width = road.halfWidth + SW, length = road.path.length;
  for (let d = 24; d < length - 24; d += 4) {
    const f = frameOn(road.path, d);
    const put = (batch, lat, y, size, color, meta = [0, 0]) => batch.add(
      [f.x + f.rx * lat, f.y + y, f.z + f.rz * lat], size, f.th, color, meta);
    put(hull, 0, -f.y - 0.25, [2 * width + 0.5, f.y, 4.1], [140, 29, 36]);
    for (const side of [-1, 1]) {
      const edge = side * (width + 0.15);
      put(hull, edge, 0, [0.34, 1.65, 4.1], [160, 30, 36]);
      put(hull, edge, 1.65, [0.35, 0.3, 4.1], [40, 40, 50]);
      put(hull, edge, 1.95, [0.38, 0.3, 4.1], [230, 230, 235]);
      if (d % 8 === 0) put(lights, edge, 0.64, [0.38, 0.5, 1.05], [255, 220, 150]);
      if (d % 60 === 28) put(hull, edge, 2.25, [1.45, 1, 5], [255, 130, 30]);
      if (d % 240 !== 120) continue;
      const funnel = side * (width + 2);
      put(stacks, funnel, -1, [4.4, 23, 4.4], [200, 40, 40]);
      put(stacks, funnel, 19, [4.5, 3, 4.5], [20, 20, 26]);
      put(stacks, funnel, 15.5, [4.5, 1.5, 4.5], [235, 235, 240]);
      for (let i = 0; i < 5; i++) put(smoke, funnel, 22, [12, 10, 1], [90, 90, 100], [0, d + i, i / 5, 0.2]);
    }
  }
  return [hull.build(mats.metal), stacks.build(mats.metal), lights.build(mats.emit), smoke.build(mats.effect)].filter(Boolean);
}

function buildTube(road, mats) {
  const walls = new Batch(unitPlane), ceiling = new Batch(unitPlaneFlat);
  const metal = new Batch(unitBox), emit = new Batch(unitBox);
  const { from, to, mode = 0 } = road.tube;
  const height = 6.5, width = road.halfWidth + SW;
  for (let d = from; d < to; d += 4) {
    const a = frameOn(road.path, d), b = frameOn(road.path, d + 4);
    const slope = b.y - a.y, midY = (a.y + b.y) / 2;
    for (const side of [-1, 1]) {
      const x0 = a.x + a.rx * side * width, z0 = a.z + a.rz * side * width;
      const x1 = b.x + b.rx * side * width, z1 = b.z + b.rz * side * width;
      walls.add([(x0 + x1) / 2, midY + height / 2, (z0 + z1) / 2], [Math.hypot(x1 - x0, z1 - z0) + 0.06, height + 0.06, 1],
        Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2, [255, 255, 255], [mode, 0, d, slope]);
    }
    ceiling.add([(a.x + b.x) / 2, midY + height, (a.z + b.z) / 2], [width * 2 + 0.08, 1, Math.hypot(b.x - a.x, b.z - a.z) + 0.14],
      Math.atan2(b.x - a.x, b.z - a.z), [255, 255, 255], [mode, 1, d, slope]);
    if (mode && (d - from) % 28 === 0)
      emit.add([a.x, a.y + height / 2, a.z], [0.01, 0.01, 0.01], a.th, [80, 210, 255], [d, 0.35, 5, 60]);
  }
  const accent = mode ? [90, 210, 255] : [0, 230, 255];
  for (const [d, facing] of [[from, 1], [to, -1]]) {
    const f = frameOn(road.path, d);
    const put = (lat, up, size, col, batch) => batch.add(
      [f.x + f.rx * lat * facing, f.y + up, f.z + f.rz * lat * facing], size, f.th, col, [0, 0]);
    for (const side of [-1, 1]) put(side * (width + 0.25), 0, [0.5, height + 0.5, 0.35], accent, emit);
    put(0, height, [width * 2, 0.5, 0.35], accent, emit);
    put(0, height + 0.5, [width * 2 + 6, 4.2, 0.32], [24, 30, 44], metal);
    const label = road.link.name, labelWidth = 14, cw = labelWidth / (label.length * 4 + 2), ch = 2.4 / 7;
    for (let i = 0; i < label.length; i++) {
      const glyph = FONT[label[i]] || FONT[' '];
      for (let bit = 0; bit < glyph.length; bit++) if (glyph[bit] === '1')
        put((i * 4 + bit % 3 + 1.5) * cw - labelWidth / 2, height + 1.2 + (5 - Math.floor(bit / 3)) * ch, [cw, ch, 0.5], accent, emit);
    }
  }
  const surface = mode ? mats.tunnel : mats.glass;
  return [metal.build(mats.metal), emit.build(mats.emit), walls.build(surface), ceiling.build(surface)].filter(Boolean);
}
