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
  varying vec2 vUv;
  varying vec3 vWorld;
  varying float vLat;
  uniform vec3 uFog;
  uniform float uFogNear, uFogFar;
  uniform vec3 uCam;
  uniform float uRW, uSW;
  uniform sampler2D uReflect;
  uniform vec2 uRes;
  uniform float uWet;
  uniform float uGlass;   // 1 on levels 2 and 3: the deck is see-through

  void main() {
    float a = abs(vLat);
    vec3 col;
    if (a >= uRW) {
      col = vec3(0.095, 0.092, 0.125);                    // pavement
      // paving slabs, and a pale kerb edge where it meets the road
      vec2 slab = vec2(fract(vUv.y * 0.5), fract((a - uRW) / 1.6));
      if (slab.x < 0.05 || slab.y < 0.05) col *= 1.45;
      if (a < uRW + 0.05) col = vec3(0.26, 0.25, 0.3);
    } else {
      col = vec3(0.055, 0.055, 0.075);                    // asphalt
      // lane markings: centre line and the dashed lane divides
      float lane = abs(fract((vLat + uRW) / (uRW * 2.0 / 4.0)) - 0.5);
      if (a < 0.16) col = vec3(0.65, 0.55, 0.15);         // centre
      else if (lane > 0.47 && fract(vUv.y * 3.0) < 0.45) col = vec3(0.6, 0.62, 0.68);
      if (a > uRW - 0.25) col = vec3(0.5, 0.52, 0.6);     // edge line
    }
    // levels 2 and 3 ride on a clear glass deck: dark blue glass over the city,
    // with the pavement's tile lines left solid
    float alpha = 1.0;
    if (uGlass > 0.5) {
      if (a < uRW) {
        if (col.r < 0.1) { col = vec3(0.055, 0.118, 0.188); alpha = 0.30; }   // plain deck
        else alpha = 0.92;                                                    // keep the markings
      } else {
        bool line = mod(vUv.y * 0.5, 1.0) < 0.05 || mod((a - uRW) / 1.6, 1.0) < 0.05;
        alpha = line ? 0.9 : 0.35;
        col = line ? col : vec3(0.08, 0.1, 0.16);
      }
    }

    // wet tarmac: the mirrored lights, smeared along the road and fading out
    // with distance, the way the original's reflection buffer did
    if (uWet > 0.01) {
      vec2 ruv = gl_FragCoord.xy / uRes;
      vec3 refl = texture2D(uReflect, ruv).rgb;
      float lum = dot(refl, vec3(0.3, 0.5, 0.2));
      // the brighter the thing above, the more of it the tarmac carries
      float k = uWet * (0.35 + 0.55 * smoothstep(0.02, 0.45, lum));
      col = mix(col * (1.0 - 0.3 * uWet), refl, k);
    }
    float d = distance(vWorld, uCam);
    float fg = smoothstep(uFogNear, uFogFar, d);
    col = mix(col, uFog, fg * 0.97);
    gl_FragColor = vec4(col, alpha);
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
