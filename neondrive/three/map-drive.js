import { VANTA_BAY, frameOn, frameInLane, laneOffset, legalTurns, routeTo, turnAngle, turnPath, LANE_WIDTH } from './map.js';
import { S, blendTheme, setAuto, updateClimate } from './sim.js';
import { CITIES, CRUISE, SEGL, ZONES, cars, clamp, mulberry } from './world.js';

const { nodes, edges } = VANTA_BAY;
const cityIndex = CITIES.findIndex(city => city.name === 'VANTA BAY');
const climateSegment = ZONES.find(zone => zone[3] === cityIndex && !zone[4])[0];
const itinerary = ['plaza-west', 'plaza-east', 'sky-outlook', 'plaza-south', 'gateway'];
const rng = mulberry(2048);

function vehicle(edge, s, lane, speed) {
  return { edge, s, lane, lat: laneOffset(edge, lane), speed, traveled: 0, turn: null, exit: null, pose: {} };
}

function sample(vehicle, out = {}) {
  if (vehicle.turn) return frameOn(vehicle.turn.path, vehicle.turn.s, out);
  return frameInLane(vehicle.edge, vehicle.s, vehicle.lat, out);
}

export class MapDrive {
  constructor() {
    this.player = vehicle(edges.find(edge => edge.from === nodes.gateway), 18, 1, 30);
    this.itineraryIndex = 0;
    this.intent = 0;
    this.owners = new Map();
    this.history = [];
    this.traffic = edges.filter(edge => !edge.road.oneWay && edge.from !== nodes.gateway).filter((_, i) => i % 2 === 0)
      .map((edge, i) => {
        const npc = vehicle(edge, edge.path.length * (0.37 + rng() * 0.24),
          Math.floor(rng() * edge.road.lanes), 8 + rng() * 7);
        npc.limit = 11 + rng() * 9;
        npc.style = cars[i];
        return npc;
      });
    this.vehicles = [this.player, ...this.traffic];
    this.spawn();
  }

  spawn() {
    for (const vehicle of this.vehicles) sample(vehicle, vehicle.pose);
    S.z = 0;
    S.zoneText = 'VANTA BAY · VANTA BOULEVARD';
    S.zoneT = 3.5;
    S.elevation = 0;
  }

  autoExit(current) {
    const node = current.edge.to;
    let target = nodes[itinerary[this.itineraryIndex]];
    if (node === target) {
      this.itineraryIndex = (this.itineraryIndex + 1) % itinerary.length;
      target = nodes[itinerary[this.itineraryIndex]];
    }
    return routeTo(node, target, current.edge)[0] ?? legalTurns(current.edge)[0];
  }

