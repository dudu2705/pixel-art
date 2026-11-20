import { D, NSEG, SEGL, SW } from './world.js';

export const integerHash = /* glsl */`
float hsh(int x, int y, int s) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 1442695041u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h >> 8u) / 16777216.0;           // the top 24 bits, so it stays below 1 exactly as in JavaScript
}
`;

// shaders.js — the look. The old build computed every wall pixel in JS
// (wallTex(), ~280k calls a frame). Here the same procedural facade runs as a
// fragment shader, so the GPU draws it in parallel and it costs ~nothing.

export const facadeVert = /* glsl */`
  attribute vec3 iPos;      // block origin in world space
  attribute vec3 iSize;     // width, height, depth
  attribute float iRot;     // yaw
  attribute vec3 iBase;     // facade colour
  attribute vec3 iCrown;    // crown neon colour (0,0,0 = none)
  attribute vec4 iMeta;     // seed, winP, style, lobby-hue

  varying vec3 vBase, vCrown;
  varying vec4 vMeta;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vNormalL;

  void main() {
    vBase = iBase; vCrown = iCrown; vMeta = iMeta;
    vNormalL = normal;
    vLocal = position * iSize;                 // unit box -> block size
    float c = cos(iRot), s = sin(iRot);
    vec3 p = vLocal;
    vec3 r = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    vec3 w = r + iPos;
    vWorld = w;
    vec3 nw = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
    vNormalW = nw;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }
`;

export const facadeFrag = /* glsl */`
  precision highp float;
  varying vec3 vBase, vCrown;
  varying vec4 vMeta;
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  varying vec3 vNormalL;

  uniform vec3 uFog;
  uniform float uFogNear, uFogFar;
  uniform vec3 uCam;
  uniform float uTime;

  float hash21(vec2 p, float s) {
    p = fract(p * vec2(123.34, 456.21) + s * 0.017);
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    float seed = vMeta.x, winP = vMeta.y, uOff = vMeta.z;

    // which face are we on. This MUST use the local normal: vLocal is in the
    // block's own space, and a rotated block's world normal points elsewhere.
    vec3 an = abs(vNormalL);
    // the long faces continue the neighbouring piece's grid via uOff
    float u = an.x > an.z ? vLocal.z + uOff : vLocal.x;
    float v = vLocal.y;

    vec3 col = vBase;

    if (an.y > 0.7) {
      // roof: flat, a touch darker, with a service-deck grid
      col = vBase * 0.55;
      vec2 g = fract(vec2(vLocal.x, vLocal.z) / 3.0);
      if (g.x < 0.06 || g.y < 0.06) col *= 1.5;
    } else {
      // storey + bay grid, then lit windows, exactly the old wallTex idea
      float FH = 3.2, BW = 2.6;
      float fl = floor(v / FH), bay = floor(u / BW);
      vec2 cell = vec2(fract(u / BW), fract(v / FH));

      // ground floor: shopfront glow
      if (v < FH * 1.2) {
        float lit = hash21(vec2(bay, 0.0), seed) < 0.75 ? 1.0 : 0.0;
        col = mix(vBase * 0.7, vBase * 0.7 + vec3(0.55, 0.42, 0.22) * 2.2, lit);
      } else {
        float r = hash21(vec2(bay, fl), seed);
        // windows flicker on and off very slowly, like the original's time term
        float blink = step(0.995, hash21(vec2(bay, fl), seed + 7.0) + sin(uTime * 0.25 + fl) * 0.004);
        bool win = cell.x > 0.18 && cell.x < 0.82 && cell.y > 0.22 && cell.y < 0.80;
        if (win) {
          if (r < winP && blink < 0.5) {
            vec3 wc = vec3(1.0, 0.78, 0.47);
            if (hash21(vec2(fl, bay), seed + 3.0) > 0.72) wc = vec3(0.47, 0.86, 1.0);
            if (hash21(vec2(fl, bay), seed + 5.0) > 0.93) wc = vec3(1.0, 0.47, 0.78);
            col = wc * (1.4 + r * 0.8);
          } else {
            col = vBase * 0.35;                 // dark glass
          }
        } else {
          col = vBase * (0.85 + 0.3 * fract(hash21(vec2(bay, fl), seed + 11.0)));
        }
      }

      // crown band at the top of the tower
      float topD = (vLocal.y);
      if (length(vCrown) > 0.01) {
        float h = vMeta.w;
        if (topD > h - 1.6 && topD < h - 0.3) col = vCrown * 2.4;
      }
      // vertical corner pilasters catch the light
      if (fract(u / BW) < 0.04) col *= 1.25;
    }

    // simple directional shade so the free camera reads the volumes
    float lam = 0.55 + 0.45 * max(0.0, dot(normalize(vNormalW), normalize(vec3(0.4, 0.8, 0.35))));
    col *= lam;

    float d = distance(vWorld, uCam);
    float fg = smoothstep(uFogNear, uFogFar, d);
    col = mix(col, uFog, fg * 0.97);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const roadVert = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vLat;
  attribute float lat;
  void main() {
    vUv = uv; vLat = lat;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const sectorLookup = /* glsl */`
