# Neon Drive 3D

A real-3D build of Neon Drive using the vendored three.js r160 renderer.
[`../neondrive-gpu.html`](../neondrive-gpu.html) is the visual reference.

From the repository root, run `python3 -m http.server` and open
`http://localhost:8000/neondrive/three/index.html`.

The default game opens in **Vanta Bay**. Vanta Boulevard passes through Prism
Plaza and its holographic fountain. Four surrounding blocks connect to the plaza.
The glass Sky Avenues deck runs above a busy street at 35 metres. Two one-way
spiral ramps connect the levels through lit bores. A two-way helix climbs to
Crown Way at 100 metres. The fourteen cities east of Vanta Bay share this three-level
layout, with their own districts, weather, palettes, and connectors.
Pedestrian footbridges join the elevated decks to tower entrances. In Vanta Bay,
the 40 m Skytrain runs southwest of the plaza above the downtown monorail.

Autopilot rides each city in one continuous pass, with no dead ends and no
turning back: up the spiral ramp to Sky Avenues, up the helix, once round the
Crown Ring (a one-way loop that carries Crown Way back to the top of the helix),
down the helix and along the deck, down the other ramp, and out along the
Harbour Loop (which carries the street below the down ramp on to the city's far
column and the road to the next city). It goes as far as Storm Citadel, then
cruises back along the avenues to Vanta Bay. In manual mode, follow the signed road branches to
climb from Street or descend from Sky Avenues. The helix runs both ways.
In Vanta Bay, the signed Tower Lift branches off the south end of Street and
Sky Avenues. Drive to the gate to call it and roll aboard. With autopilot on,
press `E` in Vanta Bay to route to the lift.

Use `index.html?loop` to revisit the 30-district visual comparison route.

## Layout

| File | Role |
|---|---|
| `map.js`, `map-drive.js` | Define the city and connector lane graphs, manual road surfaces, and tour itinerary |
| `map-city.js`, `map-bridge.js`, `map-dressing.js` | Stream roads and buildings by map position and draw the districts, decks, and connector scenery |
| `map-lift.js`, `map-lift-view.js` | Queue, move, and display Vanta Bay's drive-on tower lift |
| `world.js`, `road.js` | Supply the reference palette and art data and generate the comparison loop |
| `city.js` | Stream the road, buildings, and district art in 64-segment chunks |
| `facade.glsl.js`, `shaders.js` | Paint the building walls, billboards, roofs, street surfaces, and glass decks |
| `dressing.js`, `props.js`, `effects.js` | Place and shade district landmarks, structures, lights, and animated props |
| `sim.js`, `traffic.js`, `signals.js` | Update driving, weather state, traffic, pedestrians, and signals |
| `camera.js`, `cycle.js`, `cockpit.js`, `cycle-design.js` | Frame the shots and render the light cycle, rider, and cockpit with a shared palette and instrument layout |
| `sky.js`, `weather.js`, `overlay.js` | Draw the panorama, sky effects, and weather on the art grid |
| `main.js`, `glow.js` | Render the city and the depth-aware road surface and glow passes, then compose the banked scene and foreground |

## Controls

`←` `→` steer · `↑` gas · `↓` brake · `A` autopilot · `V` cruise speed ·
`R` or `W` weather · `L` headlight · `C` camera · `H` hints

`C` cycles Cockpit, Chase, Drone, Trackside, and Alongside. Keys `1`–`5`
select those shots directly. Use `6` for orbit or `7` for free flight.
Drag to look and use the wheel to zoom in orbit. Use `WASD` and `QE` to move
in free flight. `F` shows diagnostics and `B` toggles glow for comparison.

In the mapped cities, manual mode steers freely. The arrows turn the bike anywhere on the
road surfaces, junctions and the plaza ring. Hands off the arrows, the bike settles
into the road's direction. Deck edges, bore walls and the plaza's centre are walls
you slide along. Turn around wherever there is room. Autopilot drives the lane
graph; switching back to it snaps you onto the nearest lane going your way.

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

**Cockpit** — in the mapped game, camera 1 shows the light cycle's graphite cowl,
cyan edge lighting, armored gloves, and built-in instruments. The comparison
loop retains the reference dome rim, smoked glass, and floating readout.

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
