import { VANTA_BAY, frameOn, frameInLane, laneOffset, legalTurns, routeTo, turnAngle, turnPath,
  inBore, inTube, underSkyDeck, LANE_WIDTH, SURFACES, onSurface, LEVEL_NAMES, LINKS, AURUM, GRID_CITIES, TOWER_LIFT } from './map.js';
import { TowerLift } from './map-lift.js';
import { S, blendCities, setAuto, updateClimate } from './sim.js';
import { signalState, pedsOn, pedsOnOutbound, allCrossers, LIGHT_PERIOD, GREEN } from './map-signals.js';
import { walkersNear } from './map-people.js';
import { CRUISE, D, cars, clamp, mulberry, smooth } from './world.js';

const { nodes, edges } = VANTA_BAY;
// ---------- the tour: every road of every city, as one continuous ride ----------
// City by city, a walk over the lane graph that takes each of the city's roads at least once (either way on a two-way
// road), only ever turns legally and never back along the road it is on. At each junction it takes an untaken road,
// the straightest one; with none at hand, the shortest legal way to the nearest untaken road. Then on to the next
// city, and after the last one back to Vanta Bay to begin again.
// the legal turns that don't double back on themselves (nothing sharper than about 110°), if there are any
function flowing(e) {
  const turns = legalTurns(e), gentle = turns.filter(x => Math.abs(turnAngle(e, x)) < 1.9);
  return gentle.length ? gentle : turns;
}
function edgeRoute(from, wanted, allowed = () => true) {   // the shortest legal run of edges after `from` to a wanted one
  const prev = new Map([[from, null]]), queue = [from];
  for (let qi = 0; qi < queue.length; qi++) {
    const e = queue[qi];
    for (const x of flowing(e)) {
      if (prev.has(x) || !allowed(x)) continue;
      prev.set(x, e);
      if (wanted(x)) { const out = [x]; for (let q = e; q !== from; q = prev.get(q)) out.unshift(q); return out; }
      queue.push(x);
    }
  }
  return null;
}
function buildTour() {
  const tour = [edges.find(edge => edge.from === nodes.gateway)];
  const cities = ['VANTA BAY', ...GRID_CITIES.map(c => c.name)];
  for (const [ci, name] of cities.entries()) {
    const inCity = x => x.road.city === name;
    const todo = new Set(VANTA_BAY.roads.filter(r => r.city === name && !r.lift && !r.liftApproach && r.id !== 'gateway'));
    todo.delete(tour.at(-1).road);
    while (todo.size) {
      const e = tour.at(-1), here = flowing(e).filter(x => todo.has(x.road));
      const step = here.length ? [here.sort((a, b) => Math.abs(turnAngle(e, a)) - Math.abs(turnAngle(e, b)))[0]]
        : edgeRoute(e, x => todo.has(x.road), inCity);
      if (!step) break;
      for (const x of step) { tour.push(x); todo.delete(x.road); }
    }
    const next = cities[ci + 1];
    if (next) tour.push(...edgeRoute(tour.at(-1), x => x.road.link?.b === next, x => inCity(x) || x.road.link?.b === next));
  }
  tour.push(...edgeRoute(tour.at(-1), x => x === tour[1]).slice(0, -1));   // home, and round again from the start
  const at = new Map();
  tour.forEach((e, i) => { if (!at.has(e)) at.set(e, []); at.get(e).push(i); });
  return { edges: tour, at };
}
export const TOUR = buildTour();
const rng = mulberry(2048), waveRng = mulberry(4417);

function vehicle(edge, s, lane, speed) {
  return { edge, s, lane, lat: laneOffset(edge, lane), speed, traveled: 0, turn: null, exit: null, pose: {} };
}

// The rider's speed is the cruise speed, held down only by the bends ahead: the fastest a bend of curvature k can
// be taken at CURVE_GRIP m/s² sideways (a sport bike's ~0.8 g lean), and braking at CURVE_BRAKE to reach it.
const CURVE_GRIP = 8, CURVE_BRAKE = 7, _cf = {};
function curveCap(path, from, dir, speed, offset = 0, cap = Infinity) {
  const reach = Math.min(320, speed * speed / (2 * CURVE_BRAKE) + 40), step = 5;
  let prev = null;
  for (let x = 0; offset + x <= reach; x += step) {
    const s = from + dir * x;
    if (s < 0 || s > path.length) break;
    frameOn(path, s, _cf);
    const th = dir > 0 ? _cf.th : _cf.th + Math.PI;
    if (prev !== null) {
      const k = Math.abs(Math.atan2(Math.sin(th - prev), Math.cos(th - prev))) / step;
      if (k > 2e-4) cap = Math.min(cap, Math.sqrt(CURVE_GRIP / k + 2 * CURVE_BRAKE * Math.max(0, offset + x - step)));
    }
    prev = th;
  }
  return cap;
}

