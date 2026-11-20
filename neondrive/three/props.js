// props.js — the things that make it Neon Drive rather than a box city:
// blade signs, billboards, street lamps and rooftop kit. All instanced, all
// built per chunk alongside the buildings.

import * as THREE from './vendor/three.module.js';
import { SEGL, NSEG, RW, SW, blocks, SIDE, ELEV, LAYERED, BASE, district, D, hash } from './world.js';
import { frameAt } from './road.js';
import { integerHash } from './shaders.js';

// ---------- shared glsl ----------
const COMMON = /* glsl */`
  float h21(vec2 p, float s) {
    p = fract(p * vec2(123.34, 456.21) + s * 0.017);
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
`;

// instanced, oriented, box-or-quad vertex shader shared by every prop
const PROP_VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec3 iSize;
  attribute float iRot;
  attribute vec3 iCol;
  attribute vec4 iMeta;        // seed, kind, flickerSeed, spare
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  void main() {
    vCol = iCol; vMeta = iMeta; vUv = uv; vNL = normal;
    vec3 p = position * iSize;
    float c = cos(iRot), s = sin(iRot);
    vec3 r = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z) + iPos;
    vWorld = r;
    gl_Position = projectionMatrix * viewMatrix * vec4(r, 1.0);
  }
`;

const fogTail = /* glsl */`
    float d = distance(vWorld, uCam);
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.97);
    gl_FragColor = vec4(col, 1.0);
`;

// blade sign: border, then a grid of fake glyphs, flickering
const SIGN_FRAG = /* glsl */`
  precision highp float;
  precision highp int;
  ${integerHash}
  out vec4 fragColor;
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    int seed = int(vMeta.x);
    bool dead = vMeta.y > 0.5;
    float flicker = dead ? (hsh(int(floor(uTime * 9.0)), seed, 6) < 0.06 ? 1.0 : 0.12)
                         : (hsh(int(floor(uTime * 7.0)), seed, 5) < 0.04 ? 0.25 : 1.0);
    float u = vMeta.w > 0.0 ? 1.0 - vUv.x : vUv.x;
    ivec2 grid = ivec2(5, int(vMeta.z));
    ivec2 cell = min(ivec2(vec2(u, 1.0 - vUv.y) * vec2(grid)), grid - 1);
    vec3 col = vCol * 0.65;
    if (abs(vNL.z) > 0.5 && cell.x > 0 && cell.x < grid.x - 1 && cell.y > 0 && cell.y < grid.y - 1) {
      int ch = (cell.y - 1) / 5, row = (cell.y - 1) % 5;
      bool on = row < 4 && hsh(ch, cell.x - 1 + row * 3, seed) < 0.55;
      col = on ? mix(vec3(30, 10, 30) / 255.0, vCol, flicker) : vec3(20, 8, 24) / 255.0;
    }
    float d = distance(vWorld, uCam);
    col = mix(col, vCol * 0.55, smoothstep(0.1, 0.3, fwidth(u)));
    fragColor = vec4(mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.97), 1.0);
  }
`;

// emissive: lamp heads, tail lights, anything that is just a glowing chip
const EMIT_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    vec3 col = vCol * (0.85 + vMeta.y * 0.5);
    float d = distance(vWorld, uCam);
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.9);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// dull structural metal: poles, arms, gantries
const METAL_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    vec3 col = vCol * (0.7 + 0.5 * max(0.0, dot(normalize(vNL), normalize(vec3(0.4, 0.8, 0.35)))));
    ${fogTail}
  }
`;


// the elevated road's barrier: a cyan top rail, posts every 2.5m, a mid rail,
// and clear air in between. The original's railTex returns TR = -1 for the gaps,
// which is why you can see the city below from levels 2 and 3.
const RAIL_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    float u = vUv.x * vMeta.z;        // metres along the road
    float v = vUv.y * 1.1;            // metres up the barrier
    vec3 col;
    if (v > 1.0) col = vec3(0.0, 0.82, 1.0) * 1.5;                 // the lit top rail
    else if (mod(u, 2.5) < 0.18 || (v > 0.5 && v < 0.62)) col = vec3(0.27, 0.27, 0.35);
    else discard;                                                   // clear
    float d = distance(vWorld, uCam);
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.97);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// speckled foliage: the holo trees, sakura, ruin canopy and coral
const FOLIAGE_FRAG = /* glsl */`
  precision highp float;
  ${COMMON}
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    float lit = step(0.25, h21(floor(vUv * 9.0), vMeta.x)) ;
    float up = smoothstep(-0.2, 0.6, normalize(vNL).y);
    vec3 col = mix(vCol * 0.32, vCol * 1.5, max(up, 1.0 - lit));
    ${fogTail}
  }
`;

