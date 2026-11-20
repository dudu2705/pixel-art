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
Prism Plaza and its holographic fountain. Four blocks connect to the plaza by side streets. One graded
ramp connects Sky Avenue to the deck at 35 metres, with a turnaround at the skyline outlook.

The layout contains 20 road surfaces and 36 directed edges. The rider, traffic, and autopilot share lane
positions and junction paths. The renderer streams roads, buildings, and street furniture by map area.
The reference comparison loop remains available at `index.html?loop`.

## Stacked city levels

Approved for the Street-to-Sky slice. Stop for review after the slice before building Crown or a lift.

### First slice

- Build one Sky Avenue stretch at 35 m over a busy street. Verify gloom from below and moving street traffic
  from above. Keep the through lanes open on both levels at each branch.
- Build one up ramp and one down ramp with the reference's lit chevron bore. The rider, traffic and autopilot
  use the same exits and merges. Aim for 16 m of road per metre climbed, about 560 m at this height.
  Use a spiral around a tower where the available footprint calls for it.
- Give autopilot long stretches on each level before a change, matching the pacing of the reference.
- Report measured fps, viewport, and hardware or renderer at the slice review. The full build targets 60 fps
  with all three levels visible. The slice can measure the view with two levels visible.

### What the comparison showed

| Cue | GPU reference and three.js comparison loop | Playable Vanta Bay map |
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
   with routes in both directions, allowing about 1 km of road for the 65 m climb. Keep stretches of the old deck in view from the ramp before the lit
   chevron bore and after its exit. Reuse the loop's portal and bore art. Give ramp edges explicit endpoints,
   paths and merge priority, and check grade, curvature and vertical clearance along the whole path. Add one
   drive-on tower lift once the ramp routes work. A lift edge connects fixed landing nodes and provides door,
   boarding and waiting state to the same router.
3. **Make the decks part of the city.** Stream visible road, sidewalk, and skywalk meshes at all three heights
   by map area, keeping vehicle and pedestrian state independent of mesh loads. Use deck undersides, crossbeams
   and columns anchored to the ground or hangers anchored to towers. Place doors, signs, and lights at street,
   Sky Avenues and Crown entrances on the same full-height towers. Connect sidewalks and footbridges to those
   entrances. Use deck gaps and glass panels to keep lower streets and sidewalks legible from above.
4. **Run each level and preserve the atmosphere.** Give each level its own routed traffic and pedestrian paths
   with visible lights. Give Crown about one fifth of the car density of the busier levels. Share junction and merge rules between traffic and the rider, with occupancy tied to
   graph paths and height so roads stacked above one another can operate independently. Drive gloom and weather
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

The visual port and first Vanta Bay map are implemented. The Street-to-Sky slice is approved for implementation.
