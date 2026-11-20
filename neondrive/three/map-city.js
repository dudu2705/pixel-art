import * as THREE from './vendor/three.module.js';
import { City, ROAD_LAYER } from './city.js';
import { Batch, unitBox, unitCyl, unitSphere, unitPlane, unitPlaneFlat } from './props.js';
import { VANTA_BAY, frameOn, PLAZA_RADIUS, DECK_COVER, RAMP_BORE_HALF_WIDTH, CROWN_HELIX, BRIDGE, GRID_CITIES, LINKS } from './map.js';
import { FONT } from './cockpit.js';
import { blocks, CITIES, zoneAt, D, SW, SEGL, mulberry, mix } from './world.js';

const CELL = 96;
const VIEW_CELLS = 4;
const { roads, nodes } = VANTA_BAY;
const district = CITIES.findIndex(city => city.name === 'VANTA BAY');
const palette = CITIES[district].neon;
const styles = [D.DOWNTOWN, D.SPIRES, D.ARCADE, D.MARKET, D.STACK];
const templatesFor = name => { const ci = CITIES.findIndex(c => c.name === name);
  return styles.map(style => blocks.filter(b => b.style === style && zoneAt(b.start)[3] === ci)); };
const templates = templatesFor('VANTA BAY'), cityTemplates = new Map();
const cityLook = name => { if (!cityTemplates.has(name)) cityTemplates.set(name, { set: templatesFor(name), pal: CITIES.find(c => c.name === name).neon }); return cityTemplates.get(name); };
const cellKey = (x, z) => Math.floor(x / CELL) + '/' + Math.floor(z / CELL);
const BORE_HEIGHT = 6.5;
const roadSamples = roads.flatMap(road => Array.from({ length: Math.ceil(road.path.length / 4) + 1 }, (_, i) => {
  const distance = Math.min(i * 4, road.path.length);
  return { ...frameOn(road.path, distance), road, distance };
}));
const linkTerrain = (district, expression) => LINKS.filter(link => link.district === district).map(link => `
    if (p.x > ${link.x0}.0 && p.x < ${link.x1}.0) {
      vec3 terrain = ${expression};
      color = mix(color, terrain, smoothstep(${link.x0}.0, ${link.x0 + 70}.0, p.x)
        * (1.0 - smoothstep(${link.x1 - 70}.0, ${link.x1}.0, p.x)));
    }`).join('');

