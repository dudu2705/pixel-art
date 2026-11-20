import { frameOn, GRID_CITIES, VANTA_BAY } from './map.js';
import { CITIES, SW } from './world.js';
import { Batch, unitBox } from './props.js';

export const WALKWAY_WIDTH = 4.2;
export const LOBBY_SIZE = 22;
const byRoad = new Map();
const roadsById = new Map(VANTA_BAY.roads.map(road => [road.id, road]));
export const WALKWAYS = ['', ...GRID_CITIES.map(city => city.p + '-')].flatMap(prefix => {
  const deck = roadsById.get(prefix + 'sky-deck'), crown = roadsById.get(prefix + 'crown-way');
  return [[deck, 57 - deck.a.z], [crown, crown.path.length - 116]].flatMap(([road, s]) => {
    const f = frameOn(road.path, s);
    const records = [-1, 1].map(side => {
      const gate = road.halfWidth + SW - 0.22, face = 21.5;
      const point = offset => ({ x: f.x + side * f.rx * offset, y: f.y, z: f.z + side * f.rz * offset });
      return {
        road, s, side, frame: f, gate, face,
        entry: point(gate), door: point(face), tower: point(face + LOBBY_SIZE / 2),
        height: road.level === 2 ? 197 : 88,
      };
    });
    byRoad.set(road, records);
    return records;
  });
});

export function atWalkway(road, distance) {
  return byRoad.get(road)?.some(walkway => Math.abs(walkway.s - distance) < WALKWAY_WIDTH / 2) ?? false;
}

export function addWalkway(walkway, metal, emit) {
  const { frame: f, gate, face, side, road } = walkway;
  const span = face - gate, mid = (face + gate) / 2;
  const color = CITIES.find(city => city.name === road.city).neon[1];
  const put = (batch, lateral, along, y, size, ink) =>
    batch.add([f.x + f.rx * lateral * side + Math.sin(f.th) * along, f.y + y,
      f.z + f.rz * lateral * side + Math.cos(f.th) * along], size, f.th, ink, [0, 0]);
  put(metal, mid, 0, -0.58, [span + 0.12, 0.62, WALKWAY_WIDTH], [47, 48, 66]);
  for (const end of [-1, 1]) {
    const along = end * (WALKWAY_WIDTH / 2 - 0.09);
    put(metal, mid, along, 0.04, [span, 0.15, 0.17], [52, 57, 73]);
    put(emit, mid, along, 0.93, [span, 0.12, 0.11], color);
    for (let d = gate + 0.25; d < face; d += 2.5)
      put(metal, d, along, 0.06, [0.13, 0.94, 0.14], [58, 59, 77]);
    put(emit, face - 0.03, end * 1.52, 0.13, [0.15, 3.3, 0.15], color);
  }
  put(metal, face - 0.09, 0, 0.06, [0.23, 3.25, 3.02], [13, 18, 30]);
  put(emit, face - 0.16, 0, 3.22, [0.19, 0.17, 3.24], color);
  for (let i = -2; i <= 2; i++)
    put(emit, face - 0.22, i * 0.21, 3.62, [0.13, 0.14, 0.12], color);
}