  manualExit(current) {
    const options = legalTurns(current.edge).map(edge => ({ edge, angle: turnAngle(current.edge, edge) }));
    if (this.intent !== 0) {
      const matching = options.filter(option => option.angle * this.intent > 0.23);
      if (matching.length) return matching.sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle))[0].edge;
    }
    return options.sort((a, b) => Math.abs(a.angle) - Math.abs(b.angle))[0].edge;
  }

  selectExit(current, isPlayer) {
    if (isPlayer) return S.auto ? this.autoExit(current) : this.manualExit(current);
    const choices = legalTurns(current.edge);
    return choices[Math.floor(rng() * choices.length)];
  }

  nextLane(current, exit) {
    const angle = turnAngle(current.edge, exit);
    if (angle > 0.35) return exit.road.lanes - 1;
    if (angle < -0.35) return 0;
    return Math.min(current.lane, exit.road.lanes - 1);
  }

  leadDistance(current, edge = current.edge, start = current.s, lane = current.lane) {
    let gap = Infinity;
    for (const other of this.vehicles) {
      if (other === current || other.turn || other.edge !== edge || other.lane !== lane || other.s < start) continue;
      gap = Math.min(gap, other.s - start);
    }
    return gap;
  }

  canEnter(current) {
    const owner = this.owners.get(current.edge.to);
    if (owner && owner !== current) return false;
    const lane = this.nextLane(current, current.exit);
    return this.leadDistance(current, current.exit, current.edge.to.trim - 0.01, lane) > 7;
  }

  advance(current, remaining, isPlayer) {
    let traveled = 0;
    while (remaining > 0.0001) {
      if (current.turn) {
        const turn = current.turn;
        const move = Math.min(remaining, turn.path.length - turn.s);
        traveled += move;
        turn.s += move;
        remaining -= move;
        if (turn.s < turn.path.length - 0.0001) break;
        this.owners.delete(current.edge.to);
        const trim = current.edge.to.trim;
        const previousName = current.edge.road.name;
        current.edge = turn.edge;
        current.lane = turn.lane;
        current.lat = laneOffset(current.edge, turn.lane);
        current.s = trim;
        current.turn = null;
        current.exit = null;
        if (isPlayer) {
          this.intent = 0;
          if (previousName !== current.edge.road.name) {
            S.zoneText = current.edge.road.name.toUpperCase();
            S.zoneT = 2.5;
          }
        }
        continue;
      }
      const stop = current.edge.path.length - current.edge.to.trim;
      const move = Math.min(remaining, Math.max(0, stop - current.s));
      current.s += move;
      remaining -= move;
      traveled += move;
      if (current.s < stop - 0.0001) break;
      current.exit ??= this.selectExit(current, isPlayer);
      if (!this.canEnter(current)) {
        current.speed = 0;
        break;
      }
      this.owners.set(current.edge.to, current);
      const lane = this.nextLane(current, current.exit);
      current.turn = { path: turnPath(current.edge, current.lat, current.exit, laneOffset(current.exit, lane)),
        s: 0, edge: current.exit, lane };
    }
    current.traveled += traveled;
    sample(current, current.pose);
  }

  updateVehicle(current, dt, keys) {
    const isPlayer = current === this.player;
    const remaining = current.edge.path.length - current.edge.to.trim - current.s;
    const oldHeading = current.pose.th;
    const wasSpeed = current.speed;
    if (isPlayer && !S.auto && !current.turn) {
      const steer = Number(Boolean(keys.right)) - Number(Boolean(keys.left));
      if (steer && remaining < 34) {
        this.intent = steer;
        const exit = this.manualExit(current);
        if (exit !== current.exit) {
          current.exit = exit;
          S.zoneText = 'NEXT · ' + exit.road.name.toUpperCase();
          S.zoneT = 2;
        }
      } else if (steer) {
        const first = laneOffset(current.edge, 0) - 0.75;
        const last = laneOffset(current.edge, current.edge.road.lanes - 1) + 0.75;
        const nextLat = clamp(current.lat + steer * dt * 4.2, first, last);
        const nextLane = clamp(Math.round((nextLat - first - 0.75) / LANE_WIDTH), 0, current.edge.road.lanes - 1);
        if (nextLane === current.lane || this.vehicles.every(other => other === current || other.turn ||
          other.edge !== current.edge || other.lane !== nextLane || Math.abs(other.s - current.s) > 7)) {
          current.lat = nextLat;
          current.lane = nextLane;
        }
      }
    }
    if (!current.turn && remaining < 64) current.exit ??= this.selectExit(current, isPlayer);

    let limit = Math.min(current.edge.road.speed, isPlayer ? CRUISE[S.cruise] : current.limit);
    if (isPlayer && !S.auto) limit = current.edge.road.speed;
    if (current.turn) limit = Math.min(limit, 12);
    else {
      const lead = this.leadDistance(current);
      limit = Math.min(limit, Math.sqrt(15 * Math.max(0, lead - 6)));
      if (current.exit) {
        const angle = Math.abs(turnAngle(current.edge, current.exit));
        const turnSpeed = angle < 0.12 ? Math.min(limit, current.exit.road.speed) : angle < 0.8 ? 12 : 8.5;
        limit = Math.min(limit, Math.sqrt(turnSpeed ** 2 + 17 * Math.max(0, remaining)));
        if (!this.canEnter(current)) limit = Math.min(limit, Math.sqrt(16 * Math.max(0, remaining)));
      }
    }
    let target = limit;
    if (isPlayer && !S.auto) {
      target = keys.brake ? 0 : keys.gas ? limit : Math.min(limit, Math.max(0, current.speed - 0.7 * dt));
    }
    current.speed = Math.max(0, current.speed + clamp(target - current.speed, -(isPlayer && keys.brake ? 18 : 12) * dt, (isPlayer ? 13 : 4) * dt));
    current.brake = current.speed < wasSpeed - 0.03;
    this.advance(current, current.speed * dt, isPlayer);
    if (isPlayer) {
      const turnRate = Math.sin(oldHeading - current.pose.th) / Math.max(dt, 0.001);
      const tilt = clamp(Math.atan(turnRate * current.speed * 0.95 / 9.8), -0.42, 0.42);
      S.roll += (tilt - S.roll) * Math.min(1, dt * 5);
      S.waitLight = current.speed < 1 && remaining < 4 && Boolean(current.exit) && !this.canEnter(current);
    }
  }

  update(dt, keys) {
    const p = this.player;
    S.T += dt;
    S.zoneT -= dt;
    const steer = Number(Boolean(keys.right)) - Number(Boolean(keys.left));
    S.steer += (steer - S.steer) * Math.min(1, dt * 9);
    if (!S.auto) {
      S.idle = keys.left || keys.right || keys.gas || keys.brake ? 0 : S.idle + dt;
      if (S.idle > 10) {
        setAuto(true);
        if (!p.turn) p.exit = null;
      }
    }
    for (const current of this.traffic) this.updateVehicle(current, dt, keys);
    this.updateVehicle(p, dt, keys);
    S.z = p.traveled;
    S.px = p.lat;
    S.speed = p.speed;
    S.layer = p.pose.y >= 34 ? 1 : 0;
    S.elevation = p.pose.y;
    updateClimate(dt, blendTheme(climateSegment), false);
    if (!this.history.length || p.traveled - this.history.at(-1).distance >= 0.65) {
      this.history.push({ distance: p.traveled, pose: { ...p.pose } });
    }
    while (this.history.length > 2 && p.traveled - this.history[1].distance > 108) this.history.shift();
  }

  cameraFrame(distance, out = {}) {
    const p = this.player;
    const offset = distance - p.traveled;
    if (Math.abs(offset) < 0.0001) return Object.assign(out, p.pose);
    if (offset > 0) {
      if (p.turn) {
        const remaining = p.turn.path.length - p.turn.s;
        if (offset < remaining) return frameOn(p.turn.path, p.turn.s + offset, out);
        return frameInLane(p.turn.edge, p.edge.to.trim + offset - remaining, laneOffset(p.turn.edge, p.turn.lane), out);
      }
      const stop = p.edge.path.length - p.edge.to.trim;
      if (p.s + offset <= stop) return frameInLane(p.edge, p.s + offset, p.lat, out);
      const next = p.exit ?? legalTurns(p.edge)[0], lat = laneOffset(next, this.nextLane(p, next));
      const path = turnPath(p.edge, p.lat, next, lat);
      const delta = p.s + offset - stop;
      return delta < path.length ? frameOn(path, delta, out) : frameInLane(next, p.edge.to.trim + delta - path.length, lat, out);
    }
    let after = { distance: p.traveled, pose: p.pose };
    for (let i = this.history.length - 1; i >= 0; i--) {
      const before = this.history[i];
      if (before.distance < distance) {
        const t = (distance - before.distance) / (after.distance - before.distance);
        for (const key of ['x', 'y', 'z', 'elev']) out[key] = before.pose[key] + t * (after.pose[key] - before.pose[key]);
        out.th = before.pose.th + t * Math.atan2(Math.sin(after.pose.th - before.pose.th), Math.cos(after.pose.th - before.pose.th));
        out.rx = -Math.cos(out.th);
        out.rz = Math.sin(out.th);
        return out;
      }
      after = before;
    }
    return frameInLane(p.edge, p.s + offset, p.lat, out);
  }
}
