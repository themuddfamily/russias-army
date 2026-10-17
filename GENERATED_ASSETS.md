# Generated visual asset pack

All images in `public/assets/generated/` were created with the built-in image-generation workflow. Transparent PNGs were generated against `#00ff00`, processed with the imagegen skill's chroma-removal helper using a soft matte and despill, and checked for transparent corners and green contamination.

## Screen art prompts

### Menu backdrop

```text
Use case: stylized-concept
Asset type: game main-menu backdrop, 16:10 landscape
Primary request: a bleak overcast winter military compound in remote Russia, visually compatible with an existing low-poly first-person game
Scene/backdrop: chalky snow yard, weathered concrete perimeter, one austere guard tower, a long warehouse or barracks, sparse angular conifers fading into cold haze
Subject: a single small distant military cargo truck or solitary soldier, used only as a quiet scale cue
Style/medium: polished low-poly 3D environment render with restrained stylized realism; clean faceted geometry; tactile but simplified materials; unmistakably game-ready rather than photographic or painterly
Composition/framing: wide 16:10 establishing view at eye level; keep the entire left 45% dark, quiet, uncluttered, low-detail negative space suitable for a large title and menu; group the guard tower, warehouse, and the single distant truck or soldier within the right 55%; broad calm shapes, no close foreground obstruction
Lighting/mood: heavy overcast late afternoon, cold and silent, faint snow haze, subdued contrast, sparse dim amber window light only
Color palette: cool blue-gray sky and shadows, chalk-white snow, oxidized military green, weathered dark red siding, charcoal concrete and metal, tiny restrained amber window accents
Materials/textures: wind-brushed snow, worn concrete, oxidized painted steel, aged timber and corrugated siding, all simplified to match low-poly game screenshots
Constraints: preserve strong readability under dark UI overlays; one truck OR one soldier maximum; no active combat; no flags; no readable signage; no text; no letters; no logos; no watermark
Avoid: photorealism, painterly brushwork, glossy surfaces, heroic propaganda pose, crowds, weapons pointed at camera, explosions, dramatic sunlight, saturated colors, decorative borders
```

### Loading backdrop

```text
Use case: stylized-concept
Asset type: game loading-screen backdrop, 16:10 landscape
Primary request: an extremely restrained close, abstract view of winter military concrete and frost, designed to sit behind a centered loading indicator
Scene/backdrop: near-black weathered poured concrete slab with shallow panel seams, frozen condensation, faint windblown frost and sparse chalky snow abrasion
Subject: material and atmosphere only; no people, no vehicles, no buildings, no objects
Style/medium: polished low-poly game environment material render with subtle faceted planes and simplified tactile surface detail; restrained stylized realism, not a photograph and not painterly
Composition/framing: flat frontal close view; 16:10 landscape; center 45% especially quiet, empty, dark and low contrast for a loader; any seam or frost accumulation pushed softly toward the outer edges; no obvious focal object
Lighting/mood: extremely dim diffuse overcast light, cold, still, austere, hushed
Color palette: near-black charcoal, cool blue-gray, desaturated concrete gray, traces of chalk-white frost, one or two nearly imperceptible oxidized green undertones; no bright accents
Materials/textures: weathered concrete pores simplified into broad low-poly tonal planes, ice bloom, feathered frost, hairline cracks, subtle damp stains
Constraints: seamless-feeling full-frame background; dark enough for off-white and restrained red UI; quiet empty center; no text; no letters; no numerals; no logos; no watermark
Avoid: objects, icons, stars, emblems, dramatic cracks, high-frequency noise, vignette ring, tunnel effect, bright snowfield, photorealistic macro photography, cinematic spotlight, saturated color
```

### Loading emblem

```text
Use case: stylized-concept
Asset type: transparent-ready game loading emblem source
Primary request: a simple original weathered five-point military star held inside a restrained constructivist circular mechanical device
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for background removal
Subject: one centered symmetric emblem: bold five-point star in warm off-white enamel; a modest deep weathered-red inset accent on the star; surrounded by two or three clean concentric off-white/charcoal metal rings with sparse radial braces and small rectangular breaks, evoking a utilitarian constructivist instrument dial without copying any real insignia
Style/medium: crisp front-facing painted game UI emblem; simplified low-poly/graphic 3D relief; strong silhouette; lightly chipped paint and controlled wear; production-ready icon
Composition/framing: exact orthographic front view; emblem centered; occupies about 66% of the square canvas; generous equal padding on every side; all parts connected into one compact device; no perspective tilt
Lighting/mood: restrained soft frontal light on the emblem only; edges clean and clearly separated from background
Color palette: warm off-white, charcoal gunmetal, small weathered dark red accent; do not use any green in the subject
Materials/textures: matte painted metal, subtly chipped enamel, very sparse abrasion
Constraints: background is one uniform flat #00ff00 with no shadows, gradients, texture, reflections, floor plane, halo, or lighting variation; crisp silhouette; no cast or contact shadow; no reflection; no letters, words, numerals, logos, or watermark; original non-branded design
Avoid: hammer and sickle, eagles, flags, medals, ribbons, wreaths, skulls, bullets, weapons, readable text, photorealistic product staging, green spill, green details, disconnected fragments
```

