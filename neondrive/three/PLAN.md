# Neon Drive 3D: the city-map plan (future)

The ambitious, long-term version: a real city you can drive anywhere, built on this three.js build.
Nothing gets built until the user says so. The plan for the current game is in [`../IDEAS.md`](../IDEAS.md).

## Top priority: the GPU version's look, ported faithfully

The aesthetic and art of `../neondrive-gpu.html` is the reference. The three.js version must look like it, not like
a generic 3D city. Every step of this project is judged against the GPU version side by side. What to carry over:

- **Pixel-art finish:** a small render buffer scaled up with nearest-neighbour, whole-number pixel scaling sized by
  the shorter side, crisp on Retina and ultrawide. HD detail always, no toggle.
- **Building faces:** the GPU facade formulas (`wallTex`, billboards, storeys, bays, lit windows, shopfronts, crown
  bands, blade signs, flicker), detail kept at every distance with no pop-in.
- **Rooftops:** parapets, gardens, solar panels, AC units, glowing pools, helipads, masts.
- **The finish shader:** glow, wet-road reflections smearing neon down the tarmac, the lean rolling the view.
- **Colour:** each city's sky, fog, window and neon palettes; the day-night tint (dusk, deep night, pre-dawn glow).
- **District dressing:** every district's props exactly as drawn in the GPU version (lanterns, torii, laundry,
  containers, cranes, coral, waterfalls, ferris wheel, tesla coils...).
- **Weather and sky:** the GPU version's rain, snow, sand, petals, ash, bubbles, fireflies, lightning, fireworks,
  aurora, mountains, shimmer.
- **The light cycle and cockpit:** the GPU version's bike, rider, cockpit and camera shots.

Rule: port the look first, then add the city map. If a 3D shortcut looks worse than the GPU version, it's not done.

### Visual port and comparison

The three.js renderer uses the reference pixel grid, facade and roof formulas, stepped radial lights,
horizon reflections, panoramic sky, and art-grid weather and cockpit layers. The reference rider and five
shots are available alongside free flight for inspection. The district art sits in world space on streamed
meshes. Side-by-side captures cover all 30 districts and connector types, plus desktop, portrait, and Retina
ultrawide viewports. The geometry and animation can differ in small details between the two renderers.

### First city map

Vanta Bay is the first free-driving city and the default entry point. An east–west boulevard reaches
Prism Plaza and its holographic fountain. Four blocks connect to the plaza by side streets. The initial
map had one ramp to a deck with a turnaround at the skyline outlook.

The rider, traffic, and autopilot share lane positions and junction paths. The renderer streams roads,
buildings, and street furniture by map area.
The reference comparison loop remains available at `index.html?loop`.

## Stacked city levels

The Street-to-Sky slice is ready for review. Crown and the lift follow a later review.

### First slice

- Build one Sky Avenue stretch at 35 m over a busy street. Verify gloom from below and moving street traffic
  from above. Keep the through lanes open on both levels at each branch.
- Build one up ramp and one down ramp with the reference's lit chevron bore. The rider, traffic and autopilot
  use the same exits and merges. Aim for 16 m of road per metre climbed, about 560 m at this height.
  Use a spiral around a tower where the available footprint calls for it.
- Give autopilot long stretches on each level before a change, matching the pacing of the reference.
- Report measured fps, viewport, and hardware or renderer at the slice review. The full build targets 60 fps
  with all three levels visible. The slice can measure the view with two levels visible.

The two spiral ramps are 572 m each, with a 6.82% peak grade. Manual driving, traffic, and autopilot
completed both ramp merges in simulation. The guided route covered at least 2.3 km between level arrivals.
Five-second Chrome samples at 1100 × 720, 1×, on Apple M1 with Metal averaged 60 fps from the street,
59 fps from Sky Avenues with the street visible, and 60 fps in the bore. The 95th percentile frame time
was at most 16.8 ms in those samples. The three-level target remains to be tested.

### What the comparison showed