function sample(vehicle, out = {}) {
  if (vehicle.turn) return frameOn(vehicle.turn.path, vehicle.turn.s, out);
  return frameInLane(vehicle.edge, vehicle.s, vehicle.lat, out);
}

export class MapDrive {
  constructor() {
    this.player = vehicle(edges.find(edge => edge.from === nodes.gateway), 18, 1, 30);
    this.player.plan = TOUR;
    this.player.planAt = 0;
    this.intent = 0;
    this.owners = new Map();
    this.waiting = new Map();
    this.history = [];
    const avenueIds = ['east-north', 'east-south', 'street-north-through', 'sky-deck'];
    const localEdges = edges.filter(edge => edge.road.city === 'VANTA BAY' && edge.road.level === 0 && !edge.road.oneWay && !edge.road.liftApproach &&
      !avenueIds.includes(edge.road.id) && edge.from !== nodes.gateway).filter((_, i) => i % 3 === 0);
    const avenueEdges = edges.filter(edge => avenueIds.includes(edge.road.id));
    this.traffic = [...localEdges, ...avenueEdges, ...edges.filter(edge => edge.road.city === 'VANTA BAY' && edge.road.bore)]
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
    for (const city of GRID_CITIES) {
      const street = edges.filter(edge => edge.road.city === city.name && edge.road.level === 0);
      for (const [i, e] of street.entries()) {
        if (i % 4) continue;
        const npc = vehicle(e, clamp(e.path.length * (0.3 + 0.4 * rng()), e.from.trim + 2, e.path.length - e.to.trim - 2), 0, 12);
        npc.limit = 13 + rng() * 12;
        npc.style = { ...cars[(i * 5 + 3) % cars.length] };
        npc.home = city.name;
        this.traffic.push(npc);
      }
      const upper = edges.filter(edge => edge.road.id === city.p + '-sky-deck' ||
        edge.id === city.p + '-crown-arrival/' + city.p + '-crown-outlook');
      for (const [i, edge] of upper.entries()) {
        const level = edge.road.level, npc = vehicle(edge, edge.path.length * (0.28 + i * 0.17), 0, 17);
        const ends = level === 1 ? ['sky-south', 'sky-north'] : ['crown-arrival', 'crown-outlook'];
        npc.limit = 18 + rng() * 7;
        npc.style = { ...cars[(i * 9 + 19) % cars.length] };
        npc.itinerary = ends.map(id => ({ id: city.p + '-' + id, level }));
        npc.stopIndex = level === 2 ? 1 : Number(edge.to.z > edge.from.z);
        this.traffic.push(npc);
      }
    }
    for (const [i, e] of edges.filter(x => x.road.id === 'crown-way').entries()) {
      const npc = vehicle(e, e.path.length * (0.3 + 0.3 * i), 0, 18);
      npc.limit = 22 + rng() * 10;
      npc.style = { ...cars[(i * 7) % cars.length] };
      npc.itinerary = [{ id: 'crown-outlook', level: 2 }, { id: 'crown-arrival', level: 2 }];
      npc.stopIndex = e.to.id === 'crown-outlook' ? 0 : 1;
      this.traffic.push(npc);
    }
    this.vehicles = [this.player, ...this.traffic];
    this.onEdges = new Map();
    this.lift = new TowerLift();
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
    if (current.liftStop) {
      if (node === current.liftStop) return node.exits.find(edge => edge.road.lift);
      const level = node.level === current.liftStop.level ? node.level : null;
      const towardLift = routeTo(node, current.liftStop, current.edge, level, true)[0];
      if (towardLift) return towardLift;
    }
    if (current.plan) return this.planExit(current);
    const stops = current.itinerary;
    let index = current.stopIndex ?? 0;
    while (node === nodes[stops[index].id] || (stops[index].level != null && stops[index].level !== node.level)) {
      index = (index + 1) % stops.length;
    }
    const { id, level } = stops[index];
    current.stopIndex = index;
    // no route on that level from here (a dead end, or the only turn leaves the level): turn back along this road
    return routeTo(node, nodes[id], current.edge, level)[0]
      ?? (level != null ? node.exits.find(x => x.road.level === level) : null)
      ?? legalTurns(current.edge)[0];
  }

