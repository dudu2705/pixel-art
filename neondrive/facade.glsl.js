// facade.glsl.js — wallTex, ported.
//
// The original's buildings are not walls with windows: wallTex is a per-district
// program run for every wall pixel, drawing shopfronts, awnings, balconies,
// stacked signage, lattice screens and so on. That density is most of what the
// game looks like, so this is a near line-for-line port of it to the fragment
// stage, including the metres-per-pixel level of detail (taken from fwidth here
// rather than passed in).

export const facadeVert = /* glsl */`
  attribute vec3 iPos;
  attribute vec3 iSize;
  attribute float iRot;
  attribute vec3 iBase;
  attribute vec3 iCrown;
  attribute vec4 iMeta;     // seed, winP, uOffset, height
  attribute vec4 iExtra;    // style, dark, id, lobby (packed rgb)
  attribute vec4 iShop;     // shop0, shop1, shop2, avg (packed rgb)

  varying vec3 vBase, vCrown;
  varying vec4 vMeta, vExtra, vShop;
  varying vec3 vLocal, vWorld, vNormalW, vNormalL;

  void main() {
    vBase = iBase; vCrown = iCrown; vMeta = iMeta; vExtra = iExtra; vShop = iShop;
    vNormalL = normal;
    vLocal = position * iSize;
    float c = cos(iRot), s = sin(iRot);
    vec3 r = vec3(c * vLocal.x + s * vLocal.z, vLocal.y, -s * vLocal.x + c * vLocal.z);
    vWorld = r + iPos;
    vNormalW = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
  }
`;