| Cue | GPU reference and three.js comparison loop | Vanta Bay before the slice |
| --- | --- | --- |
| Streets below | The GPU draws a lit lower street and moving headlights and taillights. The three.js loop reproduces the drop through the glass decks with a lower ribbon and animated light meshes. The lower activity follows the main route's scenery. | The elevated spur has rails, lamps, ground columns, and routed vehicles. It sits near the edge of the street grid, with little active street directly below it. There is no Crown road. |
| Roads and bridges above | Overhead crossings and lit skywalks frame the street and Sky Avenues. The loop carries over these pieces and derives gloom from the route's layer flags. | The map has no sustained street run under a deck or network of tower-to-tower crossings. Mapped climate receives no cover information. |
| Changes of level | The GPU and loop ease the height of one continuous driven route. The lit ramp portals, bore panels and chevrons establish the visual target. | A real side branch climbs from the street, in the open, to a two-way spur with an outlook turnaround. There is no upper through route to merge onto and no second climb. |
| Tower access | The facade shader can already draw illuminated bands at upper levels. The reference frames these through glass roads and crossings. | Upper facade bands are decorative. The decks lack physical connections to named tower entrances, signs and pedestrian paths. |
| Arrival and onward travel | The loop and reference announce stable level arrivals and carry the source city's last level through its connector. The sky already reveals more stars with altitude. | The HUD infers only Street or Sky Avenues from height and shows road names. The map has no level-arrival banners or intercity exits. |

The matched Vanta Bay cockpit frames show the street canyon, the Glass Spires crossing with a lit road below, and
the Arcade Row rooftop view. The matched Mirage Bazaar bore frames show the existing three.js panels and chevrons.
Use these shots as the visual baseline when replacing scenery with connected geometry.

### Later build after slice review

1. **Connect three lane graphs.** Keep the street grid and Prism Plaza at 0 m. Run a sparser Sky Avenues circuit
   at 35 m over occupied blocks, then a shorter Crown through route at 100 m between the upper stories of a
   district of 150–250 m towers. Current inner towers are 23–80 m. Author
   overlaps and open sightlines so riders can see other levels from each route. Give nodes an explicit city
   and level. Roads crossing in plan view remain separate unless a graph edge connects them. Share the same
   3D paths between road meshes, rider, traffic, and autopilot.
2. **Build side exits and merges.** Extend the first ramp into a side exit from a continuing street lane and
   a merge beside a continuing Sky Avenue lane. Add the equivalent connection between Sky Avenues and Crown,
   with routes in both directions, allowing about 1 km of road for the 65 m climb. Keep stretches of the old
   deck in view from the ramp before the lit chevron bore and after its exit. Reuse the loop's portal and bore
   art. Give ramp edges explicit endpoints,
   paths and merge priority, and check grade, curvature and vertical clearance along the whole path. Add one
   drive-on tower lift once the ramp routes work. A lift edge connects fixed landing nodes and provides door,
   boarding and waiting state to the same router.
3. **Make the decks part of the city.** Stream visible road, sidewalk, and skywalk meshes at all three heights
   by map area, keeping vehicle and pedestrian state independent of mesh loads. Use deck undersides, crossbeams
   and columns anchored to the ground or hangers anchored to towers. Place doors, signs, and lights at street,
   Sky Avenues and Crown entrances on the same full-height towers. Connect sidewalks and footbridges to those
   entrances. Use deck gaps and glass panels to keep lower streets and sidewalks legible from above.
4. **Run each level and preserve the atmosphere.** Give each level its own routed traffic and pedestrian paths
   with visible lights. Give Crown about one fifth of the car density of the busier levels. Share junction and
   merge rules between traffic and the rider, with occupancy tied to graph paths and height so roads stacked
   above one another can operate independently. Drive gloom and weather
   shelter from actual overhead deck and bore coverage, with gradual changes at the edges. Keep the existing
   altitude-based starfield and city lighting. Announce a level once the rider reaches its through lanes or exits
   a lift, for example `▲ LEVEL 2 · SKY AVENUES`. Use the destination level from the graph for the announcement.
5. **Extend the tour.** Use the Vanta Bay implementation as the first complete example. Give every mapped city
   all three levels with drivable paths between them. Lay out the guided itinerary to visit all three before
   leaving. Start each city's outgoing link at its last ridden level and align the receiving portal to that
   elevation. Any climb or descent needed for that handoff happens on the connected graph. Keep the comparison
   loop available as cities move onto the map.

### Review in motion

- Compare fixed cockpit and chase shots against the GPU reference after each visual pass. Check street gloom
  under a deck, a Sky Avenue with a busy street below and a Crown crossing above, both lower levels in a Crown
  view, tower entrances, and the portal, middle and exit of a ramp bore.