  // the next road of the tour; off it (after driving by hand, or the lift), the shortest legal way back onto it
  planExit(current) {
    const { edges: P, at } = current.plan, e = current.edge, here = at.get(e);
    if (!here) return edgeRoute(e, x => at.has(x))?.[0] ?? legalTurns(e)[0];
    const i = here.find(j => j >= current.planAt) ?? here[0];
    current.planAt = i;
    return i + 1 < P.length ? P[i + 1] : P[1];
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
    const turns = legalTurns(current.edge);
    const choices = current.home ? turns.filter(edge => edge.road.city === current.home && edge.road.level === 0) : turns;
    if (!choices.length) return current.edge.to.exits.find(edge => edge.road === current.edge.road);
    return choices[Math.floor(rng() * choices.length)];
  }

  nextLane(current, exit) {
    const angle = turnAngle(current.edge, exit);
    if (angle > 0.35) return exit.road.lanes - 1;
    if (angle < -0.35) return 0;
    return Math.min(current.lane, exit.road.lanes - 1);
  }

  leadDistance(current, edge = current.edge, start = current.s, lane = current.lane) {
    if (current === this.player && this.filtering && edge === current.edge) return Infinity;   // on the lane line, past them
    let gap = Infinity;
    for (const other of this.onEdges.get(edge) ?? []) {
      if (other === current || other.turn || other.edge !== edge || other.lane !== lane || other.s < start) continue;
      if (other === this.player && this.filtering) continue;   // a bike on the lane line isn't in the lane
      if (other.s === start && edge === current.edge && this.vehicles.indexOf(other) > this.vehicles.indexOf(current)) continue;   // a tie: one goes first
      gap = Math.min(gap, other.s - start);
    }
    return gap;
  }

  // the light and the people: may this vehicle go past its hold line? Red stops it, amber unless it's close, and
  // anyone on the zebra of its own road or of the road it turns into
  mayPass(current) {
    if (current === this.player && !S.auto) return true;
    const e = current.edge, light = signalState(e, S.T);
    if (light < 0) return true;
    if (light === 2 || (light === 1 && e.path.length - e.to.trim - e.holdBack - current.s > 20)) return false;
    if (pedsOn(e, S.T)) return false;
    const into = current.exit?.road.edges.find(x => x.to === e.to && x !== e);
    return !(into && into.holdBack !== undefined && (into.road.oneWay ? pedsOn(into, S.T) : pedsOnOutbound(into, S.T)));
  }

  // past the hold line it is committed to the light; at the junction it still waits for its turn and for room
  canEnter(current, ignoreOwner = false) {
    if (current === this.player && !S.auto) return true;
    const e = current.edge;
    if (current.s <= e.path.length - e.to.trim - (e.holdBack ?? 0) + 0.01 && !this.mayPass(current)) return false;
    const into = current.exit?.road.edges.find(x => x.to === e.to && x !== e);   // people crossing where it turns in
    if (into && into.holdBack !== undefined && (into.road.oneWay ? pedsOn(into, S.T) : pedsOnOutbound(into, S.T))) return false;
    if (!ignoreOwner && !this.junctionFree(current)) return false;
    const lane = this.nextLane(current, current.exit);
    // one car at a time into each lane of the exit, so two cars sharing a green can't land in the same spot
    if (!ignoreOwner) for (const o of this.owners.get(e.to) ?? []) {
      if (o !== current && o.turn?.edge === current.exit && o.turn.lane === lane) return false;
    }
    return this.leadDistance(current, current.exit, current.edge.to.trim - 0.01, lane) > 7;
  }

