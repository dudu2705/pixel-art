// props.js — the things that make it Neon Drive rather than a box city:
// blade signs, billboards, street lamps and rooftop kit. All instanced, all
// built per chunk alongside the buildings.

import * as THREE from './vendor/three.module.js';
import { SEGL, NSEG, RW, SW, LH, NEON, blocks, SIDE, ELEV, LAYERED, BASE, TRANS, TRANS_AT, district, D, hash, mix } from './world.js';
import { frameAt } from './road.js';
import { integerHash } from './shaders.js';
import { EMITTER_LAYER } from './glow.js';
import { makeEffectMaterial } from './effects.js';

// ---------- shared glsl ----------
const COMMON = /* glsl */`
  float h21(vec2 p, float s) {
    p = fract(p * vec2(123.34, 456.21) + s * 0.017);
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
`;

// instanced, oriented, box-or-quad vertex shader shared by every prop
const propVertex = (slope = '') => /* glsl */`
  attribute vec3 iPos;
  attribute vec3 iSize;
  attribute float iRot;
  attribute vec3 iCol;
  attribute vec4 iMeta;        // seed, kind, flickerSeed, spare
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  void main() {
    vCol = iCol; vMeta = iMeta; vUv = uv; vNL = normal;
    vec3 p = position * iSize;
    ${slope}
    float c = cos(iRot), s = sin(iRot);
    vec3 r = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z) + iPos;
    vWorld = r;
    gl_Position = projectionMatrix * viewMatrix * vec4(r, 1.0);
  }
`;

const PROP_VERT = propVertex();
const TUNNEL_VERT = propVertex('p.y += (iMeta.y > 0.5 ? position.z : -position.x) * iMeta.w;');

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
const FOLIAGE_VERT = /* glsl */`
  attribute vec3 iPos, iSize, iCol;
  attribute vec4 iMeta;
  varying vec3 vColor;
  varying vec2 vUv;
  flat out int vSeed;
  varying float vDepth;
  void main() {
    vec4 view = viewMatrix * vec4(iPos, 1.0);
    vColor = iCol;
    vUv = uv;
    vSeed = int(iMeta.x);
    vDepth = -view.z;
    gl_Position = projectionMatrix * (view + vec4(position.xy * iSize.xy, 0.0, 0.0));
  }
`;
const FOLIAGE_FRAG = /* glsl */`
  precision highp float;
  precision highp int;
  ${integerHash}
  varying vec3 vColor;
  varying vec2 vUv;
  flat in int vSeed;
  varying float vDepth;
  uniform vec3 uFog;
  uniform float uFogNear, uFogFar;
  out vec4 fragColor;
  void main() {
    vec2 uv = vUv * 2.0 - 1.0;
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    if (vDepth > 260.0 || dot(uv, uv) > 1.0 + (hsh(pixel.x, pixel.y, 72) - 0.5) * 0.3) discard;
    bool lit = uv.y > 0.2 || hsh(pixel.x / 2, pixel.y / 2, vSeed) < 0.25;
    vec3 color = lit ? vColor : mix(vColor, vec3(10, 10, 20) / 255.0, 0.55);
    fragColor = vec4(mix(color, uFog, smoothstep(uFogNear, uFogFar, vDepth) * 0.97), 1.0);
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
    float w = vMeta.x + (1.0 - vUv.x) * ${SEGL}.0, v = vUv.y * vMeta.z;
    float st = mod(v * 0.9 + uTime * 14.0 + sin(w * 3.0) * 2.0, 3.0);
    float k = st < 0.6 ? 1.0 : 0.6 + 0.15 * sin(w * 5.0 + v);
    vec3 col = vec3(0.59, 0.82, 0.90) * k;
    ${fogTail}
  }
`;

