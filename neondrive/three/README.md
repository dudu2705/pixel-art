# Neon Drive 3D

A real-3D build of Neon Drive using the vendored three.js r160 renderer.
[`../neondrive-gpu.html`](../neondrive-gpu.html) is the visual reference.

From the repository root, run `python3 -m http.server` and open
`http://localhost:8000/neondrive/three/index.html`.

The default game opens in **Vanta Bay**. Vanta Boulevard passes through Prism
Plaza and its holographic fountain. Four surrounding blocks connect to the plaza,
and a single ramp reaches the glass sky-avenue deck 35 metres above the city.
Autopilot follows a route through the plaza, up to the deck, and back through
the city. Traffic uses the same lane graph.

Use `index.html?loop` to revisit the 30-district visual comparison route.

## Layout

| File | Role |
|---|---|
| `map.js`, `map-drive.js` | Define the fixed Vanta Bay lane graph and route the rider, traffic, and autopilot through it |
| `map-city.js` | Stream Vanta Bay by map position and draw the boulevard, plaza, skyline, and sky deck |
| `world.js`, `road.js` | Supply the reference palette and art data and generate the comparison loop |
| `city.js` | Stream the road, buildings, and district art in 64-segment chunks |
| `facade.glsl.js`, `shaders.js` | Paint the building walls, billboards, roofs, street surfaces, and glass decks |
| `dressing.js`, `props.js`, `effects.js` | Place and shade district landmarks, structures, lights, and animated props |
| `sim.js`, `traffic.js`, `signals.js` | Update driving, weather state, traffic, pedestrians, and signals |
| `camera.js`, `cycle.js`, `cockpit.js` | Render the reference shots, exterior rider, and cockpit artwork |
| `sky.js`, `weather.js`, `overlay.js` | Draw the panorama, sky effects, and weather on the art grid |
| `main.js`, `glow.js` | Render the city and the depth-aware road surface and glow passes, then compose the banked scene and foreground |

## Controls

`←` `→` steer · `↑` gas · `↓` brake · `A` autopilot · `V` cruise speed ·
`R` or `W` weather · `L` headlight · `C` camera · `H` hints

`C` cycles Cockpit, Chase, Drone, Trackside, and Alongside. Keys `1`–`5`
select those shots directly. Use `6` for orbit or `7` for free flight.
Drag to look and use the wheel to zoom in orbit. Use `WASD` and `QE` to move
in free flight. `F` shows diagnostics and `B` toggles glow for comparison.

In Vanta Bay, steer to change lanes between junctions. As you approach a junction
in manual mode, steer toward the turn you want. The banner names the selected
street.

The shorter side of the screen determines the art grid. Each art pixel spans
a whole number of physical pixels and the city always renders at twice the
art resolution with nearest-neighbour sampling.

## What is in

The renderer uses the reference generator’s data for city palettes, districts,
links, and building details.

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

**Sky and weather** — an art-grid panorama with stars, aurora, mountains, heat
shimmer, lightning, and fireworks. The weather streaks and windshield
droplets are drawn over the banked scene.

**Wet road** — the finish pass mirrors the combined scene and glow across the
horizon, using the road mask, wetness, and brightness to weight the result.

**Cockpit** — the light cycle’s handlebars, dome rim, smoked glass, floating
ring, and projected readout on camera 1.

## The comparison loop

The comparison loop's driving and weather use the reference game's
`update()` formulas. Vanta Bay uses the same weather and cruise presets.

- **Steering physics** — lateral speed limit that scales with pace, the road's
  curvature pushing you outward, and the lean angle whose tangent is sideways
  acceleration over gravity. Scrape the kerb and you lose speed and the view shakes.
- **Autopilot** — picks between the two lanes, looks far enough ahead to stop
  from its current speed, eases off before a bend to keep sideways grip under
  0.7g, brakes smoothly to a red light and waits for people to finish crossing.
  Cruise cycles 80/140/200/300 km/h on `V`. Idle ten seconds in manual and it
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

Car AI uses position bins so each car checks the bins it can reach.

Each instanced chunk borrows its position, normal, UV, and index buffers
from a shared unit mesh. `dropChunk` detaches those attributes before
disposing the chunk geometry so the other meshes can continue drawing.