  // a junction takes one car at a time, except under a light, where every car with the same green (both directions
  // of one axis) may be in it together
  junctionFree(current) {
    const node = current.edge.to, inside = this.owners.get(node);
    if (!inside) return true;
    for (const o of inside) {
      if (o === current) continue;
      if (!node.signal || o.edge.axis === undefined || o.edge.axis !== current.edge.axis) return false;
    }
    return true;
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
        this.owners.get(current.edge.to)?.delete(current);
        const trim = current.edge.to.trim;
        const previousRoad = current.edge.road;
        this.vehiclesOn(current.edge).delete(current);
        current.edge = turn.edge;
        this.vehiclesOn(current.edge).add(current);
        current.lane = turn.lane;
        current.lat = laneOffset(current.edge, turn.lane);
        current.s = trim;
        current.turn = null;
        current.exit = null;
        if (isPlayer) {
          this.intent = 0;
          const level = current.edge.road.level;
          if (level !== null && level !== S.layer) {
            S.zoneText = (level > S.layer ? '▲ ' : '▼ ') + 'LEVEL ' + (level + 1) + ' · ' + LEVEL_NAMES[level] + (level === 2 ? ' LEVEL' : '');
            S.zoneT = 3.5;
            S.layer = level;
          } else if (previousRoad.name !== current.edge.road.name && !(S.zoneT > 0 && S.zoneText.includes('LEVEL'))) {
            S.zoneText = current.edge.road.name.toUpperCase();
            S.zoneT = 2.5;
          }
        }
        continue;
      }
      const end = current.edge.path.length - current.edge.to.trim, hold = end - (current.edge.holdBack ?? 0);
      if (hold < end && current.s <= hold + 0.01) current.exit ??= this.selectExit(current, isPlayer);
      // cross the hold line only when it can go all the way through, so nobody waits out a red inside the junction
      const held = hold < end && current.s <= hold + 0.01 && !this.canEnter(current);
      const stop = held ? hold : end;
      const room = Math.max(0, this.leadDistance(current) - 6);
      const move = Math.min(remaining, Math.max(0, stop - current.s), room);
      current.s += move;
      remaining -= move;
      traveled += move;
      if (room < 0.0001) current.speed = 0;
      if (current.s < stop - 0.0001) break;
      if (held) { current.speed = 0; break; }
      current.exit ??= this.selectExit(current, isPlayer);
      if (current.exit.road.lift) {
        this.callLift(current);
        break;
      }
      // first come, first served: a car already refused at this junction goes next, so a busy crossing street
      // can't starve a turn forever
      const node = current.edge.to, first = this.waiting.get(node);
      // (only while it's held by nothing but the junction being busy; held by a full exit or by people, it doesn't
      // block the cars that could clear the jam)
      const firstValid = first && first !== current && first.edge.to === node && !first.turn && !(first === this.player && this.free)
        && first.s >= first.edge.path.length - node.trim - 0.01 && this.canEnter(first, true);
      if (firstValid || !this.canEnter(current)) {
        if (!firstValid) this.waiting.set(node, current);
        current.speed = 0;
        break;
      }
      if (first === current) this.waiting.delete(node);
      if (!this.owners.has(current.edge.to)) this.owners.set(current.edge.to, new Set());
      this.owners.get(current.edge.to).add(current);
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
    if (isPlayer) { if (S.auto && !current.turn) this.filter(current, dt); else if (current.turn) this.filtering = false; }
    if (!current.turn && remaining < Math.max(64, current.speed ** 2 / 14 + 20)) current.exit ??= this.selectExit(current, isPlayer);

    const boost = current.edge.road.link?.district === D.VAC ? 1.6 : 1;
    let limit = isPlayer ? Math.min(CRUISE[S.cruise] * boost, this.playerCap(current)) : Math.min(current.edge.road.speed, current.limit);
    if (current.turn) limit = Math.min(limit, current.turn.speed);
    else {
      const lead = this.leadDistance(current);
      limit = Math.min(limit, Math.sqrt(15 * Math.max(0, lead - 6)));
      if (current.exit) {
        const turnSpeed = this.turnSpeed(current);
        limit = Math.min(limit, Math.sqrt(turnSpeed ** 2 + 17 * Math.max(0, remaining)));
        const beforeHold = current.s <= current.edge.path.length - current.edge.to.trim - (current.edge.holdBack ?? 0);
        const toHold = remaining - (beforeHold ? current.edge.holdBack ?? 0 : 0);
        if (!this.canEnter(current)) limit = Math.min(limit, Math.sqrt(16 * Math.max(0, toHold)));
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
      S.waitLight = S.auto && current.speed < 1 && remaining < 6 + (current.edge.holdBack ?? 0) && signalState(current.edge, S.T) === 2;
    }
  }

