// The five GPU shots and two inspection cameras.
import * as THREE from './vendor/three.module.js';
import { frameAt } from './road.js';
import { SEGL, NSEG, LEN, LH, RW, D, district, TRANS, TRANS_AT, clamp, smooth } from './world.js';

// tunnels, the sea tube, the vactrain and every level-change bore are enclosed:
// a camera that sits outside them shows a roofless trench, so they clamp it in
const BORE_H = 6.5, BORE_W = RW + 1.2;
function enclosed(dist) {
  const n = ((Math.floor(dist / SEGL) % NSEG) + NSEG) % NSEG;
  const d = district(n);
  if (d === D.TUNNEL || d === D.TUBE || d === D.VAC) return true;
  const tri = TRANS_AT[n];
  return tri >= 0 && n >= TRANS[tri].s && n < TRANS[tri].e;
}

export const SHOTS = ['COCKPIT', 'CHASE', 'DRONE', 'TRACKSIDE', 'ALONGSIDE'];
export const MODES = [...SHOTS, 'ORBIT', 'FLY'];
const ORBIT = SHOTS.length, FLY = ORBIT + 1;
const FOLLOW = [
  { back: 0, up: 0, pitch: 0 },
  { back: 6.5, up: 1.5, pitch: 0.16 },
  { back: 16, up: 7, pitch: 0.38 },
  { back: 0, up: 0.6, pitch: 0 },
  { back: 7, up: 0.5, pitch: 0 },
];
const LOW_DRONE = { back: 9, up: 2.2, pitch: 0.06 };

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

export class Rig {
  constructor(camera, dom, sampling = {}) {
    this.cam = camera;
    this.frameAt = sampling.frameAt ?? frameAt;
    this.enclosed = sampling.enclosed ?? enclosed;
    this.boreHalfWidth = sampling.boreHalfWidth ?? BORE_W;
    this.cabinBounds = sampling.cabinBounds;
    this.period = sampling.period ?? LEN;
    this.mode = 0;
    this.shot = { ...FOLLOW[0], lat: 0 };
    this.shotChanged = true;
    this.trackside = null;
    this.alongside = 1;
    this.lastLat = 3.5;
    this.yaw = 0; this.pitch = 0.22; this.dist = 14;
    this.tYaw = 0; this.tPitch = 0.22; this.tDist = 14;
    this.look = new THREE.Vector3();
    this.fly = new THREE.Vector3();
    this.flyYaw = 0; this.flyPitch = 0;
    this.keys = {};
    this.dragging = false;
    this.bind(dom);
  }