// tunnel lining: tiles, grout, a cyan strip and lamp panels on the ceiling
const TUNNEL_FRAG = /* glsl */`
  precision highp float;
  varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    float mode = vMeta.x;
    bool ceiling = vMeta.y > 0.5, lift = mode > 0.5 && mode < 2.5, up = mode < 1.5;
    float w = vMeta.z + (1.0 - (ceiling ? vUv.y : vUv.x)) * ${SEGL}.0;
    float v = vUv.y * 6.5;
    vec3 lc = up ? vec3(80, 255, 150) : vec3(255, 170, 60);
    vec3 col;
    if (mode > 2.5) {
      bool ring = mod(w, 28.0) < 0.8;
      bool seam = mod(w, 4.0) < 0.08 || mod(v, 1.5) < 0.05;
      if (ring) col = vec3(80, 220, 255) * (ceiling ? 1.0 : 0.7 + 0.3 * sin(uTime * 8.0));
      else if (ceiling) col = vec3(12, 14, 22);
      else if (v > 3.1 && v < 3.25) col = vec3(40, 90, 160);
      else col = seam ? vec3(8, 9, 14) : vec3(16, 18, 28);
    } else if (ceiling) {
      float across = abs(vUv.x - 0.5) * 16.4;
      vec3 lamp = lift ? (up ? vec3(120, 255, 190) : vec3(255, 190, 110)) : vec3(255, 196, 120);
      if (across < 0.6) col = mod(w, 8.0) < 2.5 ? lamp : vec3(30, 26, 36);
      else if (mod(across, 2.5) < max(0.12, fwidth(across))) col = vec3(28, 26, 34);
      else col = lift ? vec3(30, 32, 44) : vec3(44, 42, 54);
    } else if (lift) {
      bool seam = mod(w, 3.0) < 0.1 || mod(v, 1.6) < 0.06;
      col = seam ? vec3(20, 22, 30) : vec3(34, 36, 48);
      if (v > 4.6 && v < 4.85) col = lc;
      if (v > 1.4 && v < 3.4 && abs(mod(w, 6.0) - 3.0 + abs(v - 2.4) * 1.2) < 0.35)
        col = lc * (fract(uTime * 3.0 - w * 0.3) < 0.5 ? 1.0 : 0.35);
    } else {
      if (v > 4.55 && v < 4.85) col = vec3(0, 200, 255);
      else if (v < 0.8) col = mod(w + v * 1.5, 1.2) < 0.6 ? vec3(190, 150, 30) : vec3(20, 18, 24);
      else col = mod(v, 1.0) < 0.08 || mod(w, 2.0) < 0.08 ? vec3(36, 34, 44) : vec3(64, 60, 74);
    }
    col /= 255.0;
    ${fogTail}
  }
`;

// the aqua tube: sea outside the glass, ribs, and fish going past
const GLASS_FRAG = /* glsl */`
  precision highp float;
  precision highp int;
  ${integerHash}
  out vec4 fragColor;
  varying vec3 vCol; varying vec4 vMeta; varying vec2 vUv; varying vec3 vWorld; varying vec3 vNL;
  uniform vec3 uFog, uCam; uniform float uFogNear, uFogFar, uTime;
  void main() {
    bool ceiling = vMeta.y > 0.5;
    float u = vMeta.z + (1.0 - (ceiling ? vUv.y : vUv.x)) * ${SEGL}.0, v = vUv.y * 6.5;
    vec3 col;
    if (mod(u, 6.0) < 0.35) col = vec3(0.27, 0.33, 0.39);               // steel ribs
    else if (ceiling) {
      float x = (vUv.x - 0.5) * ${2 * (RW + 1.2)};
      float caustic = 0.5 + 0.5 * sin(x * 1.7 + u * 0.6 + uTime * 2.0) * sin(x * 0.7 - u * 0.3 + uTime);
      col = (vec3(20, 90, 120) + caustic * vec3(30, 60, 50)) / 255.0;
    }
    else if (v > 4.4 && v < 4.65) col = vec3(0.0, 220.0, 255.0) / 255.0;
    else {
      float depth = v / 6.5;
      float wave = 0.5 + 0.5 * sin(u * 0.4 + uTime * 1.5 + v);
      bool fish = hsh(int(floor((u + uTime * 3.0) / 1.4)), int(floor(v * 1.6)), 5) < 0.035;
      col = fish ? vec3(1.0, 0.67 + v * 0.04, 0.35)
                       : vec3(0.024 + 0.04 * depth, 0.157 + 0.157 * depth + 0.047 * wave,
                              0.275 + 0.196 * depth + 0.039 * wave);
    }
    float d = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
    fragColor = vec4(mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.97), 1.0);
  }
`;

const TOWER_FRAG = /* glsl */`
  precision highp float;
  precision highp int;
  ${integerHash}
  varying vec3 vCol, vWorld, vNL;
  varying vec4 vMeta;
  varying vec2 vUv;
  uniform vec3 uFog, uCam;
  uniform float uFogNear, uFogFar;
  out vec4 fragColor;
  void main() {
    float u = (1.0 - vUv.x) * vMeta.z + vMeta.x;
    float v = vUv.y * vMeta.y;
    vec3 col = vCol;
    if (abs(vNL.y) < 0.5) {
      vec2 grid = vec2(u / 2.2, v / 1.8);
      vec2 cell = fract(grid);
      if (vMeta.w < 0.5 && mod(v, 9.0) < 0.35) col = vec3(0, 200, 255) / 255.0;
      else if (cell.x > 0.12 && cell.x < 0.88 && cell.y > 0.2 && cell.y < 0.8) {
        ivec2 id = ivec2(floor(grid));
        bool lit = hsh(id.x, id.y, 91) < 0.3;
        vec3 window = hsh(id.x, id.y, 92) < 0.6 ? vec3(255, 200, 120) : vec3(120, 220, 255);
        col = (lit ? window * 0.7 : vec3(14, 18, 30)) / 255.0;
      }
    }
    float d = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
    fragColor = vec4(mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.97), 1.0);
  }
`;

