// The GPU light-cycle cockpit, rastered on the output art grid.
import { SEGL, LH, ELEV, TRANS, TRANS_AT, hash, smooth } from './world.js';
import { CYCLE_INK, CYCLE_GRIP, CYCLE_DASH } from './cycle-design.js';

const LVC = [[255, 150, 60], [0, 235, 255], [255, 60, 190]];
export const FONT = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  'K': '101101110101101', 'M': '101111111101101', 'H': '101101111101101', '/': '001001010100100', 'A': '010101111101101',
  'U': '101101101101111', 'T': '111010010010010', 'O': '111101101101111', 'N': '110101101101101', 'L': '100100100100111',
  'R': '110101110101101', 'I': '111010010010111', ' ': '000000000000000', 'E': '111100110100111', 'P': '111101111100100',
  'D': '110101101101110', 'S': '111100111001111', 'C': '111100100100111', 'F': '111100110100100',
  'W': '101101101111101', '^': '010111010010010', '_': '010010010111010', 'V': '101101101101010', 'B': '110101110101110', 'Y': '101101010010010', 'G': '111100101101111',
};

const DISKS = {};                                    // the disc a thick line is stamped with: offsets in drawing order, and which are highlight
function thick(overlay, x0, y0, x1, y1, r, c, hi) {
  let D = DISKS[r];
  if (!D) { D = []; for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a * a + b * b <= r * r + 0.5) D.push(a, b, b < -r * 0.4 ? 1 : 0); DISKS[r] = D; }
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  let px = NaN, py = NaN;
  for (let i = 0; i <= n; i++) {
    // round(x + a) = round(x) + a for whole a, so each step is one rounding; a step landing where the last one did repaints the same pixels
    const rx = Math.round(x0 + (x1 - x0) * i / n), ry = Math.round(y0 + (y1 - y0) * i / n);
    if (rx === px && ry === py) continue;
    px = rx; py = ry;
    for (let k = 0; k < D.length; k += 3) {
      const x = rx + D[k], y = ry + D[k + 1];
      overlay.tint(x, y, D[k + 2] ? hi : c, 0);
    }
  }
}

