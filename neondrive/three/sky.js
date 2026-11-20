// The GPU game's panorama and sky effects, on the same art grid as the cockpit.
import * as THREE from './vendor/three.module.js';
import { NEON, WIN, clamp, hash, mix, mulberry, smooth, vnoise } from './world.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

function makePanorama(PW, HB) {
  const r = mulberry(99);
  function layer(minH, maxH, minW, maxW) {
    const L = { h: new Int16Array(PW), x0: new Int32Array(PW), seed: new Int32Array(PW), crown: [] };
    for (let x = 0; x < PW;) {
      const w = minW + Math.floor(r() * (maxW - minW)), h = Math.round(minH + Math.pow(r(), 1.5) * (maxH - minH));
      const sd = (r() * 1e6) | 0, cr = r() < 0.25 ? NEON[(r() * 6) | 0] : null;
      for (let i = 0; i < w && x + i < PW; i++) { L.h[x + i] = h; L.x0[x + i] = x; L.seed[x + i] = sd; L.crown[x + i] = cr; }
      x += w + (r() < 0.3 ? 1 + Math.floor(r() * 3) : 0);
    }
    return L;
  }
  const stars = [];
  for (let i = 0; i < 420; i++) stars.push({ pc: r() * PW, yr: r(), b: 0.3 + r() * 0.7, tw: r() * 6 });
  const mtn = new Float32Array(PW);
  for (let x = 0; x < PW; x++) {
    const u = x / PW * 40;
    mtn[x] = HB * (0.18 + 0.45 * Math.abs(vnoise(u, 0.5, 11) * 2 - 1) * 0.6 + 0.35 * vnoise(u * 3, 1.5, 12) * 0.5 + 0.2 * (1 - Math.abs(vnoise(u * 0.7, 3, 13) * 2 - 1)));
  }
  const sky1 = layer(HB * 0.15, HB * 0.85, 5, 16);
  const sky2 = layer(HB * 0.08, HB * 0.45, 8, 22);
  const holoX = Math.round(PW * 0.02);

  return { stars, mtn, sky1, sky2, holoX };
}

