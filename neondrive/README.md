# Neon Drive 3D

A real-3D rebuild of `../neondrive.html` on three.js (WebGL, r160, vendored in
`vendor/` so it runs offline). The original is untouched and still playable.

## Why

The original is a software rasterizer: every pixel is computed in JavaScript on
one thread. Measured on the old build: **61ms a frame (~16fps)** at 342x256,
45% of it inside `drawWall`, which called a procedural texture function once per
wall pixel — 280,000 calls a frame. It also could not do a real side view: it
rastered one forward image and reprojected it, which is why the side camera
looked wrong.

This build puts the same city on the GPU. Measured here: **2.07ms a frame
(~483fps)** at 1024x768 full res, 1.55ms in pixel mode.

## Layout

| file | what it does |
|---|---|
| `world.js` | the original city generator, lifted verbatim. Pure data, no DOM. 46,290 segments, 185km of road, 7,885 buildings |
| `road.js` | integrates `curve`/`hill` into a world-space centreline and gives you a frame at any distance |
| `city.js` | streams the world into GPU meshes a chunk at a time (64 segments each, ~28 live) |
| `shaders.js` | the facade and road shaders — the old `wallTex()` logic moved to the fragment stage |
| `camera.js` | the camera rig: six modes, mouse orbit, free flight |
| `main.js` | loop, driving, theme, HUD, the pixel-art downsample pass |

## Controls

The original's bindings, unchanged:

`←` `→` steer · `↑` gas · `↓` brake · `A` autopilot · `V` cruise speed ·
`R` or `W` weather · `L` headlight · `C` camera · `H` hints

Added for the free camera only: `1`–`6` pick a camera directly (cockpit, chase,
side, top, orbit, free), drag to look, wheel to zoom, `P` pixel mode, `B` glow,
`[` `]` resolution. In the free camera, `WASD` / `QE` move.

## What is in

Everything is driven by the generator's own data, so it is the same city in the
same order with the same contents.

**Structures** — tunnels and the level-change bores (tiled lining, cyan guide
stripe, hazard skirting, ceiling lamp panels); the aqua tube with sea, ribs and
fish outside the glass; the skybridge with towers, cables and hangers; elevated
decks with undersides, columns and railings; skywalks over and under the road
with their neon underline; the monorail beam, its pylons and the train;
motorway barriers and overpasses; the lit gantries that announce each city.

**Districts** — market lantern strings and striped stalls; stacktown laundry;
shrine torii and lanterns; holo-garden, sakura, ruin and coral trees; dockland
container stacks and gantry cranes; construction cones; data-canyon lasers;
foundry smokestacks with glowing lips and furnace floor glow; monsoon
waterfalls; the carnival wheel and coaster; downtown overhead cables;
air-lane light gates.

**Facades** — storey and bay grid, lit windows in the three original colours,
ground-floor shopfront glow, crown bands, corner pilasters. Blade signs with the
fake-glyph grid and the original flicker rule. Billboards in all five animated
kinds. Rooftop helipads, bar bulb strings, sky-facing neon and landmark masts.

**Life** — the generator's own pools: 380 cars with headlights, tail lights and
underglow, 980 people with glowing umbrellas, 280 hover cars in the two air
lanes, and the monorail train.

**Intersections** — cross streets, zebra crossings and signal masts running the
original's cycle (16s green, 3s amber, then red; the ruin's just blink amber).

**Sky and weather** — nine weather types as real particles, twinkling stars that
thicken as you climb, aurora curtains, a mountain ridge, heat shimmer, and
fireworks over the festival cities.

**Wet road** — a planar mirror of every glowing thing, so neon smears down the
tarmac when it rains, as the original's reflection buffer did.

**Cockpit** — the light cycle's handlebars, dome rim, smoked glass and the ring
of light floating inside, on camera 1.

## The game (sim.js)

Ported from the original's `update()`, not reinvented:

- **Steering physics** — lateral speed limit that scales with pace, the road's
  curvature pushing you outward, and the lean angle whose tangent is sideways
  acceleration over gravity. Scrape the kerb and you lose speed and the view shakes.
- **Autopilot** — picks between the two lanes, looks far enough ahead to stop
  from its current speed, eases off before a bend to keep sideways grip under
  0.7g, brakes smoothly to a red light and waits for people to finish crossing.
  Cruise cycles 80/130/190/250 km/h on `V`. Idle ten seconds in manual and it
  takes over again.
- **Traffic AI** — every car queues behind the one in front, brakes for its own
  red lights, flares its tail lights when slowing, and treats you as an obstacle.
- **Collisions** — rear-end a car and you drop to its speed; hit one head-on and
  you lose three quarters of yours. Both shake the view and flash the screen.
  Run into someone on a crossing and you stop dead.
- **Traffic lights** — 16s green, 3s amber, then red; the ruin's just blink
  amber. About one in four turns red as you approach. People cross on red.
- **Level system** — three levels (street, sky avenues at 35m, crown at 100m),
  announced on the board as you arrive, with the gloom closing in underneath.
- **Weather state machine** — the road dries at its own rate per weather type,
  nothing falls while you are under a roof but the tarmac stays wet, fog
  thickens in fog and monsoon, and the stormy cities throw lightning.
- **Day-night cycle** — one hour per cycle, shifting the sky through dusk, deep
  night and a pre-dawn glow, each city's palette tinted by the hour.

The car AI is the one place the port departs from the original: it compared
every car with every other (380² a frame). At the density a 3D view needs that
is 12 million pairs, so cars are binned by position and each only checks the
bins it can reach.

## Performance

A wet downtown block with rain, reflections, bloom, full traffic and crowds:

| | old build | this |
|---|---|---|
| frame | 61.4ms | **5.7ms** |
| fps | 16 | **174** |

An empty tunnel runs at 751fps. All 30 districts render without error.

One trap worth knowing if you extend this: every instanced chunk borrows its
position/normal/uv/index from a shared unit mesh, so `dropChunk` detaches those
before disposing. Disposing them frees the buffers every other chunk is still
drawing from, and the frame cost climbs from 3ms to 25ms as you drive.