const CAR_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vCol, vWorld, vNL;
  varying vec4 vMeta;
  varying vec2 vUv;
  uniform vec3 uFog, uCam;
  uniform float uFogNear, uFogFar;
  vec3 unpackRGB(float rgb) {
    return vec3(floor(rgb / 65536.0), floor(mod(rgb, 65536.0) / 256.0), mod(rgb, 256.0)) / 255.0;
  }
  void main() {
    float u = vUv.x, v = vUv.y;
    vec3 col = vCol;
    bool rear = vNL.z < -0.5, front = vNL.z > 0.5;
    if (rear || front) {
      vec3 light = rear ? unpackRGB(vMeta.z) : vec3(230, 240, 255) / 255.0;
      if (v < 0.13) col = (u < 0.2 || u > 0.8 ? vec3(6, 6, 8) : vec3(10, 10, 14)) / 255.0;
      else if (v < 0.24) col = vCol * 0.55;
      else if (v < 0.33 && u > 0.4 && u < 0.6) col = (rear ? vec3(170, 170, 150) : vec3(30, 30, 40)) / 255.0;
      else if (v > 0.36 && v < 0.47) col = u < 0.28 || u > 0.72 ? light : rear ? light * 0.45 : vec3(20, 20, 28) / 255.0;
      else if (v < 0.58) col = vCol * (v > 0.54 ? 1.7 : 1.0);
      else if (v > 0.62 && v < 0.92 && u > 0.06 && u < 0.94)
        col = (mod(u * 3.0 + v * 2.0 + 0.3, 1.0) < 0.14 ? vec3(70, 46, 100) : vec3(16, 18, 30)) / 255.0;
      else col = vCol * 1.15;
    } else if (abs(vNL.x) > 0.5) {
      if (v < 0.13) col = vec3(6, 6, 8) / 255.0;
      else if (v > 0.62 && v < 0.92 && u > 0.19 && u < 0.81 && abs(u - 0.5) > 0.045)
        col = vec3(16, 18, 30) / 255.0;
      else col *= 0.8;
    }
    ${fogTail}
  }
`;

const WHEEL_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  varying vec4 vMeta;
  varying vec2 vUv;
  uniform float uTime, uFogNear, uFogFar;
  uniform vec3 uFog;
  const float TAU = 6.28318530718;
  const vec3 NEON[6] = vec3[6](${NEON.map(c => 'vec3(' + c.join(', ') + ') / 255.0').join(', ')});
  out vec4 fragColor;
  void main() {
    vec2 p = (vUv - 0.5) * 34.0;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float spin = uTime * 0.12 + vMeta.x;
    float width = max(0.04, fwidth(p.x) * 0.6);
    vec3 color = vec3(80, 80, 110) / 255.0;
    bool spoke = radius < 14.0 && abs(sin((angle - spin) * 8.0)) * radius < width;
    bool rim = abs(radius - 14.0) < width;
    if (rim) {
      float phase = fract(angle / TAU);
      bool on = mod(phase * 16.0 - uTime * 6.0, 3.0) < 1.0;
      color = on ? NEON[int(phase * 6.0)] : vec3(90, 70, 110) / 255.0;
    }
    float cupSize = TAU / 12.0;
    float cup = floor((angle - spin) / cupSize + 0.5);
    float anchor = spin + cup * cupSize;
    vec2 delta = p - vec2(cos(anchor), sin(anchor)) * 14.0;
    bool gondola = abs(delta.x) < 0.9 && delta.y < -0.2 && delta.y > -1.6;
    if (gondola) color = NEON[int(mod(cup, 6.0))];
    if (!(gondola || rim || spoke)) discard;
    float d = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
    fragColor = vec4(mix(color, uFog, smoothstep(uFogNear, uFogFar, d) * 0.97), 1.0);
  }
`;