export class Sky {
  constructor(scene) {
    this.fireworks = [];
    this.lastFlash = 0;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uSky: { value: null } },
      depthTest: false, depthWrite: false,
      vertexShader: `varying vec2 vUv; void main() {
        vUv = vec2(uv.x, 1.0 - uv.y);
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
      fragmentShader: `uniform sampler2D uSky;
        varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(uSky, vUv).rgb, 1.0); }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = -10000;
    scene.add(mesh);
  }

  resize(width, height, viewWidth, viewHeight) {
    this.W = width;
    this.H = height;
    this.HB = Math.round(viewHeight * 0.45);
    this.focal = Math.max(viewWidth * 0.62, viewHeight * 0.8);
    this.PW = Math.max(width, Math.round(this.focal * 2 * Math.PI));
    this.panorama = makePanorama(this.PW, this.HB);
    this.col = new Float32Array(width * height * 3);
    this.glow = new Float32Array(width * height * 3);
    this.row = new Float32Array(width * 3);
    this.texture?.dispose();
    this.texture = new THREE.DataTexture(new Float32Array(width * height * 4),
      width, height, THREE.RGBAFormat, THREE.FloatType);
    this.material.uniforms.uSky.value = this.texture;
  }

  update(dt, state, yaw, horizon, focal, elevation, crownK, lightGrade) {
    const { W, H, PW, HB, col } = this;
    const { T, SKY, TWC, TH, wx, flash, gloom, rainOn, z: camZ } = state;
    const { stars, mtn, sky1, sky2, holoX } = this.panorama;
    const hy = clamp(horizon, 1, H + 2);
    const F = focal;
    this.origin ??= yaw;
    const bgX = (this.origin - yaw) * this.focal;
    const starK = smooth(10, 100, elevation);
    const fw = this.fireworks;
    if (flash > this.lastFlash) this.bolt = { pc: bgX + Math.random() * W, seed: Math.floor(Math.random() * 1e6) };
    this.lastFlash = flash;
    const bolt = this.bolt;
    if (TH.fireworks > 0.3 && Math.random() < dt * 0.9 * TH.fireworks) {
      const c = state.neon[Math.floor(Math.random() * 6)];
      const pc = bgX + Math.random() * W, y = hy - HB * (0.55 + Math.random() * 0.23);
      for (let i = 0; i < 34; i++) {
        const a = i * 2 * Math.PI / 34, v = 26 + Math.random() * 18;
        fw.push({ pc, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.6, c });
      }
    }
    for (let i = fw.length - 1; i >= 0; i--) {
      const f = fw[i];
      f.pc += f.vx * dt;
      f.y += f.vy * dt;
      f.vy += 22 * dt;
      f.vx *= 0.98;
      f.life -= dt;
      if (f.life <= 0) fw.splice(i, 1);
    }

    const { glow, row: tmp } = this;
    glow.fill(0);
    const putc = (x, y, color) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 3;
      col[i] = color[0]; col[i + 1] = color[1]; col[i + 2] = color[2];
    };
    const addc = (x, y, color, amount) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 3;
      col[i] += color[0] * amount;
      col[i + 1] += color[1] * amount;
      col[i + 2] += color[2] * amount;
    };
    const addLight = (x, y, radius, color, strength) => {
      const R = clamp(Math.round(radius), 2, 30);
      const cx = Math.round(x), cy = Math.round(y);
      for (let y = Math.max(0, cy - R); y <= Math.min(H - 1, cy + R); y++) {
        for (let x = Math.max(0, cx - R); x <= Math.min(W - 1, cx + R); x++) {
          const f = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / R);
          const amount = Math.floor(6 * f * f * strength) / 6;
          const i = (y * W + x) * 3;
          glow[i] += color[0] * amount;
          glow[i + 1] += color[1] * amount;
          glow[i + 2] += color[2] * amount;
        }
      }
    };
    const top = SKY[0], mid = SKY[1], hz = SKY[2];
    const LUT = [];                                    // 21 dithered gradient steps, built once per frame
    for (let q = 0; q <= 21; q++) {
      const qq = Math.min(1, q / 20), c = qq < 0.6 ? mix(top, mid, qq / 0.6) : mix(mid, hz, (qq - 0.6) / 0.4), fl = flash * 70 * (1 - qq * 0.5), dk = 1 - 0.45 * gloom;
      LUT.push([c[0] * dk + fl, c[1] * dk + fl, c[2] * dk + fl * 1.2]);
    }
    for (let y = 0; y < H; y++) {
      const t20 = clamp(y / hy, 0, 1) * 20, row = y * W * 3;
      for (let x = 0, i = row; x < W; x++, i += 3) {
        const c = LUT[Math.floor(t20 + BAYER[(y & 3) * 4 + (x & 3)])];
        col[i] = c[0]; col[i + 1] = c[1]; col[i + 2] = c[2];
      }
    }
    // stars, more of them the higher you ride
    const sk = Math.max(starK, TH.night * 0.7) * (1 - gloom * 0.8) * (1 - TH.deep) * (rainOn && (wx === 'rain' || wx === 'monsoon') ? 0.35 : rainOn && (wx === 'fog' || wx === 'sand') ? 0.2 : 1);
    if (sk > 0.02) {
      const bxs = Math.floor(bgX), yTop = hy - HB * 0.3;
      for (const st of stars) {
        const x = ((Math.round(st.pc - bxs)) % PW + PW) % PW;
        if (x >= W) continue;
        const y = Math.round(yTop * st.yr * st.yr);
        const a = sk * st.b * (0.6 + 0.4 * Math.sin(T * 2 + st.tw));
        addc(x, y, [220, 230, 255], a);
        if (st.b > 0.92) { addc(x + 1, y, [220, 230, 255], a * 0.4); addc(x - 1, y, [220, 230, 255], a * 0.4); addc(x, y - 1, [220, 230, 255], a * 0.4); addc(x, y + 1, [220, 230, 255], a * 0.4); }
      }
    }
    // aurora curtains
    if (TH.aurora > 0.02) {
      for (let x = 0; x < W; x++) {
        const pxa = x + bgX * 0.3;
        const yb = hy * 0.16 + Math.sin(pxa * 0.013 + T * 0.2) * hy * 0.06 + Math.sin(pxa * 0.031 - T * 0.35) * hy * 0.03;
        const L = hy * 0.28 * (0.6 + 0.4 * Math.sin(pxa * 0.05 + T * 0.5));
        const str = TH.aurora * (0.55 + 0.45 * Math.sin(pxa * 0.11 + T * 1.3));
        for (let y = Math.max(0, Math.floor(yb)); y < yb + L && y < H; y++) {
          const u = (y - yb) / L;
          addc(x, y, u < 0.15 ? [190, 100, 255] : [70, 255, 160], 0.3 * str * (1 - u) * (u < 0.15 ? u / 0.15 : 1));
        }
      }
    }
    // lightning bolt
    if (bolt && flash > 0.45) {
      let x = ((Math.round(bolt.pc - bgX)) % PW + PW) % PW, y = 0;
      const r = mulberry(bolt.seed), end = hy - HB * 0.3;
      while (y < end) {
        const nx = x + (r() - 0.5) * 14, ny = y + 4 + r() * 8;
        for (let t = 0; t <= 1; t += 0.1) addc(Math.round(x + (nx - x) * t), Math.round(y + (ny - y) * t), [230, 220, 255], flash);
        x = nx; y = ny;
      }
    }
    // smog bands lit from below
    const smA = mix(mid, top, 0.2), smB = mix(hz, [255, 255, 255], 0.12);
    for (let y = 0; y < hy * 0.85; y++) {
      const glowK = y / hy, sc = mix(smA, smB, glowK * glowK);
      for (let x = 0; x < W; x += 2) {                 // noise sampled every other column
        const n = vnoise((x + bgX * 0.5) * 0.03 + T * 0.05, y * 0.12, 3) * 0.65 + vnoise((x + bgX * 0.5) * 0.08, y * 0.3, 5) * 0.35;
        const d = n - 0.6;
        if (d <= 0) continue;
        if (d * 9 >= BAYER[(y & 3) * 4 + (x & 3)]) putc(x, y, sc);
        if (x + 1 < W && d * 9 >= BAYER[(y & 3) * 4 + ((x + 1) & 3)]) putc(x + 1, y, sc);
      }
    }
    const bx = Math.floor(bgX);
    {
      const mx = ((Math.round(PW * 0.62) - bx) % PW + PW) % PW, my = Math.round(hy - HB * 0.72), mr = Math.max(6, Math.round(HB * 0.12 * (1 + 0.6 * crownK)));
      if (mx > -mr && mx < W + mr && TH.deep < 0.5) {
        const mc = mix([240, 236, 250], hz, 0.15);
        for (let dy = -mr; dy <= mr; dy++) for (let dx = -mr; dx <= mr; dx++) {
          if (dx * dx + dy * dy > mr * mr) continue;
          const cr = hash((mx + dx * 0) + Math.floor((dx + mr) / 3), Math.floor((dy + mr) / 3), 404) < 0.18;
          putc(mx + dx, my + dy, cr ? mix(mc, [0, 0, 0], 0.15) : mc);
        }
        addLight(mx, my, mr * 2.4, mc, 0.18);
      }
    }
    function towers(L, cBase, cWin, fog) {
      for (let x = 0; x < W; x++) {
        const pc = ((x + bx) % PW + PW) % PW, h = L.h[pc], top = Math.round(hy - h), sd = L.seed[pc], wx = pc - L.x0[pc];
        for (let y = Math.max(0, top); y <= hy + 2 && y < H; y++) {
          const hy2 = Math.round(hy - y);
          let c = cBase;
          if (y === top && L.crown[pc]) c = L.crown[pc];
          else if (wx % 3 === 1 && hy2 % 3 === 1 && hash(pc, hy2, sd) < 0.28) c = mix(WIN[sd % 6], fog, cWin);
          putc(x, y, c);
        }
        if (h > HB * 0.6 && wx === 2) {
          for (let k = 1; k < 5; k++) putc(x, top - k, cBase);
          if ((T * 1.3 + sd) % 2 < 0.9) { putc(x, top - 5, [255, 40, 40]); addLight(x, top - 5, 3, [255, 40, 40], 0.5); }
        }
      }
    }
    // distant snowy mountains
    const mSnow = mix([200, 214, 232], hz, 0.35), mRock = mix([34, 46, 66], hz, 0.45);
    if (TH.mountains > 0.02) {
      for (let x = 0; x < W; x++) {
        const pc = ((x + bx) % PW + PW) % PW, mh = mtn[pc], top = Math.round(hy - mh);
        for (let y = Math.max(0, top); y <= hy + 2 && y < H; y++) {
          const snow = (y - top) < mh * 0.22 + hash(pc, 1, 9) * 3;
          const c = snow ? mSnow : mRock;
          const i = (y * W + x) * 3, k = TH.mountains;
          col[i] += (c[0] - col[i]) * k; col[i + 1] += (c[1] - col[i + 1]) * k; col[i + 2] += (c[2] - col[i + 2]) * k;
        }
      }
    }
    // the space elevator: a cable of light straight up into the sky
    if (TH.elevator > 0.02) {
      const ex = ((Math.round(PW * 0.3) - bx) % PW + PW) % PW;
      if (ex >= 0 && ex < W) {
        for (let y = 0; y < hy - HB * 0.05; y++) { addc(ex, y, [220, 240, 255], 0.7 * TH.elevator); addc(ex - 1, y, [120, 200, 255], 0.15 * TH.elevator); addc(ex + 1, y, [120, 200, 255], 0.15 * TH.elevator); }
        const cy = hy - HB * 0.05 - ((T * 18) % (hy + 30));
        for (let d = -2; d <= 2; d++) addc(ex + d, Math.round(cy), [255, 220, 150], TH.elevator);
        addLight(ex, cy, 5, [255, 200, 120], 0.5 * TH.elevator);
      }
    }
    // coral deep: light shafts from the surface far above, whales gliding over the city
    if (TH.deep > 0.02) {
      for (let x = 0; x < W; x++) {
        const k = Math.sin((x + bx * 0.2) * 0.045 + T * 0.25) * Math.sin((x + bx * 0.2) * 0.017 - T * 0.1);
        if (k < 0.3) continue;
        for (let y = 0; y < hy; y++) addc(x + Math.round(y * 0.25), y, [120, 220, 255], (k - 0.3) * 0.12 * TH.deep * (1 - y / hy));
      }
      if (TH.deep > 0.5) for (let i = 0; i < 2; i++) {
        const L = HB * (0.45 - i * 0.12), x0 = ((Math.round(PW * (0.3 + i * 0.45) + T * (3 + i) - bx)) % PW + PW) % PW, y0 = hy - HB * (0.55 + i * 0.2);
        if (x0 < -L || x0 > W + L * 2) continue;
        const c = mix(SKY[1], [0, 0, 0], 0.55);
        for (let q = 0; q <= L; q++) {
          const t = q / L, th = Math.sin(Math.PI * Math.pow(t, 0.7)) * L * 0.13, yy = y0 + Math.sin(T * 1.2 - t * 3) * L * 0.03 * t, x = Math.round(x0 - q);
          for (let dy = -th; dy <= th * 0.7; dy++) putc(x, Math.round(yy + dy), c);
        }
        const ty = y0 + Math.sin(T * 1.2 - 3) * L * 0.03;
        for (let f = 0; f < L * 0.12; f++) for (const sg of [-1, 1]) putc(Math.round(x0 - L - f * 0.6), Math.round(ty + sg * f * 0.8), c);
      }
    }
    // up at the crown: a cloud deck drifting just overhead, thinning toward the horizon
    if (crownK > 0.02) {
      const cc = mix(mix(mid, hz, 0.5), [190, 185, 215], 0.3), y1 = Math.floor(hy - HB * 0.1);
      for (let y = 0; y < y1; y++) {
        const z = 40 * F / (hy - y), fade = smooth(0, 0.35, (hy - y) / HB) * crownK;
        for (let x = 0; x < W; x += 2) {
          const v = vnoise((x + bgX - W / 2) * z / F * 0.012, (camZ + z) * 0.01 + T * 0.01, 91), d = (v - 0.55) * 3;
          if (d <= 0) continue;
          const a = Math.min(1, d) * 0.55 * fade;
          for (let q = 0; q < 2 && x + q < W; q++) { const i = (y * W + x + q) * 3; col[i] += (cc[0] - col[i]) * a; col[i + 1] += (cc[1] - col[i + 1]) * a; col[i + 2] += (cc[2] - col[i + 2]) * a; }
        }
      }
    }
    // aircraft crossing far off, blinking
    for (let i = 0; i < 4; i++) {
      const x = ((Math.round(PW * i * 0.27 + T * (6 + i * 2) * (i % 2 ? 1 : -1) - bx)) % PW + PW) % PW, y = Math.round(hy - HB * (0.55 + 0.1 * i));
      if (x >= W) continue;
      addc(x, y, [255, 255, 255], 0.5);
      if ((T * 1.3 + i) % 1 < 0.15) { addc(x + 1, y, [255, 60, 60], 1); addLight(x, y, 3, [255, 60, 60], 0.4); }
    }
    towers(sky1, TWC[0], 0.6, mix(hz, TWC[0], 0.4));
    // hologram jellyshroom above the skyline
    const hx = ((holoX - bx) % PW + PW) % PW;
    const R = Math.max(10, Math.round(H * 0.11));
    if (hx > -R * 2 && hx < W + R * 2) {
      const glitch = hash(Math.floor(T * 9), 1, 1) < 0.06;
      const cx = hx + (glitch ? 3 : 0), cy = Math.round(hy - HB * 0.58 + Math.sin(T * 0.7) * 3);
      const a = glitch ? 0.25 : 0.55, hc = [70, 230, 255], pulse = 1 + Math.sin(T * 2.2) * 0.06;
      for (let dy = -Math.ceil(R * 0.8); dy <= 1; dy++) for (let dx = -R - 1; dx <= R + 1; dx++) {
        const e = (dx / (R * pulse)) ** 2 + (dy / (R * 0.8)) ** 2;
        if (e > 1) continue;
        if ((cy + dy) % 2 && e < 0.8) continue;
        addc(cx + dx, cy + dy, e > 0.8 ? [150, 255, 255] : hc, e > 0.8 ? a : a * 0.4);
      }
      for (let i = 0; i < 5; i++) for (let s = 1; s < R * 1.5; s++) {
        if ((cy + s) % 2) continue;
        addc(Math.round(cx + (i - 2) * R * 0.38 + Math.sin(T * 2 + s * 0.25 + i) * s * 0.1), cy + s, [200, 120, 255], a * (1 - s / (R * 1.5)));
      }
      addLight(cx, cy, R * 1.6, hc, 0.12);
    }
    towers(sky2, TWC[1], 0.35, mix(hz, TWC[1], 0.6));
    // an advertising blimp drifting over the skyline
    {
      const rx = Math.max(12, Math.round(HB * 0.17)), ry = Math.max(4, Math.round(rx * 0.3));
      const bxp = ((Math.round(PW * 0.45 + T * 4) - bx) % PW + PW) % PW, by = Math.round(hy - HB * 0.8 + Math.sin(T * 0.3) * 2);
      if (bxp > -rx * 2 && bxp < W + rx * 2 && TH.deep < 0.5) {
        const ad = Math.floor(T / 4), c1 = NEON[ad % 6], c2 = NEON[(ad + 3) % 6];
        for (let dy = -ry - 3; dy <= -ry + 1; dy++) for (let dx = -rx - 2; dx <= -rx + 3; dx++)    // tail fin
          if (dx - (-rx - 2) >= (dy + ry + 3) * 0.6) putc(bxp + dx, by + dy, [30, 28, 44]);
        for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
          const e = (dx / rx) ** 2 + (dy / ry) ** 2; if (e > 1) continue;
          let c = mix([58, 54, 78], [14, 12, 22], (dy + ry) / (2 * ry));
          const u = (dx + rx * 0.55) / (rx * 1.1), v = (dy + ry * 0.6) / (ry * 1.2);
          if (u > 0 && u < 1 && v > 0 && v < 1) {         // the ad screen on its flank
            const t = ((u * 2 - T * 0.6) % 1 + 1) % 1;
            c = mix(c1, c2, t < 0.5 ? t * 2 : 2 - t * 2);
            if (hash(Math.floor(u * 12), Math.floor(v * 4), ad) < 0.25) c = mix(c, [255, 255, 255], 0.5);
            if (Math.floor(v * 8) & 1) c = mix(c, [0, 0, 0], 0.3);
          }
          putc(bxp + dx, by + dy, c);
        }
        for (let dx = -3; dx <= 3; dx++) { putc(bxp + dx, by + ry + 1, [26, 24, 36]); putc(bxp + dx, by + ry + 2, dx & 1 ? [255, 220, 150] : [26, 24, 36]); }
        if ((T * 1.4) % 1 < 0.4) { putc(bxp + rx, by, [255, 60, 60]); addLight(bxp + rx, by, 4, [255, 50, 50], 0.6); }
        addLight(bxp, by, rx * 1.3, c1, 0.12);
      }
    }
    // a drone light show morphing between shapes
    {
      const R = HB * 0.17, dxp = ((Math.round(PW * 0.78) - bx) % PW + PW) % PW, cy = hy - HB * 0.6;
      if (dxp > -R * 2 && dxp < W + R * 2) {
        const m = (T * 0.12) % 4, a0 = Math.floor(m), f = smooth(0.65, 1, m - a0);
        const shape = (q, p) => {
          const t = p * 2 * Math.PI;
          if (q === 0) return [Math.cos(t + T * 0.4) * R, Math.sin(t + T * 0.4) * R * 0.8];
          if (q === 1) return [Math.pow(Math.sin(t), 3) * R, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 * R];
          if (q === 2) return [(p - 0.5) * 2.4 * R, Math.sin(p * 4 * Math.PI + T * 2) * R * 0.35];
          const r = R * (0.25 + 0.75 * p); return [Math.cos(t * 3 + T) * r, Math.sin(t * 3 + T) * r * 0.8];
        };
        for (let i = 0; i < 72; i++) {
          const p = i / 72, A = shape(a0, p), B = shape((a0 + 1) % 4, p);
          const x = Math.round(dxp + A[0] + (B[0] - A[0]) * f), y = Math.round(cy + A[1] + (B[1] - A[1]) * f);
          const c = NEON[(a0 + (i >> 4)) % 6];
          addc(x, y, c, 0.9);
          if (i % 9 === 0) addLight(x, y, 3, c, 0.3);
        }
      }
    }
    // lantern kites over the bazaar
    if (TH.kites > 0.02) for (let i = 0; i < 16; i++) {
      const x = ((Math.round(PW * (0.05 + i * 0.061) + Math.sin(T * 0.3 + i) * 6 - bx)) % PW + PW) % PW;
      if (x > W + 4) continue;
      const y = Math.round(hy - HB * (0.35 + 0.35 * hash(i, 1, 81)) + Math.sin(T * 0.8 + i * 2) * 3), c = NEON[i % 6], r = 2 + (i % 3);
      for (let dy = -r; dy <= r; dy++) { const hw = r - Math.abs(dy); for (let dx = -hw; dx <= hw; dx++) addc(x + dx, y + dy, c, 0.7 * TH.kites); }
      for (let t = 1; t < 12; t++) addc(x + Math.round(Math.sin(t * 0.5 + T) * 1.5), y + r + t, [200, 180, 150], 0.15 * TH.kites);
      addLight(x, y, 6, c, 0.25 * TH.kites);
    }
    // fireworks
    for (const f of fw) {
      const x = ((Math.round(f.pc - bx)) % PW + PW) % PW, y = Math.round(f.y);
      if (x < 0 || x >= W) continue;
      addc(x, y, f.c, Math.min(1, f.life)); addc(x - Math.sign(f.vx), y - Math.sign(f.vy), f.c, 0.4 * Math.min(1, f.life));
      if (f.life > 1.45) addLight(x, y, 8, f.c, 0.12);
    }
    // searchlights sweeping the clouds
    for (let i = 0; i < 3; i++) {
      const bxs = ((Math.round(PW * (0.2 + i * 0.31)) - bx) % PW + PW) % PW;
      if (bxs < -W || bxs > 2 * W) continue;
      const ang = Math.sin(T * 0.35 + i * 2.1) * 0.55, ta = Math.tan(ang), base = hy - HB * 0.2;
      const c = i === 1 ? [255, 120, 220] : [170, 210, 255];
      for (let y = Math.floor(base); y >= 0; y--) {
        const d = base - y, cxl = bxs + d * ta, hw = 1 + d * 0.06;
        for (let x = Math.max(0, Math.floor(cxl - hw)); x <= Math.min(W - 1, cxl + hw); x++)
          addc(x, y, c, 0.07 * (1 - d / base) * (1 - Math.abs(x - cxl) / (hw + 1)));
      }
    }
    // heat shimmer: the rows near the horizon wobble sideways
    if (TH.shimmer > 0.02) {
      const y0 = Math.max(0, Math.floor(hy - HB * 0.4)), y1 = Math.min(H - 1, Math.floor(hy + 1));
      for (let y = y0; y <= y1; y++) {
        const off = Math.round(Math.sin(y * 0.9 + T * 5) * 1.6 * TH.shimmer * (y - y0) / (y1 - y0 + 1));
        if (!off) continue;
        const row = y * W * 3; tmp.set(col.subarray(row, row + W * 3));
        for (let x = 0; x < W; x++) { const sx = clamp(x - off, 0, W - 1) * 3, o = row + x * 3; col[o] = tmp[sx]; col[o + 1] = tmp[sx + 1]; col[o + 2] = tmp[sx + 2]; }
      }
    }
    const out = this.texture.image.data;
    for (let i = 0, j = 0; i < out.length; i += 4, j += 3) {
      out[i] = (col[j] + glow[j] * lightGrade[0]) / 255;
      out[i + 1] = (col[j + 1] + glow[j + 1] * lightGrade[1]) / 255;
      out[i + 2] = (col[j + 2] + glow[j + 2] * lightGrade[2]) / 255;
      out[i + 3] = 1;
    }
    this.texture.needsUpdate = true;
  }
}
