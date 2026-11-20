# Neon Drive GPU: the plan for now

Target: `neondrive/neondrive-gpu.html`. Nothing gets built until the user says **go**.
The long-term city-map project on three.js lives in [`three/PLAN.md`](three/PLAN.md).

## Goal

Wow effect. Every city and every level (street, sky avenues, crown) should feel truly futuristic and jaw-dropping.

## Do now (decided)

| Item | Decision |
|---|---|
| Side camera shot | **Remove SIDE only** (ALONGSIDE stays) |
| Cruise speeds (V) | **Rework to 80 / 140 / 200 / 300 km/h** (now 80 / 130 / 190 / 250) |
| Level-change tunnel arrows | **Bug: fix.** The wall chevrons point backward, toward the rider. The formula puts the tip behind the arms (`u - 3 - abs(vv)*1.2`); it should be `u - 3 + abs(vv)*1.2`. Same formula in the JS `liftTex` (~line 1511) and the shader (~line 4112). |
| HD detail toggle | **Remove.** HD is always on: drop the D key, the HD button and the classic mode |
| Sound effects | **Yes**, see the sound list below |

## Rejected

- Speed effects (blur, streaks, wider view)
- Radio / music

## Sound list (to grow)

- Engine hum: pitch and volume follow speed, deeper whine in the vactrain
- Rain on the visor, heavier in monsoon
- Whoosh (doppler) when cars pass, both directions
- Thunder after lightning, delayed by distance
- Tunnel and tube: sound goes muffled and echoey
- Wind: rises with speed and with height (crown level loudest)
- Level-change ramp: a rising tone as you climb
- Crash: a soft glitch thump, not harsh

## Still open for the GPU version

### Road variety without a rewrite
Today the world is one long road that loops (every system is indexed by distance along it). Two moderate options:

- **A. Turns at intersections.** At a crossing, pick left / straight / right; the bike sweeps through the turn and the
  road ahead becomes a different street. Autopilot picks turns on its own.
- **B. Forks and merges.** The road splits (one branch climbs to sky avenues, one dives into a canal tunnel) and
  rejoins later.

A true city map (open squares, drive anywhere) can't be done in this renderer; that is the three.js project.

### Wow ideas (round 2)

**Per-level identity**
- **Street level:** dense, wet and close. Steam, puddle reflections, holo ads on every surface, crowds.
- **Sky avenues (35 m):** glass and light. See-through decks, traffic in the air beside you, waterfalls of light.
- **Crown (100 m):** above the clouds. Quiet, vast, stars, giant structures on the horizon, the city glowing beneath the cloud layer.

**Horizon hero landmarks (one per city, always visible far away)**
- A space elevator tether rising into orbit with cargo pods climbing it
- A ring-shaped arcology spanning the skyline
- A colossal hologram figure that turns its head as you pass
- An orbital station or moon fragment hanging low in the sky
- A lattice megastructure catching the sunset

**Moments (set pieces)**
- Crown level breaks through the clouds: sudden silence, stars, aurora
- A maglev train races alongside, then peels away through a building
- A bridge deck lights up section by section as you ride over it
- A whole building facade turns into one synchronized light show
- Entering a city: the skyline lights up in a wave toward you

**New city concepts (need more brainstorming)**
- Orbital elevator city: the crown leaves the atmosphere
- Frozen waterfall city: ice towers lit from inside
- Drive-in cinema desert city: giant screens on the dunes
- Sunrise city: the only city in daylight, gold glass everywhere

### Not chosen yet (round 1)
- Photo mode
- Postcard hunt (rare sights stamped in a saved book)
- Courier runs
- Near-miss combo meter
- Rare world events (parade, police chase, blackout, sky whale)
- Ghost rival
- Garage (cycle colours and trails)
- Travel log