- Ride straight past each branch, then take it in both directions. Watch traffic follow the old route and merge
  on the destination deck, and verify riders at different heights can pass through the same map coordinates.
  Verify lift boarding and release and watch pedestrians cross the skywalks into tower entrances.
- Run autopilot through all three levels. Check a single banner on each arrival, street-to-crown star density,
  weather shelter under real cover, and the last level and portal height on each intercity link as cities are
  added. Run the checks from the static server using the default map and `?loop`.

## Map life port (in progress, one piece at a time)

The comparison loop (`?loop`) has the reference's street life; the Vanta Bay map so far has only cars. Port it onto
the map in this order, one commit each. Whoever picks this up: tick the box, add a line under it, commit.

- [x] **1. Traffic lights at map junctions.** Street-level junctions with three or more roads (not the plaza ring,
  not ramp nodes) get the reference cycle: 30 s period, each axis 12 s green, 3 s amber, 15 s red, axes opposite,
  random offset per junction. Traffic and autopilot stop at the stop line on red and on amber when not already
  close; the manual rider can run them. `S.waitLight` (cockpit `RED`) only for autopilot held by a real red.
  Masts and lit heads on each approach, as `signals.js` draws them in the loop. Code: `map-signals.js`.
  Done: six junctions (west, east, north, northeast, south, southeast). Amber stops a car only if more than 20 m
  from the line, as the reference. Headless 4-min autopilot run: 169 junction entries, 0 on red, autopilot held
  at red 6 times (longest 11.8 s), no gridlock. Masts render over the boulevard with lit heads.
  Next: item 2. Stop lines sit at each node's `trim`; put the zebra between the stop line and the junction disc.
- [ ] **2. Zebra crossings and pedestrians crossing on red.** Painted crossings on each signalled approach;
  people cross while their road is red, as `crossersRaw` does in the reference (umbrellas in rain). Traffic waits
  for them; hitting one stops the rider dead.
- [ ] **3. Sidewalk pedestrians** walking the map's sidewalks and skywalks (the loop's crowd art).
- [ ] **4. Hover cars and air-lane gates** over the map's main avenues.
- [ ] **5. Monorail / skytrain** on a fixed loop over Vanta Bay.
- [ ] Then: Crown level and lift (see "Later build" above), district looks per neighbourhood, more cities.

## Driving feel

Done first, without a structural change:

- **Red lights.** Vanta Bay has no traffic signals, so the cockpit no longer shows `RED`. A manual rider ignores
  junction reservations and blocked-exit holds and rides straight in; it still stops behind a real vehicle in its
  lane. Traffic and autopilot keep reserving junctions, and a rider who takes a junction is never overwritten.
- **Smooth curves and lean.** `frameOn` turns the heading continuously through path joints instead of jumping
  per segment. The lean uses a smoothed turn rate (sideways acceleration over gravity) plus the rider's own
  steering in manual mode, eased in. Exits are chosen early enough to brake to the turn speed at any cruise
  setting (at least `v² / 14 + 20` m out), so 300 km/h no longer reaches a junction with nowhere to slow down.

### Free steering (built)

Built as below in `map.js` (`SURFACES`, `onSurface`, `nearestOnPath`) and `map-drive.js` (`enterFree`, `stepFree`,
`leaveFree`, `locate`, `project`, `collide`). Where connected surfaces overlap at the same height (a ramp peeling
off its through road, a junction), the rider is on whichever it is most centred on; the height check keeps stacked
levels apart. Hands off the arrows, the heading settles into the road's direction so curves and the spiral ramps
ride without constant tapping. Verified headlessly: boulevard into the plaza and around the ring, out along Arcade
and Foundry streets, U-turns at a junction and a dead end, the full run under the Sky Avenue deck staying at street
level, peeling onto Sky Ramp Up and climbing it, and handing back to autopilot mid-street and mid-ramp (autopilot
then reaches the Sky Avenues with the level banner). Not yet checked by eye in cockpit and chase view.

The design as reviewed:

Today the manual rider is still a graph vehicle: arrows slide it sideways within its lanes, pick an exit in the
last 34 m, and the graph drives the turn. Proposed instead:

1. **The rider becomes a free body in the plane of the road surface.** State: position (x, z), heading, speed,
   current surface. Arrows turn the heading (bicycle model: turn rate from steer × speed / wheelbase, capped by
   grip so the bike can't pivot at 300 km/h). Gas and brake as today. Autopilot keeps driving the graph exactly
   as now; switching to manual hands the graph pose over, switching back snaps to the nearest lane edge.
2. **Surfaces, not lanes, decide where you can ride.** Every road, junction disc, plaza ring and ramp is a
   drivable surface built from the geometry already used for its mesh: a centre path, a half-width (road plus
   sidewalk), and a height along it. Each frame, find the surface under the rider: nearest point on the current
   surface's path; if the rider is outside its half-width, check the surfaces meeting at its end junctions; the
   rider's height comes from the surface it is on. Lookup uses a coarse grid of surfaces by map cell so it is
   cheap at any city size.
3. **Levels stay separate.** A surface belongs to one level (ramps span two). The rider only ever switches to a
   surface that touches the current one at a junction or a ramp end, never to one that merely overlaps in plan
   view, so the street under the Sky Avenue deck and the deck above it never swap.
4. **Edges are walls.** Leaving the drivable width where there is no connecting surface is a barrier: deck edges,
   bore walls, building fronts. Hitting one slides the rider along it, scrubs speed and shakes the view, as the
   reference does at the kerb. Plaza, junction discs and wide boulevards allow U-turns; a one-way ramp can be
   ridden backwards but traffic will be coming.
5. **Traffic still works around you.** The rider gets a projected graph position (nearest edge, distance, lane)
   each frame so traffic can queue behind it and avoid it, and so `S.z`, the zone banners, level announcements,
   gloom and the ramp bores keep working from the same data they use now.
6. **Collisions.** Against vehicles by distance in the plane at matching height (so cars on the street below
   never hit you on the deck), the same rear-end and head-on rules as today.
7. **Review in motion:** turn through every junction both ways by hand, a U-turn on the boulevard and in the
   plaza, ride onto and off both ramps, scrape a deck edge and a bore wall, ride under the deck and confirm the
   rider never jumps levels, then hand back to autopilot mid-street and mid-ramp.

## Why three.js, not the GPU version

- The GPU version (`../neondrive-gpu.html`) draws one road with buildings on its two sides. It cannot show an open
  square with a view in every direction, however it is faked.
- This build renders real meshes and includes a free-fly camera. Weather, traffic, autopilot and the day-night
  cycle are already ported. The comparison loop has the reference's three-level itinerary.
- Vanta Bay uses a fixed graph. The original route generator remains available for visual comparisons.

## What a city map gives that a single road can't

- Wide open squares you can see across
- Side streets with their own traffic and lights, cars crossing in front of you from real roads
- A city that stays put: loop the block and you're back at the same corner
- Landmarks fixed in space, seen from every side
- Real freedom: drive anywhere, get lost, find your way back

## City layout

- **Main boulevard (spine):** wide, 6-8 lanes, central median with holo trees, crosses the whole city end to end.
- **Central plaza:** a huge open square at the heart, a hero monument in the middle (giant hologram, fountain of
  light), the roads circling it as a roundabout. Wide view of the whole skyline.
- **Ring road:** an elevated loop around downtown at sky-avenue height; the city seen from outside.
- **Neighbourhoods:** market alleys (narrow, crowded), glass spires (wide avenues), docks on the water edge, a canal
  quarter with bridges, an arcade strip.
- **Vertical layers stay:** a dense street grid, sky avenues as a sparser grid of decks, crown as a few highways
  between tower tops. Spiral ramps and lifts connect them at fixed spots.
- **Waterfront promenade:** the city edge opens onto the sea or a canyon: the widest view of all.
- **Highways out:** each city's exits lead to the links (skybridge, aqua tube, vactrain) to the next city.

## What has to change

- **World:** a road graph (streets, junctions, plazas, ramps) and city blocks instead of one looping road.
- **Streaming:** load chunks by map area around the rider, not by distance along a road.
- **Traffic:** cars route through the graph and turn at junctions.
- **Autopilot:** plans a route (wander, or head for a landmark).
- **Content:** every district, connector, level and weather effect moved onto the map.

## Rough path

1. Keep the GPU version as the finished, polished game.
2. Port the GPU version's look into this build first, checked side by side, until they match.
3. Then make **one city** on the map: boulevard, central plaza, a few blocks around it, one ramp to the sky decks.
4. Build and verify the three-level network in Vanta Bay.
5. Then add more cities and the links between them.

The visual port, first Vanta Bay map, and Street-to-Sky slice are implemented. The slice is awaiting review.
