// The GPU reference's surface-sampled light cycle and rider.
import * as THREE from './vendor/three.module.js';
import { clamp } from './world.js';
import { CYCLE_INK, CYCLE_GRIP, CYCLE_DASH } from './cycle-design.js';

function makePoints(mapArt) {
  const points = [];
  const ACC = mapArt ? CYCLE_INK.cyan : [0, 230, 255], DIM = mapArt ? CYCLE_INK.channel : [0, 110, 140];
  const BLK = mapArt ? CYCLE_INK.carbon : [14, 15, 20], SUIT = mapArt ? CYCLE_INK.suit : [46, 50, 72], STEP = 0.026;
  const add = (x, y, z, nx, ny, nz, c, em, wz) => points.push([x, y, z, nx, ny, nz, c[0], c[1], c[2], em ? 1 : 0, wz === undefined ? NaN : wz]);
  const lerpTab = (tab, z) => { for (let i = 1; i < tab.length; i++) if (z <= tab[i][0]) { const [z0, a] = tab[i - 1], [z1, b] = tab[i], t = (z - z0) / (z1 - z0); return a + (b - a) * t; } return tab[tab.length - 1][1]; };
  // hubless wheels: a dark tyre, a glowing ring on each side, a dark disc with a broken inner ring that turns as you ride
  for (const zc of [-0.98, 1.0]) {
    const R = 0.5;
    for (let a = 0; a < Math.PI * 2; a += STEP / R) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const width = mapArt ? 0.17 : 0.13;
      for (let w = -width; w <= width; w += STEP) add(w, R + R * ca, zc + R * sa, 0, ca, sa,
        Math.abs(w) > width - 0.016 ? DIM : [20, 20, 26], Math.abs(w) > width - 0.016);
      for (let r = mapArt ? 0.26 : 0; r <= R; r += STEP) for (const sd of [-1, 1]) {
        const ring = mapArt ? r > 0.41 && r < 0.477 : r > 0.42 && r < 0.48;
        const inner = r > 0.26 && r < 0.3 && ((a / (Math.PI * 2) * 6) % 1) < 0.72;
        add(sd * width, R + r * ca, zc + r * sa, sd, 0, 0, ring ? ACC : inner ? DIM : mapArt ? BLK : [10, 10, 14], ring || inner, zc);
        if (mapArt && r < 0.29) add(sd * width * 0.55, R + r * ca, zc + r * sa, sd, 0, 0, CYCLE_INK.bevel, false);
      }
    }
  }
  // the shell: long and low, narrow over the wheels, wider where the rider's legs go; light lines along the flanks and the belly
  const TOP = mapArt ? [[-1.45, 0.68], [-1.10, 0.98], [-0.76, 1.02], [-0.35, 0.96], [0.02, 0.94],
    [0.58, 1.08], [0.92, 1.16], [1.19, 1.04], [1.4, 0.72]]
    : [[-1.45, 0.7], [-1.0, 1.06], [-0.5, 1.0], [0, 0.92], [0.5, 1.0], [1.0, 1.06], [1.4, 0.72]];
  const flank = [[-1.45, 0.12], [-1.12, 0.16], [-0.64, 0.23], [0.2, 0.24], [0.82, 0.22], [1.4, 0.12]];
  const channel = [[-1.45, 0.60], [-1.02, 0.76], [-0.62, 0.74], [-0.2, 0.63], [0.42, 0.63], [1.13, 0.83], [1.4, 0.62]];
  for (let z = -1.45; z <= 1.4; z += STEP) {
    const ht = lerpTab(TOP, z), hb = 0.36, mid = (ht + hb) / 2, hh = (ht - hb) / 2;
    const nearWheel = Math.min(Math.abs(z + 0.98), Math.abs(z - 1.0)) < 0.45;
    const hw = mapArt ? lerpTab(flank, z) : nearWheel ? 0.11 : 0.2;
    const lineY = mapArt ? lerpTab(channel, z) : mid;
    const per = 2 * Math.PI * Math.max(hw, hh);
    for (let t = 0; t < Math.PI * 2; t += STEP / per * 2 * Math.PI) {
      const ct = Math.cos(t), st = Math.sin(t), facet = mapArt ? 0.32 : 0.55;
      const x = hw * Math.sign(ct) * Math.abs(ct) ** facet, y = mid + hh * Math.sign(st) * Math.abs(st) ** facet;
      const nl = Math.hypot(ct * hh, st * hw) || 1;
      const line = (Math.abs(y - lineY) < 0.022 && Math.abs(ct) > 0.5) || (Math.abs(y - hb - 0.04) < 0.018 && Math.abs(ct) > 0.3);
      const base = mapArt && st > 0.2 ? CYCLE_INK.shell : BLK;
      add(x, y, z, ct * hh / nl, st * hw / nl, 0, line ? ACC : base, line);
    }
  }
  for (const zt of [-1.45, 1.4]) for (let y = 0.36; y < 0.75; y += STEP) for (let x = -0.11; x <= 0.11; x += STEP) {   // end caps, outlined in light
    const edge = Math.abs(x) > 0.09 || y < 0.39 || y > 0.71;
    add(x, y, zt, 0, 0, Math.sign(zt), edge ? ACC : BLK, edge);
  }
  // the rider, after the Tron: Legacy light cycle: an exposed sportbike position, lying close to horizontal along the
  // top, real proportions (torso ~0.6 m, upper arm 0.3, forearm 0.28, thigh 0.46, shin 0.43); glow lines down the
  // suit and an identity disc, a ring of light, on the upper back
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
  // a tube from p0 to p1 with an elliptical cross-section (rx sideways, ry up) that tapers; line(n, t, ca, sa) picks glow lines
  const tube = (p0, p1, rx0, ry0, rx1, ry1, col, line) => {
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...d), ax = d.map(v => v / L);
    const sideRef = Math.abs(ax[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const vUp = norm(cross(ax, sideRef)), uSide = norm(cross(vUp, ax));
    const up = vUp[1] < 0 ? vUp.map(v => -v) : vUp;
    for (let s = -Math.min(rx0, ry0); s <= L + Math.min(rx1, ry1); s += STEP) {   // rounded ends
      const t = clamp(s / L, 0, 1), rx = rx0 + (rx1 - rx0) * t, ry = ry0 + (ry1 - ry0) * t;
      const capK = s < 0 ? Math.sqrt(Math.max(0, 1 - (s / Math.min(rx0, ry0)) ** 2)) : s > L ? Math.sqrt(Math.max(0, 1 - ((s - L) / Math.min(rx1, ry1)) ** 2)) : 1;
      const c = [p0[0] + ax[0] * s, p0[1] + ax[1] * s, p0[2] + ax[2] * s];
      for (let a = 0; a < Math.PI * 2; a += STEP / Math.max(rx, ry, 0.02)) {
        const ca = Math.cos(a), sa = Math.sin(a), ox = rx * ca * capK, oy = ry * sa * capK;
        const pos = [c[0] + uSide[0] * ox + up[0] * oy, c[1] + uSide[1] * ox + up[1] * oy, c[2] + uSide[2] * ox + up[2] * oy];
        const n = norm([uSide[0] * ca / rx + up[0] * sa / ry, uSide[1] * ca / rx + up[1] * sa / ry, uSide[2] * ca / rx + up[2] * sa / ry]);
        const ln = line ? line(n, t, ca, sa) : false;
        add(pos[0], pos[1], pos[2], n[0], n[1], n[2], ln ? ACC : col, ln);
      }
    }
  };
  const ell = (cx, cy, cz, rx, ry, rz, fn) => {
    const st = STEP / Math.max(rx, ry, rz);
    for (let a = 0; a < Math.PI; a += st) for (let b = 0; b < Math.PI * 2; b += st) {
      const nx = Math.sin(a) * Math.cos(b), ny = Math.cos(a), nz = Math.sin(a) * Math.sin(b);
      fn(cx + rx * nx, cy + ry * ny, cz + rz * nz, nx, ny, nz);
    }
  };
  const SHO = 0.19;
  const J = {                                         // joints (right side; the left mirrors x)
    hip: [0.15, 1.09, -0.42], sho: [SHO, 1.24, 0.17], elb: [0.26, 1.09, 0.4], wri: mapArt ? CYCLE_GRIP : [0.25, 1.06, 0.68],
    knee: [0.25, 0.75, -0.12], ank: [0.23, 0.55, -0.5],   // sport tuck: knee forward against the flank, shin back to the peg
  };
  // torso: pelvis to chest, flattened like a real back, wider at the shoulders; glow lines down each side and the spine
  tube([0, 1.1, -0.44], [0, 1.24, 0.18], 0.16, 0.11, 0.19, 0.12, SUIT,
    (n, t, ca, sa) => (sa > 0.75 && Math.abs(ca) < 0.06) || (Math.abs(sa) < 0.06 && Math.abs(ca) > 0.99));
  ell(0, 1.12, -0.47, 0.165, 0.12, 0.13, (x, y, z, nx, ny, nz) => add(x, y, z, nx, ny, nz, SUIT, 0));          // seat of the pelvis
  ell(0, 1.23, 0.16, 0.2, 0.13, 0.13, (x, y, z, nx, ny, nz) => add(x, y, z, nx, ny, nz, SUIT, 0));             // chest and shoulder girdle
  tube([0, 1.27, 0.25], [0, 1.31, 0.33], 0.05, 0.05, 0.05, 0.05, SUIT, null);                                   // neck
  ell(0, 1.34, 0.43, 0.125, 0.13, 0.155, (x, y, z, nx, ny, nz) => {                                            // helmet, visor forward
    const visor = nz > 0.3 && ny < 0.4 && ny > -0.5;
    const ln = mapArt ? (nx * nx > 0.40 && Math.abs(ny + 0.28 - nz * 0.21) < 0.12) || (nz > 0.47 && Math.abs(ny - 0.34) < 0.10)
      : (Math.abs(x) < 0.016 && ny > 0.1 && !visor) || Math.abs(ny + 0.55) < 0.06;
    add(x, y, z, nx, ny, nz, ln ? ACC : visor ? (mapArt ? CYCLE_INK.glass : [26, 46, 68]) : BLK, ln);
  });
  for (let a = 0; a < Math.PI * 2; a += STEP / 0.12) for (const rr of [0.1, 0.12]) {                          // the identity disc
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.95;
    add(x, 1.37, z, 0, 1, 0, rr > 0.11 ? ACC : [0, 150, 190], 1);
  }
  for (let a = 0; a < Math.PI * 2; a += STEP / 0.09) for (let rr = 0; rr < 0.1; rr += STEP) add(Math.cos(a) * rr, 1.365, Math.sin(a) * rr * 0.95, 0, 1, 0, [10, 12, 18], 0);
  for (const sd of [-1, 1]) {
    const m = p => [p[0] * sd, p[1], p[2]], outer = n => n[0] * sd > (mapArt ? 0.89 : 0.96);
    ell(sd * SHO, J.sho[1], J.sho[2], mapArt ? 0.10 : 0.08, 0.075, 0.085, (x, y, z, nx, ny, nz) => {
      const ln = Math.abs(ny - 0.55) < (mapArt ? 0.12 : 0.07);
      add(x, y, z, nx, ny, nz, ln ? ACC : mapArt ? CYCLE_INK.armour : SUIT, ln);
    });
    tube(m(J.sho), m(J.elb), 0.055, 0.058, 0.045, 0.048, SUIT, n => outer(n));     // upper arm
    tube(m(J.elb), m(J.wri), 0.045, 0.048, 0.036, 0.04, SUIT, n => outer(n));      // forearm
    const hand = mapArt ? CYCLE_GRIP : [0.25, 1.05, 0.73];
    ell(sd * hand[0], hand[1], hand[2], mapArt ? 0.057 : 0.045, mapArt ? 0.045 : 0.04, mapArt ? 0.075 : 0.065, (x, y, z, nx, ny, nz) => {
      const lit = mapArt && ny > 0.2 && Math.abs(z - hand[2]) < 0.016;
      add(x, y, z, nx, ny, nz, lit ? ACC : BLK, lit);
    });
    tube(m(J.hip), m(J.knee), 0.085, 0.09, 0.06, 0.062, SUIT, n => outer(n));      // thigh, forward and down to the knee
    tube(m(J.knee), m(J.ank), 0.055, 0.058, 0.042, 0.045, SUIT, n => outer(n));    // shin, back and down to the peg
    ell(sd * 0.23, 0.53, -0.57, 0.048, 0.045, 0.11, (x, y, z, nx, ny, nz) => { const ln = Math.abs(ny + 0.6) < 0.08; add(x, y, z, nx, ny, nz, ln ? ACC : BLK, ln); });   // boot, a light line at the sole
  }
  if (mapArt) {
    const { width, y, z, depth } = CYCLE_DASH;
    for (let dz = -depth / 2; dz <= depth / 2; dz += STEP) {
      const half = width / 2 - Math.abs(dz) * 0.35;
      for (let dx = -half; dx <= half; dx += STEP) {
        const light = half - Math.abs(dx) < 0.024 || Math.abs(dx) < 0.015;
        add(dx, y + 0.03 + dz * 0.28, z + dz, 0, 1, 0, light ? ACC : CYCLE_INK.glass, light);
      }
    }
    for (const side of [-1, 1]) {
      tube([side * 0.09, 1.05, 0.66], [side * 0.23, 1.09, 0.75], 0.035, 0.02, 0.038, 0.023, CYCLE_INK.shell, n => n[1] > 0.85);
      tube([side * 0.24, 1.06, 0.74], [side * 0.35, 1.06, 0.73], 0.033, 0.036, 0.034, 0.038, CYCLE_INK.grip, (_, t) => t > 0.9);
    }
  }
  return points;
}