  bind(dom) {
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('pointerdown', e => {
      this.dragging = true; this.lx = e.clientX; this.ly = e.clientY;
      dom.setPointerCapture(e.pointerId);
      // dragging always takes you to a camera you can steer
      if (this.mode !== ORBIT && this.mode !== FLY) this.setMode(ORBIT);
    });
    dom.addEventListener('pointerup', e => { this.dragging = false; });
    dom.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      const dx = (e.clientX - this.lx) * 0.006, dy = (e.clientY - this.ly) * 0.006;
      this.lx = e.clientX; this.ly = e.clientY;
      if (this.mode === FLY) { this.flyYaw -= dx; this.flyPitch = clampP(this.flyPitch - dy); }
      else { this.tYaw -= dx; this.tPitch = clampP(this.tPitch + dy); }
    });
    dom.addEventListener('wheel', e => {
      e.preventDefault();
      this.tDist = Math.min(400, Math.max(1.5, this.tDist * Math.exp(e.deltaY * 0.0012)));
      if (this.mode !== ORBIT && this.mode !== FLY) this.setMode(ORBIT);
    }, { passive: false });
    // the camera no longer binds its own keys: main.js owns the keyboard so the
    // original's bindings stay exactly as they were
    addEventListener('keydown', e => { this.keys[e.code] = true; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  setMode(m) {
    const prev = this.mode;
    this.mode = m;
    this.shotChanged = true;
    this.trackside = null;
    this.alongside = this.lastLat > 3.5 ? -1 : 1;
    if (m === FLY && prev !== FLY) {                 // entering free flight: start where we are
      this.fly.copy(this.cam.position);
      const d = new THREE.Vector3(); this.cam.getWorldDirection(d);
      this.flyYaw = Math.atan2(-d.x, -d.z);
      this.flyPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    }
    if (m === ORBIT) { this.tYaw = this.yaw; this.tPitch = this.pitch; this.tDist = this.dist; }
    this.onMode && this.onMode(MODES[m]);
  }

  reset() { this.tYaw = 0; this.tPitch = 0.22; this.tDist = 14; }

  cycleShot() {
    this.setMode(this.mode < SHOTS.length ? (this.mode + 1) % SHOTS.length : 0);
  }

  update(bike, dt) {
    this.lastLat = bike.laneOffset ?? bike.lat;
    this.cam.up.set(0, 1, 0);
    if (this.mode === FLY) {                        // FLY: detached, WASD + mouse
      const sp = (this.keys.ShiftLeft ? 160 : 45) * dt;
      const cy = Math.cos(this.flyYaw), sy = Math.sin(this.flyYaw);
      const fwd = new THREE.Vector3(-sy * Math.cos(this.flyPitch), Math.sin(this.flyPitch), -cy * Math.cos(this.flyPitch));
      const right = new THREE.Vector3(cy, 0, -sy);
      if (this.keys.KeyW) this.fly.addScaledVector(fwd, sp);
      if (this.keys.KeyS) this.fly.addScaledVector(fwd, -sp);
      if (this.keys.KeyA) this.fly.addScaledVector(right, -sp);
      if (this.keys.KeyD) this.fly.addScaledVector(right, sp);
      if (this.keys.KeyQ) this.fly.y -= sp;
      if (this.keys.KeyE) this.fly.y += sp;
      this.cam.position.copy(this.fly);
      this.cam.lookAt(this.fly.clone().add(fwd));
      return;
    }

    if (this.mode === ORBIT) {
      this.updateOrbit(bike, dt);
      return;
    }

    const underRoof = this.enclosed(bike.dist);
    const target = this.mode === 2 && underRoof ? LOW_DRONE : FOLLOW[this.mode];
    const lat = this.mode === 4 ? this.alongside * 2.2 : 0;
    const amount = this.shotChanged ? 1 : 1 - Math.pow(0.94, dt * 60);
    for (const key of ['back', 'up', 'pitch']) this.shot[key] = lerp(this.shot[key], target[key], amount);
    this.shot.lat = lerp(this.shot.lat, lat, amount);
    this.shotChanged = false;

    let dist = bike.dist - this.shot.back;
    let side = bike.lat + this.shot.lat;
    let fixed = null;
    const cabin = this.cabinBounds?.();
    if (cabin) this.trackside = null;
    if (this.mode === 3 && !cabin) {
      const gap = this.trackside ? bike.dist - this.trackside.dist : 0;
      const passed = this.period ? (gap + this.period) % this.period : gap;
      if (!this.trackside || (passed > 55 && (!this.period || passed < this.period / 2))) {
        const forward = bike.dist + 25;
        const anchor = this.period ? forward % this.period : forward;
        this.trackside = { dist: anchor, pose: this.frameAt(anchor, {}), lat: this.lastLat > 3.5 ? -2.2 : 9.2 };
      }
      dist = this.trackside.dist;
      side = this.trackside.lat;
      fixed = this.trackside.pose;
    }

    const f = fixed ?? this.frameAt(dist, {});
    const covered = underRoof || this.enclosed(dist);
    const height = covered ? Math.min(1.4 + this.shot.up, BORE_H - 1.9) : 1.4 + this.shot.up;
    if (covered) side = clamp(side, -(this.boreHalfWidth - 1.4), this.boreHalfWidth - 1.4);
    this.placeCamera(f.x + f.rx * side, f.y + height, f.z + f.rz * side, cabin);

    const focal = Math.max(0.62 * this.cam.aspect, 0.8) * (1 - 0.14 * smooth(45, 85, bike.speed));
    const lift = 0.14 * smooth(0, LH[1], f.elev) - 0.16 * smooth(LH[1] + 15, LH[2], f.elev);
    const pitch = (0.05 + this.shot.pitch - lift) / focal;
    this.look.set(this.cam.position.x + Math.sin(f.th), this.cam.position.y - pitch, this.cam.position.z + Math.cos(f.th));
    this.cam.lookAt(this.look);
    this.setFov(THREE.MathUtils.radToDeg(2 * Math.atan(0.5 / focal)));
  }

  updateOrbit(bike, dt) {
    const f = this.frameAt(bike.dist, {});
    this.yaw = damp(this.yaw, this.tYaw, 10, dt);
    this.pitch = damp(this.pitch, this.tPitch, 10, dt);
    this.dist = damp(this.dist, this.tDist, 8, dt);
    const cp = Math.cos(this.pitch), a = f.th + this.yaw;
    const bx = f.x + f.rx * bike.lat, bz = f.z + f.rz * bike.lat;
    let x = -Math.sin(a) * this.dist * cp, z = -Math.cos(a) * this.dist * cp;
    let up = 1.6 + Math.sin(this.pitch) * this.dist;
    if (this.enclosed(bike.dist)) {
      const side = x * f.rx + z * f.rz;
      const limit = this.boreHalfWidth - 1.4;
      const correction = clamp(bike.lat + side, -limit, limit) - bike.lat - side;
      x += correction * f.rx;
      z += correction * f.rz;
      up = clamp(up, 1.1, BORE_H - 1.9);
    }
    this.placeCamera(bx + x, f.y + up, bz + z, this.cabinBounds?.());
    this.cam.lookAt(bx, f.y + 1.6, bz);
    this.setFov(68);
  }

  placeCamera(x, y, z, bounds) {
    if (bounds) {
      x = clamp(x, bounds.x0, bounds.x1);
      y = clamp(y, bounds.y0, bounds.y1);
      z = clamp(z, bounds.z0, bounds.z1);
    }
    this.cam.position.set(x, y, z);
  }

  setFov(fov) {
    if (Math.abs(this.cam.fov - fov) < 0.05) return;
    this.cam.fov = fov;
    this.cam.updateProjectionMatrix();
  }
}

function clampP(p) { return Math.max(-1.45, Math.min(1.45, p)); }
