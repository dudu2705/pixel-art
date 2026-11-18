// city.js — streams the world into GPU meshes a chunk at a time.
// 46,290 segments / 7,885 blocks is far too much to hold as geometry, so we keep
// a window of chunks around the camera and build/drop them as it moves.

import * as THREE from './vendor/three.module.js';
import { SEGL, NSEG, LEN, RW, SW, blocks, SIDE, ELEV, LAYERED, BASE, zoneAt, D } from './world.js';
import { frameAt } from './road.js';
import { roadVert, roadFrag, floorVert, floorFrag } from './shaders.js';
import { facadeVert, facadeFrag } from './facade.glsl.js';
import { makeMaterials, markGlowing, buildProps } from './props.js';
import { buildDressing } from './dressing.js';
import { buildSignals } from './signals.js';

export const CHUNK = 64;                       // segments per chunk
export const NCHUNK = Math.ceil(NSEG / CHUNK);
const AHEAD = 22, BEHIND = 6;                  // chunks kept live

const NO_ROAD_EDGE = new Set([D.TUNNEL, D.TUBE, D.VAC]);

export class City {
  constructor(scene) {
    this.scene = scene;
    this.live = new Map();                     // chunkIndex -> { group, dispose() }
    this.uniforms = {
      uFog: { value: new THREE.Color(0.17, 0.06, 0.22) },
      uFogNear: { value: 60 },
      uFogFar: { value: 1400 },
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uRW: { value: RW },
      uSW: { value: SW },
      uReflect: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uWet: { value: 0 },
    };
    this.facadeMat = new THREE.ShaderMaterial({
      vertexShader: facadeVert, fragmentShader: facadeFrag,
      uniforms: this.uniforms, side: THREE.DoubleSide,
      extensions: { derivatives: true },
    });
    this.roadMat = new THREE.ShaderMaterial({
      vertexShader: roadVert, fragmentShader: roadFrag,
      uniforms: { ...this.uniforms, uGlass: { value: 0 } }, side: THREE.DoubleSide,
    });
    // levels 2 and 3 ride on a see-through deck, so they get their own material
    this.glassMat = new THREE.ShaderMaterial({
      vertexShader: roadVert, fragmentShader: roadFrag,
      uniforms: { ...this.uniforms, uGlass: { value: 1 } }, side: THREE.DoubleSide,
      transparent: true, depthWrite: false,
    });
    this.floorMat = new THREE.ShaderMaterial({
      vertexShader: floorVert, fragmentShader: floorFrag,
      uniforms: this.uniforms, side: THREE.DoubleSide,
    });
    this.box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);   // origin at base
    this.mats = markGlowing(makeMaterials(this.uniforms));
  }

  setFog(color, near, far) {
    this.uniforms.uFog.value.setRGB(color[0] / 255, color[1] / 255, color[2] / 255);
    this.uniforms.uFogNear.value = near;
    this.uniforms.uFogFar.value = far;
  }

  // ---------- road ribbon for one chunk ----------
  // Elevated stretches are built as a separate, transparent mesh: on levels 2
  // and 3 the original's deck is clear glass you see the city through.
  buildRoad(ci, wantElev) {
    const n0 = ci * CHUNK, n1 = Math.min(NSEG, n0 + CHUNK) + 1;
    const KERB = 0.28;
    const lats = [[-(RW + SW), KERB], [-RW, KERB], [-RW, 0], [-RW * 0.5, 0], [0, 0],
                  [RW * 0.5, 0], [RW, 0], [RW, KERB], [RW + SW, KERB]];
    const isElev = n => { const i = ((n % NSEG) + NSEG) % NSEG; return (LAYERED[i] ? ELEV[i] : 0) > 0.4; };
    const pos = [], uv = [], lat = [], idx = [];
    const f = {};
    let row = 0, prevRow = -1;
    for (let n = n0; n < n1; n++) {
      const here = isElev(n) === wantElev;
      const linkBack = here && prevRow >= 0;
      if (!here) { prevRow = -1; continue; }
      frameAt(n * SEGL, f);
      for (let li = 0; li < lats.length; li++) {
        const L = lats[li][0];
        pos.push(f.x + f.rx * L, f.y + 0.02 + lats[li][1], f.z + f.rz * L);
        uv.push(li / (lats.length - 1), n);
        lat.push(L);
      }
      if (linkBack) {
        for (let j = 0; j < lats.length - 1; j++) {
          const a = prevRow * lats.length + j, b = a + 1;
          const c = row * lats.length + j, d2 = c + 1;
          idx.push(a, c, b, b, c, d2);
        }
      }
      prevRow = row; row++;
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
    g.setAttribute('lat', new THREE.BufferAttribute(new Float32Array(lat), 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, wantElev ? this.glassMat : this.roadMat);
    if (wantElev) m.renderOrder = 2;
    return m;
  }

  // the dark city you look down on through the glass
  buildFloor(ci) {
    const n0 = ci * CHUNK, n1 = Math.min(NSEG, n0 + CHUNK);
    let any = false;
    for (let n = n0; n < n1; n++) {
      const i = ((n % NSEG) + NSEG) % NSEG;
      if ((LAYERED[i] ? ELEV[i] : 0) > 6) { any = true; break; }
    }
    if (!any) return null;
    const f = {}, pos = [], idx = [];
    const SPAN = 150;
    let row = 0;
    for (let n = n0; n <= n1; n += 4) {
      frameAt(n * SEGL, f);
      const i = ((n % NSEG) + NSEG) % NSEG;
      const y = BASE[i] - 0.5;
      pos.push(f.x + f.rx * -SPAN, y, f.z + f.rz * -SPAN);
      pos.push(f.x + f.rx * SPAN, y, f.z + f.rz * SPAN);
      if (row > 0) {
        const a = (row - 1) * 2, b = a + 1, c = row * 2, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      row++;
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, this.floorMat);
    m.renderOrder = -2;
    return m;
  }

  // ---------- buildings for one chunk ----------
  buildBlocks(ci) {
    const n0 = ci * CHUNK, n1 = Math.min(NSEG, n0 + CHUNK);
    const seen = new Set();
    const list = [];
    for (let side = 0; side < 2; side++) for (let n = n0; n < n1; n++) {
      const id = SIDE[side][n];
      if (id < 0) continue;
      const key = side * 1e7 + id;
      if (seen.has(key)) continue;
      seen.add(key);
      const B = blocks[id];
      if (B.start < n0 || B.start >= n1) continue;     // owned by the chunk its start falls in
      list.push({ B, side });
    }
    if (!list.length) return null;

    // A block can run 80m. Emitting it as one straight box makes it cut across
    // the road wherever the road curves under it, so each block is laid down in
    // short pieces that follow the centreline. iMeta.z carries how far along the
    // facade each piece starts, so the window grid runs on unbroken.
    const STEP = 3;                                     // segments per piece
    const pieces = [];
    for (const { B, side } of list) {
      const depth = 10 + (B.seed % 17);
      for (let a = 0; a < B.len; a += STEP) {
        const b = Math.min(B.len, a + STEP);
        pieces.push({ B, side, a, b, depth });
      }
    }
    const N = pieces.length;
    const iPos = new Float32Array(N * 3), iSize = new Float32Array(N * 3);
    const iRot = new Float32Array(N), iBase = new Float32Array(N * 3);
    const iCrown = new Float32Array(N * 3), iMeta = new Float32Array(N * 4);
    const iExtra = new Float32Array(N * 4), iShop = new Float32Array(N * 4);
    const pack = c => Math.round(Math.min(255, Math.max(0, c[0]))) * 65536
                    + Math.round(Math.min(255, Math.max(0, c[1]))) * 256
                    + Math.round(Math.min(255, Math.max(0, c[2])));
    const f = {};
    pieces.forEach(({ B, side, a, b, depth }, i) => {
      const mid = (B.start + (a + b) / 2) * SEGL;
      frameAt(mid, f);
      const sg = side ? 1 : -1;
      const off = RW + SW + B.set + depth / 2;
      const midSeg = ((Math.floor(mid / SEGL) % NSEG) + NSEG) % NSEG;
      const groundY = BASE[midSeg];
      iPos[i * 3] = f.x + f.rx * sg * off;
      iPos[i * 3 + 1] = groundY;
      iPos[i * 3 + 2] = f.z + f.rz * sg * off;
      iSize[i * 3] = depth;
      iSize[i * 3 + 1] = B.h;
      iSize[i * 3 + 2] = (b - a) * SEGL + 0.25;        // a touch of overlap hides the joins
      iRot[i] = f.th;
      iBase[i * 3] = B.base[0] / 255; iBase[i * 3 + 1] = B.base[1] / 255; iBase[i * 3 + 2] = B.base[2] / 255;
      if (B.crown) { iCrown[i * 3] = B.crown[0] / 255; iCrown[i * 3 + 1] = B.crown[1] / 255; iCrown[i * 3 + 2] = B.crown[2] / 255; }
      iMeta[i * 4] = B.seed % 1000;
      iMeta[i * 4 + 1] = B.winP;
      iMeta[i * 4 + 2] = a * SEGL;                      // u offset along the facade
      iMeta[i * 4 + 3] = B.h;
      iExtra[i * 4] = B.style;
      iExtra[i * 4 + 1] = B.dark ? 1 : 0;
      iExtra[i * 4 + 2] = B.id % 4096;
      iExtra[i * 4 + 3] = pack(B.lobby || [120, 120, 160]);
      iShop[i * 4] = pack(B.shop[0]);
      iShop[i * 4 + 1] = pack(B.shop[1]);
      iShop[i * 4 + 2] = pack(B.shop[2]);
      iShop[i * 4 + 3] = pack(B.avg);
    });

    const g = new THREE.InstancedBufferGeometry();
    g.index = this.box.index;
    g.attributes.position = this.box.attributes.position;
    g.attributes.normal = this.box.attributes.normal;
    g.attributes.uv = this.box.attributes.uv;
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 3));
    g.setAttribute('iRot', new THREE.InstancedBufferAttribute(iRot, 1));
    g.setAttribute('iBase', new THREE.InstancedBufferAttribute(iBase, 3));
    g.setAttribute('iCrown', new THREE.InstancedBufferAttribute(iCrown, 3));
    g.setAttribute('iMeta', new THREE.InstancedBufferAttribute(iMeta, 4));
    g.setAttribute('iExtra', new THREE.InstancedBufferAttribute(iExtra, 4));
    g.setAttribute('iShop', new THREE.InstancedBufferAttribute(iShop, 4));
    g.instanceCount = N;
    g.userData.sharedBase = true;
    const mesh = new THREE.Mesh(g, this.facadeMat);
    mesh.frustumCulled = false;
    return mesh;
  }

  buildChunk(ci) {
    const group = new THREE.Group();
    const floor = this.buildFloor(ci);
    if (floor) group.add(floor);
    for (const e of [false, true]) { const r = this.buildRoad(ci, e); if (r) group.add(r); }
    const b = this.buildBlocks(ci);
    if (b) group.add(b);
    const n0 = ci * CHUNK, n1 = Math.min(NSEG, n0 + CHUNK);
    for (const m of buildProps(n0, n1, this.mats)) group.add(m);
    for (const m of buildDressing(n0, n1, this.mats)) group.add(m);
    for (const m of buildSignals(n0, n1, this.mats)) group.add(m);
    this.scene.add(group);
    return group;
  }

  dropChunk(ci) {
    const g = this.live.get(ci);
    if (!g) return;
    this.scene.remove(g);
    g.traverse(o => {
      const geo = o.geometry;
      if (!geo) return;
      // every instanced chunk borrows its position/normal/uv/index from a shared
      // unit mesh. Disposing those would free the buffers every OTHER chunk is
      // still drawing from, so detach them and dispose only what this chunk owns.
      if (geo.userData.sharedBase) {
        geo.setIndex(null);
        delete geo.attributes.position;
        delete geo.attributes.normal;
        delete geo.attributes.uv;
      }
      geo.dispose();
    });
    this.live.delete(ci);
  }

  // keep the window of chunks centred on the camera's road distance
  update(camDist, camPos, time) {
    this.uniforms.uCam.value.copy(camPos);
    this.uniforms.uTime.value = time;
    const c0 = Math.floor(((camDist % LEN + LEN) % LEN) / SEGL / CHUNK);
    const want = new Set();
    for (let k = -BEHIND; k <= AHEAD; k++) want.add(((c0 + k) % NCHUNK + NCHUNK) % NCHUNK);
    for (const ci of this.live.keys()) if (!want.has(ci)) this.dropChunk(ci);
    let budget = 3;                                   // build a few per frame, never stall
    for (const ci of want) {
      if (this.live.has(ci)) continue;
      this.live.set(ci, this.buildChunk(ci));
      if (--budget <= 0) break;
    }
  }
}