function htext(overlay, str, x, y, c, sc, a) {               // hologram text: added light, scanlined when big
  for (const ch of str) {
    const g = FONT[ch] || FONT[' '];
    for (let i = 0; i < 15; i++) if (g[i] === '1')
      for (let p = 0; p < sc; p++) for (let q = 0; q < sc; q++) {
        const yy = y + Math.floor(i / 3) * sc + q;
        overlay.add(x + (i % 3) * sc + p, yy, c, sc > 1 && (yy & 1) ? a * 0.45 : a);
      }
    x += 4 * sc;
  }
}
function shade(overlay, x0, y0, x1, y1, k) {
  const { width: W, height: H } = overlay;                 // dim a box so projected readouts stay legible over bright streets
  for (let y = Math.max(0, Math.round(y0)); y <= Math.min(H - 1, Math.round(y1)); y++)
    for (let x = Math.max(0, Math.round(x0)); x <= Math.min(W - 1, Math.round(x1)); x++) overlay.tint(x, y, [0, 0, 0], k);
}
// handlebars as a polyline (fractions of W, H from the steering pivot), turning a little with the steering:
// one chrome tube clamped in the middle, switch housings, levers in front of ribbed rubber grips, metal bar ends
function barSet(overlay, pcy, path, r, steer, vib) {
  const { width: W, height: H } = overlay;
  const a = steer * 0.07, ca = Math.cos(a), sa = Math.sin(a);
  pcy += vib;
  const side = sd => path.map(([fx, fy]) => { const ex = fx * W * sd, ey = fy * H; return [W / 2 + ex * ca - ey * sa, pcy + ex * sa + ey * ca]; });
  const L = side(-1), Rt = side(1), tube = [52, 52, 62], tubeHi = [165, 168, 182];
  thick(overlay, L[0][0], L[0][1], Rt[0][0], Rt[0][1], r, tube, tubeHi);                        // across the middle
  for (const P of [L, Rt]) for (let i = 0; i < P.length - 2; i++) thick(overlay, P[i][0], P[i][1], P[i + 1][0], P[i + 1][1], r, tube, tubeHi);
  const cxm = (L[0][0] + Rt[0][0]) / 2, cym = (L[0][1] + Rt[0][1]) / 2, cw = Math.max(3, W * 0.025);
  thick(overlay, cxm - cw * ca, cym - cw * sa, cxm + cw * ca, cym + cw * sa, r + 2, [34, 34, 42], [96, 96, 110]);   // the clamp
  [L, Rt].forEach((P, k) => {
    const g0 = P[P.length - 2], g1 = P[P.length - 1], dx = g1[0] - g0[0], dy = g1[1] - g0[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    // "in front of the bar" reads as up the screen for flat bars and inward for upright grips
    let nx = -uy, ny = ux;
    if (Math.abs(ux) > Math.abs(uy) ? ny > 0 : nx * (W / 2 - g0[0]) < 0) { nx = -nx; ny = -ny; }
    const hx = g0[0] - ux * (r + 3), hy = g0[1] - uy * (r + 3);
    thick(overlay, hx, hy, g0[0], g0[1], r + 2, [26, 26, 32], [70, 70, 82]);                     // switch housing
    overlay.tint(Math.round(hx + nx * (r + 1)), Math.round(hy + ny * (r + 1)), k ? [220, 40, 40] : [230, 230, 235], 0);
    const lo = r + 3, lx0 = g0[0] + nx * lo, ly0 = g0[1] + ny * lo, lx1 = g0[0] + ux * len * 0.9 + nx * (lo - 1), ly1 = g0[1] + uy * len * 0.9 + ny * (lo - 1);
    thick(overlay, g0[0], g0[1], lx0, ly0, 1, [60, 60, 70], [120, 120, 134]);                  // lever perch
    thick(overlay, lx0, ly0, lx1, ly1, 1, [120, 122, 136], [190, 192, 205]);                    // brake / clutch lever
    for (let t = 0; t <= len; t += 1) {                                                 // ribbed rubber grip
      const rib = Math.floor(t / 2) & 1;
      thick(overlay, g0[0] + ux * t, g0[1] + uy * t, g0[0] + ux * t, g0[1] + uy * t, r + 2, rib ? [14, 14, 18] : [28, 28, 34], rib ? [34, 34, 40] : [56, 56, 64]);
    }
    thick(overlay, g1[0], g1[1], g1[0] + ux * 2, g1[1] + uy * 2, r + 1, [110, 112, 124], [200, 202, 214]);   // bar-end weight
  });
}


function drawDome(overlay) {
  const { width: W, height: H } = overlay;
  const cx = W / 2, cy = H * 1.04, rx = W * 0.13, ry = H * 0.24;
  for (let y = Math.floor(cy - ry); y < H; y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx, ny = (y - cy) / ry, e = nx * nx + ny * ny;
      if (e > 1) continue;
      if (e > 0.9) overlay.tint(x, y, [92, 98, 122], 0);
      else {
        const highlight = nx < -0.25 && nx > -0.55 && ny < -0.35 && ny > -0.8
          && Math.abs(nx + 0.4 - (ny + 0.6) * 0.3) < 0.07;
        overlay.tint(x, y, highlight ? [46, 52, 68] : [6, 9, 16], 0.3, 0.34);
      }
    }
  }
  for (const side of [-1, 1]) {
    for (let y = Math.round(H * 0.84); y < H * 0.9; y++) {
      for (let x = 0; x < Math.max(2, W * 0.01); x++) {
        overlay.tint(Math.round(cx + side * (W * 0.03 + x)), y, [60, 62, 78], 0);
      }
    }
  }
}