// hanging cloth: laundry, awnings, banners
const CLOTH_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    vec3 col = vCol * (0.62 + 0.25 * sin(vUv.x * 12.0));
    if (vMeta.y > 0.5) {                       // striped awning
      col = mod(floor(vUv.x * 6.0), 2.0) < 0.5 ? vCol : vec3(0.94, 0.9, 0.86);
    }
    ${fogTail}
  }
`;

// falling water: the monsoon terraces
const WATER_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    float st = mod(vUv.y * 24.0 + uTime * 14.0 + sin(vUv.x * 22.0) * 2.0, 3.0);
    float k = st < 0.6 ? 1.0 : 0.6 + 0.15 * sin(vUv.x * 30.0);
    vec3 col = vec3(0.59, 0.82, 0.90) * k;
    ${fogTail}
  }
`;

// tunnel lining: tiles, grout, a cyan strip and lamp panels on the ceiling
const TUNNEL_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    float mode = vMeta.x;      // 0 plain bore, 1 climbing, 2 descending, 3 vactrain
    float kind = vMeta.y;      // 0 wall, 1 ceiling
    float u = vUv.x * vMeta.z, v = vUv.y * vMeta.w;
    bool up = mode < 1.5;
    vec3 accent = mode > 2.5 ? vec3(0.31, 0.86, 1.0)
                : up ? vec3(0.31, 1.0, 0.59) : vec3(1.0, 0.67, 0.24);
    vec3 col;

    if (mode > 2.5) {                                   // vactrain: a dark pipe with light rings
      if (kind > 0.5) col = mod(u, 28.0) < 0.8 ? accent * 1.6 : vec3(0.047, 0.055, 0.086);
      else col = mod(u, 28.0) < 0.8 ? accent * 1.5 : vec3(0.047, 0.055, 0.086);
    } else if (mode > 0.5) {                            // the level-change bore
      if (kind > 0.5) {
        float lamp = step(mod(u, 8.0), 2.5) * step(abs(vUv.y - 0.5), 0.09);
        col = lamp > 0.5 ? accent * 1.5 : vec3(0.12, 0.125, 0.17);
      } else {
        col = vec3(0.133, 0.141, 0.188);
        bool seam = mod(u, 3.0) < 0.1 || mod(v, 1.6) < 0.06;
        if (seam) col = vec3(0.078, 0.086, 0.118);
        if (v > 4.6 && v < 4.85) col = accent * 1.4;    // the guide stripe
        // chevrons pointing the way you are going, sliding along the wall
        if (v > 1.4 && v < 3.4) {
          float uu = mod(u, 6.0);
          float vv = (v - 2.4) * (up ? 1.0 : -1.0);
          if (abs(uu - 3.0 - abs(vv) * 1.2) < 0.35) {
            float k = mod(uTime * 3.0 - u * 0.3, 1.0) < 0.5 ? 1.0 : 0.35;
            col = accent * k * 1.3;
          }
        }
      }
    } else {                                            // the plain tiled underpass
      if (kind > 0.5) {
        float lamp = step(mod(u, 8.0), 2.5) * step(abs(vUv.y - 0.5), 0.09);
        col = lamp > 0.5 ? vec3(1.0, 0.77, 0.47) * 1.5 : vec3(0.17, 0.16, 0.21);
      } else {
        if (v > 4.55 && v < 4.85) col = vec3(0.0, 0.78, 1.0) * 1.4;
        else if (v < 0.8) col = mod(u + v * 1.5, 1.2) < 0.6 ? vec3(0.75, 0.59, 0.12) : vec3(0.08, 0.07, 0.09);
        else {
          bool grout = mod(v, 1.0) < 0.08 || mod(u, 2.0) < 0.08;
          col = grout ? vec3(0.14, 0.13, 0.17) : vec3(0.25, 0.235, 0.29);
        }
      }
    }
    ${fogTail}
  }
