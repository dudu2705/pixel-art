// Art-grid weather from the GPU reference, drawn in front of the banked scene.
export class Weather {
  constructor() {
    this.streaks = [];
    this.drops = [];
  }

  reset() {
    this.streaks.length = 0;
    this.drops.length = 0;
  }

  update(dt, state, overlay, cockpit) {
    const { width: W, height: H } = overlay;
    const { fall: W_, speed, steer, T, rainOn } = state;
    const { streaks, drops } = this;
    if (!rainOn) drops.length = 0;
    const want = Math.round(W * ({ rain: 0.6, monsoon: 1.1, snow: 0.5, ash: 0.45, sand: 0.4, petals: 0.14, bubbles: 0.25, fireflies: 0.12 }[W_] || 0));
    const respawn = s => {
      s.kind = W_;
      if (W_ === 'sand') { s.x = -Math.random() * 40; s.y = Math.random() * H; }
      else if (W_ === 'rain' || W_ === 'monsoon') { s.x = Math.random() * W; s.y = Math.random() * H * 0.3; }
      else if (W_ === 'bubbles') { s.x = Math.random() * W; s.y = H * (0.6 + Math.random() * 0.4); }
      else { s.x = W / 2 + (Math.random() - 0.5) * W * 0.6; s.y = H * 0.42 + (Math.random() - 0.5) * H * 0.5; }
    };
    while (streaks.length < want) { const s = { v: 140 + Math.random() * 80, l: 2 + Math.random() * 4, ph: Math.random() * 6 }; respawn(s); s.y = Math.random() * H; streaks.push(s); }
    if (streaks.length > want) streaks.length = want;
    for (const s of streaks) {
      if (s.kind === 'rain' || s.kind === 'monsoon') { s.y += s.v * dt * (s.kind === 'monsoon' ? 1.5 : 1); s.x += (s.x - W / 2) * dt * speed * 0.02 - steer * 20 * dt; }
      else if (s.kind === 'bubbles') { s.y -= (30 + s.v * 0.15) * dt; s.x += ((s.x - W / 2) * speed * 0.015 + Math.sin(T * 3 + s.ph) * 8) * dt; }
      else if (s.kind === 'fireflies') {
        s.x += ((s.x - W / 2) * speed * 0.02 + Math.sin(T * 0.7 + s.ph * 3) * 10) * dt;
        s.y += ((s.y - H * 0.42) * speed * 0.02 + Math.cos(T * 0.9 + s.ph * 2) * 8) * dt;
      }
      else if (s.kind === 'snow' || s.kind === 'petals' || s.kind === 'ash') {
        const k = s.kind === 'snow' ? 1 : s.kind === 'ash' ? 0.8 : 0.6;
        s.x += ((s.x - W / 2) * speed * 0.025 + Math.sin(T * 2 + s.ph) * 14 * (2 - k) - steer * 15) * dt;
        s.y += ((s.y - H * 0.42) * speed * 0.025 + 18 * k) * dt;
      } else if (s.kind === 'sand') { s.x += (s.v * 1.6 + (s.x - W / 2) * speed * 0.01) * dt; s.y += Math.sin(T * 3 + s.ph) * 10 * dt; }
      if (s.kind !== W_ || s.y > H || s.y < -5 || s.x < -50 || s.x >= W + 5) respawn(s);
    }
    if (cockpit && rainOn && (W_ === 'rain' || W_ === 'monsoon') && drops.length < 60) for (let i = 0; i < (W_ === 'monsoon' ? 36 : 18) * dt * (1 + Math.random()); i++) {
      const a = Math.random() * Math.PI * 2, r = 0.62 + Math.random() * 0.45;
      const x = W / 2 + Math.cos(a) * r * W * 0.5, y = H * 0.42 + Math.sin(a) * r * H * 0.5;
      if (x > 0 && x < W && y > 0 && y < H * 0.8) drops.push({ x, y, s: Math.random() < 0.25 ? 2 : 1 });
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.y -= speed * 0.06 * dt * (1 + d.s); d.x += (d.x - W / 2) * 0.012 * speed * dt;
      if (d.y < 0 || d.x < 0 || d.x >= W) drops.splice(i, 1);
    }
  }

  draw(overlay, state, cockpit) {
    const { width: W, height: H } = overlay;
    const { T, steer } = state;
    const { streaks, drops } = this;
    const addc = (x, y, color, amount) => overlay.add(x, y, color, amount);
    // rain streaks outside
    for (const s of streaks) {
      const cd = Math.abs(s.x - W / 2) / W + Math.abs(s.y - H * 0.42) / H;   // fainter near the centre of view
      const fade = Math.min(1, cd * 2.5);
      const x = Math.round(s.x), y = Math.round(s.y);
      if (s.kind === 'rain') { const a = 0.09 * fade; if (a > 0.01) for (let k = 0; k < s.l; k++) addc(Math.round(s.x - steer * k * 0.3), y - k, [130, 150, 200], a); }
      else if (s.kind === 'monsoon') { const a = 0.14 * fade; if (a > 0.01) for (let k = 0; k < s.l * 1.6; k++) addc(Math.round(s.x - steer * k * 0.3), y - k, [150, 180, 200], a); }
      else if (s.kind === 'ash') addc(x, y, s.ph > 5 ? [255, 140, 50] : [150, 140, 140], 0.7 * fade);
      else if (s.kind === 'bubbles') { const c = [170, 230, 255]; addc(x, y, c, 0.12 * fade); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) addc(x + dx, y + dy, c, 0.45 * fade); }
      else if (s.kind === 'fireflies') { const bl = 0.5 + 0.5 * Math.sin(T * 3 + s.ph * 5), c = [200, 255, 120]; addc(x, y, c, bl); addc(x + 1, y, c, 0.35 * bl); addc(x - 1, y, c, 0.35 * bl); addc(x, y + 1, c, 0.35 * bl); addc(x, y - 1, c, 0.35 * bl); }
      else if (s.kind === 'snow') { addc(x, y, [230, 240, 255], 0.75 * fade); if (s.l > 4.5 && cd > 0.3) addc(x + 1, y, [230, 240, 255], 0.5 * fade); }
      else if (s.kind === 'petals') { const c = [255, 170, 210]; addc(x, y, c, 0.9 * fade); addc(x + (Math.sin(T * 5 + s.ph) > 0 ? 1 : -1), y, c, 0.6 * fade); }
      else if (s.kind === 'sand') { for (let k = 0; k < s.l * 2.5; k++) addc(x - k, y, [230, 160, 90], 0.14 * (1 - k / (s.l * 2.5))); }
    }
    if (!cockpit) return;
    for (const drop of drops) {
      const x = Math.round(drop.x), y = Math.round(drop.y);
      if (x < 1 || y < 3 || x >= W - 1 || y >= H - 1) continue;
      overlay.tint(x, y, [22, 24, 30], 1.15);
      if (drop.s === 2) overlay.tint(x, y + 1, [0, 0, 0], 0.7);
    }
  }
}