  // the player ignores the posted limits (they are for traffic) except on the lift's slow approaches, and slows for
  // the bends on its own road, through the junction turn and on the road after it
  playerCap(current) {
    const e = current.turn ? current.turn.edge : current.edge, road = e.road;
    if (road.liftApproach || road.lift) return road.speed;
    if (current.turn) return curveCap(e.path, e.from.trim, 1, current.speed, current.turn.path.length - current.turn.s);
    let cap = curveCap(e.path, current.s, 1, current.speed);
    const x = current.exit;
    if (x && !x.road.lift) cap = curveCap(x.path, x.from.trim, 1, current.speed, e.path.length - e.to.trim - current.s + 8, cap);
    return cap;
  }

  // filtering, as a rider does: a slower car ahead in the lane, and the autopilot moves onto the lane line (the
  // centre line of a two-way street, or the line to the next lane) and rides past it, then back into the lane once
  // nothing is alongside; the 3.5 m lanes leave ~0.4 m either side between the bike and the cars
  filter(p, dt) {
    const e = p.edge, road = e.road, centre = laneOffset(e, p.lane), half = LANE_WIDTH / 2;
    const line = !road.oneWay || p.lane > 0 ? centre - half : road.lanes > 1 ? centre + half : null;
    let slowAhead = false, beside = false;
    if (line !== null && !road.liftApproach) for (const o of this.onEdges.get(e) ?? []) {
      if (o === p || o.turn || o.lane !== p.lane) continue;
      const gap = o.s - p.s;
      if (gap > -7 && gap < 7) beside = true;
      if (gap > 0 && gap < 80 && o.speed < CRUISE[S.cruise] - 2) slowAhead = true;
    }
    const target = slowAhead || (beside && Math.abs(p.lat - centre) > 0.3) ? line : centre;
    p.lat += clamp(target - p.lat, -2.4 * dt, 2.4 * dt);
    this.filtering = Math.abs(p.lat - centre) > 1.0;
  }

  // the next planned edge after e on the autopilot's tour
  planNext(e) {
    const p = this.player, here = p.plan?.at.get(e);
    if (!here) return null;
    const i = here.find(j => j >= p.planAt) ?? here[0];
    return p.plan.edges[i + 1] ?? p.plan.edges[1];
  }

  // Lights that detect you, as many real ones do: the autopilot's next signalled junction sees it coming and runs
  // its cycle on to green in time (up to 4x fast, never backwards), so a red stop happens only now and then:
  // when the junction decides not to (about 1 in 7), or when the rider is too close for the cycle to catch up.
  greenWave(dt) {
    const p = this.player;
    if (!S.auto || this.free || this.lift.holds(p) || !p.plan) return;
    let e = p.turn ? p.turn.edge : p.edge, next = p.turn ? null : p.exit;
    let d = p.turn ? p.turn.path.length - p.turn.s + e.path.length - e.to.trim - e.from.trim : e.path.length - e.to.trim - p.s;
    for (let k = 0; k < 4 && d < 260; k++) {
      const hold = e.holdBack ?? 0;
      if (e.to.signal && d - hold > -0.5 && !(k === 0 && !p.turn && p.s > e.path.length - e.to.trim - hold + 0.01)) {
        const node = e.to, P = LIGHT_PERIOD;
        if (this.wave?.node !== node || this.wave.edge !== e) this.wave = { node, edge: e, favour: waveRng() > 0.14 };
        if (!this.wave.favour) return;
        const v = Math.max(p.speed, Math.min(e.road.speed * 1.5, CRUISE[S.cruise]) * 0.7, 4), eta = Math.max(0, d - hold) / v;
        const sig = node.signal, phase = ((S.T + eta + sig.offset + (e.axis ? P / 2 : 0)) % P + P) % P;
        if (phase > 0.3 && phase < GREEN - 2) return;
        const need = ((2.5 - phase) % P + P) % P;
        sig.offset = (sig.offset + Math.min(need, dt * 3 * Math.min(1, need / 3 / Math.max(0.3, eta)))) % P;
        return;
      }
      const after = next ?? this.planNext(e);
      if (!after || after.road.lift) return;
      next = null;
      d += after.path.length - after.from.trim - after.to.trim;
      e = after;
    }
  }

  routeViaLift() {
    const p = this.player;
    if (!S.auto || p.edge.road.city !== 'VANTA BAY' || this.lift.holds(p)) return false;
    p.liftStop = TOWER_LIFT.landings[S.layer === 0 ? 0 : 1];
    if (!p.turn) p.exit = null;
    return true;
  }