const SKYWALK_FRAG = /* glsl */`
  precision highp float;
  precision highp int;
  ${integerHash}
  varying vec3 vCol, vWorld, vNL;
  varying vec4 vMeta;
  varying vec2 vUv;
  uniform float uTime, uFogNear, uFogFar;
  uniform vec3 uFog;
  out vec4 fragColor;
  void main() {
    float x = (vUv.x - 0.5) * ${2 * (RW + SW + 22)};
    int row = int(floor(vUv.y * 6.0));
    int seed = int(vMeta.x);
    vec3 col;
    if (vNL.y < -0.5) {
      bool lamp = abs(vUv.y - 0.5) < 0.12 && mod(x, 4.0) < 0.5;
      col = (lamp ? vec3(255, 210, 150) : vec3(22, 20, 30)) / 255.0;
    } else if (vNL.y > 0.5) {
      if (vUv.y < 0.1 || vUv.y > 0.9) col = vec3(120, 140, 160) / 255.0;
      else if (vMeta.y < 0.5) {
        float dir = row % 2 == 0 ? -1.0 : 1.0;
        float h = hsh(int(floor((x + uTime * 1.1 * dir) / 0.8)), row, seed);
        col = h < 0.04 ? vCol : (h < 0.3 ? vec3(16, 14, 20) : vec3(48, 46, 60)) / 255.0;
      } else {
        float dir = row < 3 ? 1.0 : -1.0;
        float h = hsh(int(floor((x - uTime * 14.0 * dir) / 6.0)), row, seed);
        vec3 light = dir > 0.0 ? vec3(255, 50, 60) : vec3(230, 235, 255);
        col = (row == 3 && mod(x * 0.5, 2.0) < 1.0 ? vec3(150, 150, 160)
               : h < 0.12 ? light : vec3(30, 28, 38)) / 255.0;
      }
    } else col = vUv.y < 0.15 ? vCol : vec3(38, 36, 50) / 255.0;
    float distanceAhead = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
    fragColor = vec4(mix(col, uFog, smoothstep(uFogNear, uFogFar, distanceAhead) * 0.97), 1.0);
  }
`;

export function makeMaterials(uniforms) {
  const mk = frag => new THREE.ShaderMaterial({ vertexShader: PROP_VERT, fragmentShader: frag, uniforms });
  const two = (frag, vert = PROP_VERT) => new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, side: THREE.DoubleSide });
  return {
    sign: new THREE.ShaderMaterial({ vertexShader: PROP_VERT, fragmentShader: SIGN_FRAG, uniforms, glslVersion: THREE.GLSL3 }),
    emit: two(EMIT_FRAG), metal: mk(METAL_FRAG), car: mk(CAR_FRAG),
    foliage: new THREE.ShaderMaterial({
      vertexShader: FOLIAGE_VERT, fragmentShader: FOLIAGE_FRAG, uniforms, glslVersion: THREE.GLSL3,
    }),
    cloth: two(CLOTH_FRAG), water: two(WATER_FRAG),
    tunnel: two(TUNNEL_FRAG, TUNNEL_VERT), glass: new THREE.ShaderMaterial({
      vertexShader: TUNNEL_VERT, fragmentShader: GLASS_FRAG, uniforms, side: THREE.DoubleSide, glslVersion: THREE.GLSL3,
    }), rail: two(RAIL_FRAG),
    effect: makeEffectMaterial(uniforms),
    track: two(METAL_FRAG, TUNNEL_VERT),
    wheel: new THREE.ShaderMaterial({
      vertexShader: PROP_VERT, fragmentShader: WHEEL_FRAG, uniforms, side: THREE.DoubleSide, glslVersion: THREE.GLSL3,
    }),
    tower: new THREE.ShaderMaterial({ vertexShader: PROP_VERT, fragmentShader: TOWER_FRAG, uniforms, glslVersion: THREE.GLSL3 }),
    skywalk: new THREE.ShaderMaterial({
      vertexShader: PROP_VERT, fragmentShader: SKYWALK_FRAG, uniforms, glslVersion: THREE.GLSL3,
    }),
  };
}

export function markGlowing(mats) {
  for (const kind of ['sign', 'emit']) mats[kind].userData.lightKind = kind;
  return mats;
}

// ---------- instanced builder ----------
export const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
export const unitPlane = new THREE.PlaneGeometry(1, 1);
// a plane already laid flat, for ceilings and decks: the prop vertex shader
// only applies yaw, so anything horizontal needs the tilt baked into the mesh
export const unitPlaneFlat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
export const unitCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
export const unitDome = new THREE.SphereGeometry(0.5, 28, 12, 0, 2 * Math.PI, 0, Math.PI / 2);
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
    if (mat.userData.lightKind) m.layers.enable(EMITTER_LAYER);
    return m;
  }
}

