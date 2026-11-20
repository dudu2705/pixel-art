import * as THREE from './vendor/three.module.js';
import { City, ROAD_LAYER } from './city.js';
import { Batch, unitBox, unitCyl, unitSphere, unitPlane } from './props.js';
import { VANTA_BAY, frameOn, PLAZA_RADIUS } from './map.js';
import { blocks, CITIES, zoneAt, D, SW, SEGL, mulberry, mix } from './world.js';

const CELL = 96;
const VIEW_CELLS = 4;
const { roads, nodes } = VANTA_BAY;
const district = CITIES.findIndex(city => city.name === 'VANTA BAY');
const palette = CITIES[district].neon;
const styles = [D.DOWNTOWN, D.SPIRES, D.ARCADE, D.MARKET, D.STACK];
const templates = styles.map(style => blocks.filter(b => b.style === style && zoneAt(b.start)[3] === district));
const cellKey = (x, z) => Math.floor(x / CELL) + '/' + Math.floor(z / CELL);

function makeBuildings() {
  const random = mulberry(41283);
  const models = [];
  const lot = (x, z, sx, sz, h, style, rot = 0) => {
    const collection = templates[style] ?? templates[0];
    const fallback = collection.length ? collection : blocks.filter(b => b.style === styles[style]);
    const source = fallback[Math.floor(random() * fallback.length)];
    const ratio = sz / (source.len * SEGL);
    const bbs = source.bbs.filter(b => b.v1 < h).map(b => ({ ...b, u0: b.u0 * ratio, u1: b.u1 * ratio }));
    if (style === 2 && h > 27) bbs.push({ u0: 2, u1: Math.min(sz - 2, 21), v0: 13, v1: 24, kind: 4,
      seed: Math.floor(random() * 100000), c1: palette[1], c2: palette[0] });
    models.push({ ...source, id: models.length, start: models.length * 19, len: sz / SEGL, h, bbs, x, z, sx, sz, rot,
      crown: h > 54 ? palette[models.length % palette.length] : source.crown });
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
  uniform float uFogNear, uFogFar;
  void main() {
    vec2 p = vWorld.xz;
    float r = length(p);
    vec3 color = vec3(16, 13, 24);
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

function roadGeometry(road, from, to) {
  const position = [], uv = [], lat = [], index = [];
  const h = road.halfWidth, columns = [-h - SW, -h, 0, h, h + SW];
  const rows = Math.ceil((to - from) / 2.5);
  for (let i = 0; i <= rows; i++) {
    const dist = from + i / rows * (to - from);
    const f = frameOn(road.path, dist);
    for (const x of columns) {
      position.push(f.x + f.rx * x, f.y + 0.045, f.z + f.rz * x);
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

export class MapCity extends City {
  constructor(scene) {
    const buildings = makeBuildings();
    super(scene, buildings);
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
      const base = road?.elevated ? this.glassMat : this.roadMat;
      const material = base.clone();
      material.uniforms = { ...base.uniforms,
        uRW: { value: road?.halfWidth ?? 7 },
        uMapMode: { value: road ? (road.oneWay ? 2 : 1) : 3 },
        uMapLength: { value: road?.path.length ?? 0 },
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
      const mesh = new THREE.Mesh(roadGeometry(road, from, to), this.roadMaterial(road));
      mesh.layers.set(ROAD_LAYER);
      if (road.elevated) mesh.renderOrder = 2;
      group.add(mesh);
    }
    for (const node of cell?.junctions ?? []) {
      const g = new THREE.CircleGeometry(Math.max(node.trim + 1, node.halfWidth + 3.5), 32).rotateX(-Math.PI / 2);
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
      for (const { road, from, to } of cell.roads) {
        if (!road.elevated) continue;
        const rows = Math.ceil((to - from) / 2.5);
        for (let i = 0; i < rows; i++) {
          const a = from + i / rows * (to - from), b = from + (i + 1) / rows * (to - from);
          const first = frameOn(road.path, a), last = frameOn(road.path, b);
          for (const sign of [-1, 1]) {
            const lat = sign * (road.halfWidth + SW - 0.1);
            const x0 = first.x + first.rx * lat, z0 = first.z + first.rz * lat;
            const x1 = last.x + last.rx * lat, z1 = last.z + last.rz * lat;
            const yaw = Math.atan2(x1 - x0, z1 - z0);
            const span = Math.hypot(x1 - x0, z1 - z0);
            rails.add([(x0 + x1) / 2, (first.y + last.y) / 2 + 0.58, (z0 + z1) / 2],
              [span + 0.05, 1.08, 1], yaw + Math.PI / 2, [255, 255, 255], [0, 0, span, last.y - first.y]);
          }
        }
      }
      for (const { f, road, d } of cell.lamps) {
        const put = (layer, lat, y, size, color, meta) => layer.add(
          [f.x + f.rx * lat, f.y + y, f.z + f.rz * lat], size, f.th, color, meta);
        for (const side of [-1, 1]) {
          const edge = road.halfWidth + 0.9, color = Math.floor(d / 27) % 3 === 0 ? palette[0] : palette[1];
          put(metal, side * edge, 0, [0.18, 7, 0.18], [24, 20, 36], [0, 0]);
          put(metal, side * (edge - 1.1), 7, [2.2, 0.2, 0.2], [24, 20, 36], [0, 0]);
          put(emit, side * (edge - 2.1), 6.78, [1, 0.22, 0.4], mix(color, [255, 255, 255], 0.5), [0, 0]);
          put(emit, side * (edge - 2.1), 6.78, [0.01, 0.01, 0.01], color, [0, 0.55, 1.8, 28]);
          if (road.elevated && f.y > 2) {
            put(metal, side * (road.halfWidth + SW - 0.18), -f.y, [1.2, f.y, 1.2], [34, 32, 44], [0, 0]);
          }
        }
      }
      for (const b of cell.buildings) {
        if (b.h < 48) continue;
        metal.add([b.x, b.h, b.z], [0.25, 4.8, 0.25], b.rot, [40, 38, 52], [0, 0]);
        emit.add([b.x, b.h + 4.8, b.z], [0.28, 0.3, 0.28], b.rot, [255, 50, 80], [0, 0.55, 1.4, 24]);
      }
      for (const mesh of [metal.build(this.mats.metal), emit.build(this.mats.emit), rails.build(this.mats.rail)]) if (mesh) group.add(mesh);
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