function makeBuildings() {
  const random = mulberry(41283);
  const models = [];
  const lot = (x, z, sx, sz, h, style, rot = 0, cityName = null) => {
    const { set, pal } = cityName ? cityLook(cityName) : { set: templates, pal: palette };
    const collection = set[style]?.length ? set[style] : templates[style] ?? templates[0];
    const fallback = collection.length ? collection : blocks.filter(b => b.style === styles[style]);
    const source = fallback[Math.floor(random() * fallback.length)];
    const clearance = Math.hypot(sx, sz) / 2;
    if (roadSamples.some(f => (f.road.bore || f.road.id.startsWith('street-') || f.road.helix || f.road.level === 2 || f.road.city !== 'VANTA BAY') &&
      Math.hypot(f.x - x, f.z - z) < clearance + f.road.halfWidth + SW + 2)) return;
    const ratio = sz / (source.len * SEGL);
    const bbs = source.bbs.filter(b => b.v1 < h).map(b => ({ ...b, u0: b.u0 * ratio, u1: b.u1 * ratio }));
    if (style === 2 && h > 27) bbs.push({ u0: 2, u1: Math.min(sz - 2, 21), v0: 13, v1: 24, kind: 4,
      seed: Math.floor(random() * 100000), c1: pal[1], c2: pal[0] });
    models.push({ ...source, id: models.length, start: models.length * 19, len: sz / SEGL, h, bbs, x, z, sx, sz, rot,
      crown: h > 54 ? pal[models.length % pal.length] : source.crown });
  };

  // Four blocks around the open plaza. Keep the lots closest to the plaza low.
  for (const [dx, dz, style] of [[-1, 1, 3], [1, 1, 1], [-1, -1, 0], [1, -1, 2]]) {
    for (const x of [36, 66, 99]) for (const z of [36, 72, 92]) {
      if (Math.hypot(x, z) < 66) continue;
      const height = 23 + random() * (x > 80 ? 55 : 30) + z * 0.14;
      lot(x * dx, z * dz, 16 + random() * 10, 15 + random() * 8, height, style, z === 36 ? Math.PI / 2 : 0);
    }
  }
  // Street walls approach the plaza and then open out around the monument.
  for (const side of [-1, 1]) {
    for (let x = -308; x < -145; x += 27) {
      lot(x, side * (30 + random() * 5), 20, 19 + random() * 5, 29 + random() * 44, x < -220 ? 0 : 2, Math.PI / 2);
    }
    for (let x = 153; x < 239; x += 30) {
      lot(x, side * (31 + random() * 7), 19, 19 + random() * 7, 31 + random() * 50, 0, Math.PI / 2);
    }
  }

  // A second, taller line of towers gives the plaza and deck a distant skyline.
  for (let i = 0; i < 64; i++) {
    const angle = i * 2 * Math.PI / 64, r = 189 + random() * 115;
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    if (Math.abs(z) < 49 || (x > 110 && z > 105)) continue;
    lot(x, z, 16 + random() * 18, 20 + random() * 18, 49 + random() * 108, i % 5 === 0 ? 0 : 1, -angle);
  }
  for (let x = -59; x <= 104; x += 29) {
    lot(x, 211 + random() * 22, 17, 19, 75 + random() * 55, 1);
    lot(x - 23, -197 - random() * 22, 17, 19, 63 + random() * 75, 1);
  }
  lot(210, 193, 33, 33, 76, 1);
  lot(210, -193, 33, 33, 80, 1);
  lot(164, 291, 25, 29, 69, 1);
  lot(191, 319, 30, 27, 81, 1);
  lot(164, -282, 24, 27, 73, 1);
  // the Crown: the helix winds round one 280 m tower, and Crown Way runs between the upper storeys of a band of
  // 150-250 m towers north of the city (the road clears them by the same margin every lot keeps)
  lot(CROWN_HELIX.cx, CROWN_HELIX.cz, 58, 58, 280, 1);
  for (let x = -250; x <= 40; x += 31) for (const side of [-1, 1])
    lot(x + random() * 6, 480 + side * (30 + random() * 6), 22 + random() * 6, 22 + random() * 6, 150 + random() * 100, x % 2 ? 1 : 0);
  for (let z = 360; z <= 450; z += 32) for (const side of [-1, 1])
    lot(128 + side * (31 + random() * 5), z, 22, 22 + random() * 6, 150 + random() * 90, 1);
  // the grid cities: blocks filled on a 30 m grid (lots too near a street drop out by the clearance rule), low along
  // the avenue, spires toward the east, a landmark block where there is one, and a skyline ring round each
  for (const c of GRID_CITIES) {
    const E = c.elevator;
    for (let x = c.x0 - 40; x <= c.x1 + 40; x += 30) for (let z = c.z0 - 40; z <= c.z1 + 40; z += 30) {
      if (E && Math.hypot(x - E.x, z - E.z) < 42) continue;
      const east = (x - c.x0) / (c.x1 - c.x0), nearAvenue = Math.abs(z) < 45;
      const h = nearAvenue ? 22 + random() * 20 : 34 + random() * 50 + east * 70;
      lot(x + (random() - 0.5) * 4, z + (random() - 0.5) * 4, 19 + random() * 5, 19 + random() * 5, h, east > 0.6 ? 1 : random() < 0.5 ? 0 : 2, 0, c.name);
    }
    if (E) lot(E.x, E.z, 36, 36, 64, 1, 0, c.name);
    for (let i = 0; i < 48; i++) {
      const a = i * 2 * Math.PI / 48, r = 260 + random() * 110, x = c.xm + Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(z) < 60 && (x < c.x0 || x > c.x1)) continue;       // keep the roads in and out clear
      lot(x, z, 18 + random() * 16, 18 + random() * 16, 60 + random() * 120, 1, -a, c.name);
    }
  }
  return models;
}

