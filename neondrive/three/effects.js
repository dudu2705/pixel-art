import * as THREE from './vendor/three.module.js';
import { integerHash } from './shaders.js';

// Art such as steam and holograms needs a soft billboard that still sits at
// its place in the city and can be hidden by the surrounding buildings.
export function makeEffectMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    glslVersion: THREE.GLSL3,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 iPos, iSize, iCol;
      attribute vec4 iMeta;
      attribute float iRot;
      uniform float uTime;
      uniform float uFogNear, uFogFar;
      varying vec2 vLocal;
      varying vec3 vColor;
      varying vec4 vEffect;
      void main() {
        vec3 center = iPos;
        vec2 size = iSize.xy;
        float opacity = 1.0;
        float mode = iMeta.x;
        float seed = iMeta.y;
        if (mode == 0.0) {
          float ph = mod(uTime * iMeta.w + iMeta.z, 1.0);
          center.y += ph * size.y;
          center.x += sin(uTime * 0.8 + seed) * 0.4 * ph;
          size *= 0.25 + 0.7 * ph;
          size.y = size.x * 0.8;
          opacity = 0.22 * (1.0 - ph);
        } else if (mode == 1.0) {
          center.y += sin(uTime * 0.8 + seed) * 1.5;
          center += vec3(-cos(iRot), 0.0, sin(iRot)) * (7.0 * sin(uTime * 0.25 + seed));
        } else if (mode == 3.0) {
          center.y += size.y * 0.5;
        }
        vec4 view = viewMatrix * vec4(center, 1.0);
        opacity *= 1.0 - 0.97 * smoothstep(uFogNear, uFogFar, -view.z);
        vLocal = position.xy * size;
        vEffect = vec4(mode, seed, opacity, size.x);
        vColor = iCol;
        gl_Position = projectionMatrix * (view + vec4(vLocal, 0.0, 0.0));
      }`,
    fragmentShader: `
      precision highp float;
      precision highp int;
      ${integerHash}
      varying vec2 vLocal;
      varying vec3 vColor;
      varying vec4 vEffect;
      uniform float uTime, uFlash;
      out vec4 fragColor;
      float lineDistance(vec2 p, vec2 a, vec2 b) {
        vec2 span = b - a;
        return length(p - a - span * clamp(dot(p - a, span) / dot(span, span), 0.0, 1.0));
      }
      void main() {
        float mode = vEffect.x, seed = vEffect.y, opacity = vEffect.z;
        vec3 color = vColor;
        if (mode == 0.0) {
          float d = length(vLocal * vec2(2.0, 2.5) / vEffect.w);
          opacity *= max(0.0, 1.0 - d * d);
        } else if (mode == 1.0) {
          float x = vLocal.x * (cos(uTime * 0.25 + seed) > 0.0 ? 1.0 : -1.0);
          float t = clamp(0.5 - x / 12.0, 0.0, 1.0);
          float wave = sin(uTime * 3.0 - t * 5.0) * 0.7 * t;
          float radius = 1.5 * pow(1.0 - t, 0.7) * min(1.0, t * 5.0 + 0.35);
          float d = abs(vLocal.y - wave) / max(0.01, radius);
          opacity *= abs(x) < 6.0 && d < 1.0 ? (d > 0.7 ? 0.45 : 0.15) : 0.0;
          if (x < -5.9 && x > -7.3 && abs(abs(vLocal.y - wave) + (x + 6.0) * 0.7) < 0.1)
            opacity = vEffect.z * 0.3;
          color = mix(vec3(255, 90, 160), vec3(80, 230, 255), t) / 255.0;
          if (mod(floor(gl_FragCoord.y), 2.0) > 0.5) opacity = 0.0;
        } else if (mode == 3.0) {
          float y = vLocal.y + 40.0;
          float angle = sin(uTime * 0.5 + seed) * 0.6;
          float width = max(0.02, fwidth(vLocal.x));
          opacity *= 0.35 * max(0.0, 1.0 - y / 80.0)
            * (1.0 - smoothstep(0.0, width, abs(vLocal.x - y * tan(angle))));
        } else {
          int tick = int(floor(uTime * 14.0)), id = int(seed);
          float pixelWidth = max(fwidth(vLocal.x), 0.025);
          float coverage = 0.0;
          for (int arc = 0; arc < 3; arc++) {
            if (hsh(tick, arc, id) < 0.45 - uFlash * 0.4) continue;
            float dir = hsh(tick, arc + 5, id) < 0.5 ? -1.0 : 1.0;
            vec2 start = vec2(0);
            for (int j = 0; j < 6; j++) {
              vec2 end = start + vec2(dir * (0.8 + hsh(tick, j + arc * 9, id + 1) * 1.2),
                (0.6 - hsh(tick, j + arc * 7, id + 2)) * 1.4);
              coverage = max(coverage, 1.0 - smoothstep(0.0, pixelWidth, lineDistance(vLocal, start, end)));
              start = end;
            }
          }
          opacity *= 0.9 * coverage;
        }
        if (opacity <= 0.005) discard;
        fragColor = vec4(color, opacity);
      }`,
  });
}
