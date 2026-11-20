import * as THREE from './vendor/three.module.js';
import { TOWER_LIFT, VANTA_BAY, frameOn } from './map.js';
import { FONT } from './cockpit.js';
import { Batch, unitBox } from './props.js';

const steel = [34, 37, 54];
const panel = [16, 20, 34];
const light = [105, 230, 255];

function label(batch, x, y, z, heading, pixel = 0.16) {
  const text = 'TOWER LIFT';
  const rx = -Math.cos(heading), rz = Math.sin(heading);
  for (let i = 0; i < text.length; i++) {
    const glyph = FONT[text[i]];
    for (let bit = 0; bit < glyph.length; bit++) {
      if (glyph[bit] !== '1') continue;
      const across = (i * 4 + bit % 3 - (text.length * 4 - 2) / 2) * pixel;
      batch.add([x + rx * across, y + (4 - Math.floor(bit / 3)) * pixel, z + rz * across],
        [pixel, pixel, 0.25], heading, light, [0, 0]);
    }
  }
}

export function buildTowerLift(mats) {
  const { x, z, halfLength, halfWidth, height, landings } = TOWER_LIFT;
  const top = landings[1].y + height + 3;
  const group = new THREE.Group();
  const shell = new Batch(unitBox), emit = new Batch(unitBox);
  const put = (batch, dx, y, dz, size, color) => batch.add([x + dx, y, z + dz], size, 0, color, [0, 0]);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1])
      put(shell, end * (halfLength + 0.3), 0, side * (halfWidth + 0.35), [0.62, top, 0.62], steel);
    put(shell, 0, 0, side * (halfWidth + 0.52), [2 * halfLength + 0.8, top, 0.26], panel);
    for (let y = 6; y < top; y += 6)
      put(emit, 0, y, side * (halfWidth + 0.68), [2 * halfLength + 0.6, 0.1, 0.08], [30, 116, 160]);
  }
  put(shell, halfLength + 0.2, height, 0, [0.32, top - height, 2 * halfWidth], panel);
  put(shell, -halfLength - 0.2, 0, 0, [0.32, landings[1].y, 2 * halfWidth], panel);
  put(shell, 0, top, 0, [2 * halfLength + 0.95, 0.7, 2 * halfWidth + 1.4], steel);
  for (let y = 2; y < landings[1].y - 0.2; y += 3.5) {
    for (const end of [-1, 1]) {
      if (end === 1 && y <= height) continue;
      const face = end * (halfLength + 0.01);
      put(shell, face, y, 0, [0.09, 0.33, halfWidth * 2], steel);
      put(emit, face - end * 0.06, y + 0.12, 0, [0.04, 0.10, halfWidth * 2 - 0.32], [30, 130, 180]);
      for (const side of [-1, 1])
        put(emit, face - end * 0.06, y + 0.04, side * (halfWidth - 0.3), [0.04, 0.16, 0.23], light);
    }
  }

  const doors = [];
  for (const [i, landing] of landings.entries()) {
    const side = i === 0 ? 1 : -1, gateX = landing.x + side * 0.13;
    const leaf = new Batch(unitBox), strips = new Batch(unitBox);
    for (const polarity of [-1, 1]) {
      put(shell, side * halfLength, landing.y, polarity * (halfWidth + 0.22), [0.52, height, 0.54], steel);
      put(emit, side * (halfLength + 0.33), landing.y, polarity * halfWidth, [0.21, height, 0.13], light);
      put(shell, side * (halfLength + 0.49), landing.y, polarity * (halfWidth * 1.5 + 0.1),
        [0.34, height - 0.65, halfWidth + 0.14], panel);
      const closed = z + polarity * halfWidth * 0.5;
      leaf.add([gateX, landing.y + 0.06, closed], [0.24, height - 0.8, halfWidth - 0.04], 0, [31, 40, 62], [0, 0]);
      strips.add([gateX + side * 0.14, landing.y + 2.25, closed], [0.08, 0.15, halfWidth - 0.14], 0, [63, 170, 208], [0, 0]);
    }
    put(shell, side * (halfLength + 0.1), landing.y + height - 0.8, 0, [0.65, 1, 2 * halfWidth], panel);
    label(emit, gateX + side * 0.4, landing.y + height - 0.6, z, -side * Math.PI / 2);
    const meshes = [leaf.build(mats.metal), strips.build(mats.emit)];
    group.add(...meshes);
    doors.push(meshes);
  }
  for (const id of ['street-south-through', 'sky-south-through']) {
    const road = VANTA_BAY.roads.find(road => road.id === id);
    const f = frameOn(road.path, id.startsWith('sky') ? 26 : road.path.length - 26);
    shell.add([f.x - 3, f.y + 5.2, f.z], [8.2, 1.2, 0.42], 0, panel, [0, 0]);
    label(emit, f.x - 3, f.y + 5.37, f.z + 0.25, Math.PI);
    shell.add([f.x - 7, f.y, f.z], [0.28, 5.5, 0.28], 0, steel, [0, 0]);
  }
  group.add(shell.build(mats.metal), emit.build(mats.emit));

  const cabin = new Batch(unitBox), cabLight = new Batch(unitBox);
  put(cabin, 0, -0.24, 0, [2 * halfLength, 0.29, 2 * halfWidth], [53, 56, 72]);
  put(cabin, 0, height - 0.45, 0, [2 * halfLength, 0.26, 2 * halfWidth], steel);
  for (const side of [-1, 1]) {
    put(cabin, 0, 0.04, side * (halfWidth - 0.12), [2 * halfLength, height - 0.5, 0.24], steel);
    put(cabLight, 0, height - 0.53, side * (halfWidth - 0.7), [2 * halfLength - 0.6, 0.12, 0.18], light);
    put(cabLight, 0, 1.18, side * (halfWidth - 0.31), [2 * halfLength - 0.45, 0.11, 0.09], [70, 178, 222]);
  }
  const platform = [cabin.build(mats.metal), cabLight.build(mats.emit)];
  group.add(...platform);

  let lastY, lastDoors = [-1, -1];
  return {
    group,
    update(lift, camera) {
      group.visible = Math.hypot(camera.x - x, camera.z - z) < 650;
      if (!group.visible) return;
      if (lift.y !== lastY) {
        for (const mesh of platform) {
          const pos = mesh.geometry.getAttribute('iPos');
          const base = mesh === platform[0] ? cabin.pos : cabLight.pos;
          for (let i = 0; i < pos.count; i++) pos.setY(i, base[i * 3 + 1] + lift.y);
          pos.needsUpdate = true;
        }
        lastY = lift.y;
      }
      for (let floor = 0; floor < doors.length; floor++) {
        const opened = lift.doorAt(floor);
        if (opened === lastDoors[floor]) continue;
        for (const mesh of doors[floor]) {
          const pos = mesh.geometry.getAttribute('iPos');
          const offset = halfWidth * (0.5 + opened);
          pos.setZ(0, z - offset);
          pos.setZ(1, z + offset);
          pos.needsUpdate = true;
        }
        lastDoors[floor] = opened;
      }
    },
  };
}
