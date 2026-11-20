import { SEGL } from './world.js';

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
  uniform float uRW;
  uniform sampler2D uSceneDepth;
  uniform bool uMaskPass;
  uniform float uWet;
  uniform float uGlass;
  uniform vec2 uBike;
  uniform vec2 uBikeForward;
  uniform float uHeadlight;

  void main() {
    float a = abs(vLat);
    float roadZ = vUv.y * ${SEGL}.0;
    float pixelWidth = fwidth(vLat);
    float lineWidth = max(0.09, pixelWidth * 0.55);
    float alpha = 1.0;
    float reflectivity;
    vec3 col;

    if (a < uRW) {
      reflectivity = 0.2;
      if (abs(a - 0.2) < lineWidth) col = vec3(235, 165, 40);
      else if (abs(a - 3.5) < lineWidth && mod(roadZ, 10.0) < 4.5) col = vec3(190, 190, 210);
      else if (abs(a - (uRW - 0.3)) < lineWidth) col = uGlass > 0.5 ? vec3(90, 230, 255) : vec3(200, 200, 215);
      else if (uGlass > 0.5) {
        col = vec3(14, 30, 48);
        alpha = 0.30;
        reflectivity = 0.15;
      } else {
        float noise = hsh(int(floor(vLat * 3.0)), int(floor(roadZ * 3.0)), 9);
        col = vec3(24, 22, 34) + mix(9.0 * noise, 4.5, smoothstep(0.25, 0.35, pixelWidth));
        reflectivity = 0.5;
      }
    } else if (a < uRW + 0.3) {
      col = vec3(0, 225, 255);
      reflectivity = 0.3;
    } else {
      bool tile = pixelWidth < 0.5 && (mod(roadZ, 1.6) < max(0.12, pixelWidth) ||
                                       mod(a - uRW, 1.6) < max(0.10, pixelWidth));
      col = tile ? vec3(30, 26, 42) : vec3(46, 40, 60);
      alpha = uGlass > 0.5 ? (tile ? 0.9 : 0.35) : 1.0;
      reflectivity = uGlass > 0.5 ? 0.1 : 0.25;
    }

    float d = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
    float fog = smoothstep(uFogNear, uFogFar, d) * 0.97;
    if (uMaskPass) {
      float depth = texelFetch(uSceneDepth, ivec2(gl_FragCoord.xy), 0).r;
      if (gl_FragCoord.z > depth + 0.000002) discard;
      float wet = reflectivity * (1.0 - fog) * uWet * (1.0 - smoothstep(45.0, 170.0, d));

      vec2 offset = vWorld.xz - uBike;
      float ahead = dot(offset, uBikeForward);
      float across = dot(offset, vec2(uBikeForward.y, -uBikeForward.x)) / 2.8;
      float beam = (1.0 - smoothstep(9.0, 32.0, ahead)) * smoothstep(2.5, 6.0, ahead)
                   * max(0.0, 1.0 - across * across) * uHeadlight;
      fragColor = vec4(wet, beam, 0.0, 1.0);
      return;
    }

    fragColor = vec4(mix(col / 255.0, uFog, fog), alpha);
  }
`;

// the city floor under an elevated road — what you see through the glass deck
export const floorVert = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
export const floorFrag = /* glsl */`
  precision highp float;
  varying vec3 vWorld;
  uniform vec3 uFog, uCam;
  uniform float uFogNear, uFogFar, uTime;
  float h21(vec2 p, float s) {
    p = fract(p * vec2(123.34, 456.21) + s * 0.017);
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  void main() {
    // rooftops and lit windows of the city you are riding over
    vec2 g = floor(vWorld.xz / 2.4);
    float r = h21(g, 57.0);
    vec3 col = vec3(0.055, 0.047, 0.086);
    if (r < 0.20) {
      float t = h21(g, 58.0);
      vec3 c = t > 0.72 ? vec3(0.47, 0.86, 1.0)
             : t > 0.44 ? vec3(1.0, 0.78, 0.47)
             : t > 0.22 ? vec3(1.0, 0.47, 0.78)
                        : vec3(1.0, 0.92, 0.75);
      col = c * (0.45 + 0.55 * h21(g, 59.0));
    }
    // the street grid between the blocks, with its own lamps
    vec2 blk = fract(vWorld.xz / 46.0);
    if (blk.x < 0.09 || blk.y < 0.09) {
      col = vec3(0.035, 0.031, 0.055);
      vec2 lamp = fract(vWorld.xz / 9.0);
      if ((blk.x < 0.09 && lamp.y < 0.12) || (blk.y < 0.09 && lamp.x < 0.12))
        col = vec3(0.47, 0.86, 1.0) * 0.55;
    }
    float d = distance(vWorld, uCam);
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.97);
    gl_FragColor = vec4(col, 1.0);
  }
`;