export function drawReferenceCockpit(overlay, state) {
  const { width: W, height: H } = overlay;
  const { T, speed, steer, waitLight, auto } = state;
  const n = Math.floor(state.z / SEGL), elevation = state.elevation ?? ELEV[n];
  const tr = state.elevation === undefined ? TRANS[TRANS_AT[n]] : null;
  const level = elevation <= LH[1] ? elevation / LH[1] : 1 + (elevation - LH[1]) / (LH[2] - LH[1]);
  const I = {
    lv: Math.round(level), moving: tr && n >= tr.s && n < tr.e, up: tr && tr.to > tr.from,
    st: waitLight ? 'RED' : auto ? 'AUTO' : 'MANUAL',
    stC: waitLight ? (T * 2 % 1 < 0.6 ? [255, 60, 60] : [120, 30, 30]) : auto ? [80, 255, 150] : [255, 150, 60],
  };
  const cx = W / 2, sc = H > 200 ? 2 : 1;
  const g = { ring: [cx, H * 0.92], holo: [cx, H * 0.71], proj: [cx, H * 0.81] };
  const r = Math.max(1, Math.round(H * 0.008)), spd = String(Math.round(speed * 3.6)).padStart(3, ' ');
  const vib = Math.sin(T * 75) * smooth(62, 83, speed);
  drawDome(overlay);
  barSet(overlay, H * 0.9, [[0.03, -0.03], [0.17, -0.05], [0.27, -0.15], [0.29, -0.22]], r, steer, vib);
  {                                                 // the ring floating under the glass, breathing slowly
    const [rx0, ry0] = g.ring, rx = W * 0.045, ry = Math.max(3, H * 0.018), p = 0.65 + 0.35 * Math.sin(T * 1.8), steps = Math.ceil(rx * 7);
    for (let i = 0; i < steps; i++) { const t = i / steps * 2 * Math.PI; overlay.add(Math.round(rx0 + Math.cos(t) * rx), Math.round(ry0 + Math.sin(t) * ry), [80, 230, 255], 0.9 * p); }
    for (let y = -ry * 3; y <= ry * 3; y++) for (let x = -rx * 1.6; x <= rx * 1.6; x++) {
      const d = Math.hypot(x / (rx * 1.6), y / (ry * 3)); if (d < 1) overlay.add(Math.round(rx0 + x), Math.round(ry0 + y), [0, 160, 220], (1 - d) * 0.18 * p);
    }
  }
  const [hx, hy] = g.holo, glitch = hash(Math.floor(T * 8), 7, 7) < 0.05, ox = glitch ? 1 : 0;
  const a = 0.45 + 0.08 * Math.sin(T * 9) + 0.05 * Math.sin(T * 23), hc = [80, 230, 255], big = sc, sw = 12 * big - big;
  for (let i = -4; i <= 4; i++) {                   // a faint projector beam from the emitter on the tank
    const x1 = hx + i * W * 0.008, y1 = hy + 6 * sc;
    for (let t = 0; t <= 1; t += 0.03) overlay.add(Math.round(g.proj[0] + (x1 - g.proj[0]) * t), Math.round(g.proj[1] + (y1 - g.proj[1]) * t), hc, 0.025);
  }
  const tY = Math.round(hy - 5 * big), lX = Math.round(hx - sw / 2);
  shade(overlay, lX - 13, tY - 4, hx + sw / 2 + 15, hy + 11, 0.8);
  htext(overlay, spd, lX + ox, tY, hc, big, a);
  if (glitch) htext(overlay, spd, lX - 2, tY, [255, 60, 180], big, 0.4);
  htext(overlay, I.st, Math.round(hx - I.st.length * 2), Math.round(hy + 3), I.stC, 1, a);
  htext(overlay, 'L' + (I.lv + 1), lX - 10, tY, LVC[I.lv], 1, a);
  if (I.moving && (T * 3) % 1 < 0.6) htext(overlay, I.up ? '^' : '_', lX - 8, tY + 7, LVC[I.lv], 1, a);
  for (let i = 0; i < 3; i++) {                     // three stacked chevrons, the current level lit
    const yy = tY + (2 - i) * 5, xx = Math.round(hx + sw / 2 + 5), on = i === I.lv;
    for (let k = 0; k < 4; k++) { overlay.add(xx + k, yy + k, on ? LVC[i] : hc, on ? a : 0.15); overlay.add(xx + 7 - k, yy + k, on ? LVC[i] : hc, on ? a : 0.15); }
  }
  const bx0 = lX - 13, bx1 = Math.round(hx + sw / 2 + 15), by0 = tY - 4, by1 = Math.round(hy + 11);
  for (let k = 0; k < 4; k++) for (const [x, y, dx, dy] of [[bx0, by0, 1, 0], [bx0, by0, 0, 1], [bx1, by0, -1, 0], [bx1, by0, 0, 1], [bx0, by1, 1, 0], [bx0, by1, 0, -1], [bx1, by1, -1, 0], [bx1, by1, 0, -1]])
    overlay.add(x + dx * k, y + dy * k, hc, 0.3 * a);
}