  callLift(vehicle) {
    this.lift.request(vehicle, vehicle.edge.to.level);
    if (vehicle !== this.player) return;
    this.free = null;
    S.waitLight = false;
  }

  releaseLift({ vehicle, to }) {
    const edge = TOWER_LIFT.approaches[to].edges[1];
    this.vehiclesOn(vehicle.edge).delete(vehicle);
    Object.assign(vehicle, { edge, s: TOWER_LIFT.exitClearance, lane: 0, lat: laneOffset(edge, 0), turn: null, exit: null, liftStop: null });
    this.vehiclesOn(edge).add(vehicle);
    sample(vehicle, vehicle.pose);
    if (vehicle !== this.player) return;
    S.layer = to;
    S.zoneText = to ? '▲ LEVEL 2 · SKY AVENUES' : '▼ LEVEL 1 · STREET';
    S.zoneT = 3.5;
  }

  vehiclesOn(edge) {
    if (!this.onEdges.has(edge)) this.onEdges.set(edge, new Set());
    return this.onEdges.get(edge);
  }

  update(dt, keys) {
    const p = this.player;
    S.T += dt;
    S.zoneT -= dt;
    const steer = Number(Boolean(keys.right)) - Number(Boolean(keys.left));
    S.steer += (steer - S.steer) * Math.min(1, dt * 9);
    if (!S.auto && !this.lift.holds(p)) {
      S.idle = keys.left || keys.right || keys.gas || keys.brake ? 0 : S.idle + dt;
      if (S.idle > 10) {
        setAuto(true);
        if (!p.turn) p.exit = null;
      }
    }
    this.onEdges.clear();
    for (const current of this.vehicles) this.vehiclesOn(current.edge).add(current);
    const released = this.lift.step(dt, ({ vehicle, to }) =>
      this.leadDistance(vehicle, TOWER_LIFT.approaches[to].edges[1], 0, 0) > TOWER_LIFT.exitClearance + 6);
    if (released) this.releaseLift(released);
    this.greenWave(dt);
    for (const current of this.traffic) if (!this.lift.holds(current)) this.updateVehicle(current, dt, keys);
    // by hand the rider is a free body on the road surfaces; autopilot drives the lane graph
    if (!this.lift.holds(p)) {
      if (!S.auto && !this.free) this.enterFree();
      else if (S.auto && this.free) {
        const edge = p.edge;
        this.leaveFree();
        if (p.edge !== edge) {
          this.vehiclesOn(edge).delete(p);
          this.vehiclesOn(p.edge).add(p);
        }
      }
      if (this.free) this.stepFree(dt, keys);
      else this.updateVehicle(p, dt, keys);
    } else {
      S.roll *= Math.exp(-dt * 5);
      S.waitLight = false;
    }
    const liftStatus = this.lift.holds(p) ? (this.lift.trip?.vehicle === p ? this.lift.phase : 'queue') : null;
    if (liftStatus !== this.liftStatus) {
      this.liftStatus = liftStatus;
      if (liftStatus === 'queue' || liftStatus === 'summon') S.zoneText = 'TOWER LIFT · WAITING';
      if (liftStatus === 'board') S.zoneText = 'TOWER LIFT · BOARDING';
      if (liftStatus === 'travel') S.zoneText = 'TOWER LIFT · MOVING';
      if (liftStatus && liftStatus !== 'release') S.zoneT = 7;
    }
    // people on the crossings: drawn by main.js, and riding into one stops you dead, as in the reference
    this.crossers = allCrossers(S.T, p.pose.x, p.pose.z, 200);
    walkersNear(S.T, p.pose.x, p.pose.z, 180, this.crossers);   // and the sidewalk crowd around you
    if (this.free && p.speed > 3) for (const c of this.crossers) {     // the manual rider; autopilot waits at the line
      if (Math.abs(c.y - p.pose.y) < 2 && (c.x - p.pose.x) ** 2 + (c.z - p.pose.z) ** 2 < 0.9 * 0.9) {
        p.speed = 0; S.shake = 0.8; S.crashFlash = 0.5; S.lastHit = S.T;
        break;
      }
    }
    S.shake *= Math.exp(-dt * 4);
    S.crashFlash *= Math.exp(-dt * 5);
    S.z = p.traveled;
    S.px = p.lat;
    S.speed = p.speed;
    S.elevation = p.pose.y;
    const deck = underSkyDeck(p.pose), bore = this.enclosed(p.traveled);
    S.gloom += (Number(deck || bore) - S.gloom) * Math.min(1, dt * 0.85);
    // Use the road's city on stacked roads. Blend west to east only while on a link.
    const x = p.pose.x;
    const road = this.free?.surface.road ?? p.edge.road, link = road.link;
    const distance = link ? x - link.x0 : 0, span = link ? link.x1 - link.x0 : 0;
    const fraction = link ? clamp(distance / span, 0, 1) : 0;
    const strength = link ? smooth(0, 72, distance) * smooth(0, 72, span - distance) : 0;
    const th = link ? blendCities(link.a, link.b, smooth(0.25, 0.85, fraction), link.district, strength)
      : blendCities(road.city, road.city, 0);
    if (link === LINKS[0] && fraction < 1) th.TH.elevator = Math.max(th.TH.elevator, 0.6 * smooth(0, 0.3, fraction));
    // Aurum's space elevator: far off, the sky paints it (fog would hide the real one); in the city the real one
    if (x > AURUM.gate - 150 && x < AURUM.x1 + 150) th.TH.elevator = 0;
    updateClimate(dt, th, deck || bore);
    const here = (this.free ? this.free.surface.road : p.turn ? null : p.edge.road);
    if (here && here.city !== this.cityNow) {
      const east = Math.sin(p.pose.th) > 0;
      if (this.cityNow !== undefined) {
        S.zoneText = here.link ? here.link.name + ' → ' + (east ? here.link.b : here.link.a) : here.city + ' · ' + here.name.toUpperCase();
        S.zoneT = 3.5;
      }
      this.cityNow = here.city;
      this.placeNow = here.link ? here.link.name : here.city;
    }
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
    let best = current && onSurface(current, x, z, hit, y) && Math.abs(hit.y - y) < 2 ? { surface: current, hit, k: norm(current, hit) + 0.1 } : null;
    for (const s of current ? current.next : SURFACES) {
      const o = onSurface(s, x, z, {}, y);
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
    this.free = { x: pose.x, z: pose.z, y: pose.y, th: pose.th, surface: found ? found.surface : start, wall: 0, assistYaw: 0 };
    if (p.turn) { this.owners.get(p.edge.to)?.delete(p); p.edge = p.turn.edge; p.s = p.edge.to === p.edge.from ? 0 : p.edge.from.trim; }
    p.turn = null; p.exit = null;
    this.project();
  }

  leaveFree() {                                       // snap onto the nearest lane going your way
    const p = this.player, f = this.free;
    const roads = (f.surface.kind === 'road' ? [f.surface] : []).concat(f.surface.next.filter(s => s.kind === 'road'));
    let best = null;
    for (const s of roads) for (const edge of s.road.edges) {
      const fr = {}, o = onSurface(s, f.x, f.z, fr, f.y) ?? (() => { frameOn(s.road.path, 0, fr); fr.s = 0; fr.lat = 0; return fr; })();
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
    const o = {}; if (!onSurface(s, f.x, f.z, o, f.y)) return;
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
    // speed: the cruise speed by hand too, slowed only for the bends of the road you're on
    let limit = CRUISE[S.cruise] * (f.surface.road?.link?.district === D.VAC ? 1.6 : 1);
    if (f.surface.kind === 'road') {
      const road = f.surface.road, o = onSurface(f.surface, f.x, f.z, {}, f.y);
      if (road.liftApproach || road.lift) limit = road.speed;
      else if (o) {
        const back = Math.abs(Math.atan2(Math.sin(o.th - f.th), Math.cos(o.th - f.th))) > Math.PI / 2;
        limit = Math.min(limit, curveCap(road.path, o.s, back ? -1 : 1, p.speed));
      }
    }
    const target = keys.brake ? 0 : keys.gas ? limit : Math.min(limit, Math.max(0, p.speed - 0.7 * dt));
    p.speed = Math.max(0, p.speed + clamp(target - p.speed, -(keys.brake ? 18 : 12) * dt, 13 * dt));
    if (f.wall > 0) p.speed *= Math.exp(-dt * 2.5);
    p.brake = p.speed < wasSpeed - 0.03;
    // steering: a turn rate capped by grip (about 0.9 g sideways), tight enough at walking pace for a U-turn
    const v = p.speed, cap = Math.min(1.5, 9 / Math.max(v, 1));
    let assist = 0;
    if (f.surface.kind === 'road') {   // hands off: settle into the road's direction
      const o = {};
      if (onSurface(f.surface, f.x, f.z, o, f.y)) {
        const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
        const back = Math.abs(wrap(o.th - f.th)) > Math.PI / 2 && f.surface.road.edges.length > 1, dir = back ? -1 : 1;
        const along = back ? o.th + Math.PI : o.th;
        let d = wrap(along - f.th);
        const alignment = 1 - smooth(0.35, 0.6, Math.abs(d));
        if (alignment > 0) {
          // follow the bend: the road's own turn rate ahead, so long curves (the helix, the plaza ring) don't drift out
          const path = f.surface.road.path, ahead = frameOn(path, Math.max(0, Math.min(path.length, o.s + dir * 4)));
          const ff = wrap((back ? ahead.th + Math.PI : ahead.th) - along) / 4 * v;
          // and ease back from the edge: within 2.5 m of it, aim a little inward (lat is + to the road's right)
          const half = f.surface.half, lat = o.lat * dir, edge = Math.abs(lat) - (half - 2.5);
          if (edge > 0) d += clamp(Math.sign(lat) * edge * 0.12, -0.25, 0.25);
          assist = alignment * clamp(d * Math.min(2.5, v * 0.2) + ff, -cap, cap);
        }
      }
    }
    f.assistYaw += (assist - f.assistYaw) * -Math.expm1(-14 * dt);
    const hand = smooth(0.04, 0.24, Math.abs(S.steer));
    const yaw = clamp(-S.steer * cap + f.assistYaw * (1 - hand), -cap, cap);
    f.th += yaw * dt;
    // move, then find the ground; off the edge of everything is a wall you slide along
    const step = v * dt;
    let tx = f.x + Math.sin(f.th) * step, tz = f.z + Math.cos(f.th) * step;
    let at = this.locate(tx, tz, f.y, f.surface);
    f.wall = Math.max(0, f.wall - dt);
    if (!at) {
      const base = onSurface(f.surface, f.x, f.z, {}, f.y);
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
    if (keys.gas && p.edge.road.liftApproach && p.edge.to.liftLanding &&
        p.edge.path.length - p.s < 1.4 && Math.abs(f.z - TOWER_LIFT.z) < TOWER_LIFT.halfWidth - 0.5) {
      this.callLift(p);
    }
  }

  arrive(surface) {                                   // banners when the rider reaches a new road or level
    const f = this.free;
    if (surface === f.surface) return;
    const before = f.surface;
    f.surface = surface;
    if (surface.kind !== 'road') return;
    const level = surface.level;
    if (level !== null && level !== S.layer) {
      S.zoneText = (level > S.layer ? '▲ ' : '▼ ') + 'LEVEL ' + (level + 1) + ' · ' + LEVEL_NAMES[level] + (level === 2 ? ' LEVEL' : '');
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
    const speed = current === this.player ? CRUISE[S.cruise] : Math.min(current.edge.road.speed, current.exit.road.speed);
    return angle < 0.12 ? speed : current.edge.to.ramp ? Math.min(speed, 18) : angle < 0.8 ? 12 : angle < 1.2 ? 8.5 : 6.5;
  }

  enclosed(distance) {
    const p = this.player;
    if (this.lift.onboard(p)) return true;
    const road = p.edge.road, s = p.s + distance - p.traveled;
    return !p.turn && (inBore(road, s) || inTube(road, road.edges[0] === p.edge ? s : road.path.length - s));
  }

  cabinBounds() {
    if (!this.lift.onboard(this.player)) return null;
    const { x, z, halfLength, halfWidth, height } = TOWER_LIFT;
    return { x0: x - halfLength + 0.5, x1: x + halfLength - 0.5, z0: z - halfWidth + 0.5,
      z1: z + halfWidth - 0.5, y0: this.lift.y + 0.8, y1: this.lift.y + height - 0.8 };
  }

  cameraFrame(distance, out = {}) {
    const p = this.player;
    const offset = distance - p.traveled;
    if (this.lift.holds(p)) {
      Object.assign(out, p.pose);
      if (this.lift.onboard(p)) out.x += Math.sin(p.pose.th) * offset;
      return out;
    }
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
      if (next.road.lift) return frameInLane(p.edge, stop, p.lat, out);
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