const groundVertex = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }`;
const groundFragment = /* glsl */`
  varying vec3 vWorld;
  uniform vec3 uFog;
  uniform float uFogNear, uFogFar, uTime;
  void main() {
    vec2 p = vWorld.xz;
    float r = length(p);
    vec3 color = vec3(16, 13, 24);
    if (p.x > ${GRID_CITIES[1].x1 + 60}.0 && p.x < ${GRID_CITIES[2].gate - 40}.0) {   // the sea floor round the aqua tube
      float caustic = sin(p.x * 0.31 + uTime * 1.3) * sin(p.y * 0.27 - uTime * 1.1);
      color = vec3(18, 46, 52) + vec3(20, 60, 60) * max(0.0, caustic) * 0.5;
    }
    if (p.x > ${BRIDGE.x0 + 40}.0 && p.x < ${BRIDGE.x1 - 40}.0) {          // the bay under the skybridge
      float ripple = sin(p.x * 0.21 + p.y * 0.07 + uTime * 0.9) * sin(p.y * 0.17 - uTime * 0.6);
      color = vec3(6, 12, 28) + vec3(10, 18, 34) * max(0.0, ripple) * 0.6;
    }
    float water = sin(p.x * 0.12 + p.y * 0.23 - uTime * 0.9) * sin(p.x * 0.31 - p.y * 0.13 + uTime * 0.6);
    ${linkTerrain(D.FERRY, 'vec3(6, 12, 27) + vec3(17, 23, 39) * smoothstep(0.15, 0.95, water)')}
    if (r < ${PLAZA_RADIUS - 5}.0) {
      vec2 tile = abs(fract(p / 2.5) - 0.5);
      bool grout = max(tile.x, tile.y) > 0.47;
      color = grout ? vec3(26, 22, 38) : vec3(41, 33, 53);
      if (abs(r - 34.0) < 0.22 || abs(r - 27.0) < 0.15) color = vec3(36, 145, 180);
      if (r < 16.0) color = vec3(17, 29, 47);
    }
    float fog = smoothstep(uFogNear, uFogFar, max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z)) * 0.97;
    gl_FragColor = vec4(mix(color / 255.0, uFog, fog), 1.0);
  }`;

function roadGeometry(road, from, to, lift = 0) {
  const position = [], uv = [], lat = [], index = [];
  const h = road.halfWidth, columns = [-h - SW, -h, 0, h, h + SW];
  const rows = Math.ceil((to - from) / 2.5);
  for (let i = 0; i <= rows; i++) {
    const dist = from + i / rows * (to - from);
    const f = frameOn(road.path, dist);
    const shoulder = THREE.MathUtils.smoothstep(distanceToFork(road, dist), 28, 38);
    for (const x of columns) {
      const east = f.rx * x > 0;
      const offset = Math.sign(x) * (Math.min(Math.abs(x), h) + Math.max(0, Math.abs(x) - h) * (road.bore || east ? shoulder : 1));
      position.push(f.x + f.rx * offset, f.y + 0.045 + lift, f.z + f.rz * offset);
      lat.push(x);
      uv.push(0, dist / SEGL);
    }
    if (!i) continue;
    for (let j = 0; j < columns.length - 1; j++) {
      const a = (i - 1) * columns.length + j, b = a + 1, c = a + columns.length, d = c + 1;
      index.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('lat', new THREE.Float32BufferAttribute(lat, 1));
  g.setIndex(index);
  return g;
}

function addBore(road, from, to, walls, ceiling, siding) {
  const { mode } = road.bore, halfWidth = RAMP_BORE_HALF_WIDTH;
  for (let d = from; d < to; d += SEGL) {
    const end = Math.min(d + SEGL, to);
    const a = frameOn(road.path, d), b = frameOn(road.path, end);
    const slope = b.y - a.y, y = (a.y + b.y) * 0.5;
    for (const lat of [-halfWidth, halfWidth]) {
      const x0 = a.x + a.rx * lat, z0 = a.z + a.rz * lat;
      const x1 = b.x + b.rx * lat, z1 = b.z + b.rz * lat;
      walls.add([(x0 + x1) / 2, y + BORE_HEIGHT / 2, (z0 + z1) / 2],
        [Math.hypot(x1 - x0, z1 - z0) + 0.055, BORE_HEIGHT + 0.06, 1],
        Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2, [255, 255, 255], [mode, 0, d, slope]);
      const outer = Math.sign(lat) * 0.18;
      siding.add([(x0 + x1) / 2 + (a.rx + b.rx) * outer / 2, y + BORE_HEIGHT / 2,
        (z0 + z1) / 2 + (a.rz + b.rz) * outer / 2],
      [Math.hypot(x1 - x0, z1 - z0) + 0.12, BORE_HEIGHT + 0.12, 1],
      Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2, [38, 34, 50], [0, 0, d, slope]);
    }
    ceiling.add([(a.x + b.x) / 2, y + BORE_HEIGHT, (a.z + b.z) / 2],
      [2 * halfWidth + 0.25, 1, Math.hypot(b.x - a.x, b.z - a.z) + 0.14],
      Math.atan2(b.x - a.x, b.z - a.z), [255, 255, 255], [mode, 1, d, slope]);
  }
}

function addPortal(road, f, entrance, metal, emit) {
  const width = RAMP_BORE_HALF_WIDTH, up = road.bore.mode === 1;
  const accent = up ? [80, 255, 150] : [255, 170, 60];
  const put = (batch, lateral, height, size, color) =>
    batch.add([f.x + f.rx * lateral, f.y + height, f.z + f.rz * lateral], size, f.th, color, [0, 0]);
  for (const lateral of [-width, width])
    put(emit, lateral, 0, [0.28, BORE_HEIGHT + 0.28, 0.32], accent);
  put(emit, 0, BORE_HEIGHT, [2 * width, 0.28, 0.32], accent);
  if (!entrance) return;
  put(metal, 0, BORE_HEIGHT + 0.28, [2 * width + 0.6, 1.4, 0.34], [24, 23, 34]);
  const label = up ? 'TO LEVEL 2' : 'TO LEVEL 1';
  addMapLabel(label, BORE_HEIGHT + 0.48, 0.22, (lateral, y, size) => put(emit, lateral, y, size, accent));
}

function addMapLabel(label, height, pixel, put) {
  for (let i = 0; i < label.length; i++) {
    const glyph = FONT[label[i]];
    for (let bit = 0; bit < glyph.length; bit++) {
      if (glyph[bit] !== '1') continue;
      const lateral = (i * 4 + bit % 3 - (label.length * 4 - 2) / 2) * pixel;
      put(lateral, height + (4 - Math.floor(bit / 3)) * pixel, [pixel, pixel, 0.43]);
    }
  }
}

function addExitSign(f, up, metal, emit) {
  const span = 8.4, side = up ? -1 : 1;
  const accent = up ? [80, 255, 150] : [255, 170, 60];
  const put = (batch, lateral, height, size, color) =>
    batch.add([f.x + f.rx * (lateral + side * 4.4), f.y + height, f.z + f.rz * (lateral + side * 4.4)], size, f.th, color, [0, 0]);
  put(metal, side * span / 2, 0, [0.25, 6.3, 0.25], [30, 27, 39]);
  put(metal, 0, 5.8, [span, 1.42, 0.34], [18, 20, 28]);
  put(emit, 0, 5.78, [span, 0.08, 0.43], accent);
  addMapLabel(up ? 'SKY AVENUES' : 'STREET', 6.03, 0.15, (lateral, y, size) => put(emit, lateral, y, size, accent));
}

// East-side rails and columns stop at the fork and merge openings.
function rampOpening(road, distance, x) {
  return x > DECK_COVER.x && distanceToFork(road, distance) < 34;
}

function distanceToFork(road, distance) {
  return Math.min(road.a.ramp ? distance : Infinity, road.b.ramp ? road.path.length - distance : Infinity);
}

export class MapCity extends City {
  constructor(scene) {
    const buildings = makeBuildings();
    super(scene, buildings);
    this.uniforms.uMapBikeHeight = { value: 0 };
    this.cells = new Map();
    this.groundMat = new THREE.ShaderMaterial({
      vertexShader: groundVertex, fragmentShader: groundFragment, uniforms: this.uniforms,
    });
    this.materials = new Map();
    for (const building of buildings) this.cell(building.x, building.z).buildings.push(building);
    for (const road of roads) {
      for (let d = 0; d < road.path.length; d += 32) {
        const end = Math.min(d + 32, road.path.length);
        const f = frameOn(road.path, (d + end) / 2);
        this.cell(f.x, f.z).roads.push({ road, from: d, to: end });
      }
      for (let d = 14; d < road.path.length - 13; d += 27) {
        const f = frameOn(road.path, d);
        this.cell(f.x, f.z).lamps.push({ road, f, d });
      }
    }
    for (const node of Object.values(nodes)) this.cell(node.x, node.z).junctions.push(node);
    this.cell(0, 0).plaza = true;
  }

  cell(x, z) {
    const key = cellKey(x, z);
    if (!this.cells.has(key)) this.cells.set(key, { roads: [], buildings: [], lamps: [], junctions: [], plaza: false });
    return this.cells.get(key);
  }

  roadMaterial(road) {
    const key = road?.id ?? 'junction';
    if (!this.materials.has(key)) {
      const base = road?.level >= 1 ? this.glassMat : this.roadMat;
      const material = base.clone();
      material.uniforms = { ...base.uniforms,
        uRW: { value: road?.halfWidth ?? 7 },
        uMapMode: { value: road ? (road.oneWay ? 2 : 1) : 3 },
        uMapLength: { value: road?.path.length ?? 0 },
        uMapDistrict: { value: road?.link?.district ?? -1 },
        uMapDeck: { value: new THREE.Vector4(DECK_COVER.x, DECK_COVER.halfWidth, DECK_COVER.south, DECK_COVER.north) },
        uMapContinuous: { value: road?.level >= 1 ? 1 : 0 },
        // where each end's zebra starts, measured from the junction centre: just outside its disc
        uMapZebra: { value: new THREE.Vector2(road?.a.discR ? road.a.discR + 0.3 : 8, road?.b.discR ? road.b.discR + 0.3 : 8) },
        uMapFork: { value: new THREE.Vector3(Number(Boolean(road?.a.ramp)), Number(Boolean(road?.b.ramp)), Number(Boolean(road?.bore))) },
      };
      this.materials.set(key, material);
    }
    return this.materials.get(key);
  }

  buildingMesh(buildings) {
    const attributes = { iPos: [], iSize: [], iRot: [], iWall: [] };
    for (const b of buildings) {
      attributes.iPos.push(b.x, 0, b.z);
      attributes.iSize.push(b.sx, b.h, b.sz);
      attributes.iRot.push(b.rot);
      attributes.iWall.push(b.id, b.sz / 2, b.x > 0 ? 1 : -1);
    }
    return this.buildBuildingMesh(Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, new Float32Array(value)])));
  }

  buildCell(key) {
    const group = new THREE.Group(), cell = this.cells.get(key);
    const [x, z] = key.split('/').map(Number);
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2), this.groundMat);
    terrain.position.set((x + 0.5) * CELL, -0.06, (z + 0.5) * CELL);
    group.add(terrain);
    if (cell?.buildings.length) group.add(this.buildingMesh(cell.buildings));
    for (const { road, from, to } of cell?.roads ?? []) {
      const mesh = new THREE.Mesh(roadGeometry(road, from, to, road.bore ? 0.018 : 0), this.roadMaterial(road));
      mesh.layers.set(ROAD_LAYER);
      if (road.level >= 1) mesh.renderOrder = 2;
      group.add(mesh);
    }
    for (const node of cell?.junctions ?? []) {
      if (node.ramp) continue;
      const g = new THREE.CircleGeometry(node.discR, 32).rotateX(-Math.PI / 2);
      const p = g.getAttribute('position');
      const lat = new Float32Array(p.count), uv = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) {
        lat[i] = p.getX(i);
        uv[i * 2 + 1] = p.getZ(i) / SEGL;
      }
      g.setAttribute('lat', new THREE.BufferAttribute(lat, 1));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      const mesh = new THREE.Mesh(g, this.roadMaterial());
      mesh.position.set(node.x, node.y + 0.058, node.z);
      mesh.layers.set(ROAD_LAYER);
      group.add(mesh);
    }
    if (cell) {
      const metal = new Batch(unitBox), emit = new Batch(unitBox), rails = new Batch(unitPlane);
      const walls = new Batch(unitPlane), ceiling = new Batch(unitPlaneFlat), siding = new Batch(unitPlane);
      for (const { road, from, to } of cell.roads) {
        if (road.id === 'street-north-approach' || road.id === 'sky-deck') {
          const up = road.id === 'street-north-approach', d = up ? road.path.length - 43 : 43;
          if (d >= from && d < to) {
            const f = frameOn(road.path, d);
            if (!up) {
              f.th += Math.PI;
              f.rx *= -1;
              f.rz *= -1;
            }
            addExitSign(f, up, metal, emit);
          }
        }
        if (road.bore) {
          const start = Math.max(from, road.bore.from), end = Math.min(to, road.bore.to);
          if (start < end) addBore(road, start, end, walls, ceiling, siding);
          if (road.bore.from >= from && road.bore.from < to)
            addPortal(road, frameOn(road.path, road.bore.from), true, metal, emit);
          if (road.bore.to >= from && road.bore.to < to)
            addPortal(road, frameOn(road.path, road.bore.to), false, metal, emit);
        } else if (!(road.level >= 1 || road.helix || road.bridge)) continue;
        const rows = Math.ceil((to - from) / 2.5);
        for (let i = 0; i < rows; i++) {
          const a = from + i / rows * (to - from), b = from + (i + 1) / rows * (to - from);
          const mid = (a + b) / 2;
          if (road.bore && mid >= road.bore.from && mid <= road.bore.to) continue;
          const first = frameOn(road.path, a), last = frameOn(road.path, b);
          for (const sign of [-1, 1]) {
            const lat = sign * (road.halfWidth + SW - 0.1);
            const x0 = first.x + first.rx * lat, z0 = first.z + first.rz * lat;
            const x1 = last.x + last.rx * lat, z1 = last.z + last.rz * lat;
            if (road.bore && distanceToFork(road, mid) < (x0 > first.x ? 21 : 35)) continue;
            if (!road.bore && rampOpening(road, mid, x0)) continue;
            const yaw = Math.atan2(x1 - x0, z1 - z0);
            const span = Math.hypot(x1 - x0, z1 - z0);
            rails.add([(x0 + x1) / 2, (first.y + last.y) / 2 + 0.58, (z0 + z1) / 2],
              [span + 0.05, 1.08, 1], yaw + Math.PI / 2, [255, 255, 255], [0, 0, span, last.y - first.y]);
          }
        }
      }
      for (const { f, road, d } of cell.lamps) {
        if (road.tube && d > road.tube.from - 8 && d < road.tube.to + 8) continue;   // no street lamps inside the glass
        if (road.link?.district === D.FERRY) continue;
        const put = (layer, lat, y, size, color, meta) => layer.add(
          [f.x + f.rx * lat, f.y + y, f.z + f.rz * lat], size, f.th, color, meta);
        const insideBore = road.bore && d >= road.bore.from && d <= road.bore.to;
        if (insideBore) {
          const color = road.bore.mode === 1 ? [90, 255, 170] : [255, 170, 80];
          put(emit, 0, BORE_HEIGHT - 0.12, [0.01, 0.01, 0.01], color, [0, 0.35, 2.2, 40]);
        }
        const pal = CITIES.find(c => c.name === (road.link?.b ?? road.city))?.neon ?? palette;
        for (const side of [-1, 1]) {
          const edge = road.halfWidth + 0.9, color = Math.floor(d / 27) % 3 === 0 ? pal[0] : pal[1];
          const brace = side * (road.halfWidth + SW - 0.18);
          const x = f.x + f.rx * brace, z = f.z + f.rz * brace;
          if (road.bore ? d < 36 || road.path.length - d < 36 : rampOpening(road, d, x)) continue;
          if (!insideBore) {
            put(metal, side * edge, 0, [0.18, 7, 0.18], [24, 20, 36], [0, 0]);
            put(metal, side * (edge - 1.1), 7, [2.2, 0.2, 0.2], [24, 20, 36], [0, 0]);
            put(emit, side * (edge - 2.1), 6.78, [1, 0.22, 0.4], mix(color, [255, 255, 255], 0.5), [0, 0]);
            put(emit, side * (edge - 2.1), 6.78, [0.01, 0.01, 0.01], color, [0, 0.55, 1.8, 28]);
          }
          if (f.y > 2 && !roadSamples.some(other => other.y < f.y - 1 &&
            (other.road !== road || Math.abs(other.distance - d) > 18) &&
            Math.hypot(other.x - x, other.z - z) < other.road.halfWidth + 2)) {
            put(metal, brace, -f.y, [1.2, f.y, 1.2], [34, 32, 44], [0, 0]);
          }
          if (road.level >= 1 || road.helix || road.bridge) {
            put(metal, brace * 0.86, -1.0, [2.8, 1.0, 1.35], [35, 32, 47], [0, 0]);
            put(emit, brace * 0.87, -1.1, [0.85, 0.12, 1.7], [188, 167, 236], [0, 0, 0, 0]);
          }
        }
        if ((road.level >= 1 || road.helix || road.bridge) && !rampOpening(road, d, DECK_COVER.x + 1))
          put(metal, 0, -0.75, [2 * (road.halfWidth + SW), 0.75, 1.25], [28, 25, 39], [0, 0]);
      }
      for (const b of cell.buildings) {
        if (b.h < 48) continue;
        metal.add([b.x, b.h, b.z], [0.25, 4.8, 0.25], b.rot, [40, 38, 52], [0, 0]);
        emit.add([b.x, b.h + 4.8, b.z], [0.28, 0.3, 0.28], b.rot, [255, 50, 80], [0, 0.55, 1.4, 24]);
      }
      for (const mesh of [metal.build(this.mats.metal), emit.build(this.mats.emit), rails.build(this.mats.rail),
        walls.build(this.mats.tunnel), ceiling.build(this.mats.tunnel), siding.build(this.mats.track)]) if (mesh) group.add(mesh);
      if (cell.plaza) group.add(this.makeMonument());
    }
    this.scene.add(group);
    return group;
  }

  makeMonument() {
    const group = new THREE.Group();
    const base = new Batch(unitCyl), lights = new Batch(unitSphere);
    base.add([0, 0, 0], [28, 0.7, 28], 0, [24, 30, 48], [0, 0]);
    base.add([0, 0.6, 0], [22, 0.55, 22], 0, [30, 39, 64], [0, 0]);
    base.add([0, 0.9, 0], [6, 2.2, 6], 0, [28, 25, 56], [0, 0]);
    for (let i = 0; i < 20; i++) {
      const a = i * Math.PI / 10;
      lights.add([13.5 * Math.cos(a), 0.92, 13.5 * Math.sin(a)], [0.44, 0.44, 0.44],
        0, palette[i % 2], [i, 0.46, 1.4, 32]);
    }
    for (const [batch, material] of [[base, this.mats.metal], [lights, this.mats.emit]]) {
      const mesh = batch.build(material);
      if (mesh) group.add(mesh);
    }
    // The fountain's rings float above the stone basin.
    const glow = this.monumentGlow ??= new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vPosition; varying vec2 vUv; uniform float uTime;
        void main(){ vPosition=position; vUv=uv; vec3 p=position; p.y += sin(uTime * 1.6 + position.z * 0.45) * 0.3;
        gl_Position=projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
      fragmentShader: `varying vec3 vPosition; varying vec2 vUv; uniform float uTime;
        void main(){ float pulse = 0.65 + 0.35 * sin(vUv.x * 50.0 - uTime * 4.0);
        vec3 cyan=vec3(0.12,0.9,1.0), pink=vec3(1.0,0.22,0.76);
        float glass = abs(vPosition.y) > 1.0 ? 0.24 : 1.0;
        gl_FragColor=vec4(mix(cyan,pink,0.25+0.25*sin(vPosition.z + uTime)),pulse * glass); }`,
    });
    const form = new THREE.OctahedronGeometry(1, 0).scale(3.9, 7.7, 3.9).rotateY(Math.PI / 4);
    const prism = new THREE.Mesh(form, glow);
    prism.position.y = 12.5;
    group.add(prism);
    for (const [radius, height] of [[11.7, 2], [9.4, 5], [7, 8.4], [5.6, 11.6], [5.2, 15], [3.2, 19.2]]) {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.09, 5, 80).rotateX(Math.PI / 2), glow);
      mesh.position.y = height;
      group.add(mesh);
    }
    return group;
  }

  update(_, camera, time) {
    this.uniforms.uCam.value.copy(camera);
    this.uniforms.uTime.value = time;
    const cx = Math.floor(camera.x / CELL), cz = Math.floor(camera.z / CELL), next = new Set();
    for (let x = cx - VIEW_CELLS; x <= cx + VIEW_CELLS; x++) {
      for (let z = cz - VIEW_CELLS; z <= cz + VIEW_CELLS; z++) {
        if (Math.hypot(x - cx, z - cz) > VIEW_CELLS + 0.6) continue;
        const key = x + '/' + z;
        next.add(key);
        if (!this.live.has(key)) this.live.set(key, this.buildCell(key));
      }
    }
    for (const key of this.live.keys()) if (!next.has(key)) this.dropChunk(key);
  }
}
