import { TOWER_LIFT, LEVEL_Y } from './map.js';
import { clamp, smooth } from './world.js';

const OPEN = 0.45;
const CLOSE = 0.35;
const ROLL = 1.55;
const TRAVEL = 6.2;

export class TowerLift {
  constructor() {
    this.floor = 0;
    this.y = LEVEL_Y[0];
    this.phase = 'idle';
    this.elapsed = 0;
    this.calls = new Map();
  }

  request(vehicle, floor) {
    if (this.holds(vehicle)) return;
    this.calls.set(vehicle, floor);
    vehicle.speed = 0;
  }

  holds(vehicle) {
    return this.trip?.vehicle === vehicle || this.calls.has(vehicle);
  }

  onboard(vehicle) {
    return this.trip?.vehicle === vehicle && this.phase !== 'summon';
  }

  doorAt(floor) {
    if (this.floor !== floor) return 0;
    if (this.phase === 'board') return Math.min(1, this.elapsed / OPEN);
    if (this.phase === 'close') return Math.max(0, 1 - this.elapsed / CLOSE);
    if (this.phase === 'release') return Math.min(1, this.elapsed / OPEN);
    return 0;
  }

  start(phase) {
    this.phase = phase;
    this.elapsed = 0;
  }

  pose(trip, progress) {
    const { vehicle, from, to } = trip;
    const x1 = TOWER_LIFT.landings[to].x + (to === 0 ? 1 : -1) * TOWER_LIFT.exitClearance;
    const heading = from === 0 ? -Math.PI / 2 : Math.PI / 2;
    const x = progress < 0 ? TOWER_LIFT.x + (TOWER_LIFT.x - trip.x) * progress
      : TOWER_LIFT.x + (x1 - TOWER_LIFT.x) * progress;
    const laneZ = TOWER_LIFT.z + Math.sin(heading) * 1.75;
    const z = progress < 0 ? laneZ + (laneZ - trip.z) * progress : laneZ;
    const last = vehicle.pose;
    vehicle.traveled += Math.hypot(x - last.x, this.y - last.y, z - last.z);
    Object.assign(last, { x, y: this.y, z, th: heading, rx: 0, rz: Math.sin(heading), elev: this.y });
  }

  step(dt, canRelease) {
    if (this.phase === 'idle') {
      const next = this.calls.entries().next().value;
      if (!next) return null;
      const [vehicle, from] = next;
      this.calls.delete(vehicle);
      this.trip = { vehicle, from, to: 1 - from, x: vehicle.pose.x, z: vehicle.pose.z };
      this.start(this.floor === from ? 'board' : 'summon');
    }
    this.elapsed += dt;
    const trip = this.trip;
    switch (this.phase) {
      case 'summon':
      case 'travel': {
        const loaded = this.phase === 'travel', target = loaded ? trip.to : trip.from;
        const amount = smooth(0, TRAVEL, this.elapsed);
        this.y = LEVEL_Y[this.floor] + (LEVEL_Y[target] - LEVEL_Y[this.floor]) * amount;
        if (loaded) this.pose(trip, 0);
        if (this.elapsed >= TRAVEL) {
          this.floor = target;
          this.start(loaded ? 'release' : 'board');
        }
        break;
      }
      case 'board':
        this.pose(trip, clamp((this.elapsed - OPEN) / ROLL, 0, 1) - 1);
        if (this.elapsed >= OPEN + ROLL) this.start('close');
        break;
      case 'close':
        if (this.elapsed >= CLOSE) this.start('travel');
        break;
      case 'release':
        if (this.elapsed > OPEN && !canRelease(trip)) {
          this.elapsed = OPEN;
          break;
        }
        this.pose(trip, clamp((this.elapsed - OPEN) / ROLL, 0, 1));
        if (this.elapsed >= OPEN + ROLL) {
          this.trip = null;
          this.start('idle');
          return trip;
        }
        break;
    }
    return null;
  }
}