export function makeLightCycle(fogUniforms, mapArt = false) {
  const points = makePoints(mapArt);
  const position = new Float32Array(points.length * 3);
  const normals = new Float32Array(points.length * 3);
  const colors = new Float32Array(points.length * 3);
  const emission = new Float32Array(points.length);
  const wheel = new Float32Array(points.length);
  points.forEach(([x, y, z, nx, ny, nz, r, g, b, emissive, wheelZ], i) => {
    position.set([-x, y, z], i * 3);
    normals.set([-nx, ny, nz], i * 3);
    colors.set([r / 255, g / 255, b / 255], i * 3);
    emission[i] = emissive;
    wheel[i] = Number.isNaN(wheelZ) ? 0 : wheelZ;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('aEmission', new THREE.BufferAttribute(emission, 1));
  g.setAttribute('aWheel', new THREE.BufferAttribute(wheel, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSpin: { value: new THREE.Vector2(1, 0) },
      uSky: { value: new THREE.Color() },
      uViewportHeight: { value: 1 },
      uFog: fogUniforms.uFog, uFogNear: fogUniforms.uFogNear, uFogFar: fogUniforms.uFogFar,
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aEmission, aWheel;
      uniform vec2 uSpin;
      uniform vec3 uSky, uFog;
      uniform float uViewportHeight, uFogNear, uFogFar;
      varying vec3 vColor;
      void main() {
        vec3 p = position;
        if (abs(aWheel) > 0.5) {
          vec2 radial = p.yz - vec2(0.5, aWheel);
          p.yz = vec2(0.5, aWheel) + mat2(uSpin.x, uSpin.y, -uSpin.y, uSpin.x) * radial;
        }
        vec4 view = modelViewMatrix * vec4(p, 1.0);
        float depth = max(0.01, -view.z);
        gl_Position = projectionMatrix * view;
        if (aEmission > 0.5) gl_Position.z -= 0.0005;
        gl_PointSize = max(1.0, ceil(0.028 * projectionMatrix[1][1] * uViewportHeight * 0.5 / depth));

        vec3 n = normalize(mat3(modelMatrix) * normal);
        float lambert = max(0.0, dot(n, vec3(0.4, 0.8, -0.3)));
        float sheen = pow(max(0.0, n.y), 3.0);
        float rim = max(0.0, -normal.z) * 0.3 + pow(abs(normal.x), 4.0) * 0.25;
        vec3 color = aEmission > 0.5 ? aColor
          : aColor * (0.5 + lambert) + uSky * 0.45 * sheen + vec3(20, 60, 80) / 255.0 * rim;
        float fog = smoothstep(uFogNear, uFogFar, depth) * 0.97 * (aEmission > 0.5 ? 0.3 : 1.0);
        vColor = mix(color, uFog, fog);
      }`,
    fragmentShader: `varying vec3 vColor; void main() { gl_FragColor = vec4(vColor, 1.0); }`,
  });
  return new THREE.Points(g, material);
}
