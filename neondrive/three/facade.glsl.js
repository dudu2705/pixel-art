// The GPU reference's wallTex, billboard and roofTex formulas evaluated on
// the streamed three.js building meshes.
import * as THREE from './vendor/three.module.js';
import { blocks, D, LH, SEGL } from './world.js';
import { integerHash } from './shaders.js';

const BUILDING_TEXELS = 18;
const BUILDINGS_PER_ROW = 64;

export function makeBuildingTexture() {
  const width = BUILDINGS_PER_ROW * BUILDING_TEXELS;
  const height = Math.ceil(blocks.length / BUILDINGS_PER_ROW);
  const data = new Float32Array(width * height * 4);
  for (const building of blocks) {
    const offset = building.id * BUILDING_TEXELS * 4;
    const put = (index, values) => data.set(values, offset + index * 4);
    const { style, h, seed, id, winP, dark, crown, bbs } = building;
    put(0, [style, h, seed, id]);
    put(1, [winP, dark, Number(Boolean(crown)), Math.min(2, bbs.length)]);
    put(2, building.base);
    if (crown) put(3, crown);
    put(4, building.lobby);
    put(5, building.avg);
    building.shop.forEach((color, index) => put(6 + index, color));
    put(9, [building.len, building.roofKind, building.roof, building.start]);
    bbs.slice(0, 2).forEach((board, index) => {
      const slot = 10 + index * 4;
      put(slot, [board.u0, board.u1, board.v0, board.v1]);
      put(slot + 1, [board.kind, board.seed, board.seed % (2 * Math.PI), board.seed % 4]);
      put(slot + 2, board.c1);
      put(slot + 3, board.c2);
    });
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.needsUpdate = true;
  return texture;
}

export const facadeVert = /* glsl */`
  attribute vec3 iPos, iSize;
  attribute float iRot;
  attribute vec3 iWall; // building id, distance along the wall, side of the road

  flat out int vBuilding;
  varying vec3 vWorld, vLocal, vNormalL;
  varying vec2 vWall;

  void main() {
    vBuilding = int(iWall.x);
    vNormalL = normal;
    vLocal = position * iSize;
    vWall = vec2((iWall.z * position.x + 0.5) * iSize.x, vLocal.z + iWall.y);
    float c = cos(iRot), s = sin(iRot);
    vec3 p = vLocal;
    vWorld = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z) + iPos;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const facadeFrag = /* glsl */`
precision highp float;
precision highp int;
uniform highp sampler2D uBuildings;
uniform vec3 uFog;
uniform float uFogNear, uFogFar, uTime, uFlash;
flat in int vBuilding;
varying vec3 vWorld, vLocal, vNormalL;
varying vec2 vWall;
out vec4 fragColor;

bool gHole;                                          // set by wallTex where the facade is see-through (the JavaScript's TR = -1)
float gMpp;                                          // the real size of the pixel on the wall (wallTex itself gets 0: full detail)
const vec3 WIN_[6] = vec3[6](vec3(255, 200, 120), vec3(255, 170, 90), vec3(120, 220, 255), vec3(255, 120, 200), vec3(200, 190, 255), vec3(255, 236, 190));
const vec3 COOL_[4] = vec3[4](vec3(180, 210, 255), vec3(140, 200, 255), vec3(210, 230, 255), vec3(120, 180, 240));
const vec3 STK_[6] = vec3[6](vec3(110, 50, 30), vec3(40, 90, 90), vec3(40, 70, 130), vec3(90, 60, 40), vec3(70, 70, 80), vec3(50, 80, 40));
const float LH1 = ${LH[1]}.0, LH2 = ${LH[2]}.0;
float jm(float a, float b) { return a - b * trunc(a / b); }                   // JavaScript's %, sign of the dividend
${integerHash}
float vns(float x, float y, int s) {
  float fx0 = floor(x), fy0 = floor(y); int ix = int(fx0), iy = int(fy0); float fx = x - fx0, fy = y - fy0;
  float a = hsh(ix, iy, s), b = hsh(ix + 1, iy, s), c = hsh(ix, iy + 1, s), d = hsh(ix + 1, iy + 1, s);
  float ux = fx * fx * (3.0 - 2.0 * fx), uy = fy * fy * (3.0 - 2.0 * fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
// one building: 18 texels per row (see bldPack)
int bI; int bStyle, bSeed, bId, bDark, bNbb; float bH, bWinP; bool bHasCrown; vec3 bBase, bCrown, bLobby, bAvg, bShop0, bShop1, bShop2;
vec4 bt(int i) {
  return texelFetch(uBuildings, ivec2((bI % ${BUILDINGS_PER_ROW}) * ${BUILDING_TEXELS} + i, bI / ${BUILDINGS_PER_ROW}), 0);
}
void loadB(int bi) {
  bI = bi; vec4 t0 = bt(0), t1 = bt(1);
  bStyle = int(t0.x); bH = t0.y; bSeed = int(t0.z); bId = int(t0.w);
  bWinP = t1.x; bDark = int(t1.y); bHasCrown = t1.z > 0.5; bNbb = int(t1.w);
  bBase = bt(2).rgb; bCrown = bt(3).rgb; bLobby = bt(4).rgb; bAvg = bt(5).rgb; bShop0 = bt(6).rgb; bShop1 = bt(7).rgb; bShop2 = bt(8).rgb;
}
vec3 shop(int i) { return i == 0 ? bShop0 : i == 1 ? bShop1 : bShop2; }
// billboard b: texels 10+4b .. 13+4b = (u0,u1,v0,v1), (kind, seed, seed mod 2pi, seed mod 4), c1, c2
vec3 billboard(int b, float uu, float vv) {
  if (uu < 0.04 || uu > 0.96 || vv < 0.07 || vv > 0.93) return vec3(34, 30, 44);
  vec4 k = bt(11 + 4 * b); vec3 c1 = bt(12 + 4 * b).rgb, c2 = bt(13 + 4 * b).rgb;
  int kind = int(k.x), seed = int(k.y); float sp = k.z, s4 = k.w;
  float qu = floor(uu * 24.0) / 24.0, qv = floor(vv * 12.0) / 12.0;
  vec3 c;
  if (kind == 0) {
    float t = jm(qv * 2.0 + qu * 0.5 + uTime * 0.4, 1.0);
    c = mix(c1, c2, t < 0.5 ? t * 2.0 : 2.0 - t * 2.0);
  } else if (kind == 1) {
    int gx = int(floor((uu - 0.1) / 0.8 * 7.0)), gy = int(floor((vv - 0.15) / 0.7 * 5.0));
    bool on = gx >= 0 && gx < 7 && gy >= 0 && gy < 5 && hsh(gx % 7 < 4 ? gx : 6 - gx, gy, seed) < 0.55;
    c = on ? c1 : mix(c2, vec3(0), 0.78);
    if (hsh(int(floor(uTime * 4.0)), seed, 2) < 0.08) c = mix(c, vec3(255), 0.5);
  } else if (kind == 3) {
    float hgt = 0.5 + 0.45 * sin(uTime * 5.0 + floor(uu * 16.0) * 0.9 + sp);
    c = (1.0 - vv) < hgt ? mix(c1, c2, 1.0 - vv) : mix(c2, vec3(0), 0.8);
  } else if (kind == 4) {
    float ex = abs(qu - 0.5) - 0.18, ey = qv - 0.4;
    bool eyes = ex * ex * 9.0 + ey * ey * 30.0 < 0.4 && jm(uTime * 0.7 + s4, 4.0) > 0.2;
    c = eyes || (abs(qv - 0.72) < 0.05 && abs(qu - 0.5) < 0.22) ? c1 : mix(c2, vec3(0), 0.65);
  } else {
    float d = length(vec2((qu - 0.5) * 2.2, (qv - 0.5) * 1.6)), r = 0.45 + sin(uTime * 3.0 + sp) * 0.12;
    c = d < r * 0.45 ? vec3(10, 10, 20) : d < r ? c1 : mix(c2, vec3(0), 0.7);
  }
  float scan = (int(floor(vv * 24.0)) & 1) == 1 ? 0.82 : 1.0;
  return c * scan;
}
const int DIGITS[10] = int[10](31599, 29850, 29671, 31207, 18925, 31183, 31695, 18727, 31727, 31215);
bool fontBit(int digit, int i) { return ((DIGITS[digit] >> i) & 1) == 1; }
vec3 wallTex(float u, float v, bool front, float mpp) {
  if (bHasCrown && v > bH - 0.6 && bStyle != 2) return bCrown;
  if (bStyle != 11) for (int q = 1; q < 3; q++) {
    float lv = v - (q == 1 ? LH1 : LH2);
    if (lv > -0.7 && lv < 3.4 && bH > (q == 1 ? LH1 : LH2) + 5.0) {
      if (lv < -0.25) return bLobby * (bDark == 1 ? 0.3 : 1.0);
      if (lv > 3.0 || jm(u, 3.0) < 0.18) return vec3(34, 30, 44);
      float k = (0.5 + 0.25 * lv / 3.0) * (bDark == 1 ? 0.25 : 1.0);
      if (mpp > 0.9) return vec3(230, 190, 150) * k;
      float cf = floor(u / 1.3); int cell = int(cf); float fu = u / 1.3 - cf;
      if (mpp < 0.35 && lv < 1.8 && fu > 0.4 && fu < 0.65 && hsh(cell, q, bSeed) < 0.2 && (lv < 1.45 || fu > 0.45 && fu < 0.6)) return vec3(16, 12, 22);
      return vec3(255, 205, 160) * k;
    }
  }
  if (!front) for (int b = 0; b < 2; b++) {
    if (b >= bNbb) break;
    vec4 r = bt(10 + 4 * b);
    if (u >= r.x && u < r.y && v >= r.z && v < r.w) return billboard(b, (u - r.x) / (r.y - r.x), 1.0 - (v - r.z) / (r.w - r.z));
  }
  vec3 bc = bBase;
  if (bStyle == 2) {
    float bf = floor(u / 1.8); int bayN = int(bf); float fu = u / 1.8 - bf;
    if (bayN % 4 == 0 && fu < 0.12 && v > 5.0) {
      float run = jm(jm(v * 0.35 - mod(uTime * 4.0, 6.0) + float(bayN) * 0.37 + float(bSeed % 6), 6.0) + 6.0, 6.0);
      return bCrown * (run < 1.2 ? 1.0 : 0.28);
    }
    if (mpp > 1.2) return bAvg;
    if (v < 5.0) {
      bool m = jm(u, 3.0) < 0.15 || v > 4.6;
      if (m) return bc * 0.7;
      return vec3(200, 190, 170) * (0.3 + 0.15 * (v / 5.0));
    }
    float ff = floor(v / 3.6); int fl = int(ff); float fv = v / 3.6 - ff;
    if (fv > 0.12 && fv < 0.92 && fu > 0.06 && fu < 0.94) {
      if (hsh(bayN, fl, bSeed) < bWinP) {
        vec3 c = COOL_[int(hsh(bayN, fl, bSeed + 1) * 4.0)]; float k = 0.45 + 0.4 * hsh(bayN, fl, bSeed + 2);
        return c * k;
      }
      return vec3(18.0 + fv * 22.0, 26.0 + fv * 22.0, 46.0 + fv * 30.0);
    }
    return bc * 1.3;
  }
  if (bStyle == 4 && v < 16.0) {
    if (bHasCrown && v > bH - 2.2 && v < bH - 1.4) return bCrown;
    float cf = floor(u / 9.0); int cell = int(cf); float cu = u - cf * 9.0;
    if (v < 5.5 && cu > 1.5 && cu < 7.5) {
      if (hsh(cell, bId, 9) < 0.35) return vec3(255, 170, 90) * (0.45 + 0.2 * (v / 5.5));
      bool sl = jm(v, 0.5) < 0.08; return bc * (sl ? 0.6 : 1.1);
    }
    float rib = mpp < 0.3 && jm(u, 0.7) < 0.15 ? 0.75 : 1.0;
    return bc * rib;
  }
  if (bStyle == 6 && v >= 3.8) {
    float ff = floor(v / 3.2); int fl = int(ff); float fv = v / 3.2 - ff;
    if (fv < 0.2 && mpp < 0.9) {
      float hh = hsh(int(floor(u * 2.5)), fl, bSeed);
      vec3 c = hh < 0.35 ? vec3(50, 200, 120) : hh < 0.5 ? vec3(200, 80, 230) : hh < 0.62 ? vec3(60, 220, 230) : vec3(70, 64, 80);
      return c * (hh < 0.62 ? 0.8 : 1.0);
    }
  }
  if (bStyle == 7 && v >= 3.8) {
    float cf = floor(u / 10.0); int cell = int(cf); float cu = u - cf * 10.0, top = min(bH - 2.5, 32.0);
    if (cu > 0.6 && cu < 9.4 && v > 5.0 && v < top) {
      vec3 c1 = shop(cell % 3), c2 = shop((cell + 1) % 3);
      if (mpp > 1.0) return c1 * 0.45;
      float uu = (cu - 0.6) / 8.8, vv = 1.0 - (v - 5.0) / (top - 5.0); int kind = int(hsh(cell, bId, 7) * 4.0);
      vec3 c = vec3(8, 8, 14);
      if (kind == 0) {
        int num = 99 - (int(floor(uTime * 2.0 + float(cell * 7))) % 100), gx = int(floor(uu * 9.0)) - 1, gy = int(floor(vv * 7.0)) - 1;
        if (gx >= 0 && gx < 7 && gx != 3 && gy >= 0 && gy < 5) {
          int dg = gx < 3 ? num / 10 : num % 10;
          if (fontBit(dg, gy * 3 + (gx < 3 ? gx : gx - 4))) c = c1;
        }
      } else if (kind == 1) {
        float bar = floor(uu * 12.0), hgt = 0.5 + 0.5 * sin(uTime * 4.0 + bar * 1.3 + float(cell));
        if ((1.0 - vv) < hgt * 0.9 && jm(uu * 12.0, 1.0) < 0.8) c = mix(c1, c2, 1.0 - vv);
      } else if (kind == 2) { float t = jm(jm(uu * 3.0 + vv * 2.0 - uTime * 0.8, 1.0) + 1.0, 1.0); c = mix(c1, c2, t < 0.5 ? t * 2.0 : 2.0 - t * 2.0); }
      else { float dd = length(vec2((uu - 0.5) * 2.0, (vv - 0.5) * 1.6)), r = 0.4 + sin(uTime * 3.0 + float(cell)) * 0.12; c = dd < r * 0.4 ? vec3(255) : dd < r ? c1 : mix(c2, vec3(0), 0.75); }
      float scan = (int(floor(vv * 30.0)) & 1) == 1 ? 0.8 : 1.0;
      return c * scan;
    }
    if (v < top + 0.8 && (cu <= 0.6 || cu >= 9.4 || v >= top)) return vec3(26, 24, 34);
  }
  if (bStyle == 9) {
    if (mpp > 0.8) return bAvg;
    float ff = floor(v / 2.6); int fl = int(ff); float fv = v / 2.6 - ff, uo = u + hsh(fl, 1, bSeed) * 2.4, cf = floor(uo / 2.4); int cell = int(cf); float fu = uo / 2.4 - cf;
    if (fu < 0.06 || fv < 0.07) return vec3(14, 11, 12);
    float hh = hsh(cell, fl, bSeed);
    if (hh < 0.08) return vec3(6, 5, 8);
    if (fu > 0.32 && fu < 0.68 && fv > 0.3 && fv < 0.72) {
      if (hsh(cell, fl, bSeed + 3) < bWinP) return WIN_[int(hh * 6.0)] * 0.8;
      return vec3(16, 14, 22);
    }
    if (fv > 0.76 && fu > 0.08 && fu < 0.3 && hh > 0.7) return vec3(110, 110, 116);
    return STK_[int(hsh(cell, fl, bSeed + 1) * 6.0)] * (0.45 + 0.35 * hh);
  }
  if (bStyle == 10) {
    float scanV = jm(uTime * 4.0 + float(bSeed % 50), bH);
    if (abs(v - scanV) < max(0.15, gMpp * 0.6)) return vec3(120, 255, 140);   // the real pixel size: the scan line stays a line far away
    if (mpp < 0.45) {
      float cxf = floor(u / 0.5), cyf = floor(v / 0.5); int cx_ = int(cxf), cy_ = int(cyf); float hh = hsh(cx_, cy_, bSeed);
      float fu = u / 0.5 - cxf, fv = v / 0.5 - cyf;
      if (hh < 0.06 && fu > 0.3 && fu < 0.7 && fv > 0.35 && fv < 0.65) {
        bool on = hsh(cx_, cy_, int(floor(uTime * (2.0 + hh * 30.0)))) < 0.6;
        vec3 c = hh < 0.035 ? vec3(60, 255, 120) : vec3(70, 160, 255);
        return on ? c : c * 0.15;
      }
    }
    bool pnl = mpp < 0.6 && jm(u, 3.0) < 0.08;
    return pnl ? vec3(24, 28, 34) : vec3(10, 12, 16);
  }
  if (bStyle == 11) {                                // construction: open steel skeleton, tarps, hoarding
    if (v < 3.6) {
      if (v > 2.2 && v < 2.6) { bool st = jm(u + v, 1.2) < 0.6; return st ? vec3(220, 170, 30) : vec3(20, 18, 16); }
      if (v < 2.6) return vec3(90, 78, 58);
    }
    float ff = floor(v / 3.6); int fl = int(ff); float fv = v / 3.6 - ff, bf = floor(u / 4.0); int bayN = int(bf); float fu = u / 4.0 - bf;
    float thick_ = max(0.1, gMpp * 0.25);
    if (fv < 0.1 + thick_ * 0.3 || fu < 0.09 + thick_ * 0.3) return vec3(150, 82, 30);
    if (hsh(bayN, fl, bSeed) < 0.3 && v < bH - 6.0) { vec3 tc = hsh(bayN, fl, bSeed + 1) < 0.5 ? vec3(40, 80, 160) : vec3(150, 150, 160); return tc * (0.8 + 0.2 * sin(u * 3.0 + uTime * 2.0)); }
    if (abs(fu - fv) < 0.05 + thick_ * 0.2 && hsh(bayN, fl, bSeed + 2) < 0.5) return vec3(130, 70, 26);
    if (fu < 0.2 && fv < 0.25 && hsh(bayN, fl, bSeed + 4) < 0.08 && jm(uTime * 2.0 + float(bayN), 1.0) < 0.5) return vec3(255, 150, 40);
    gHole = true; return vec3(0);
  }
  if (bStyle == 12) {
    if (v > bH - 1.2) { bool e = v > bH - 0.3; return e ? vec3(70, 52, 50) : vec3(28, 22, 26); }
    if (v < 3.8) {
      if (v > 2.0 && v < 2.8 && jm(u, 4.0) > 0.5 && jm(u, 4.0) < 3.5) { vec3 c = hsh(int(floor(u / 4.0)), 1, bSeed) < 0.5 ? vec3(170, 30, 30) : vec3(30, 40, 110); float sl = jm(u, 0.8) < 0.08 ? 0.6 : 1.0; return c * sl; }
      if (v > 0.2 && v < 2.0) { bool lat = jm(u, 0.5) < 0.06 || jm(v, 0.6) < 0.06; return lat ? vec3(60, 40, 30) : vec3(200, 160, 110); }
    }
    if (mpp < 0.8) {
      float ff = floor(v / 3.0); int fl = int(ff); float fv = v / 3.0 - ff, bf = floor(u / 2.4); int bayN = int(bf); float fu = u / 2.4 - bf;
      if (fu > 0.2 && fu < 0.8 && fv > 0.3 && fv < 0.75) {
        if (jm(fu * 2.4, 0.4) < 0.05 || jm(fv * 3.0, 0.4) < 0.05) return vec3(50, 34, 26);
        bool lit = hsh(bayN, fl, bSeed) < 0.6; return lit ? vec3(230, 170, 110) : vec3(60, 44, 34);
      }
      float pk = jm(v, 0.5) < 0.05 ? 0.7 : 1.0; return bc * pk;
    }
    return vec3(bc.r * 1.2, bc.g * 1.1, bc.b);
  }
  if (bStyle == 14) {                                // stilt canals: houses on poles above the water
    if (v < 3.4) {
      if (v > 3.0) { bool lt = jm(u, 1.5) < 0.2 && mpp < 0.6; return lt ? vec3(255, 210, 140) : vec3(60, 48, 40); }
      if (jm(u, 4.0) < 0.5) return vec3(40, 34, 40);
      gHole = true; return vec3(0);
    }
    v -= 3.4;
  }
  if (bStyle == 15) {
    if (v > bH - 0.8) return vec3(bc.r * 1.35, bc.g * 1.3, bc.b * 1.2);
    float band = vns(u * 0.03, v * 0.35, bSeed % 997) * 0.7 + vns(u * 0.2, v * 1.2, 7) * 0.3;
    if (mpp < 0.8) {
      float ff = floor(v / 4.0); int fl = int(ff); float fv = v / 4.0 - ff, bf = floor(u / 5.0); int bayN = int(bf); float fu = u / 5.0 - bf;
      if (fu > 0.3 && fu < 0.6 && fv > 0.35 && fv < 0.7 && hsh(bayN, fl, bSeed) < 0.12) { vec3 c = WIN_[int(hsh(bayN, fl, 2) * 6.0)]; return vec3(c.r * 0.8, c.g * 0.75, c.b * 0.6); }
    }
    return bc * (0.65 + band * 0.7);
  }
  if (bStyle == ${D.FORGE}) {
    if (v < 3.8) {
      float cf = floor(u / 6.0); int cell = int(cf); float cu = u - cf * 6.0;
      if (cu > 1.0 && cu < 5.0 && v < 3.0 && hsh(cell, bId, 13) < 0.6) return vec3(255, 120, 40) * (0.6 + 0.4 * sin(uTime * 5.0 + float(cell)));
    } else {
      if (mpp > 1.0) return bAvg;
      float ff = floor(v / 5.0); int fl = int(ff); float fv = v / 5.0 - ff; int bay = int(floor(u / 3.0));
      if (fv > 0.45 && fv < 0.6 && hsh(bay, fl, bSeed) < bWinP) return vec3(255, 110, 30) * (0.7 + 0.3 * sin(uTime * 7.0 + float(bay) * 1.7 + float(fl)));
      if (jm(u, 7.0) < 0.6 && mpp < 0.8) return vec3(62, 40, 34);
    }
    float seam = mpp < 0.6 && jm(v, 2.5) < 0.12 ? 0.6 : 1.0;
    return bc * seam;
  }
  if (bStyle == ${D.TERRACE}) {
    float ff = floor(v / 5.0); int fl = int(ff); float fv = v / 5.0 - ff;
    if (fl > 0 && fv < 0.18) {
      if (mpp > 0.9) return vec3(40, 90, 50);
      int row = int(floor(u * 2.5)) & 1; float sh = 0.8 + 0.2 * sin(u * 0.7 + uTime * 1.2 + float(fl));
      return (row == 1 ? vec3(70, 150, 70) : vec3(30, 90, 80)) * sh;
    }
    if (fl > 0 && fv < 0.22) return vec3(20, 24, 20);
    if (mpp < 0.8 && v > 3.8) {
      float bf = floor(u / 3.0); int bay = int(bf); float fu = u / 3.0 - bf;
      if (fu > 0.25 && fu < 0.75 && fv > 0.35 && fv < 0.8) {
        if (hsh(bay, fl, bSeed) < bWinP) { vec3 c = WIN_[int(hsh(bay, fl, 4) * 6.0)]; return vec3(c.r * 0.8, c.g * 0.8, c.b * 0.7); }
        return vec3(14, 18, 16);
      }
    }
    if (v >= 3.8 || mpp >= 0.8) {
      float st = mpp < 0.5 && (jm(u + float(fl & 1) * 0.6, 1.2) < 0.06 || jm(v, 1.0) < 0.05) ? 0.7 : 1.0;
      return bc * st;
    }
  }
  if (bStyle == ${D.REEF}) {
    if (mpp > 1.1) return bAvg;
    float kelp = jm(jm(u - sin(v * 0.25 + uTime * 0.8 + u * 0.1) * 0.9, 3.5) + 3.5, 3.5);
    if (kelp < 0.35 && hsh(int(floor(u / 3.5)), 1, bSeed) < 0.5) return vec3(30.0, 120.0 + 40.0 * sin(v * 0.5), 60.0);
    float ff = floor(v / 4.0); int fl = int(ff); float fv = v / 4.0 - ff, bf = floor(u / 3.2); int bay = int(bf); float fu = u / 3.2 - bf, dx = fu - 0.5, dy = fv - 0.55;
    if (v > 3.0 && dx * dx + dy * dy < 0.06) {
      if (hsh(bay, fl, bSeed) < bWinP) return vec3(60, 230, 220) * (0.6 + 0.3 * sin(uTime * 1.5 + float(bay) + float(fl)));
      return vec3(6, 20, 30);
    }
    float sp = hsh(int(floor(u * 1.5)), int(floor(v * 1.5)), bSeed + 9);
    if (sp < 0.03 && mpp < 0.5) {
      vec3 c = sp < 0.015 ? vec3(255, 120, 220) : vec3(120, 255, 240);
      return c * (0.5 + 0.5 * sin(uTime * 2.0 + sp * 300.0));
    }
    return bc * (0.7 + 0.6 * (mpp < 0.5 ? vns(u * 0.2, v * 0.2, bSeed % 991) : 0.5));
  }
  if (bStyle == ${D.FAIR}) {
    if (v < 7.0) {
      if (v > 6.2) { bool on = jm(jm(u * 2.0 - uTime * 6.0, 2.0) + 2.0, 2.0) < 1.0; return on ? vec3(255, 220, 140) : vec3(90, 70, 40); }
      vec3 c = (int(floor(u / 1.2)) & 1) == 1 ? bShop0 : vec3(235, 225, 210);
      float k = v < 3.0 && jm(u, 6.0) > 1.0 && jm(u, 6.0) < 5.0 ? 1.1 : 0.75;
      return c * k;
    }
    if (mpp > 1.0) return bAvg;
    float ff = floor(v / 4.0); int fl = int(ff); float fv = v / 4.0 - ff, bf = floor(u / 3.0); int bay = int(bf); float fu = u / 3.0 - bf;
    if (fv < 0.08 || fu < 0.06) {
      bool on = ((int(floor((u + v) * 2.0)) - int(floor(uTime * 8.0))) % 4 + 4) % 4 == 0;
      return on ? vec3(255, 230, 150) : vec3(70, 50, 40);
    }
    if (hsh(bay, fl, bSeed) < bWinP) return shop(int(hsh(bay, fl, 3) * 3.0)) * 0.7;
    return bc;
  }
  if (bStyle == ${D.RUIN}) {
    float vn = vns(u * 0.18, v * 0.06, bSeed % 997) + hsh(int(floor(u * 0.9)), int(floor(v * 0.4)), 5) * 0.25;
    float grow = 0.8 - 0.4 * max(0.0, 1.0 - v / 20.0) - 0.25 * max(0.0, (v - bH + 15.0) / 15.0);
    if (vn > grow) {
      bool leaf = mpp < 0.5 && hsh(int(floor(u * 3.0)), int(floor(v * 3.0)), bSeed) < 0.3;
      return leaf ? vec3(70, 130, 50) : vec3(26, 60, 28);
    }
    if (mpp < 0.6 && v > 3.8) {
      float ff = floor(v / 3.2), bf = floor(u / 2.6); int fl = int(ff), bay = int(bf); float fv = v / 3.2 - ff, fu = u / 2.6 - bf;
      if (hsh(bay, fl, bSeed + 21) < 0.3 && fv > 0.28 && fv < 0.82 && fu > 0.15 && fu < 0.85) return vec3(4, 4, 6);
    }
  }
  if (bStyle == ${D.CITADEL}) {                      // storm citadel: battlements, buttresses, pointed windows
    if (v > bH - 1.6) { if (jm(u, 2.4) < 1.2) return bc * 1.2; gHole = true; return vec3(0); }
    float bf = floor(u / 4.0); int bay = int(bf); float fu = u / 4.0 - bf;
    if (bay % 3 == 0 && fu < 0.16) return bc * 1.5;
    if (mpp > 1.0) return bAvg;
    float ff = floor(v / 8.0); int fl = int(ff); float fv = v / 8.0 - ff;
    if (v > 3.8 && fu > 0.32 && fu < 0.68 && fv > 0.12 && fv < 0.88 && (fv < 0.7 || abs(fu - 0.5) < (0.88 - fv))) {
      if (mpp < 0.4 && (jm(fu * 4.0, 1.0) < 0.1 || jm(fv * 8.0, 1.0) < 0.08)) return vec3(20, 22, 30);
      float k = hsh(bay, fl, bSeed) < bWinP ? 0.6 + 0.2 * sin(uTime * 0.7 + float(bay)) + uFlash * 0.3 : 0.1;
      return vec3(150, 190, 255) * k;
    }
    bool blk = mpp < 0.5 && (jm(v, 1.2) < 0.08 || jm(u + floor(v / 1.2) * 0.9, 1.8) < 0.08);
    return bc * (blk ? 0.75 : 1.0);
  }
  if (bStyle == ${D.BAZAAR}) {
    if (v < 4.2) {
      float cf = floor(u / 3.2); int cell = int(cf); float cu = u / 3.2 - cf, top = min(3.6, 3.0 + (0.5 - abs(cu - 0.5)) * 1.6);
      if (cu > 0.12 && cu < 0.88 && v < top) return shop(cell % 3) * (0.4 + 0.25 * v / 3.6);
      return bc * 0.85;
    }
    if (jm(v, 4.0) < 0.3) return vec3(40, 170, 170);
    if (mpp > 0.9) return bAvg;
    float ff = floor(v / 4.0); int fl = int(ff); float fv = v / 4.0 - ff, bf = floor(u / 3.0); int bay = int(bf); float fu = u / 3.0 - bf;
    if (fu > 0.2 && fu < 0.8 && fv > 0.2 && fv < 0.85) {
      if (hsh(bay, fl, bSeed) < bWinP) {
        bool lat = mpp < 0.35 && (jm(fu * 9.0 + fv * 9.0, 1.0) < 0.25 || jm(jm(fu * 9.0 - fv * 9.0, 1.0) + 1.0, 1.0) < 0.25);
        return vec3(255, 180, 90) * (lat ? 0.25 : 0.75);
      }
      return bc * 0.4;
    }
    return bc;
  }
  if (mpp > 0.75 && v >= 3.8) return bAvg;
  if (v < 3.8) {
    float cf = floor(u / 6.0); int cell = int(cf); float cu = u - cf * 6.0;
    if (v > 3.0 && v < 3.6) {
      vec3 c = shop(int(hsh(cell, bId, 3) * 3.0));
      if (cu > 0.4 && cu < 5.6 && hsh(int(floor(cu * 2.2)), cell, bId) < 0.6 && !(bDark == 1 && hsh(cell, bId, 11) < 0.75)) return c;
      return vec3(16, 10, 22);
    }
    if (cu > 0.5 && cu < 5.5 && v > 0.15 && v < 2.8) {
      float k = (0.35 + 0.25 * (v / 2.8)) * (bDark == 1 ? (hsh(cell, bId, int(floor(uTime * 6.0))) < 0.08 ? 0.8 : 0.12) : 1.0);
      return shop(cell % 3) * k;
    }
    return bc * 0.8;
  }
  float ff = floor(v / 3.2); int fl = int(ff); float fv = v / 3.2 - ff, bf = floor(u / 2.6); int bayN = int(bf); float fu = u / 2.6 - bf;
  if (fv > 0.28 && fv < 0.82 && fu > 0.15 && fu < 0.85) {
    if (hsh(bayN, fl, bSeed) < bWinP) {
      vec3 c = WIN_[int(hsh(bayN, fl, bSeed + 1) * 6.0)]; float k = 0.5 + 0.5 * hsh(bayN, fl, bSeed + 2);
      return c * k;
    }
    return vec3(14.0 + fv * 14.0, 14.0 + fv * 8.0, 28.0 + fv * 18.0);
  }
  float p = fu < 0.08 || fu > 0.92 ? 1.35 : 1.0;
  return bc * p;
}
// every distance gets the full detail: one sample up close, and further out a grid of samples across the
// pixel's footprint on the wall, averaged, so far facades show their real windows smoothed instead of
// switching from a flat colour to detail (the JavaScript's distance cut-offs) as they come closer
vec4 facade(float uc, float vc, float du, float dv, bool front, float mpp) {
  gMpp = mpp;
  int nu = clamp(int(ceil(du / 0.22)), 1, 4), nv = clamp(int(ceil(dv / 0.22)), 1, 4);
  vec3 acc = vec3(0); float n = 0.0;
  for (int i = 0; i < 4; i++) { if (i >= nu) break;
    for (int j = 0; j < 4; j++) { if (j >= nv) break;
      gHole = false;
      vec3 c = wallTex(uc + du * ((float(i) + 0.5) / float(nu) - 0.5), vc + dv * ((float(j) + 0.5) / float(nv) - 0.5), front, 0.0);
      if (!gHole) { acc += c; n += 1.0; }
    } }
  if (n == 0.0) return vec4(0);
  // a footprint wider than the samples can resolve: ease towards the facade's average colour (gradually, no switch);
  // see-through facades (skeletons, battlements, stilts) cover the pixel only partly
  return vec4(mix(acc / n, bAvg, smoothstep(0.9, 2.6, max(du, dv))), n / float(nu * nv));
}vec3 roofTex(float ul, float w, float lz, float mpp) {
  vec4 t9 = bt(9); float L = t9.x * ${SEGL}.0; int kindR = int(t9.y), roofB = int(t9.z);
  if (ul < 0.5) return bHasCrown ? bCrown : vec3(80, 72, 98);
  float ku = ul - 13.0, kz = lz - L / 2.0;
  if (kindR == 2 && L > 15.0) {
    float d = length(vec2(ku, kz));
    if (d < 7.5) {
      if (d > 6.4) return vec3(230, 190, 40);
      if (abs(ku) < 2.6 && abs(kz) < 3.2 && (abs(ku) > 1.7 || abs(kz) < 0.45)) return vec3(235, 235, 240);
      return vec3(44, 48, 60);
    }
  } else if (kindR == 3) {
    if (jm(lz, 4.0) < 0.3) { bool on = hsh(int(floor(ul * 2.0)), int(floor(lz / 4.0)), int(floor(uTime * 3.0))) < 0.9; return on ? vec3(255, 205, 130) : vec3(90, 70, 50); }
    if (mpp < 0.5 && hsh(int(floor(ul / 2.5)), int(floor(lz / 2.5)), bSeed) < 0.18 && jm(ul, 2.5) < 1.1 && jm(lz, 2.5) < 1.1) return vec3(120, 60, 50);
    bool pl = mpp < 0.4 && jm(lz, 0.8) < 0.08; return pl ? vec3(44, 30, 24) : vec3(78, 52, 36);
  } else if (kindR == 4 && L > 12.0) {
    if (abs(ku) < 9.0 && abs(kz) < L / 2.0 - 2.0) {
      int cu = int(floor((ku + 9.0) / 1.5)), cz = int(floor(lz / 1.5));
      bool on = (cu % 4 != 3) && hsh(cu >> 2, (cu & 3) + (cz % 5) * 3, bSeed) < 0.55; float fl = hsh(int(floor(uTime * 6.0)), bId, 3) < 0.05 ? 0.3 : 1.0;
      if (on) return bLobby * fl;
      return vec3(18, 16, 24);
    }
  } else if (kindR == 5) {
    if (jm(lz, 3.0) < 2.2 && jm(ul, 2.6) < 2.2) { bool ln = mpp < 0.4 && (jm(lz, 0.55) < 0.05 || jm(ul, 0.55) < 0.05); return ln ? vec3(70, 90, 140) : vec3(28, 46, 104); }
    return vec3(40, 40, 48);
  }
  float fxq = floor(ul / 5.0), fzq = floor(w / 5.0); int tx = int(fxq), tz = int(fzq);
  float h = hsh(tx, tz, bSeed), fu = ul / 5.0 - fxq, fz = w / 5.0 - fzq;
  int hk = int(h * 10.0) + roofB * 2, kind = hk > 13 ? 9 : hk % 10;
  if (kind < 4) { bool ln = mpp < 0.5 && (fu < 0.05 || fz < 0.05); return ln ? vec3(26, 24, 32) : vec3(44, 42, 54); }
  if (kind < 6) { bool tree = mpp < 1.0 && hsh(int(floor(ul * 1.2)), int(floor(w * 1.2)), bSeed + 5) < 0.35; return tree ? vec3(60, 140, 74) : vec3(28, 66, 40); }
  if (kind < 8) { bool st = mpp < 0.6 && jm(fz * 5.0, 1.0) < 0.15; return st ? vec3(70, 90, 140) : vec3(24, 42, 84); }
  if (kind < 9) { bool box = fu > 0.25 && fu < 0.75 && fz > 0.25 && fz < 0.75; return box ? vec3(96, 96, 106) : vec3(44, 42, 54); }
  bool pool = fu > 0.15 && fu < 0.85 && fz > 0.2 && fz < 0.8; float ww = 0.7 + 0.3 * sin(w * 2.0 + uTime * 2.0 + ul);
  return pool ? vec3(30.0 * ww, 180.0 * ww, 210.0 * ww) : vec3(44, 42, 54);
}

void main() {
  loadB(vBuilding);
  vec3 normal = abs(vNormalL);
  bool endFace = normal.z > 0.5;
  float u = endFace ? vWall.x : vWall.y;
  float v = vLocal.y;
  vec3 col;

  if (vNormalL.y > 0.5) {
    float roadDistance = bt(9).w * ${SEGL}.0 + vWall.y;
    col = roofTex(vWall.x, roadDistance, vWall.y, max(fwidth(vWall.x), fwidth(vWall.y)));
  } else if (vNormalL.y < -0.5) {
    col = bBase * 0.55;
  } else {
    float du = fwidth(u), dv = fwidth(v);
    vec4 face = facade(u, v, du, dv, endFace, max(du, dv));
    if (face.a < 0.5) discard;
    col = face.rgb * (endFace ? 0.7 : 1.0);
  }

  float distanceAhead = max(0.0, -(viewMatrix * vec4(vWorld, 1.0)).z);
  vec3 fogged = mix(col / 255.0, uFog, smoothstep(uFogNear, uFogFar, distanceAhead) * 0.97);
  fragColor = vec4(fogged, 1.0);
}
`;