## Arena material prompt set

Shared prompt:

```text
Use case: stylized-concept. Asset type: tileable game texture, albedo/base-color map. The entire square image is one continuous, fully opaque material surface, filling every pixel and all four corners edge-to-edge. Production-ready stylized realism for a bleak low-poly winter military compound, with believable scale/wear and slightly simplified game-art readability. Perfectly flat front-on/top-down orthographic plane, no perspective; uniform density; repeat-friendly pattern; balanced macro/mid/micro detail; no obvious central focal feature. Even neutral overcast illumination; pure diffuse albedo appearance. No isolated/circular swatch, torn edge, floating panel, black/transparent background, border/frame, objects, text/logos/watermark, baked directional shadows, AO, glare/highlights/reflections, gradients/vignette, horizon/DOF/perspective/hotspots, large unique feature, obvious repeated motifs, or strong contrast.
```

Material bodies:

- Cracked concrete: cold medium-gray cast concrete; irregular hairline cracks, sparse fractured seams, aggregate, frost abrasion, pore grime; no radial hero crack.
- Icy asphalt: charcoal road aggregate, scattered pale ice glaze, frozen meltwater veins and salt abrasion; no thick snow, reflections, tracks, or single large patch.
- Painted corrugated steel: vertical shallow industrial ridges, faded green-gray paint, dull exposed galvanized scratches and sparse rust; no seams, fasteners, holes, or orange-heavy corrosion.
- Worn wood: broad horizontal gray-brown utilitarian softwood boards, restrained knots/checking and frost bleaching; no nails, piles of snow, central knot, or decorative hardwood.
- Burlap: dense straight coarse jute plain weave, worn fibers and cold damp discoloration; no folds, sack silhouette, fringe, seams, print, or holes.
- Packed snow: wind-packed old snow with crust, granular variation, mineral flecks and shallow non-footprint depressions; no bank edge, tracks, props, sparkle, or deep drift.
- Dark metal: charcoal blued steel with matte coating, rolled grain, fine scuffs, tiny neutral paint nicks and restrained grime; no seams, welds, fasteners, reflections, or large rust.

## Actor material prompt set

Shared prompt:

```text
Stylized-realistic production game albedo for low-poly geometry; edge-to-edge orthographic flat material scan; uniform restrained detail; seamless repeat-friendly edges; exact square 1024x1024; perfectly even neutral illumination; diffuse color only; no objects, perspective, focal feature, text, logos, watermark, borders, directional lighting, shadows, highlights, depth cues, or normal-map shading.
```

Material bodies:

- Blackened gunmetal: charcoal-black blued steel, fine machining grain, rubbed wear and minute neutral speckling.
- Dark molded polymer: injection-molded charcoal polymer, microscopic pebble grain, flow variation and worn smoothing.
- Worn laminated wood: warm birch laminate strips, flowing grain, age-darkening and handling wear.
- Chipped olive paint: muted olive field coating over dark metal with sparse chips and scuffs.
- Winter uniform fabric: muted olive-gray heavy cloth, fine crossed threads, faded fiber variation and cold-weather wear.
- Ballistic armor: olive composite/fabric shell with crosshatch fibers, molding grain and dispersed abrasion.
- Military webbing: coarse olive strap fibers with dense basket weave and field wear.
- Weapon metal: dark blue-black blued steel with linear manufacturing grain and rubbed patina.
- Weathered weapon wood: dark warm hardwood, longitudinal grain, reddish undertone and age-darkened pores.
- Winter skin: generic light-to-medium skin albedo, subtle cold-reddened mottling, pores and wind-chapped variation; no anatomy or facial features.

## Decal prompt set

Shared prompt:

```text
Use case: stylized-concept. Asset type: game decal or effect. Crisp hand-painted realistic game asset; centered with generous padding on a perfectly uniform #00ff00 chroma-key background; isolated subject with crisp edges; no shadows, floor, reflections, text, logos, or watermark; never use green in the subject.
```

Asset bodies:

- Health: one weathered red medical cross device made of thick worn painted-steel segments; no words.
- Armor: one cyan-blue angular steel armor plate/shield with worn paint, chipped edges and rivets; no words.
- Ammo: one squat amber open ammo box with three brass cartridges; no words.
- Bullet: one front-on irregular dark crater, charcoal center, jagged gray-brown chipped rim and short radial fractures.
- Scorch: one front-on irregular black/brown radial soot blast mark, dense painted pigment rather than translucent smoke.
- Bootprint: one top-down winter combat boot sole impression, charcoal-brown compressed soil and dirty snow, rugged tread, toe upward.
- Muzzle flash: one front-on asymmetric white-hot flash with sharp orange/amber petals; no smoke or weapon.
- Crate stamp: one original distressed dark-red/charcoal five-point star with unequal abstract rectangular serial bars; no letters, numbers, or barcode.
- Blank sign: weathered oxblood-red enamel plate filling a wide canvas, chipped steel border, scuffs, grime, subtle star ghosts and an empty center; opaque, with absolutely no lettering.
