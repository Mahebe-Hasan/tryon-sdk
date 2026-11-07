# Changelog

## [0.1.0] — 2026-11-08 — First embeddable release (Lushé integration)

- Version 0.1.0 for self-hosting on a shop: `dist/tryon.esm.js` + `dist/models/` + `dist/wasm/`
  (+ `dist/types/`). The first integration is lushe.beauty product pages (Try it on).

## [0.0.10] — 2026-11-08 — Face-shape placement, concealer types, true shades, compare slider

- **Face-shape detection** (`tracking/faceShape.ts`): oval, round, square, oblong, heart,
  diamond, triangle. Measures face length, forehead, cheekbone and jaw widths and the jaw angle
  (frontal frames only, voted over ~90 frames). Prototypes were fitted on 21 labelled reference
  faces (a contour chart and photos): 14/15 usable samples correct. The detected shape is shown,
  and the user can override it (`FaceView.setFaceShape`, `'face-shape'` event).
- **Placement by face shape** (`render/placements.ts`), following makeup-artist charts. Round:
  contour temples and the sides of the face, vertical blush, highlight down the centre. Oblong:
  contour hairline and under the chin, horizontal blush, highlight across the cheekbones.
  Square: contour temples and jaw corners. Heart: blush on the apples, highlight the chin. And
  so on. New zones: temples, hairline, face sides, jaw corners, under the chin, centre
  forehead, under-eye triangles, chin, vertical blush.
- **Blended, never stripes:** zones are tapered strokes (wide where the product sits, thinning
  as it blends out), then feathered. Products layer on top of each other instead of replacing.
- **Concealer types** (standard colour theory): cover (own shade, more on darker spots),
  brighten (lighter shade on the high points), peach corrector (cancels blue-purple dark
  circles), green corrector (neutralises redness only where skin is redder than average).
- **True shades in every light:** product colours no longer follow the room light
  (`RENDER_CONFIG.productSceneLight = 0`). Texture and shading still come from the real image.
- **Before/after slider** (`FaceView.setCompare`): off by default, with a camera button.
  Left of the line = before, right = after. Drag fully left for makeup on the whole face.
  Works with mirrored front cameras and cropped (object-fit: cover) video. The split is done in
  the final GPU pass using the same frame.
- Dev server: watch `src/sdk` and reload on shader edits (`?raw` .glsl imports were served
  stale, which hid a bug during local checks).

## [0.0.9] — 2026-11-08 — Face makeup realism fixes (from phone testing)

- **Fixed: muddy/olive concealer (and wrong colours on small regions).** The region's mean
  skin colour was stored in 8-bit textures; for small or split regions (two under-eye
  crescents, two cheeks, eyelids) most precision was lost and the colour channels became
  garbage. Stats now use half-float textures (with an 8-bit fallback) and are sampled per
  shape. Synthetic check: concealer now brightens the under-eye L* 50.5 → 67.9 toward the
  shade with neutral colour, identically on both eyes.
- **Foundation, skin tint and concealer apply to skin only.** Pixels far darker than the skin
  (beard, stubble, nostrils, hair) get progressively less product. Check: beard hairs ΔE 0,
  shadowed skin still fully covered (ΔE 11.8 vs 11.2 on normal skin). Coverage lowered
  slightly (foundation 0.5, tint 0.25, concealer 0.55, softer edges).
- **Eyes stay clean.** Eyeshadow and concealer feather softly, then the eye opening is cut out
  with a crisp edge. Blended upward and crisp at the lash line; eye whites and iris unchanged.
- **Blush styles** (`Product.style`): lifted (apple → temple, default), draped (cheekbone →
  temple → outer brow), sun-kissed (across cheeks and nose bridge), apples (soft oval).
  Replaces the blurred circle.
- **Less fake, less strong:** contour is a soft shadow (density 0.38 → 0.22), bronzer 0.3 → 0.2,
  eyeshadow lid 0.62 → 0.5 / crease 0.4 → 0.3, highlighter is mostly finish shine
  (glow 0.2 → 0.07), and shimmer particles are fainter and only glint where light falls.
- Demo: Style picker for blush.

## [0.0.8] — 2026-11-08 — Phase 4: Face makeup + eyeshadow

Foundation, skin tint, concealer, blush, bronzer, contour, highlighter and eyeshadow, built
on the same research as lipstick (no blend modes; lit by the measured scene light).

- **Coverage technique** (foundation, skin tint, concealer): the face's mean colour moves
  toward the shade by the product's coverage, blotchiness and redness are evened out, the
  face's light and shadow are kept, fine detail is softened slightly, and the finish
  (matte/natural/dewy) reshapes the shine. A wide soft edge means no line at the hairline or jaw.
- **Thin-layer technique** (blush, bronzer, contour, eyeshadow, highlighter): Kubelka-Munk
  thin film. Pixels are multiplied in linear light by (product ÷ own skin)^density, so
  texture and shading survive and blush reads as a natural flush. Highlighter adds light.
