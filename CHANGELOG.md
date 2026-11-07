# Changelog

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