// ---------- build every prop in one chunk ----------
const LAMPLESS = new Set([D.TUNNEL, D.VAC, D.TUBE, D.FERRY, D.SALT, D.BRIDGE, D.MARKET, D.GARDENS, D.SHRINE, D.HIGHWAY, D.RAMP]);

export function buildProps(n0, n1, mats) {
  const signs = new Batch(unitBox);
  const domes = new Batch(unitDome), coils = new Batch(unitSphere), arcs = new Batch(unitPlane);
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
        sn.c, [sn.seed, Number(sn.dead), Math.max(6, Math.round((sn.v1 - sn.v0) / 1.6 * 5)), -sg]);
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
    if (B.style === D.BAZAAR || B.style === D.CITADEL) {
      const at = wall + (B.style === D.BAZAAR ? 6 : 5);
      const x = f.x + f.rx * sg * at, z = f.z + f.rz * sg * at;
      if (B.style === D.BAZAAR) {
        domes.add([x, roofY, z], [10, 11.5, 10], f.th, B.seed & 1 ? [210, 170, 70] : [50, 170, 170], [0, 0]);
        metal.add([x, roofY + 5.75, z], [0.14, 2.25, 0.14], f.th, [220, 190, 90], [0, 0]);
        emit.add([x, roofY + 8, z], [0.13, 0.13, 0.13], f.th, [255, 210, 120], [0, 0.4, 1.2, 40]);
      } else {
        metal.add([x, roofY, z], [1.2, 9, 1.2], f.th, [50, 54, 70], [0, 0]);
        for (let i = 1; i < 6; i++) metal.add([x, roofY + i * 1.5, z], [1.8, 0.15, 1.8], f.th, [160, 120, 60], [0, 0]);
        coils.add([x, roofY + 9.8, z], [3.2, 1.4, 3.2], f.th, [120, 130, 150], [0, 0]);
        arcs.add([x, roofY + 9.8, z], [28, 14, 1], 0, [190, 220, 255], [2, B.id]);
        emit.add([x, roofY + 10.45, z], [0.01, 0.01, 0.01], f.th, [150, 190, 255], [B.id, 0.25, 4, 52]);
      }
    } else if (B.landmark) {
      const mh = Math.max(0, Math.min(10 + hash(B.id, 1, 5) * 22, LH[2] - 3 - B.h));
      metal.add([rx, roofY, rz], [0.6, mh, 0.6], f.th, [40, 38, 52], [0, 0]);
      emit.add([rx, roofY + mh, rz], [1.0, 1.0, 1.0], 0, [255, 50, 50], [B.id, 0.8]);
    }
  }

  // --- street lamps down both kerbs ---
  for (let n = n0; n < n1; n++) {
    const d = district(n), transition = TRANS[TRANS_AT[n]];
    const onCrown = LAYERED[n] && ELEV[n] > LH[1] + 5;
    const lampEvery = onCrown && ![D.VOLCANO, D.CLOUDS, D.PONTOON].includes(d) ? 27 : 9;
    if (n % lampEvery !== 0 || LAMPLESS.has(d) ||
        (transition && n >= transition.s && n < transition.e)) continue;
    frameAt(n * SEGL, f);
    for (const sg of [-1, 1]) {
      const px = f.x + f.rx * sg * (RW + 0.6), pz = f.z + f.rz * sg * (RW + 0.6);
      metal.add([px, f.y, pz], [0.18, 7, 0.18], f.th, [26, 22, 36], [0, 0]);
      const ax = f.x + f.rx * sg * (RW - 2), az = f.z + f.rz * sg * (RW - 2);
      metal.add([(px + ax) / 2, f.y + 7, (pz + az) / 2], [2.7, 0.2, 0.2], f.th, [26, 22, 36], [0, 0]);
      const lc = d === D.DOCKS ? [255, 150, 60] : n % 18 === 0 ? [255, 70, 200] : [120, 240, 255];
      emit.add([ax, f.y + 6.78, az], [1, 0.22, 0.4], f.th, mix(lc, [255, 255, 255], 0.5), [n, 0]);
      emit.add([ax, f.y + 6.79, az], [0.01, 0.01, 0.01], f.th, lc, [n, 0.55, 1.8, 28]);
    }
  }

  const out = [];
  for (const [b, m] of [[signs, mats.sign], [emit, mats.emit], [metal, mats.metal], [domes, mats.metal], [coils, mats.metal], [arcs, mats.effect]]) {
    const mesh = b.build(m);
    if (mesh) out.push(mesh);
  }
  return out;
}