function panel(overlay, points, color) {
  const min = Math.max(0, Math.ceil(Math.min(...points.map(p => p[1]))));
  const max = Math.min(overlay.height - 1, Math.floor(Math.max(...points.map(p => p[1]))));
  for (let y = min; y <= max; y++) {
    const edges = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i];
      if ((a[1] > y) !== (b[1] > y)) edges.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    edges.sort((a, b) => a - b);
    for (let i = 0; i < edges.length; i += 2)
      for (let x = Math.ceil(edges[i]); x <= edges[i + 1]; x++) overlay.tint(x, y, color, 0);
  }
}

export function drawCockpit(overlay, state) {
  const { width: W, height: H } = overlay;
  const sx = Math.min(W * 0.42, H * 0.62), sy = H * 0.28, top = H * 0.72, center = W / 2;
  const P = (x, y) => [center + x * sx, top + y * sy];
  const fill = (points, color) => panel(overlay, points.map(([x, y]) => P(x, y)), color);
  const trace = (points, color, radius = 1) => {
    for (let i = 1; i < points.length; i++) thick(overlay, ...P(...points[i - 1]), ...P(...points[i]), radius, color, color);
  };
  const { carbon, shell, bevel, grip, suit, armour, glass, cyan, channel, dim } = CYCLE_INK;
  const dashSide = CYCLE_DASH.width / (CYCLE_GRIP[0] * 2) * 0.54;
  const fork = Math.max(-1, Math.min(1, state.steer || 0)) * 0.055;

  fill([[-0.53, 1.12], [-0.46, 0.61], [-0.31, 0.38], [-0.25, 0.19], [0.25, 0.19],
    [0.31, 0.38], [0.46, 0.61], [0.53, 1.12]], carbon);
  fill([[-0.28, 1.12], [-0.34, 0.62], [-0.17, 0.40], [0.17, 0.40], [0.34, 0.62], [0.28, 1.12]], shell);
  for (const side of [-1, 1]) {
    const mirror = points => points.map(([x, y]) => [x * side, y]);
    fill(mirror([[0.26, 0.44], [0.44, 0.54], [0.52, 1.12], [0.37, 1.12], [0.32, 0.67]]), bevel);
    trace(mirror([[0.44, 0.57], [0.35, 0.70], [0.40, 1.09]]), channel);
    trace(mirror([[0.37, 0.78], [0.40, 0.96]]), cyan);

    // The short enclosed grip and glove sit at the same contact point as the exterior model.
    const move = (x, y) => [side * x + fork * (0.4 + x), y + side * fork * 0.95];
    const shape = (vertices, color) => fill(vertices.map(([x, y]) => move(x, y)), color);
    const seam = (vertices, color) => trace(vertices.map(([x, y]) => move(x, y)), color);
    shape([[0.23, 0.52], [0.48, 0.40], [0.67, 0.14], [0.86, 0.13], [0.91, 0.29],
      [0.76, 0.40], [0.59, 0.51], [0.45, 0.62], [0.26, 0.63]], carbon);
    shape([[0.24, 0.53], [0.48, 0.44], [0.68, 0.17], [0.85, 0.17], [0.83, 0.30],
      [0.65, 0.40], [0.47, 0.57]], shell);
    seam([[0.32, 0.55], [0.49, 0.46], [0.68, 0.20]], channel);
    shape([[0.68, 0.17], [0.85, 0.16], [0.91, 0.23], [0.90, 0.33], [0.77, 0.37], [0.66, 0.30]], grip);
    shape([[0.73, 0.13], [0.84, 0.14], [0.91, 0.28], [0.92, 0.41], [1.02, 0.65],
      [1.00, 0.87], [0.85, 0.68], [0.72, 0.40], [0.66, 0.27]], suit);
    shape([[0.70, 0.20], [0.75, 0.15], [0.83, 0.17], [0.87, 0.26], [0.84, 0.33], [0.74, 0.31]], armour);
    seam([[0.74, 0.20], [0.83, 0.22], [0.86, 0.31]], cyan);
    seam([[0.85, 0.43], [0.95, 0.64], [0.98, 0.74]], channel);
  }

  fill([[-dashSide * 0.76, 0.08], [dashSide * 0.76, 0.08], [dashSide, 0.21], [dashSide * 0.86, 0.54],
    [dashSide * 0.44, 0.63], [-dashSide * 0.44, 0.63], [-dashSide * 0.86, 0.54], [-dashSide, 0.21]], bevel);
  fill([[-dashSide * 0.72, 0.12], [dashSide * 0.72, 0.12], [dashSide * 0.92, 0.23],
    [dashSide * 0.78, 0.51], [dashSide * 0.42, 0.58], [-dashSide * 0.42, 0.58],
    [-dashSide * 0.78, 0.51], [-dashSide * 0.92, 0.23]], glass);
  trace([[-dashSide * 0.9, 0.24], [-dashSide * 0.68, 0.12], [dashSide * 0.68, 0.12], [dashSide * 0.9, 0.24]], cyan);
  trace([[-0.085, 0.71], [-0.065, 0.80], [0.065, 0.80], [0.085, 0.71], [-0.085, 0.71]], channel);
  trace([[-0.039, 0.86], [0.039, 0.86]], dim);

  const speed = String(Math.round(state.speed * 3.6)), scale = sy >= 64 && sx >= 120 ? 2 : 1;
  const text = (str, y, ink, sc = 1) =>
    htext(overlay, str, Math.round(center - (str.length * 4 - 1) * sc / 2), Math.round(top + y * sy), ink, sc, 0.9);
  const status = state.waitLight ? 'RED' : state.auto ? 'AUTO' : 'MANUAL';
  const statusColor = state.waitLight ? [255, 70, 70] : state.auto ? [104, 255, 179] : [255, 189, 108];
  text(speed, 0.22, cyan, scale);
  text('L' + ((state.layer ?? 0) + 1) + ' ' + status, 0.41, statusColor);
}


export function drawRideReadout(overlay, state) {
  const level = state.layer ?? 0, y = overlay.height - 9;
  const status = state.waitLight ? 'RED' : state.auto ? 'AUTO' : 'MANUAL';
  const color = state.waitLight ? [255, 60, 60] : state.auto ? [80, 255, 150] : [255, 150, 60];
  const draw = (label, x, ink) => {
    for (const ch of label) {
      const glyph = FONT[ch] || FONT[' '];
      for (let i = 0; i < glyph.length; i++) {
        if (glyph[i] === '1') overlay.tint(x + i % 3, y + Math.floor(i / 3), ink, 0);
      }
      x += 4;
    }
  };
  draw(String(Math.round(state.speed * 3.6)), 4, [150, 230, 255]);
  draw('L' + (level + 1), 22, LVC[level]);
  draw(status, 34, color);
}