- Eyeshadow zones (lid, crease, outer V) interpolated between the lash line and the brow;
  one shade or up to three tones.
- `Product` / `FaceView.setProducts()`: any mix of lip, face and eye products forms a look,
  drawn in realistic order. `finishesFor()`, `productEffects()`, `lookEffects()`.
- Demo: "Build a look" panel with grouped products, invented shades (8 skin tones, blush,
  bronzer, contour, highlighter, eyeshadow, lips), finish, intensity, removable chips and
  before/after.
- Measured on synthetic skin: foundation evens redness by half while keeping shading;
  natural blush flush ≈ +12 a* fading smoothly to 0; highlighter +8 L*. See
  docs/RENDERING_RESEARCH.md.

## [0.0.7] — 2026-11-07 — Lipstick lit by the room's light (no more glow)

Testing showed lipstick "glowing" in a dim room, like a screen/overlay layer: the shade was
applied at its daylight brightness while the face was dim.

- **Scene light from the whites of the eyes** (`tracking/light.ts`): every few frames the
  sclera is sampled, the brightest region averaged, and compared with the measured reference
  sclera colour from Choi et al. 2017 (sRGB 0.70/0.59/0.54). This gives per-channel scene light
  (exposure + colour) that doesn't depend on skin tone. Smoothed, skipped while blinking,
  white-balance swings limited.
- The product colour is multiplied by that light (linear RGB) before the pigment transfer, so
  lipstick darkens and warms with the room exactly like real makeup. Lip-based brightness
  adaptation is removed (lip lightness varies too much between people).
- Debug HUD shows the measured light.
- Measured on a synthetic dim warm room: light estimate within 0.007 of the truth; lip colour
  ΔE 21 → 1.0 vs a physically lit real lipstick.

## [0.0.6] — 2026-11-07 — Research-based lipstick rendering, product recipes

Researched how commercial try-on renders makeup (Shiseido and L'Oréal patents, Amazon's
LipAT paper, a "virtual face chart" patent, NYCU's measured Kubelka-Munk cosmetics, and the
Perfect Corp / ModiFace / Banuba products). Findings and recipes are in
`docs/RENDERING_RESEARCH.md`.

- **No more user-facing blend modes.** Products are described by category + shade + finish
  - intensity (`LipProduct`, `FaceView.setLipProducts`). Recipes in `render/recipes.ts` decide
    coverage, texture retention, shine, edges and highlight per category and finish.
- **New `pigment` technique (lipstick industry method):** split diffuse colour and shine;
  shift the lips' mask-weighted mean CIELAB colour to the product colour while keeping
  kL/kC of each pixel's own variation; reshape the shine with LipAT's roughness formula
  (glossy 0.1 … matte 0.7); synthetic wet highlight on the lower lip for glossy finishes;
  screen-blend recombination; sparkle for shimmer/metallic. Replaces the 0.0.5 `tint` mode.
- Lip categories: lipstick, liquid lipstick, lip gloss, lip stain, lip liner. Finishes: matte,
  satin, cream, sheer, gloss, shimmer, metallic.
- CIELAB (D65) conversions on CPU and GPU, CIE76 ΔE, CPU reference functions
  (`pigmentTransfer`, `lipSpecular`) with unit tests.
- Demo: shop-style lip panel (product type, 10 invented shades, finish, intensity,
  before/after). Blend, feather and edge controls removed.
- Measured on synthetic lips: matte lipstick ΔE 3.1, liquid matte ΔE 1.7 from the product
  colour; highlight rises from matte to gloss as expected; shading and lip lines are kept.

## [0.0.5] — 2026-11-07 — Phase 2 fix: lip colour looks on the lips, not over them

Found by reviewing an iPhone recording (29 fps, tracking was aligned): the colour looked like
a flat red sticker — uniform colour, lost lip shading/lines, hard jagged edges, and bleed past
the lip line.

- **New `tint` blend mode** (makeup mode): product colour × (pixel brightness ÷ region mean
  brightness). The region shows the exact shade on average but keeps every bit of its own
  light, shadow, lip lines and highlights. Lip test now uses it.
- **Region brightness measured under the mask**: a stats pass writes (lum·mask, mask) and is
  mipmapped, giving the mask-weighted mean. Before, brightness was sampled at the region's
  bounding-box centre — the dark inside of an open mouth.
- **Inward-only soft edges** (`featherInset`, 0–1): lips fade inside their outline, so
  nothing bleeds onto skin or teeth. Every mask is now anti-aliased (`minFeatherTexels`).
- **Curved lip outlines**: MediaPipe's 20-point lip loops are smoothed with a centripetal
  Catmull-Rom spline (`REGION_CONFIG.lipCurveSubdivisions`), removing visible straight
  segments.
