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

### First city map proposed for approval

Use Vanta Bay as the first free-driving city. Lay out an east–west boulevard, a plaza loop, and four blocks
connected by side streets. Put a tall holographic fountain at the center and leave a clear view across the
plaza to the skyline. Add one graded ramp to a short sky-avenue deck at 35 metres, with a return connection.

1. Describe the streets as directed lane edges with curved centerlines and named junctions. Connect the
   boulevard, plaza loop, side streets, and ramp in a single graph.
2. Make the rider, traffic, and autopilot share that graph. Traffic follows lanes through junctions, autopilot
   chooses legal routes, and the rider can take turns at junctions while steering manually.
3. Stream road meshes and city blocks by map position. Reuse the visual shaders and district assets for the
   plaza, skyline, and elevated deck.
4. Verify that the rider can circle a block, traffic crosses a junction, and autopilot can route from the
   boulevard to the deck. Compare the plaza and skyline shots with the visual baseline.

## Why three.js, not the GPU version

- The GPU version (`../neondrive-gpu.html`) draws one road with buildings on its two sides. It cannot show an open
  square with a view in every direction, however it is faked.
- This build renders real meshes and includes a free-fly camera. Weather, traffic, autopilot, the three levels,
  and the day-night cycle are already ported.
- It still uses the old one-road generator (`world.js`). The plan is to replace that with a city map and keep the rest.

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
4. Make that one city truly wow before scaling up.
5. Then add more cities and the links between them.

Status: visual port implemented and compared. The city map is pending approval.