export const facadeFrag = /* glsl */`
  precision highp float;
  varying vec3 vBase, vCrown;
  varying vec4 vMeta, vExtra, vShop;
  varying vec3 vLocal, vWorld, vNormalW, vNormalL;

  uniform vec3 uFog, uCam;
  uniform float uFogNear, uFogFar, uTime, uFlash;

  // the generator's own integer hash, so the buildings come out the same
  float hash3(float x, float y, float s) {
    vec3 p = vec3(x, y, s);
    float h = dot(p, vec3(374.761393, 668.265263, 1442.695041));
    h = fract(sin(h) * 43758.5453123);
    return h;
  }
  float vnoise(vec2 p, float s) {
    vec2 i = floor(p), f = fract(p);
    float a = hash3(i.x, i.y, s), b = hash3(i.x + 1.0, i.y, s);
    float c = hash3(i.x, i.y + 1.0, s), d = hash3(i.x + 1.0, i.y + 1.0, s);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  vec3 unpack(float c) {
    float r = floor(c / 65536.0);
    float g = floor(mod(c, 65536.0) / 256.0);
    return vec3(r, g, mod(c, 256.0)) / 255.0;
  }
  vec3 WINC(float i) {
    i = floor(mod(i, 6.0));
    if (i < 0.5) return vec3(1.0, 0.784, 0.471);
    if (i < 1.5) return vec3(1.0, 0.667, 0.353);
    if (i < 2.5) return vec3(0.471, 0.863, 1.0);
    if (i < 3.5) return vec3(1.0, 0.471, 0.784);
    if (i < 4.5) return vec3(0.784, 0.745, 1.0);
    return vec3(1.0, 0.925, 0.745);
  }
  vec3 COOLC(float i) {
    i = floor(mod(i, 4.0));
    if (i < 0.5) return vec3(0.706, 0.824, 1.0);
    if (i < 1.5) return vec3(0.549, 0.784, 1.0);
    if (i < 2.5) return vec3(0.824, 0.902, 1.0);
    return vec3(0.471, 0.706, 0.941);
  }
  vec3 STKC(float i) {
    i = floor(mod(i, 6.0));
    if (i < 0.5) return vec3(0.431, 0.196, 0.118);
    if (i < 1.5) return vec3(0.157, 0.353, 0.353);
    if (i < 2.5) return vec3(0.157, 0.275, 0.510);
    if (i < 3.5) return vec3(0.353, 0.235, 0.157);
    if (i < 4.5) return vec3(0.275, 0.275, 0.314);
    return vec3(0.196, 0.314, 0.157);
  }

  void main() {
    float seed  = vMeta.x, winP = vMeta.y, uOff = vMeta.z, H = vMeta.w;
    float style = vExtra.x, dark = vExtra.y, id = vExtra.z;
    vec3 lobby  = unpack(vExtra.w);
    vec3 shop0 = unpack(vShop.x), shop1 = unpack(vShop.y), shop2 = unpack(vShop.z);
    vec3 avg = unpack(vShop.w);
    vec3 bc = vBase;

    vec3 an = abs(vNormalL);
    bool roof = an.y > 0.7;
    float u = (an.x > an.z ? vLocal.z + uOff : vLocal.x);
    float v = vLocal.y;
    float mpp = max(fwidth(u), fwidth(v));          // metres per pixel: the LOD the original passed in

    vec3 col = bc;
    bool done = false;

    if (roof) {
      col = bc * 0.55;
      vec2 g = fract(vec2(vLocal.x, vLocal.z) / 3.0);
      if (g.x < 0.06 || g.y < 0.06) col *= 1.5;
      done = true;
    }

    // the crown band
    if (!done && length(vCrown) > 0.01 && v > H - 0.6 && style != 2.0) { col = vCrown; done = true; }

    // sky lobbies where the upper roads run past (levels 1 and 2)
    if (!done && style != 11.0) {
      for (int q = 1; q < 3; q++) {
        float LHq = (q == 1) ? 35.0 : 100.0;
        float lv = v - LHq;
        if (lv > -0.7 && lv < 3.4 && H > LHq + 5.0) {
          if (lv < -0.25) { col = lobby * (dark > 0.5 ? 0.3 : 1.0); done = true; break; }
          if (lv > 3.0 || mod(u, 3.0) < 0.18) { col = vec3(0.133, 0.118, 0.173); done = true; break; }
          float k = (0.5 + 0.25 * lv / 3.0) * (dark > 0.5 ? 0.25 : 1.0);
          if (mpp > 0.9) { col = vec3(0.902, 0.745, 0.588) * k; done = true; break; }
          float cell = floor(u / 1.3), fu = u / 1.3 - cell;
          if (mpp < 0.35 && lv < 1.8 && fu > 0.4 && fu < 0.65 && hash3(cell, float(q), seed) < 0.2) {
            col = vec3(0.063, 0.047, 0.086); done = true; break;     // someone at the glass
          }
          col = vec3(1.0, 0.804, 0.627) * k; done = true; break;
        }
      }
    }

    if (!done && style == 2.0) {                     // glass spires
      float bayN = floor(u / 1.8), fu = u / 1.8 - bayN;
      if (mod(bayN, 4.0) < 0.5 && fu < 0.12 && v > 5.0) {
        float run = mod(v * 0.35 - uTime * 4.0 + bayN * 0.37 + seed, 6.0);
        col = vCrown * (run < 1.2 ? 1.0 : 0.28); done = true;
      } else if (mpp > 1.2) { col = avg; done = true; }
      else if (v < 5.0) {
        bool m = mod(u, 3.0) < 0.15 || v > 4.6;
        col = m ? bc * 0.7 : vec3(0.784, 0.745, 0.667) * (0.3 + 0.15 * (v / 5.0));
        done = true;
      } else {
        float fl = floor(v / 3.6), fv = v / 3.6 - fl;
        if (fv > 0.12 && fv < 0.92 && fu > 0.06 && fu < 0.94) {
          if (hash3(bayN, fl, seed) < winP)
            col = COOLC(hash3(bayN, fl, seed + 1.0) * 4.0) * (0.45 + 0.4 * hash3(bayN, fl, seed + 2.0));
          else col = vec3(0.071 + fv * 0.086, 0.102 + fv * 0.086, 0.180 + fv * 0.118);
        } else col = bc * 1.3;
        done = true;
      }
    }

    if (!done && style == 4.0 && v < 16.0) {         // docklands sheds
      if (length(vCrown) > 0.01 && v > H - 2.2 && v < H - 1.4) { col = vCrown; done = true; }
      else {
        float cell = floor(u / 9.0), cu = u - cell * 9.0;
        if (v < 5.5 && cu > 1.5 && cu < 7.5) {
          if (hash3(cell, id, 9.0) < 0.35) col = vec3(1.0, 0.667, 0.353) * (0.45 + 0.2 * (v / 5.5));
          else col = bc * (mod(v, 0.5) < 0.08 ? 0.6 : 1.1);
        } else col = bc * (mpp < 0.3 && mod(u, 0.7) < 0.15 ? 0.75 : 1.0);
        done = true;
      }
    }

    if (!done && style == 6.0 && v >= 3.8) {         // holo gardens: planted balconies
      float fl = floor(v / 3.2), fv = v / 3.2 - fl;
      if (fv < 0.2 && mpp < 0.9) {
        float hh = hash3(floor(u * 2.5), fl, seed);
        col = hh < 0.35 ? vec3(0.196, 0.784, 0.471) * 0.8
            : hh < 0.5  ? vec3(0.784, 0.314, 0.902) * 0.8
            : hh < 0.62 ? vec3(0.235, 0.863, 0.902) * 0.8
                        : vec3(0.275, 0.251, 0.314);
        done = true;
      }
    }

    if (!done && style == 7.0 && v >= 3.8) {         // arcade row: giant screens
      float cell = floor(u / 10.0), cu = u - cell * 10.0, top = min(H - 2.5, 32.0);
      if (cu > 0.6 && cu < 9.4 && v > 5.0 && v < top) {
        vec3 c1 = (mod(cell, 3.0) < 1.0) ? shop0 : (mod(cell, 3.0) < 2.0 ? shop1 : shop2);
        vec3 c2 = (mod(cell + 1.0, 3.0) < 1.0) ? shop0 : (mod(cell + 1.0, 3.0) < 2.0 ? shop1 : shop2);
        if (mpp > 1.0) { col = c1 * 0.45; }
        else {
          float uu = (cu - 0.6) / 8.8, vv = 1.0 - (v - 5.0) / (top - 5.0);
          float kind = floor(hash3(cell, id, 7.0) * 4.0);
          vec3 c = vec3(0.031, 0.031, 0.055);
          if (kind < 1.5) {                           // bars / equalizer
            float hgt = 0.5 + 0.45 * sin(uTime * 5.0 + floor(uu * 16.0) * 0.9 + seed);
            c = vv < hgt ? mix(c1, c2, vv) : c2 * 0.2;
          } else if (kind < 2.5) {                    // blocky panel
            vec2 g = floor(vec2(uu * 9.0, vv * 6.0));
            c = hash3(g.x, g.y, seed) < 0.5 ? c1 : c2 * 0.25;
          } else {                                    // sweep
            float sweep = fract(uTime * 0.3 + seed * 0.01);
            c = mix(c2 * 0.2, c1 * 1.4, exp(-abs(uu - sweep) * 10.0));
          }
          float scan = mod(floor(vv * 30.0), 2.0) < 1.0 ? 0.8 : 1.0;
          col = c * scan;
        }
        done = true;
      } else if (v < top + 0.8) { col = vec3(0.102, 0.094, 0.133); done = true; }
    }

    if (!done && style == 9.0) {                     // stacktown: shacks on shacks
      if (mpp > 0.8) { col = avg; done = true; }
      else {
        float fl = floor(v / 2.6), fv = v / 2.6 - fl;
        float uo = u + hash3(fl, 1.0, seed) * 2.4;
        float cell = floor(uo / 2.4), fu = uo / 2.4 - cell;
        float hh = hash3(cell, fl, seed);
        if (fu < 0.06 || fv < 0.07) col = vec3(0.055, 0.043, 0.047);
        else if (hh < 0.08) col = vec3(0.024, 0.02, 0.031);
        else if (fu > 0.32 && fu < 0.68 && fv > 0.3 && fv < 0.72) {
          col = hash3(cell, fl, seed + 3.0) < winP ? WINC(hh * 6.0) * 0.8 : vec3(0.063, 0.055, 0.086);
        } else if (fv > 0.76 && fu > 0.08 && fu < 0.3 && hh > 0.7) col = vec3(0.431, 0.431, 0.455);
        else col = STKC(hash3(cell, fl, seed + 1.0) * 6.0) * (0.45 + 0.35 * hh);
        done = true;
      }
    }

    if (!done && style == 10.0) {                    // data canyon: black walls, server lights, scan laser
      float scanV = mod(uTime * 4.0 + mod(seed, 50.0), max(H, 1.0));
      if (abs(v - scanV) < max(0.15, mpp * 0.6)) { col = vec3(0.471, 1.0, 0.549); done = true; }
      else {
        if (mpp < 0.45) {
          float cx = floor(u / 0.5), cy = floor(v / 0.5);
          float hh = hash3(cx, cy, seed);
          float fu = u / 0.5 - cx, fv = v / 0.5 - cy;
          if (hh < 0.06 && fu > 0.3 && fu < 0.7 && fv > 0.35 && fv < 0.65) {
            bool on = hash3(cx, cy, floor(uTime * (2.0 + hh * 30.0))) < 0.6;
            vec3 c = hh < 0.035 ? vec3(0.235, 1.0, 0.471) : vec3(0.275, 0.627, 1.0);
            col = on ? c : c * 0.15; done = true;
          }
        }
        if (!done) {
          bool pnl = mpp < 0.6 && mod(u, 3.0) < 0.08;
          col = pnl ? vec3(0.094, 0.110, 0.133) : vec3(0.039, 0.047, 0.063);
          done = true;
        }
      }
    }

    if (!done && style == 11.0) {                    // construction: steel skeleton and tarps
      if (v > 2.2 && v < 2.6) { bool st = mod(u + v, 1.2) < 0.6; col = st ? vec3(0.863,0.667,0.118) : vec3(0.078,0.071,0.063); done = true; }
      else if (v < 2.6) { col = vec3(0.353, 0.306, 0.227); done = true; }
      else {
        float fl = floor(v / 3.6), fv = v / 3.6 - fl;
        float bayN = floor(u / 4.0), fu = u / 4.0 - bayN;
        float th = max(0.1, mpp * 0.25);
        if (fv < 0.1 + th * 0.3 || fu < 0.09 + th * 0.3) { col = vec3(0.588, 0.322, 0.118); done = true; }
        else if (hash3(bayN, fl, seed) < 0.3 && v < H - 6.0) {
          vec3 tc = hash3(bayN, fl, seed + 1.0) < 0.5 ? vec3(0.157,0.314,0.627) : vec3(0.588,0.588,0.627);
          col = tc * (0.8 + 0.2 * sin(u * 3.0 + uTime * 2.0)); done = true;
        } else if (abs(fu - fv) < 0.05 + th * 0.2 && hash3(bayN, fl, seed + 2.0) < 0.5) {
          col = vec3(0.510, 0.275, 0.102); done = true;
        } else discard;                               // open steel: you see straight through
      }
    }

    if (!done && style == 12.0) {                    // shrine street: wood, paper screens, cloth
      if (v > H - 1.2) { col = v > H - 0.3 ? vec3(0.275,0.204,0.196) : vec3(0.110,0.086,0.102); done = true; }
      else if (v > 2.0 && v < 2.8 && mod(u, 4.0) > 0.5 && mod(u, 4.0) < 3.5) {
        vec3 c = hash3(floor(u / 4.0), 1.0, seed) < 0.5 ? vec3(0.667,0.118,0.118) : vec3(0.118,0.157,0.431);
        col = c * (mod(u, 0.8) < 0.08 ? 0.6 : 1.0); done = true;
      } else if (v > 0.2 && v < 2.0) {
        bool lat = mod(u, 0.5) < 0.06 || mod(v, 0.6) < 0.06;
        col = lat ? vec3(0.235,0.157,0.118) : vec3(0.784,0.627,0.431); done = true;
      } else if (mpp < 0.8) {
        float fl = floor(v / 3.0), fv = v / 3.0 - fl;
        float bayN = floor(u / 2.4), fu = u / 2.4 - bayN;
        if (fu > 0.2 && fu < 0.8 && fv > 0.3 && fv < 0.75) {
          if (mod(fu * 2.4, 0.4) < 0.05 || mod(fv * 3.0, 0.4) < 0.05) col = vec3(0.196,0.133,0.102);
          else col = hash3(bayN, fl, seed) < 0.6 ? vec3(0.902,0.667,0.431) : vec3(0.235,0.173,0.133);
        } else col = bc * (mod(v, 0.5) < 0.05 ? 0.7 : 1.0);
        done = true;
      } else { col = bc * vec3(1.2, 1.1, 1.0); done = true; }
    }

    if (!done && style == 15.0) {                    // rust mesa: layered rock, carved windows
      if (v > H - 0.8) { col = bc * vec3(1.35, 1.3, 1.2); done = true; }
      else {
        float band = vnoise(vec2(u * 0.03, v * 0.35), mod(seed, 997.0)) * 0.7 + vnoise(vec2(u * 0.2, v * 1.2), 7.0) * 0.3;
        if (mpp < 0.8) {
          float fl = floor(v / 4.0), fv = v / 4.0 - fl;
          float bayN = floor(u / 5.0), fu = u / 5.0 - bayN;
          if (fu > 0.3 && fu < 0.6 && fv > 0.35 && fv < 0.7 && hash3(bayN, fl, seed) < 0.12) {
            col = WINC(hash3(bayN, fl, 2.0) * 6.0) * vec3(0.8, 0.75, 0.6); done = true;
          }
        }
        if (!done) { col = bc * (0.65 + band * 0.7); done = true; }
      }
    }

    if (!done && style == 17.0) {                    // ember foundry: iron plates, furnace slits
      if (v < 3.8) {
        float cell = floor(u / 6.0), cu = u - cell * 6.0;
        if (cu > 1.0 && cu < 5.0 && v < 3.0 && hash3(cell, id, 13.0) < 0.6) {
          col = vec3(1.0, 0.471, 0.157) * (0.6 + 0.4 * sin(uTime * 5.0 + cell)); done = true;
        }
      } else if (mpp > 1.0) { col = avg; done = true; }
      else {
        float fl = floor(v / 5.0), fv = v / 5.0 - fl, bay = floor(u / 3.0);
        if (fv > 0.45 && fv < 0.6 && hash3(bay, fl, seed) < winP) {
          col = vec3(1.0, 0.431, 0.118) * (0.7 + 0.3 * sin(uTime * 7.0 + bay * 1.7 + fl)); done = true;
        } else if (mod(u, 7.0) < 0.6 && mpp < 0.8) { col = vec3(0.243, 0.157, 0.133); done = true; }
      }
      if (!done) { col = bc * (mpp < 0.6 && mod(v, 2.5) < 0.12 ? 0.6 : 1.0); done = true; }
    }

    if (!done && style == 18.0) {                    // monsoon terraces: rice ledges
      float fl = floor(v / 5.0), fv = v / 5.0 - fl;
      if (fl > 0.0 && fv < 0.18) {
        if (mpp > 0.9) col = vec3(0.157, 0.353, 0.196);
        else {
          float row = mod(floor(u * 2.5), 2.0);
          float sh = 0.8 + 0.2 * sin(u * 0.7 + uTime * 1.2 + fl);
          col = (row > 0.5 ? vec3(0.275,0.588,0.275) : vec3(0.118,0.353,0.314)) * sh;
        }
        done = true;
      } else if (fl > 0.0 && fv < 0.22) { col = vec3(0.078,0.094,0.078); done = true; }
      else if (mpp < 0.8 && v > 3.8) {
        float bay = floor(u / 3.0), fu = u / 3.0 - bay;
        if (fu > 0.25 && fu < 0.75 && fv > 0.35 && fv < 0.8) {
          col = hash3(bay, fl, seed) < winP ? WINC(hash3(bay, fl, 4.0) * 6.0) * vec3(0.8,0.8,0.7)
                                            : vec3(0.055,0.071,0.063);
          done = true;
        }
      }
      if (!done) {
        float st = (mpp < 0.5 && (mod(u + mod(fl, 2.0) * 0.6, 1.2) < 0.06 || mod(v, 1.0) < 0.05)) ? 0.7 : 1.0;
        col = bc * st; done = true;
      }
    }

    if (!done && style == 21.0) {                    // verdant ruin: vines and broken windows
      float vn = vnoise(vec2(u * 0.18, v * 0.06), mod(seed, 997.0)) + hash3(floor(u * 0.9), floor(v * 0.4), 5.0) * 0.25;
      float grow = 0.8 - 0.4 * max(0.0, 1.0 - v / 20.0) - 0.25 * max(0.0, (v - H + 15.0) / 15.0);
      if (vn > grow) {
        bool leaf = mpp < 0.5 && hash3(floor(u * 3.0), floor(v * 3.0), seed) < 0.3;
        col = leaf ? vec3(0.275,0.510,0.196) : vec3(0.102,0.235,0.110); done = true;
      } else if (mpp < 0.6 && v > 3.8) {
        float fl = floor(v / 3.2), bay = floor(u / 2.6);
        float fv = v / 3.2 - fl, fu = u / 2.6 - bay;
        if (hash3(bay, fl, seed + 21.0) < 0.3 && fv > 0.28 && fv < 0.82 && fu > 0.15 && fu < 0.85) {
          col = vec3(0.016, 0.016, 0.024); done = true;
        }
      }
    }

    if (!done && style == 22.0) {                    // storm citadel: battlements and pointed windows
      if (v > H - 1.6) { if (mod(u, 2.4) < 1.2) { col = bc * 1.2; done = true; } else discard; }
      else {
        float bay = floor(u / 4.0), fu = u / 4.0 - bay;
        if (mod(bay, 3.0) < 0.5 && fu < 0.16) { col = bc * 1.5; done = true; }
        else if (mpp > 1.0) { col = avg; done = true; }
        else {
          float fl = floor(v / 8.0), fv = v / 8.0 - fl;
          if (v > 3.8 && fu > 0.32 && fu < 0.68 && fv > 0.12 && fv < 0.88 && (fv < 0.7 || abs(fu - 0.5) < (0.88 - fv))) {
            if (mpp < 0.4 && (mod(fu * 4.0, 1.0) < 0.1 || mod(fv * 8.0, 1.0) < 0.08)) col = vec3(0.078,0.086,0.118);
            else {
              float k = hash3(bay, fl, seed) < winP ? 0.6 + 0.2 * sin(uTime * 0.7 + bay) + uFlash * 0.3 : 0.1;
              col = vec3(0.588, 0.745, 1.0) * k;
            }
            done = true;
          }
          if (!done) {
            float blk = (mpp < 0.5 && (mod(v, 1.2) < 0.08 || mod(u + floor(v / 1.2) * 0.9, 1.8) < 0.08)) ? 0.75 : 1.0;
            col = bc * blk; done = true;
          }
        }
      }
    }

    if (!done && style == 23.0) {                    // mirage bazaar: arches, tile bands, lattice
      if (v < 4.2) {
        float cell = floor(u / 3.2), cu = u / 3.2 - cell;
        float top = min(3.6, 3.0 + (0.5 - abs(cu - 0.5)) * 1.6);
        if (cu > 0.12 && cu < 0.88 && v < top) {
          vec3 c = (mod(cell, 3.0) < 1.0) ? shop0 : (mod(cell, 3.0) < 2.0 ? shop1 : shop2);
          col = c * (0.4 + 0.25 * v / 3.6);
        } else col = bc * 0.85;
        done = true;
      } else if (mod(v, 4.0) < 0.3) { col = vec3(0.157, 0.667, 0.667); done = true; }
      else if (mpp > 0.9) { col = avg; done = true; }
      else {
        float fl = floor(v / 4.0), fv = v / 4.0 - fl;
        float bay = floor(u / 3.0), fu = u / 3.0 - bay;
        if (fu > 0.2 && fu < 0.8 && fv > 0.2 && fv < 0.85) {
          if (hash3(bay, fl, seed) < winP) {
            bool lat = mpp < 0.35 && (mod(fu * 9.0 + fv * 9.0, 1.0) < 0.25 || mod(fu * 9.0 - fv * 9.0 + 9.0, 1.0) < 0.25);
            col = vec3(1.0, 0.706, 0.353) * (lat ? 0.25 : 0.75);
          } else col = bc * 0.4;
        } else col = bc;
        done = true;
      }
    }

    // ---------- the default district: shopfronts, awning, window grid ----------
    if (!done) {
      if (mpp > 0.75 && v >= 3.8) { col = avg; }
      else if (v < 3.8) {
        float cell = floor(u / 6.0), cu = u - cell * 6.0;
        if (v > 3.0 && v < 3.6) {                     // the lit awning band over the shops
          vec3 c = (hash3(cell, id, 3.0) < 0.333) ? shop0 : (hash3(cell, id, 3.0) < 0.667 ? shop1 : shop2);
          bool lit = cu > 0.4 && cu < 5.6 && hash3(floor(cu * 2.2), cell, id) < 0.6
                     && !(dark > 0.5 && hash3(cell, id, 11.0) < 0.75);
          col = lit ? c : vec3(0.063, 0.039, 0.086);
        } else if (cu > 0.5 && cu < 5.5 && v > 0.15 && v < 2.8) {   // the shopfront itself
          vec3 c = (mod(cell, 3.0) < 1.0) ? shop0 : (mod(cell, 3.0) < 2.0 ? shop1 : shop2);
          float k = (0.35 + 0.25 * (v / 2.8))
                  * (dark > 0.5 ? (hash3(cell, id, floor(uTime * 6.0)) < 0.08 ? 0.8 : 0.12) : 1.0);
          col = c * k;
        } else col = bc * 0.8;
      } else {
        float fl = floor(v / 3.2), fv = v / 3.2 - fl;
        float bayN = floor(u / 2.6), fu = u / 2.6 - bayN;
        if (fv > 0.28 && fv < 0.82 && fu > 0.15 && fu < 0.85) {
          if (hash3(bayN, fl, seed) < winP)
            col = WINC(hash3(bayN, fl, seed + 1.0) * 6.0) * (0.5 + 0.5 * hash3(bayN, fl, seed + 2.0));
          else col = vec3(0.055 + fv * 0.055, 0.055 + fv * 0.031, 0.110 + fv * 0.071);
        } else col = bc * ((fu < 0.08 || fu > 0.92) ? 1.35 : 1.0);
      }
    }

    // the original shades nothing by normal — the texture carries it — but a
    // touch keeps the volumes readable from a free camera
    float lam = 0.88 + 0.12 * max(0.0, dot(normalize(vNormalW), normalize(vec3(0.4, 0.8, 0.35))));
    col *= lam;

    float d = distance(vWorld, uCam);
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d) * 0.97);
    gl_FragColor = vec4(col, 1.0);
  }
`;