- Demo: "Edge inset" slider; Canvas 2D fallback maps `tint` to `color`.

## [0.0.4] — 2026-11-07 — Phase 2 fix: makeup sticks to moving lips

- **Same-frame rendering:** the renderer now snapshots the camera frame (`captureFrame`)
  immediately before detection runs on it, then draws the makeup on that snapshot. Before,
  the video could advance to the next frame during detection, so makeup was drawn on a
  newer image than its landmarks and trailed the lips by a frame.
- **Lower-lag smoothing:** One Euro defaults changed from minCutoff 1.5 / beta 20 / dCutoff 1
  to 1.5 / 150 / 4. In simulation a fast mouth opening trailed by up to 25% of the movement;
  now ~5%, while still removing ~30% of still-face jitter. Locked in by unit tests.
- Debug HUD: `dCutoff` slider added and `beta` range widened (0–400); `?dCutoff=` URL param.

## [0.0.3] — 2026-11-07 — Phase 2: Render engine

- WebGL2 pipeline (`src/sdk/render/renderer.ts`): video uploaded as a mipmapped texture;
  per effect, region shapes are triangulated (earcut for polygons with holes, quads + round
  joins for strokes, fans for circles), rasterised into a half-resolution mask (MAX blending,
  stencil clipping for the iris), feathered with a separable Gaussian blur, then composited.
- Blend modes in GLSL: normal, multiply, screen, overlay, soft-light, color (W3C formulas,
  mirrored by CPU reference functions in `color.ts`).
- Finishes: matte, satin, cream, gloss, shimmer, metallic. Gloss builds a white specular
  layer from the frame's own bright spots (so highlights move with the light). Shimmer adds a
  twinkling sparkle anchored to the face. Every finish keeps skin and lip texture via a
  high-pass detail layer. Strengths live in `FINISH_PRESETS` / `RENDER_CONFIG`.
- Lighting adaptation: each effect samples the region's average brightness from a coarse mip
  level and scales the shade toward the scene (per-blend-mode strength in config).
- Canvas 2D fallback (`fallback2d.ts`): polygon fill + `globalCompositeOperation`, feathering
  faked by drawing the mask at low resolution and scaling it up. Used automatically without
  WebGL2 or after a WebGL context loss; force it with `?renderer=2d`.
- `FaceView.setEffects()` applies colour effects to named face regions; feather scales with
  face width.
- Demo: "Test effect" panel (region, colour, blend, finish, opacity, feather), defaulting to a
  ruby lip colour.
- Unit tests for hex/sRGB/linear conversion, all blend functions, triangulation, strokes,
  circles, bounding boxes and the face-space transform.

## [0.0.2] — 2026-11-07 — Phase 1: Camera and face tracking

- Camera module: front/back switch, iOS-safe `<video>` (playsinline/muted/autoplay), and clear
  states for asking, denied (with iOS/Android/desktop instructions + "Use a photo instead"),
  no camera, in use, insecure and unsupported. The camera stops when the tab is hidden and
  resumes when it comes back.
- FaceLandmarker wrapper: self-hosted model (`public/models/`) and wasm (`public/wasm/`,
  copied on `npm install`), GPU delegate with CPU fallback, detection on a ≤640 px
  downscaled frame, blendshapes on. The model downloads while the permission prompt is open,
  with a progress bar.
- One Euro landmark smoothing (`minCutoff`/`beta` configurable) and a 150 ms fade when
  the face is lost or found.
- Face regions from plan §5.3 (`src/sdk/tracking/regions.ts`): lips (outer minus inner),
  lip line, face skin, under-eye, cheeks, contour, highlight, eyelid, lash line, liner
  wing, waterline, brows, iris (clipped by the eyelids). Sizes live in `REGION_CONFIG`.
- `?debug=1` HUD: fps, detect/draw timings, delegate, video/detect sizes, blink and jaw
  blendshapes, and toggles for landmarks, regions and landmark index numbers, plus live
  smoothing sliders. URL shortcuts: `regions=1`, `ids=1`, `minCutoff=`, `beta=`, `detect=`.
- CI: GitHub Actions updated to their latest major versions and Node 24.

## [0.0.1] — 2026-11-07 — Phase 0: Project setup

- Vite + TypeScript (strict) project with ESLint, Prettier and Vitest.
- Two build configs: demo site (`vite.config.ts` → `dist-demo/`) and SDK library
  (`vite.sdk.config.ts` → `dist/tryon.esm.js`, `dist/tryon.iife.js`, `dist/types/`).
- "Hello TryOn" demo page that checks HTTPS, camera API and WebGL2 support and shows the
  privacy statement.
- GitHub Actions workflow: lint, typecheck, test, build, deploy demo to GitHub Pages on push
  to `main`.
- README, proprietary LICENSE, THIRD_PARTY_LICENSES.md, CLAUDE.md project rules.
