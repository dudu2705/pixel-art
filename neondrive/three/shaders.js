import { D, NSEG, SEGL, SW } from './world.js';

export const integerHash = /* glsl */`
float hsh(int x, int y, int s) {
  uint h = uint(x) * 374761393u + uint(y) * 668265263u + uint(s) * 1442695041u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h >> 8u) / 16777216.0;           // the top 24 bits, so it stays below 1 exactly as in JavaScript
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
  uniform float uMapMode, uMapLength;
  uniform vec4 uMapDeck;
  uniform float uMapContinuous, uMapBikeHeight;
  uniform vec3 uMapFork;
  uniform vec2 uMapZebra;
  uniform vec3 uCam;
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
vec3 mapGround(float lx, float w, float pxw, out float reflectivity) {
  float a = abs(lx), width = max(0.09, pxw * 0.55);
  float endDist = uMapContinuous > 0.5 ? 0.0 : min(w, uMapLength - w);
  bool through = uMapContinuous > 0.5;
  bool ramp = uMapFork.z > 0.5;
  bool byFork = uMapFork.x > 0.5 && w < 28.0 || uMapFork.y > 0.5 && uMapLength - w < 28.0;
  bool openEdge = byFork && (ramp || vWorld.x > uMapDeck.x);
  reflectivity = 0.5;
  if (uMapMode < 2.5) {
    if (a < uRW) {
      float zs = w < uMapLength - w ? uMapZebra.x : uMapZebra.y;
      if (!byFork && endDist > zs && endDist < zs + 2.5 && uMapLength > 2.0 * zs + 20.0 && mod(a + 0.45, 1.0) < 0.55) {
        reflectivity = 0.15;
        return vec3(215, 215, 225);
      }
      if (uMapMode < 1.5 && (through || endDist > 7.0) && abs(a - 0.2) < width) {
        reflectivity = 0.2;
        return vec3(235, 165, 40);
      }
      bool divider = !ramp && (uMapMode < 1.5 ? a > 1.0 && abs(a - round(a / 3.5) * 3.5) < width : a < width);
      if ((through || endDist > 8.0) && (divider && mod(w, 10.0) < 4.5 || !openEdge && abs(a - (uRW - 0.3)) < width)) {
        reflectivity = 0.2;
        return vec3(200, 200, 215);
      }
    } else {
      if (!ramp && !openEdge && a < uRW + 0.3) { reflectivity = 0.3; return vec3(0, 225, 255); }
      reflectivity = 0.25;
      bool tile = pxw < 0.5 && (mod(w, 1.6) < 0.12 || mod(a - uRW, 1.6) < 0.10);
      return tile ? vec3(30, 26, 42) : vec3(46, 40, 60);
    }
  }
  float mottled = pxw < 0.35 ? hsh(int(floor(lx * 3.0)), int(floor(w * 3.0)), 9) * 9.0 : 4.5;
  return vec3(24, 22, 34) + mottled;
}
  void main() {
    float roadZ = vUv.y * ${SEGL}.0;
    int d = sector(int(floor(vUv.y))).x;
    bool deck = uGlass > 0.5;
    float deckWidth = d == ${D.HIGHWAY} ? uRW + ${SW} : uRW + 1.5;
    if (uMapMode < 0.5 && deck && abs(vLat) >= deckWidth) discard;
    float pixelWidth = fwidth(vLat);
    float distanceAhead = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
    float fog = smoothstep(uFogNear, uFogFar, distanceAhead) * 0.97;
    float wet, alpha;
    vec3 col;
    if (uMapMode > 0.5) {
      float materialWet;
      vec3 base = mapGround(vLat, roadZ, pixelWidth, materialWet);
      float shade = (1.0 - smoothstep(uMapDeck.y - 1.0, uMapDeck.y + 3.0, abs(vWorld.x - uMapDeck.x)))
        * smoothstep(uMapDeck.z - 5.0, uMapDeck.z + 6.0, vWorld.z)
        * (1.0 - smoothstep(uMapDeck.w - 6.0, uMapDeck.w + 5.0, vWorld.z))
        * (1.0 - smoothstep(25.0, 33.0, vWorld.y));
      col = mix(base / 255.0 * (1.0 - 0.32 * shade), uFog, fog);
      wet = materialWet * (1.0 - fog) * uWet * (1.0 - smoothstep(45.0, 170.0, distanceAhead));
      alpha = deck && abs(vLat) < uRW - 0.48 && materialWet > 0.4 ? 0.34 : 1.0;
      if (deck && uCam.y < vWorld.y - 0.2) {
        bool trim = abs(abs(vLat) - (uRW - 0.12)) < max(pixelWidth * 0.52, 0.11);
        vec3 underside = trim ? vec3(19, 103, 136) : vec3(24, 21, 34);
        col = mix(underside / 255.0, uFog, fog);
        alpha = abs(vLat) < uRW - 0.48 ? 0.75 : 1.0;
        wet = 0.0;
      }
    } else {
      col = ground(vLat, roadZ, distanceAhead, pixelWidth, fog, d, deck, wet, alpha);
    }
    if (uMaskPass) {
      float depth = texelFetch(uSceneDepth, ivec2(gl_FragCoord.xy), 0).r;
      if (gl_FragCoord.z > depth + 0.000002) discard;

      vec2 offset = vWorld.xz - uBike;
      float ahead = dot(offset, uBikeForward);
      float across = dot(offset, vec2(uBikeForward.y, -uBikeForward.x)) / 2.8;
      float beam = (1.0 - smoothstep(9.0, 32.0, ahead)) * smoothstep(2.5, 6.0, ahead)
                   * max(0.0, 1.0 - across * across) * uHeadlight;
      if (uMapMode > 0.5) beam *= 1.0 - smoothstep(2.0, 5.0, abs(vWorld.y - uMapBikeHeight));
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