ivec2 sector(int index) {
  index = (index % ${NSEG} + ${NSEG}) % ${NSEG};
  return ivec2(round(texelFetch(uSectors, ivec2(index % 256, index / 256), 0).rg * 255.0));
}
`;

export const roadFrag = /* glsl */`
  precision highp float;
  precision highp int;
  ${integerHash}
  out vec4 fragColor;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vLat;
  uniform vec3 uFog;
  uniform float uFogNear, uFogFar;
  uniform float uRW, uTime;
  uniform sampler2D uSectors;
  uniform sampler2D uSceneDepth;
  uniform bool uMaskPass;
  uniform float uWet;
  uniform float uGlass;
  uniform vec2 uBike;
  uniform vec2 uBikeForward;
  uniform float uHeadlight;

const vec3 WIN_[6] = vec3[6](vec3(255, 200, 120), vec3(255, 170, 90), vec3(120, 220, 255), vec3(255, 120, 200), vec3(200, 190, 255), vec3(255, 236, 190));
float vns(float x, float y, int s) {
  float fx0 = floor(x), fy0 = floor(y); int ix = int(fx0), iy = int(fy0); float fx = x - fx0, fy = y - fy0;
  float a = hsh(ix, iy, s), b = hsh(ix + 1, iy, s), c = hsh(ix, iy + 1, s), d = hsh(ix + 1, iy + 1, s);
  float ux = fx * fx * (3.0 - 2.0 * fx), uy = fy * fy * (3.0 - 2.0 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
float jm(float value, float divisor) { return mod(value, divisor); }
int wInt(float scale, float w) { return int(floor(w * scale)); }
float smo(float a, float b, float value) { return smoothstep(a, b, value); }
${sectorLookup}
bool XR(int segment) { return sector(segment).y != 0; }

vec3 ground(float lx, float w, float z, float pxw, float fz, int d, bool deckOnly, out float rfo, out float opo) {
  bool water = d == ${D.BRIDGE} || d == ${D.CANALS} || d == ${D.FERRY} || d == ${D.PONTOON}, deck = d == ${D.HIGHWAY} || d == ${D.RAMP}, sand = d == ${D.CANYON};
  bool lava = d == ${D.VOLCANO}, cloud = d == ${D.CLOUDS}, salt = d == ${D.SALT}, forge = d == ${D.FORGE}, ruin = d == ${D.RUIN};
  bool pontoon = d == ${D.PONTOON}, ferry = d == ${D.FERRY};
  bool dash = jm(w, 10.0) < 4.5; float lw = max(0.09, pxw * 0.55); bool tileRow = jm(w, 1.6) < max(0.12, pxw);
  int zq = wInt(3.0, w);
  int seg = int(floor(w / ${SEGL}.0)); float lz = w - floor(w / ${SEGL}.0) * ${SEGL}.0;
  bool xr = XR(seg), nx1 = XR(seg + 1), nx2 = XR(seg + 2), pv = XR(seg - 1);
  bool zebra = !xr && (nx1 || pv) && lz > 0.4 && lz < 3.6;
  bool stopL = !xr && !nx1 && nx2 && lz > 3.2 && lz < 3.7;
  float a = abs(lx);
  vec3 c; float rf = 0.0, op = 1.0;
  float RW_ = uRW, SW_ = ${SW};
  if (a < RW_ || (xr && a < RW_ + SW_ + 30.0)) {
    if (xr && a >= RW_) { float h = pxw < 0.35 ? hsh(int(floor(lx * 3.0)), zq, 9) * 9.0 : 4.5; c = vec3(24.0 + h, 22.0 + h, 34.0 + h); rf = 0.5; if (abs(lz - 2.0) < lw * 1.2 && jm(a * 0.5, 2.0) < 1.0) c = vec3(190, 190, 210); }
    else if (zebra && jm(a + 0.45, 1.0) < 0.55) { c = vec3(215, 215, 225); rf = 0.15; }
    else if (stopL && lx > 0.3) { c = vec3(225, 225, 235); rf = 0.15; }
    else if (!xr && abs(a - 0.2) < lw) { c = vec3(235, 165, 40); rf = 0.2; }
    else if (!xr && !zebra && dash && abs(a - 3.5) < lw) { c = vec3(190, 190, 210); rf = 0.2; }
    else if (!xr && abs(a - (RW_ - 0.3)) < lw) { c = vec3(200, 200, 215); rf = 0.2; }
    else {
      float h = pxw < 0.35 ? hsh(int(floor(lx * 3.0)), zq, 9) * 9.0 : 4.5; c = vec3(24.0 + h, 22.0 + h, 34.0 + h); rf = 0.5;
      if (deckOnly) { c = vec3(14, 30, 48); op = 0.3; rf = 0.15; }
      if (sand && a > RW_ - 1.6 && hsh(int(floor(lx * 2.0)), wInt(0.7, w), 33) < (a - RW_ + 1.6) * 0.6) { c = vec3(150, 92, 54); rf = 0.0; }
    }
  } else if (deck) {
    if (a < RW_ + SW_) { float h = pxw < 0.35 ? hsh(int(floor(lx * 3.0)), zq, 19) * 6.0 : 3.0; c = vec3(30.0 + h, 28.0 + h, 38.0 + h); rf = 0.3; if (deckOnly) op = 0.55; }
    else {
      int gx = int(floor(lx / 3.0)), gz = int(floor(w / 3.0));
      bool lt = pxw < 1.2 && hsh(gx, gz, 57) < 0.07;
      c = lt ? WIN_[int(hsh(gx, gz, 58) * 6.0)] * 0.7 : vec3(8, 6, 14);
    }
  } else if (a < RW_ + 0.3) {
    if (sand) c = vec3(120, 70, 40); else { c = vec3(0, 225, 255); rf = 0.3; }
  } else if (a < RW_ + SW_) {
    if (d == ${D.CANALS}) { bool pl = pxw < 0.5 && jm(w, 0.8) < max(0.1, pxw); c = pl ? vec3(40, 26, 22) : vec3(82, 56, 40); rf = 0.2; }
    else if (sand) { float h = hsh(int(floor(lx * 2.0)), zq, 34) * 14.0; c = vec3(130.0 + h, 78.0 + h * 0.6, 46.0); }
    else {
      bool ln = pxw < 0.5 && (tileRow || jm(a - RW_, 1.6) < max(0.1, pxw));
      c = ln ? vec3(30, 26, 42) : vec3(46, 40, 60); rf = 0.25;
      if (deckOnly) { op = ln ? 0.9 : 0.35; rf = 0.1; }
    }
  } else if (water) {
    bool sp = pxw < 0.4 && hsh(int(floor(lx * 2.0)), zq, 21) < 0.012;
    c = sp ? vec3(120, 130, 170) : vec3(6, 10, 24); rf = 0.85;
  } else if (lava) {
    if (a < RW_ + SW_ + 2.5) c = vec3(40, 26, 24);
    else {
      float v = vns(lx * 0.12, w * 0.06 - uTime * 0.15, 61) * 0.7 + vns(lx * 0.4, w * 0.2, 62) * 0.3;
      if (v > 0.52) { float h = smo(0.52, 0.75, v); c = vec3(200.0 + 55.0 * h, 60.0 + 120.0 * h, 10.0 + 40.0 * h); } else c = vec3(34, 16, 12);
    }
  } else if (cloud) {
    float v = vns(lx * 0.035 + uTime * 0.04, w * 0.012, 71) * 0.7 + vns(lx * 0.11, w * 0.04 - uTime * 0.05, 72) * 0.3, h = smo(0.3, 0.75, v);
    c = vec3(40.0 + 170.0 * h, 46.0 + 166.0 * h, 80.0 + 160.0 * h);
  } else if (salt) {
    float fr = floor(w / 3.5); int rz = int(fr); float cu = lx / 4.0 + float(rz & 1) * 0.5, fx = cu - floor(cu), fzz = w / 3.5 - fr;
    bool edge = pxw < 0.6 && (fx < 0.05 || fzz < 0.05);
    c = edge ? vec3(150, 152, 165) : vec3(200, 204, 218); rf = 0.85;
  } else if (sand) c = vec3(110, 60, 34);
  else c = vec3(18, 14, 26);
  if (forge) {
    if (a >= RW_ && a < RW_ + 0.3) { float fl = 0.75 + 0.25 * sin(w * 1.3 - uTime * 4.0); c = vec3(255.0 * fl, 110.0 * fl, 20.0); rf = 0.1; }
    else if (a < RW_ && mod(w, 12.0) < 1.6 && (abs(a - 1.75) < 0.8 || abs(a - 5.25) < 0.8)) {
      bool bar = pxw < 0.25 && (int(floor(lx * 5.0)) & 1) == 1; float fl = 0.7 + 0.3 * sin(w * 2.0 + uTime * 3.0 + lx);
      c = bar ? vec3(30, 20, 16) : vec3(255.0 * fl, 120.0 * fl, 30.0 * fl); rf = 0.0;
    }
  }
  if (ruin && a < RW_ + SW_ && pxw < 0.5) {
    float hc = hsh(int(floor(lx * 2.5)), wInt(2.5, w), 44);
    if (hc < 0.05) { c = vec3(40, 90, 40); rf = 0.0; } else if (hc < 0.09) c = vec3(10, 10, 12);
  }
  if (deckOnly && a < RW_ && !xr && abs(a - (RW_ - 0.3)) < lw) { c = vec3(90, 230, 255); op = 1.0; }
  if (pontoon && a >= RW_ + 0.3 && a < RW_ + SW_) { c = vec3(90, 50, 34); rf = 0.1; }
  if (pontoon && a < RW_ + SW_ && mod(w, 24.0) < 0.5) { c = vec3(8, 8, 12); rf = 0.0; }
  if (ferry && a >= RW_ + 0.3 && a < RW_ + SW_) { c = vec3(40, 70, 60); rf = 0.15; }
  rfo = rf == 0.85 ? (uWet > 0.0 ? rf : 0.0) : rf * (1.0 - fz) * uWet * (1.0 - smo(45.0, 170.0, z)); opo = op;
  return mix(c / 255.0, uFog, fz);
}
  void main() {
    float roadZ = vUv.y * ${SEGL}.0;
    int d = sector(int(floor(vUv.y))).x;
    bool deck = uGlass > 0.5;
    float deckWidth = d == ${D.HIGHWAY} ? uRW + ${SW} : uRW + 1.5;
    if (deck && abs(vLat) >= deckWidth) discard;
    float pixelWidth = fwidth(vLat);
    float distanceAhead = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
    float fog = smoothstep(uFogNear, uFogFar, distanceAhead) * 0.97;
    float wet, alpha;
    vec3 col = ground(vLat, roadZ, distanceAhead, pixelWidth, fog, d, deck, wet, alpha);
    if (uMaskPass) {
      float depth = texelFetch(uSceneDepth, ivec2(gl_FragCoord.xy), 0).r;
      if (gl_FragCoord.z > depth + 0.000002) discard;

      vec2 offset = vWorld.xz - uBike;
      float ahead = dot(offset, uBikeForward);
      float across = dot(offset, vec2(uBikeForward.y, -uBikeForward.x)) / 2.8;
      float beam = (1.0 - smoothstep(9.0, 32.0, ahead)) * smoothstep(2.5, 6.0, ahead)
                   * max(0.0, 1.0 - across * across) * uHeadlight;
      fragColor = vec4(wet, beam, 0.0, 1.0);
      return;
    }

    fragColor = vec4(col, alpha);
  }
`;

// Lower streets and window lights visible through the elevated deck.
export const floorFrag = /* glsl */`
  precision highp float;
  precision highp int;
  ${integerHash}
  varying vec3 vWorld;
  varying vec2 vUv;
  varying float vLat;
  uniform vec3 uFog;
  uniform float uFogNear, uFogFar, uTime, uRW;
  uniform sampler2D uSectors;
  out vec4 fragColor;
  ${sectorLookup}
  void main() {
    float w = vUv.y * ${SEGL}.0, lx = vLat, a = abs(lx);
    float distanceAhead = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
    float fz = smoothstep(uFogNear, uFogFar, distanceAhead) * 0.97;
    bool dash = mod(w, 10.0) < 4.5;
    float lw = max(0.1, fwidth(vLat) * 0.55);
    float RW_ = uRW, SW_ = ${SW};
    vec3 c; bool em = false;
    if (a < RW_) {
      if (abs(a - 0.2) < lw) c = vec3(150, 110, 40);
      else if (dash && abs(a - 3.5) < lw) c = vec3(110, 110, 130);
      else c = vec3(16, 15, 22);
    } else if (a < RW_ + 0.3) c = vec3(0, 150, 180);
    else if (a < RW_ + SW_) c = vec3(30, 27, 40);
    else if (sector(int(floor(vUv.y))).x == ${D.CANALS}) c = vec3(6, 12, 26);
    else {
      float gx = mod(lx, 48.0), gz = mod(w, 48.0);
      if (gx < 7.0 || gz < 7.0) {
        bool lamp = (gx < 7.0 && (gx < 0.9 || gx > 6.1) && mod(w, 12.0) < 0.9) || (gz < 7.0 && (gz < 0.9 || gz > 6.1) && mod(lx, 12.0) < 0.9);
        if (lamp) { c = vec3(255, 180, 90); em = true; }
        else if (gx < 7.0 && abs(gx - 2.0) < 0.7 && hsh(int(floor((w - uTime * 12.0) / 7.0)), int(floor(lx / 48.0)), 401) < 0.15) { c = vec3(255, 60, 60); em = true; }
        else if (gx < 7.0 && abs(gx - 5.0) < 0.7 && hsh(int(floor((w + uTime * 12.0) / 7.0)), int(floor(lx / 48.0)), 402) < 0.15) { c = vec3(240, 240, 255); em = true; }
        else c = vec3(24, 22, 30);
      } else {
        bool lit = hsh(int(floor(lx / 3.0)), int(floor(w / 3.0)), 403) < 0.08;
        c = lit ? vec3(200, 160, 110) : vec3(14, 12, 20); em = lit;
      }
    }
    fragColor = vec4(mix(c / 255.0, uFog, em ? fz * 0.6 : fz), 1.0);
  }
`;