`;

// the aqua tube: sea outside the glass, ribs, and fish going past
const GLASS_FRAG = /* glsl */`
  precision highp float;
  ${COMMON}
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    float u = vUv.x * vMeta.z, v = vUv.y * vMeta.w;
    vec3 col;
    if (mod(u, 6.0) < 0.35) col = vec3(0.27, 0.33, 0.39);               // steel ribs
    else if (v > 4.4 && v < 4.65) col = vec3(0.0, 0.86, 1.0) * 1.3;
    else {
      float depth = v / 6.5;
      float wave = 0.5 + 0.5 * sin(u * 0.4 + uTime * 1.5 + v);
      float fish = step(h21(vec2(floor((u + uTime * 3.0) / 1.4), floor(v * 1.6)), 5.0), 0.035);
      col = fish > 0.5 ? vec3(1.0, 0.67 + v * 0.04, 0.35)
                       : vec3(0.024 + 0.04 * depth, 0.157 + 0.157 * depth + 0.047 * wave,
                              0.275 + 0.196 * depth + 0.039 * wave);
    }
    ${fogTail}
  }
`;

export function makeMaterials(uniforms) {
  const mk = frag => new THREE.ShaderMaterial({ vertexShader: PROP_VERT, fragmentShader: frag, uniforms });
  const two = frag => new THREE.ShaderMaterial({ vertexShader: PROP_VERT, fragmentShader: frag, uniforms, side: THREE.DoubleSide });
  return {
    sign: new THREE.ShaderMaterial({ vertexShader: PROP_VERT, fragmentShader: SIGN_FRAG, uniforms, glslVersion: THREE.GLSL3 }),
    emit: two(EMIT_FRAG), metal: mk(METAL_FRAG),
    foliage: mk(FOLIAGE_FRAG), cloth: two(CLOTH_FRAG), water: two(WATER_FRAG),
    tunnel: two(TUNNEL_FRAG), glass: two(GLASS_FRAG), rail: two(RAIL_FRAG),
  };
}

export function markGlowing(mats) {
  for (const k of ['sign', 'emit']) mats[k].userData.glows = true;
  return mats;
}

// ---------- instanced builder ----------
export const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
export const unitPlane = new THREE.PlaneGeometry(1, 1);
// a plane already laid flat, for ceilings and decks: the prop vertex shader
// only applies yaw, so anything horizontal needs the tilt baked into the mesh
export const unitPlaneFlat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
export const unitSphere = new THREE.SphereGeometry(0.5, 10, 7);
export const unitTorus = new THREE.TorusGeometry(0.5, 0.035, 5, 28);
export const unitCone = new THREE.ConeGeometry(0.5, 1, 8).translate(0, 0.5, 0);

export class Batch {
  constructor(base) { this.base = base; this.pos = []; this.size = []; this.rot = []; this.col = []; this.meta = []; }
  add(p, s, rot, c, m) {
    this.pos.push(p[0], p[1], p[2]); this.size.push(s[0], s[1], s[2]); this.rot.push(rot);
    this.col.push(c[0] / 255, c[1] / 255, c[2] / 255); this.meta.push(m[0], m[1], m[2] || 0, m[3] || 0);
  }
  build(mat) {
    const n = this.rot.length;
    if (!n) return null;
    const g = new THREE.InstancedBufferGeometry();
    g.index = this.base.index;
    g.attributes.position = this.base.attributes.position;
    g.attributes.normal = this.base.attributes.normal;
    g.attributes.uv = this.base.attributes.uv;
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('iSize', new THREE.InstancedBufferAttribute(new Float32Array(this.size), 3));
    g.setAttribute('iRot', new THREE.InstancedBufferAttribute(new Float32Array(this.rot), 1));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('iMeta', new THREE.InstancedBufferAttribute(new Float32Array(this.meta), 4));
    g.instanceCount = n;
    g.userData.sharedBase = true;        // position/normal/uv/index belong to the unit mesh
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    if (mat.userData.glows) m.layers.enable(1);        // layer 1 = what the wet road mirrors
    return m;
  }
}

// ---------- build every prop in one chunk ----------
export function buildProps(n0, n1, mats) {
  const signs = new Batch(unitBox);
  const emit = new Batch(unitBox), metal = new Batch(unitBox);
  const f = {};

  // --- signs and billboards hang off the blocks that start in this chunk ---
  const seen = new Set();
  for (let side = 0; side < 2; side++) for (let n = n0; n < n1; n++) {
    const id = SIDE[side][n];
    if (id < 0) continue;
    const key = side * 1e7 + id;
    if (seen.has(key)) continue;
    seen.add(key);
    const B = blocks[id];
    if (B.start < n0 || B.start >= n1) continue;
    const sg = side ? 1 : -1;
    const wall = RW + SW + B.set;                       // the facade plane
    // the city floor under this block, read at whatever segment we are drawing
    const floorAt = d => BASE[((Math.floor(d / SEGL) % NSEG) + NSEG) % NSEG];

    for (const sn of B.signs) {
      const d = B.start * SEGL + sn.u;
      frameAt(d, f);
      const gy = floorAt(d);
      // a slab standing out from the wall, facing along the road
      const x = f.x + f.rx * sg * (wall - 0.8), z = f.z + f.rz * sg * (wall - 0.8);
      signs.add([x, gy + sn.v0, z], [1.6, sn.v1 - sn.v0, 0.12], f.th,
        sn.c, [sn.seed, Number(sn.dead), Math.max(6, Math.round((sn.v1 - sn.v0) / 1.6 * 5)), sg]);
    }

    // --- rooftop kit, straight off B.roofKind ---
    const mid = (B.start + B.len / 2) * SEGL;
    frameAt(mid, f);
    const roofY = floorAt(mid) + B.h;
    const rx = f.x + f.rx * sg * (wall + 13), rz = f.z + f.rz * sg * (wall + 13);
    if (B.roofKind === 2 && B.len * SEGL > 15) {        // helipad: a ring of landing lights
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        const px = rx + Math.cos(a) * 6, pz = rz + Math.sin(a) * 6;
        emit.add([px, roofY, pz], [0.5, 0.3, 0.5], 0, [255, 220, 120], [i, 0.35]);
      }
    } else if (B.roofKind === 3) {                       // rooftop bar: a string of warm bulbs
      for (let i = 0; i < 6; i++)
        emit.add([rx + (i - 2.5) * 2.4, roofY + 2.2, rz], [0.4, 0.4, 0.4], 0, [255, 190, 110], [i, 0.25]);
    }
    if (B.landmark) {                                     // antenna mast with an aviation light
      const mh = 10 + hash(B.id, 1, 5) * 22;
      metal.add([rx, roofY, rz], [0.6, mh, 0.6], f.th, [40, 38, 52], [0, 0]);
      emit.add([rx, roofY + mh, rz], [1.0, 1.0, 1.0], 0, [255, 50, 50], [B.id, 0.8]);
    }
  }

  // --- street lamps down both kerbs, same spacing and colours as the original ---
  for (let n = n0; n < n1; n++) {
    if (n % 6 !== 0) continue;
    const d = district(n);
    if (d === D.TUNNEL || d === D.VAC || d === D.TUBE) continue;
    frameAt(n * SEGL, f);
    for (const sg of [-1, 1]) {
      const px = f.x + f.rx * sg * (RW + 0.6), pz = f.z + f.rz * sg * (RW + 0.6);
      metal.add([px, f.y, pz], [0.28, 7, 0.28], f.th, [26, 22, 36], [0, 0]);
      const ax = f.x + f.rx * sg * (RW - 2), az = f.z + f.rz * sg * (RW - 2);
      metal.add([(px + ax) / 2, f.y + 6.8, (pz + az) / 2], [2.9, 0.26, 0.26], f.th, [26, 22, 36], [0, 0]);
      const lc = d === D.DOCKS ? [255, 150, 60] : n % 18 === 0 ? [255, 70, 200] : [120, 240, 255];
      emit.add([ax, f.y + 6.35, az], [0.55, 0.22, 0.55], f.th, lc, [n, 0.55]);
    }
  }

  const out = [];
  for (const [b, m] of [[signs, mats.sign], [emit, mats.emit], [metal, mats.metal]]) {
    const mesh = b.build(m);
    if (mesh) out.push(mesh);
  }
  return out;
}
