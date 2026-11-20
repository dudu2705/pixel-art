import { VANTA_BAY, frameOn, frameInLane, laneOffset, legalTurns, routeTo, turnAngle, turnPath,
  inBore, underSkyDeck, LANE_WIDTH, SURFACES, onSurface } from './map.js';
import { S, blendTheme, setAuto, updateClimate } from './sim.js';
import { CITIES, CRUISE, SEGL, ZONES, cars, clamp, mulberry } from './world.js';

const { nodes, edges } = VANTA_BAY;
const cityIndex = CITIES.findIndex(city => city.name === 'VANTA BAY');
const climateSegment = ZONES.find(zone => zone[3] === cityIndex && !zone[4])[0];
const groundStops = ['plaza-east', 'street-north', 'street-south'];
const skyStops = ['sky-north', 'sky-south', 'sky-north'];
const itinerary = [
  ...groundStops.map(id => ({ id, level: 0 })),
  { id: 'sky-north', level: null },
  ...skyStops.slice(1).map(id => ({ id, level: 1 })),
  { id: 'street-south', level: null },
];
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
    this.player.itinerary = itinerary;
    this.intent = 0;
    this.owners = new Map();
    this.history = [];
    const avenueIds = ['east-north', 'east-south', 'street-north-through', 'sky-deck'];
    const localEdges = edges.filter(edge => edge.road.level === 0 && !edge.road.oneWay &&
      !avenueIds.includes(edge.road.id) && edge.from !== nodes.gateway).filter((_, i) => i % 3 === 0);
    const avenueEdges = edges.filter(edge => avenueIds.includes(edge.road.id));
    this.traffic = [...localEdges, ...avenueEdges, ...edges.filter(edge => edge.road.bore)]
      .map((edge, i) => {
        const distance = clamp(edge.path.length * (0.4 + 0.22 * rng()), edge.from.trim + 2, edge.path.length - edge.to.trim - 2);
        const npc = vehicle(edge, distance,
          Math.floor(rng() * edge.road.lanes), 8 + rng() * 7);
        npc.limit = 11 + rng() * 9;
        npc.style = { ...cars[i % cars.length] };
        if (edge.road.bore) {
          npc.itinerary = [{ id: 'sky-north' }, { id: 'sky-south', level: 1 },
            { id: 'street-south' }, { id: 'street-north', level: 0 }];
          npc.stopIndex = edge.to.level === 1 ? 0 : 2;
        } else if (avenueEdges.includes(edge)) {
          npc.itinerary = edge.road.level === 1
            ? [{ id: 'sky-south', level: 1 }, { id: 'sky-north', level: 1 }]
            : [{ id: 'street-south', level: 0 }, { id: 'street-north', level: 0 }];
          npc.stopIndex = Number(edge.to.z > edge.from.z);
        }
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
    S.layer = 0;
  }

  autoExit(current) {
    const node = current.edge.to;
    const stops = current.itinerary;
    let index = current.stopIndex ?? 0;
    while (node === nodes[stops[index].id] || (stops[index].level != null && stops[index].level !== node.level)) {
      index = (index + 1) % stops.length;
    }
    const { id, level } = stops[index];
    current.stopIndex = index;
    return routeTo(node, nodes[id], current.edge, level)[0] ?? legalTurns(current.edge)[0];
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
    if (current.itinerary) return this.autoExit(current);
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
    if (current === this.player && !S.auto) return true;
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
        if (this.owners.get(current.edge.to) === current) this.owners.delete(current.edge.to);
        const trim = current.edge.to.trim;
        const previousRoad = current.edge.road;
        current.edge = turn.edge;
        current.lane = turn.lane;
        current.lat = laneOffset(current.edge, turn.lane);
        current.s = trim;
        current.turn = null;
        current.exit = null;
        if (isPlayer) {
          this.intent = 0;
          const level = current.edge.road.level;
          if (level !== null && level !== S.layer) {
            S.zoneText = level > S.layer ? '▲ LEVEL 2 · SKY AVENUES' : '▼ LEVEL 1 · STREET';
            S.zoneT = 3.5;
            S.layer = level;
          } else if (previousRoad.name !== current.edge.road.name && !(S.zoneT > 0 && S.zoneText.includes('LEVEL'))) {
            S.zoneText = current.edge.road.name.toUpperCase();
            S.zoneT = 2.5;
          }
        }
        continue;
      }
      const stop = current.edge.path.length - current.edge.to.trim;
      const room = Math.max(0, this.leadDistance(current) - 6);
      const move = Math.min(remaining, Math.max(0, stop - current.s), room);
      current.s += move;
      remaining -= move;
      traveled += move;
      if (room < 0.0001) current.speed = 0;
      if (current.s < stop - 0.0001) break;
      current.exit ??= this.selectExit(current, isPlayer);
      if (!this.canEnter(current)) {
        current.speed = 0;
        break;
      }
      if (!this.owners.has(current.edge.to)) this.owners.set(current.edge.to, current);
      const lane = this.nextLane(current, current.exit);
      current.turn = { path: turnPath(current.edge, current.lat, current.exit, laneOffset(current.exit, lane)),
        s: 0, speed: this.turnSpeed(current), edge: current.exit, lane };
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
    if (!current.turn && remaining < Math.max(64, current.speed ** 2 / 14 + 20)) current.exit ??= this.selectExit(current, isPlayer);

    let limit = Math.min(current.edge.road.speed, isPlayer ? CRUISE[S.cruise] : current.limit);
    if (isPlayer && !S.auto) limit = current.edge.road.speed;
    if (current.turn) limit = Math.min(limit, current.turn.speed);
    else {
      const lead = this.leadDistance(current);
      limit = Math.min(limit, Math.sqrt(15 * Math.max(0, lead - 6)));
      if (current.exit) {
        const turnSpeed = this.turnSpeed(current);
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
      // lean like a real bike: the angle whose tangent is sideways acceleration over gravity, from a smoothed turn
      // rate (so path joints don't jitter it) plus the rider's own steering when changing lanes by hand
      const turnRate = Math.sin(oldHeading - current.pose.th) / Math.max(dt, 0.001);
      this.yawRate = (this.yawRate ?? 0) + (turnRate - (this.yawRate ?? 0)) * Math.min(1, dt * 6);
      const handLean = S.auto || current.turn ? 0 : S.steer * Math.min(current.speed, 40) * 0.2;
      const tilt = clamp(Math.atan((this.yawRate * current.speed + handLean) / 9.8), -0.42, 0.42);
      S.roll += (tilt - S.roll) * Math.min(1, dt * 4);
      S.waitLight = false;
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
    // by hand the rider is a free body on the road surfaces; autopilot drives the lane graph
    if (!S.auto && !this.free) this.enterFree();
    else if (S.auto && this.free) this.leaveFree();
    if (this.free) this.stepFree(dt, keys);
    else this.updateVehicle(p, dt, keys);
    S.shake *= Math.exp(-dt * 4);
    S.crashFlash *= Math.exp(-dt * 5);
    S.z = p.traveled;
    S.px = p.lat;
    S.speed = p.speed;
    S.elevation = p.pose.y;
    const deck = underSkyDeck(p.pose), bore = this.enclosed(p.traveled);
    S.gloom += (Number(deck || bore) - S.gloom) * Math.min(1, dt * 0.85);
    updateClimate(dt, blendTheme(climateSegment), deck || bore);
    if (!this.history.length || p.traveled - this.history.at(-1).distance >= 0.65) {
      this.history.push({ distance: p.traveled, pose: { ...p.pose } });
    }
    while (this.history.length > 2 && p.traveled - this.history[1].distance > 108) this.history.shift();
  }

  // ---------- free steering ----------
  locate(x, z, y, current) {                          // the surface under (x, z): the current one while it holds you
    // where connected surfaces overlap at the same height (a ramp peeling off a through road, a junction), take
    // the one you're most centred on; the height check keeps stacked levels apart
    const norm = (s, o) => o.depth / (s.kind === 'node' ? s.radius : s.half);
    const hit = {};
    let best = current && onSurface(current, x, z, hit) && Math.abs(hit.y - y) < 2 ? { surface: current, hit, k: norm(current, hit) + 0.1 } : null;
    for (const s of current ? current.next : SURFACES) {
      const o = onSurface(s, x, z, {});
      if (!o || Math.abs(o.y - y) > (best ? 0.3 : 2)) continue;
      const k = norm(s, o);
      if (!best || k > best.k) best = { surface: s, hit: o, k };
    }
    return best;
  }

  enterFree() {
    const p = this.player, pose = p.pose;
    const road = p.turn ? p.turn.edge.road : p.edge.road;
    const start = SURFACES.find(s => s.road === road);
    const found = this.locate(pose.x, pose.z, pose.y, start) ?? this.locate(pose.x, pose.z, pose.y, null);
    this.free = { x: pose.x, z: pose.z, y: pose.y, th: pose.th, surface: found ? found.surface : start, wall: 0 };
    if (p.turn) { if (this.owners.get(p.edge.to) === p) this.owners.delete(p.edge.to); p.edge = p.turn.edge; p.s = p.edge.to === p.edge.from ? 0 : p.edge.from.trim; }
    p.turn = null; p.exit = null;
    this.project();
  }

  leaveFree() {                                       // snap onto the nearest lane going your way
    const p = this.player, f = this.free;
    const roads = (f.surface.kind === 'road' ? [f.surface] : []).concat(f.surface.next.filter(s => s.kind === 'road'));
    let best = null;
    for (const s of roads) for (const edge of s.road.edges) {
      const fr = {}, o = onSurface(s, f.x, f.z, fr) ?? (() => { frameOn(s.road.path, 0, fr); fr.s = 0; fr.lat = 0; return fr; })();
      const forward = edge.path === s.road.path, th = forward ? o.th : o.th + Math.PI;
      const score = Math.cos(th - f.th) - Math.abs(o.lat) * 0.01 - (o.depth == null ? 1 : 0);
      if (!best || score > best.score) best = { score, edge, s: forward ? o.s : edge.path.length - o.s, lat: forward ? o.lat : -o.lat };
    }
    const e = best.edge, lanes = e.road.lanes;
    p.edge = e;
    p.s = clamp(best.s, e.from.trim + 0.5, e.path.length - e.to.trim - 0.5);
    p.lane = clamp(Math.round((best.lat + (e.road.oneWay ? e.road.halfWidth : 0)) / LANE_WIDTH - 0.5), 0, lanes - 1);
    p.lat = laneOffset(e, p.lane);
    p.turn = null; p.exit = null;
    this.free = null;
    sample(p, p.pose);
  }

  project() {                                         // where traffic, banners and bores see the free rider on the graph
    const p = this.player, f = this.free, s = f.surface;
    if (s.kind !== 'road') return;
    const o = {}; if (!onSurface(s, f.x, f.z, o)) return;
    const edges = s.road.edges;
    const back = edges.length > 1 && Math.cos(o.th - f.th) < 0;
    const e = back ? edges[1] : edges[0];
    p.edge = e;
    p.s = back ? e.path.length - o.s : o.s;
    const lat = back ? -o.lat : o.lat;
    p.lane = clamp(Math.round((lat + (e.road.oneWay ? e.road.halfWidth : 0)) / LANE_WIDTH - 0.5), 0, e.road.lanes - 1);
    p.lat = lat;
  }

  stepFree(dt, keys) {
    const p = this.player, f = this.free;
    const oldTh = f.th, wasSpeed = p.speed;
    // speed: as before, the road's own limit by hand
    const limit = f.surface.speed;
    const target = keys.brake ? 0 : keys.gas ? limit : Math.min(limit, Math.max(0, p.speed - 0.7 * dt));
    p.speed = Math.max(0, p.speed + clamp(target - p.speed, -(keys.brake ? 18 : 12) * dt, 13 * dt));
    if (f.wall > 0) p.speed *= Math.exp(-dt * 2.5);
    p.brake = p.speed < wasSpeed - 0.03;
    // steering: a turn rate capped by grip (about 0.9 g sideways), tight enough at walking pace for a U-turn
    const v = p.speed, cap = Math.min(1.5, 9 / Math.max(v, 1));
    let yaw = -S.steer * cap;
    if (Math.abs(S.steer) < 0.08 && f.surface.kind === 'road') {   // hands off: settle into the road's direction
      const o = {};
      if (onSurface(f.surface, f.x, f.z, o)) {
        let d = Math.atan2(Math.sin(o.th - f.th), Math.cos(o.th - f.th));
        if (Math.abs(d) > Math.PI / 2 && f.surface.road.edges.length > 1) d = Math.atan2(Math.sin(o.th + Math.PI - f.th), Math.cos(o.th + Math.PI - f.th));
        if (Math.abs(d) < 0.6) yaw += clamp(d * Math.min(2.5, v * 0.2), -cap, cap);
      }
    }
    f.th += yaw * dt;
    // move, then find the ground; off the edge of everything is a wall you slide along
    const step = v * dt;
    let tx = f.x + Math.sin(f.th) * step, tz = f.z + Math.cos(f.th) * step;
    let at = this.locate(tx, tz, f.y, f.surface);
    f.wall = Math.max(0, f.wall - dt);
    if (!at) {
      const base = onSurface(f.surface, f.x, f.z, {});
      if (base) {
        // the edge's direction: along the road, or around a junction disc
        let ux, uz, nx, nz;
        if (base.th != null) { ux = Math.sin(base.th); uz = Math.cos(base.th); nx = -base.rx * Math.sign(base.lat); nz = -base.rz * Math.sign(base.lat); }
        else {
          const n = f.surface.node, d = Math.hypot(f.x - n.x, f.z - n.z) || 1;
          nx = -(f.x - n.x) / d; nz = -(f.z - n.z) / d; ux = -nz; uz = nx;
        }
        const d = (tx - f.x) * ux + (tz - f.z) * uz;
        tx = f.x + ux * d + nx * 0.05; tz = f.z + uz * d + nz * 0.05;
        at = this.locate(tx, tz, f.y, f.surface);
        const along = Math.atan2(ux * Math.sign(d || 1), uz * Math.sign(d || 1));
        f.th += clamp(Math.atan2(Math.sin(along - f.th), Math.cos(along - f.th)), -2 * dt, 2 * dt);
      }
      if (v > 3) S.shake = Math.max(S.shake, 0.15 * Math.min(1, v / 20));
      f.wall = 0.25;
    }
    let moved = 0;
    if (at) {
      moved = Math.hypot(tx - f.x, tz - f.z);
      f.x = tx; f.z = tz; f.y = at.hit.y;
      this.arrive(at.surface);
    } else p.speed *= 0.5;
    p.traveled += moved;
    this.collide();
    this.project();
    const pose = p.pose;
    pose.x = f.x; pose.y = f.y; pose.z = f.z; pose.th = f.th; pose.elev = f.y;
    pose.rx = -Math.cos(f.th); pose.rz = Math.sin(f.th);
    S.waitLight = false;
    const turnRate = Math.sin(oldTh - f.th) / Math.max(dt, 0.001);
    this.yawRate = (this.yawRate ?? 0) + (turnRate - (this.yawRate ?? 0)) * Math.min(1, dt * 6);
    const tilt = clamp(Math.atan(this.yawRate * p.speed / 9.8), -0.42, 0.42);
    S.roll += (tilt - S.roll) * Math.min(1, dt * 4);
  }

  arrive(surface) {                                   // banners when the rider reaches a new road or level
    const f = this.free;
    if (surface === f.surface) return;
    const before = f.surface;
    f.surface = surface;
    if (surface.kind !== 'road') return;
    const level = surface.level;
    if (level !== null && level !== S.layer) {
      S.zoneText = level > S.layer ? '▲ LEVEL 2 · SKY AVENUES' : '▼ LEVEL 1 · STREET';
      S.zoneT = 3.5;
      S.layer = level;
    } else if (before.road?.name !== surface.road.name && surface.road.name !== this.lastRoadName && !(S.zoneT > 0 && S.zoneText.includes('LEVEL'))) {
      S.zoneText = surface.road.name.toUpperCase();
      S.zoneT = 2.5;
    }
    this.lastRoadName = surface.road.name;
  }

  collide() {                                         // against cars at your height: rear-end or head-on, as in the reference
    const p = this.player, f = this.free;
    if (S.T - (S.lastHit ?? -9) < 0.6) return;
    for (const c of this.traffic) {
      const q = c.pose, dx = q.x - f.x, dz = q.z - f.z;
      if (Math.abs(q.y - f.y) > 3 || dx * dx + dz * dz > 2.4 * 2.4) continue;
      const ahead = dx * Math.sin(f.th) + dz * Math.cos(f.th) > 0;
      if (!ahead) continue;
      if (Math.cos(q.th - f.th) > 0) { if (p.speed > c.speed) { p.speed = c.speed * 0.6; S.shake = 0.7; S.crashFlash = 0.6; S.lastHit = S.T; } }
      else { p.speed *= 0.25; S.shake = 1; S.crashFlash = 1; S.lastHit = S.T; }
      return;
    }
  }

  turnSpeed(current) {
    const angle = Math.abs(turnAngle(current.edge, current.exit));
    const speed = Math.min(current.edge.road.speed, current.exit.road.speed);
    return angle < 0.12 ? speed : current.edge.to.ramp ? Math.min(speed, 18) : angle < 0.8 ? 12 : 8.5;
  }

  enclosed(distance) {
    const p = this.player;
    return !p.turn && inBore(p.edge.road, p.s + distance - p.traveled);
  }

  cameraFrame(distance, out = {}) {
    const p = this.player;
    const offset = distance - p.traveled;
    if (Math.abs(offset) < 0.0001) return Object.assign(out, p.pose);
    if (offset > 0 && this.free) {
      const f = this.free;
      Object.assign(out, p.pose);
      out.x = f.x + Math.sin(f.th) * offset; out.z = f.z + Math.cos(f.th) * offset;
      return out;
    }
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
