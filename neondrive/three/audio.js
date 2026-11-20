// Sound effects, all synthesised with Web Audio (no files): the light cycle's engine, wind that grows with speed
// and height, rain on the visor, cars whooshing past, thunder after lightning, a muffled echo in the bores, and a
// soft thump on a crash. No music. The browser only allows sound after a key or tap, so it starts on the first one;
// M mutes.
export class Audio {
  constructor() { this.ctx = null; this.muted = false; this.prevFlash = 0; this.prevCrash = 0; this.near = new Map(); }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    // master: a lowpass that closes in the bores, a short echo there, then the volume
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.8;
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 18000;
    this.echo = c.createDelay(0.5); this.echo.delayTime.value = 0.11;
    this.echoGain = c.createGain(); this.echoGain.gain.value = 0;
    this.tone.connect(this.master); this.tone.connect(this.echo); this.echo.connect(this.echoGain);
    this.echoGain.connect(this.echo); this.echoGain.connect(this.master);
    this.master.connect(c.destination);
    // white noise, shared by wind, rain, whooshes and thunder
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    const loop = () => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    // engine: a hum and a sub an octave down, through a lowpass that opens with speed
    this.eng = c.createGain(); this.eng.gain.value = 0;
    this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 400; this.engF.Q.value = 3;
    this.osc = [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['sine', 2.01, 0.25]].map(([type, mult, g]) => {
      const o = c.createOscillator(), og = c.createGain(); o.type = type; og.gain.value = g;
      o.connect(og); og.connect(this.engF); o.start(); return { o, mult };
    });
    this.engF.connect(this.eng); this.eng.connect(this.tone);
    // wind: band-passed noise
    this.wind = c.createGain(); this.wind.gain.value = 0;
    this.windF = c.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.7; this.windF.frequency.value = 500;
    loop().connect(this.windF); this.windF.connect(this.wind); this.wind.connect(this.tone);
    // rain on the visor: a high hiss
    this.rain = c.createGain(); this.rain.gain.value = 0;
    const rainF = c.createBiquadFilter(); rainF.type = 'highpass'; rainF.frequency.value = 2500;
    loop().connect(rainF); rainF.connect(this.rain); this.rain.connect(this.tone);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  burst({ at = 0, dur = 0.4, gain = 0.3, type = 'bandpass', f0 = 800, f1 = 800, q = 1 }) {
    const c = this.ctx, t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.08, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.tone);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }

  // speed m/s, height m, enclosed (in a bore), rider {x, y, z, th}, cars [{pose, speed}]
  update(dt, S, { speed, height, enclosed, rider, cars }) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime, k = 0.08;
    const v = Math.max(0, speed), sf = Math.min(1, v / 83);
    // engine: pitch follows speed; a light hum when idling
    const base = 38 + v * 2.1;
    for (const { o, mult } of this.osc) o.frequency.setTargetAtTime(base * mult, t, k);
    this.engF.frequency.setTargetAtTime(260 + v * 22, t, k);
    this.eng.gain.setTargetAtTime(0.05 + 0.11 * sf, t, k);
    // wind: rises with speed, and with height (the Crown is the loudest)
    const hk = Math.min(1, Math.max(0, height) / 100);
    this.wind.gain.setTargetAtTime(enclosed ? 0.02 : 0.015 + 0.16 * sf * sf + 0.07 * hk, t, 0.2);
    this.windF.frequency.setTargetAtTime(300 + v * 14 + hk * 300, t, 0.2);
    // rain on the visor, heavier in a monsoon and with speed; tapping drops
    const raining = S.fall === 'rain' || S.fall === 'monsoon';
    const rk = raining ? (S.fall === 'monsoon' ? 1 : 0.6) : 0;
    this.rain.gain.setTargetAtTime(rk * (0.025 + 0.04 * sf), t, 0.4);
    if (rk && Math.random() < dt * (6 + 20 * sf) * rk) this.burst({ dur: 0.05, gain: 0.05, f0: 3000 + Math.random() * 3000, f1: 2000, q: 4 });
    // in a bore everything goes muffled, with a short echo
    this.tone.frequency.setTargetAtTime(enclosed ? 1400 : 18000, t, 0.15);
    this.echoGain.gain.setTargetAtTime(enclosed ? 0.35 : 0, t, 0.15);
    // thunder: lightning flashes now, the rumble arrives later the further away it struck
    if (S.flash > 0.9 && this.prevFlash < 0.9) {
      const delay = 0.4 + Math.random() * 2.5;
      this.burst({ at: delay, dur: 3.5 + Math.random() * 2, gain: 0.5 - delay * 0.1, type: 'lowpass', f0: 220, f1: 60, q: 0.5 });
      this.burst({ at: delay, dur: 0.6, gain: 0.25, type: 'lowpass', f0: 900, f1: 200, q: 0.7 });
    }
    this.prevFlash = S.flash;
    // a crash: a soft thump, not a bang
    if (S.crashFlash > 0.45 && this.prevCrash <= 0.45) this.burst({ dur: 0.35, gain: 0.45, type: 'lowpass', f0: 300, f1: 50, q: 1 });
    this.prevCrash = S.crashFlash;
    // cars whooshing past: when one crosses from ahead to behind within a few metres, a doppler sweep, louder the
    // faster you close on it
    if (rider && cars) {
      const fx = Math.sin(rider.th), fz = Math.cos(rider.th);
      for (const car of cars) {
        const p = car.pose, dx = p.x - rider.x, dz = p.z - rider.z;
        if (Math.abs(p.y - rider.y) > 4 || dx * dx + dz * dz > 30 * 30) { this.near.delete(car); continue; }
        const ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx), was = this.near.get(car);
        if (was !== undefined && was > 0 && ahead <= 0 && side < 7) {
          const carV = car.speed * Math.cos((p.th ?? 0) - rider.th), closing = Math.abs(v - carV);
          if (closing > 4) this.burst({ dur: 0.6, gain: Math.min(0.35, 0.05 + closing * 0.006), f0: 1600 + closing * 20, f1: 300, q: 1.2 });
        }
        this.near.set(car, ahead);
      }
    }
  }
}
