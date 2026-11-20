// camera.js — the free camera rig.
//
// The old build could not do this: it rastered one forward view and faked the
// side shot by reprojecting that same buffer, which is why side view looked
// wrong. Here the city is real geometry, so a camera is just a transform.

import * as THREE from './vendor/three.module.js';
import { frameAt } from './road.js';
import { SEGL, NSEG, RW, D, district, TRANS, TRANS_AT } from './world.js';

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

export const MODES = ['COCKPIT', 'CHASE', 'SIDE', 'TOP', 'ORBIT', 'FLY'];

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

export class Rig {
  constructor(camera, dom) {
    this.cam = camera;
    this.mode = 1;                       // start in CHASE so you can see the bike
    this.yaw = 0; this.pitch = 0.22; this.dist = 14;
    this.tYaw = 0; this.tPitch = 0.22; this.tDist = 14;
    this.pos = new THREE.Vector3();
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
      if (this.mode !== 4 && this.mode !== 5) this.setMode(4);
    });
    dom.addEventListener('pointerup', e => { this.dragging = false; });
    dom.addEventListener('pointermove', e => {
      if (!this.dragging) return;
      const dx = (e.clientX - this.lx) * 0.006, dy = (e.clientY - this.ly) * 0.006;
      this.lx = e.clientX; this.ly = e.clientY;
      if (this.mode === 5) { this.flyYaw -= dx; this.flyPitch = clampP(this.flyPitch - dy); }
      else { this.tYaw -= dx; this.tPitch = clampP(this.tPitch + dy); }
    });
    dom.addEventListener('wheel', e => {
      e.preventDefault();
      this.tDist = Math.min(400, Math.max(1.5, this.tDist * Math.exp(e.deltaY * 0.0012)));
      if (this.mode !== 4 && this.mode !== 5) this.setMode(4);
    }, { passive: false });
    // the camera no longer binds its own keys: main.js owns the keyboard so the
    // original's bindings stay exactly as they were
    addEventListener('keydown', e => { this.keys[e.code] = true; });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
  }

  setMode(m) {
    const prev = this.mode;
    this.mode = m;
    if (m === 5 && prev !== 5) {                 // entering free flight: start where we are
      this.fly.copy(this.cam.position);
      const d = new THREE.Vector3(); this.cam.getWorldDirection(d);
      this.flyYaw = Math.atan2(-d.x, -d.z);
      this.flyPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    }
    if (m === 4) { this.tYaw = this.yaw; this.tPitch = this.pitch; this.tDist = this.dist; }
    this.onMode && this.onMode(MODES[m]);
  }

  reset() { this.tYaw = 0; this.tPitch = 0.22; this.tDist = 14; }

  // bike: { dist (along road), lat, speed, roll }
  update(bike, dt) {
    const f = frameAt(bike.dist, {});
    const bx = f.x + f.rx * bike.lat, by = f.y, bz = f.z + f.rz * bike.lat;
    const head = f.th;

    if (this.mode === 5) {                        // FLY: detached, WASD + mouse
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
      this.cam.up.set(0, 1, 0);
      return;
    }

    let want = new THREE.Vector3(), lookAt = new THREE.Vector3(bx, by + 1.6, bz), roll = 0, fov = 68;

    if (this.mode === 0) {                        // COCKPIT
      want.set(bx, by + 1.45, bz);
      const ahead = frameAt(bike.dist + 30, {});
      lookAt.set(ahead.x + ahead.rx * bike.lat, ahead.y + 1.3, ahead.z + ahead.rz * bike.lat);
      roll = bike.roll;          // the cockpit rolls fully with the bike
      fov = 72;
    } else if (this.mode === 1) {                 // CHASE
      const back = 11 + bike.speed * 0.05;
      want.set(bx + Math.sin(head) * -back, by + 4.2, bz + Math.cos(head) * -back);
      const ahead = frameAt(bike.dist + 26, {});
      lookAt.set(ahead.x, ahead.y + 2.2, ahead.z);
      roll = bike.roll * 0.85;   // the chase view leans with it too
    } else if (this.mode === 2) {                 // SIDE — a real camera, properly beside the bike
      const side = 17, lift = 3.4;
      want.set(bx + f.rx * side, by + lift, bz + f.rz * side);
      lookAt.set(bx, by + 1.5, bz);
      fov = 55;
    } else if (this.mode === 3) {                 // TOP
      want.set(bx, by + 46, bz);
      lookAt.set(bx + Math.sin(head) * 18, by, bz + Math.cos(head) * 18);
      fov = 60;
    } else {                                      // ORBIT — mouse-driven, anchored on the bike
      this.yaw = damp(this.yaw, this.tYaw, 10, dt);
      this.pitch = damp(this.pitch, this.tPitch, 10, dt);
      this.dist = damp(this.dist, this.tDist, 8, dt);
      const cp = Math.cos(this.pitch), a = head + this.yaw;
      want.set(bx - Math.sin(a) * this.dist * cp, by + 1.6 + Math.sin(this.pitch) * this.dist, bz - Math.cos(a) * this.dist * cp);
      lookAt.set(bx, by + 1.6, bz);
    }

    // inside a bore, pull the camera back through the walls and under the roof
    if (this.mode !== 0 && enclosed(bike.dist)) {
      const dx = want.x - bx, dy = want.y - by, dz = want.z - bz;
      let lat = dx * f.rx + dz * f.rz;                      // sideways offset
      let fwd = dx * Math.sin(head) + dz * Math.cos(head);  // along the road
      lat = Math.max(-(BORE_W - 1.4), Math.min(BORE_W - 1.4, lat));
      const maxUp = BORE_H - 1.9;
      const up = Math.min(dy, maxUp);
      if (this.mode === 3) fwd = Math.min(fwd, -5);         // the top camera becomes a low chase
      want.set(bx + f.rx * lat + Math.sin(head) * fwd,
               by + Math.max(1.1, up),
               bz + f.rz * lat + Math.cos(head) * fwd);
      lookAt.y = Math.min(lookAt.y, by + maxUp);
    }

    // critically damped follow so nothing snaps
    const l = this.mode === 0 ? 60 : 9;
    this.pos.x = damp(this.pos.x, want.x, l, dt);
    this.pos.y = damp(this.pos.y, want.y, l, dt);
    this.pos.z = damp(this.pos.z, want.z, l, dt);
    this.look.x = damp(this.look.x, lookAt.x, l, dt);
    this.look.y = damp(this.look.y, lookAt.y, l, dt);
    this.look.z = damp(this.look.z, lookAt.z, l, dt);

    this.cam.position.copy(this.pos);
    this.cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.cam.lookAt(this.look);
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov = damp(this.cam.fov, fov, 6, dt); this.cam.updateProjectionMatrix(); }
  }
}

function clampP(p) { return Math.max(-1.45, Math.min(1.45, p)); }
