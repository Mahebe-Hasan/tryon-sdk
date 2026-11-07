# Virtual Try-On SDK — Build Plan (Makeup + Fake Nails)

> **How to use this file:** Put this file in the root of an empty folder, open Claude Code there, and say:
> *"Read virtual-tryon-build-plan.md. Create CLAUDE.md from the 'Project Rules' section, then start Phase 0. Stop after each phase so I can test."*

---

## 1. Project Summary

Build a **browser-based, real-time virtual try-on** for makeup and fake (press-on) nails.
The user opens a product, taps **Try it on**, allows the camera, and sees the product applied live on their face or nails.

- Works in the browser on **Android, iOS (iPhone/iPad), desktop and tablets**. No app, no browser extension.
- Built as a **standalone, embeddable SDK** (one script tag) so it can be added to my own store first and later sold to other brands.
- **Zero cost:** no paid services, no backend, no servers. Everything runs on the user's device.
- Code lives on **GitHub**. Demo and SDK are hosted for free (see Section 9).

Working name: **TryOn** (repo: `tryon-sdk`). Easy to rename later.

### In scope (this build)
| Area | Products |
|---|---|
| Lips | Lipstick (matte, satin, cream, gloss, metallic), liquid lipstick, lip gloss (clear/tinted), lip liner, lip stain/tint |
| Face | Foundation, concealer, blush, bronzer, contour, highlighter |
| Eyes | Eyeshadow (1–3 tones), eyeliner (thin, thick, winged), kajal (waterline), mascara, false lashes, coloured contact lenses |
| Brows | Brow pencil/gel (colour + fill) |
| Nails | Fake/press-on nails: shapes, lengths, colours, finishes, designs |
| Looks | Combining several products into one "full look" |

### Out of scope (later)
Clothing try-on, brand dashboard, accounts, analytics backend, payments, Shopify/WooCommerce plugins.

---

## 2. Project Rules (copy into CLAUDE.md)

1. **No paid services, no backend, no API keys.** Everything runs in the browser. If something seems to need a server, stop and ask me.
2. **Privacy first:** camera frames and photos never leave the device. No uploads, no tracking, no third-party analytics. After the first load, the SDK must not make any network requests except loading its own model and asset files.
3. **Only use dependencies with licenses that allow commercial use** (MIT, Apache-2.0, BSD, ISC). List every dependency and its license in `THIRD_PARTY_LICENSES.md`.
4. **TypeScript, strict mode.** Keep modules small and focused.
5. **Work one phase at a time.** At the end of each phase: run lint, typecheck and tests, commit with a clear message, update `CHANGELOG.md`, then stop and tell me how to test the phase on my phone and laptop.
6. **Mobile is the main target.** Test on mobile-sized viewports first. Keep each frame light enough to run smoothly on mid-range Android phones.
7. **No copyrighted brand assets.** Use invented sample product names and shades and generated nail designs.
8. **Keep the SDK framework-agnostic** (vanilla TS, no React inside the SDK). The demo site may use plain TS too.
9. When unsure about a visual detail, build it with a config value so it can be tuned later instead of hardcoding it.

---

## 3. Tech Stack (all free)

| Purpose | Choice | License |
|---|---|---|
| Language | TypeScript | Apache-2.0 |
| Build / dev server | Vite (library mode for the SDK) | MIT |
| Face tracking | `@mediapipe/tasks-vision` → **FaceLandmarker** (478 landmarks incl. iris, blendshapes) | Apache-2.0 |
| Hand tracking | `@mediapipe/tasks-vision` → **HandLandmarker** (21 landmarks per hand) | Apache-2.0 |
| Rendering | **WebGL2** (custom shaders) with Canvas 2D fallback | — |
| Polygon triangulation | `earcut` | ISC |
| Tests | Vitest (unit), Playwright (smoke) | MIT / Apache-2.0 |
| Lint / format | ESLint + Prettier | MIT |
| Hosting | GitHub Pages or Cloudflare Pages (free) + jsDelivr CDN | free |

**Model and WASM files:** self-host them in `public/models/` and `public/wasm/`. Do not load them from Google's CDN at runtime. This keeps the SDK reliable and private.
- `face_landmarker.task`
- `hand_landmarker.task`
- MediaPipe WASM files, copied from `node_modules/@mediapipe/tasks-vision/wasm`

Re-check the license on the model cards when you download them, and note it in `THIRD_PARTY_LICENSES.md`.

---

## 4. Repository Structure

```
tryon-sdk/
├─ CLAUDE.md
├─ README.md                  # what it is, demo link, quick start
├─ INTEGRATION.md             # how a brand adds it to their site
├─ CHANGELOG.md
├─ THIRD_PARTY_LICENSES.md
├─ LICENSE                    # see Section 9
├─ package.json
├─ vite.config.ts             # demo site build
├─ vite.sdk.config.ts         # SDK library build (ESM + IIFE)
├─ .github/workflows/deploy.yml
├─ public/
│  ├─ models/                 # .task model files
│  ├─ wasm/                   # MediaPipe wasm
│  └─ assets/
│     ├─ lashes/              # false lash PNGs (generated)
│     └─ nails/               # nail design textures (generated)
├─ src/
│  ├─ sdk/
│  │  ├─ index.ts             # public API (TryOn class)
│  │  ├─ types.ts             # Product, Shade, Look, Options
│  │  ├─ catalog.ts           # load + validate product JSON
│  │  ├─ ui/                  # built-in modal UI (optional to use)
│  │  ├─ camera/
│  │  │  ├─ camera.ts         # getUserMedia, switching, permissions
│  │  │  └─ photo.ts          # photo-upload fallback
│  │  ├─ tracking/
│  │  │  ├─ face.ts           # FaceLandmarker wrapper
│  │  │  ├─ hand.ts           # HandLandmarker wrapper
│  │  │  ├─ smoothing.ts      # One Euro filter
│  │  │  └─ regions.ts        # face regions from landmark index sets
│  │  ├─ render/
│  │  │  ├─ renderer.ts       # WebGL2 pipeline
│  │  │  ├─ mask.ts           # polygon → mask texture, feathering
│  │  │  ├─ blend.ts          # blend modes as GLSL
│  │  │  ├─ shaders/          # .glsl files
│  │  │  └─ fallback2d.ts     # Canvas 2D fallback renderer
│  │  ├─ effects/
│  │  │  ├─ lips.ts
│  │  │  ├─ face.ts           # foundation, concealer, blush, bronzer, contour, highlighter
│  │  │  ├─ eyes.ts           # eyeshadow, liner, kajal, mascara, lashes, lenses
│  │  │  ├─ brows.ts
│  │  │  └─ nails.ts
│  │  ├─ capture.ts           # snapshot → PNG Blob
│  │  └─ events.ts
│  └─ demo/
│     ├─ index.html           # demo store
│     ├─ main.ts
│     ├─ products.json        # sample catalogue
│     └─ styles.css
└─ tests/
   ├─ unit/
   └─ e2e/
```

---

## 5. Core Technical Design

### 5.1 Camera
- `getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })`.
- On iOS the `<video>` element must have `playsinline`, `muted` and `autoplay`.
- Mirror the front camera visually, but keep the landmark maths in unmirrored space and mirror only at draw time.
- Camera switch (front/back). The back camera is useful for nails.
- Clear permission states: *asking*, *denied* (show how to enable it, plus a "Use a photo instead" button), *no camera*, *in use by another app*.
- Stop all tracks when the try-on closes or the tab is hidden (`visibilitychange`).
- Requires HTTPS. GitHub/Cloudflare Pages provide it. In local dev, `localhost` counts as secure.

### 5.2 Tracking loop
- Use `requestVideoFrameCallback` when available, falling back to `requestAnimationFrame`.
- Run MediaPipe in `VIDEO` mode with the **GPU delegate**, falling back to CPU if GPU init fails.
- Downscale the detection input (around 480–640 px on the long side) while drawing at full video resolution.
- Smooth landmarks with a **One Euro filter**. Expose `minCutoff` and `beta` in config. The goal is no jitter when still and no lag when moving.
- When the face or hand is lost, fade effects out over about 150 ms instead of popping them off.
- Only load the model a product needs: the face model for makeup, the hand model for nails.

### 5.3 Face regions
Build every region from MediaPipe's exported landmark connection constants (`FaceLandmarker.FACE_LANDMARKS_LIPS`, `..._LEFT_EYE`, `..._RIGHT_EYE`, `..._LEFT_EYEBROW`, `..._RIGHT_EYEBROW`, `..._FACE_OVAL`, `..._LEFT_IRIS`, `..._RIGHT_IRIS`). Convert connection lists into ordered polygon loops. Where no constant exists (cheeks, under-eye, contour zones, eyelid area), define index sets in `regions.ts`, with a debug view to check them visually.

| Region | How |
|---|---|
| Lips | Outer lip loop **minus** inner lip loop (even-odd fill). This keeps teeth and the inside of the mouth clean when the mouth is open. |
| Lip line | Stroke along the outer lip loop |
| Face skin | Face oval minus eyes, brows and lips, with a heavily feathered edge so there's no visible border at the hairline or jaw |
| Under-eye (concealer) | Crescent below each lower eyelid |
| Cheeks (blush) | Radial gradient centred on the cheek apple, scaled by face size |
| Contour | Soft bands under the cheekbones, along the jaw, and down the sides of the nose |
| Highlight | Tops of the cheekbones, nose bridge, cupid's bow, brow bone |
| Eyelid (eyeshadow) | Area between the upper lid line and the brow, fading upward. Support 1–3 tones (lid, crease, outer corner). |
| Eyeliner | Thick stroke along the upper lash line, tapered; optional wing extending outward and up from the outer corner |
| Kajal | Thin stroke along the lower waterline |
| Mascara | Darkened, slightly thickened stroke along the upper lash line plus tiny strand texture |
| False lashes | PNG lash strip warped along the upper lid curve (sample a curve through the lid landmarks and map the texture along it) |
| Brows | Brow polygon, colour filled at low opacity with soft edges, preserving hair texture |
| Iris (lenses) | Circle from the iris landmarks, clipped by the eyelid opening so the lids cover it naturally |

Use blendshapes (`eyeBlinkLeft/Right`, `jawOpen`) to fade eyeshadow and lashes correctly when the eyes close, and to keep lips clean when the mouth opens.

### 5.4 Rendering pipeline (WebGL2)
For each frame:
1. Upload the video frame as a texture.
2. For each active effect, rasterise its polygon(s) into a **mask texture** (triangulated with earcut), then **feather** it with a separable Gaussian blur pass. Blur radius scales with face size.
3. Composite the effect colour onto the frame through the mask using the product's **blend mode** and **opacity**.
4. Draw effects in a realistic order: foundation → concealer → contour/bronzer → blush → highlighter → eyeshadow → eyeliner/kajal → mascara/lashes → brows → lenses → lip liner → lipstick → gloss.

**Blend modes (GLSL):** `multiply`, `soft-light`, `overlay`, `screen`, `color`, and normal alpha.
**Finishes:**
- **Matte:** lower the highlights under the mask slightly, using mostly multiply/colour blending.
- **Satin/cream:** keep some original highlights.
- **Gloss:** take the original frame's luminance, boost the brightest spots into a white specular layer, and add it on top.
- **Metallic/shimmer:** specular as for gloss, plus fine animated noise sparkle that moves with the face.
- **Chrome (nails):** strong environment-like gradient reflection.

**Realism rules:**
- Always keep the underlying texture (lip lines, skin pores, brow hairs). Never paint flat colour.
- **Lighting adaptation:** measure the average luminance in the region and adjust the effect brightness, so a shade looks right in dim rooms and bright daylight.
- Foundation must stay subtle. Shift skin tone toward the shade at low opacity and lightly even out the skin. Don't blur it into plastic.

**Fallback:** if WebGL2 is unavailable, use a simpler Canvas 2D renderer (polygon fill + `globalCompositeOperation`). Don't rely on `ctx.filter` for blur, because browser support is inconsistent. Fake the feathering by drawing the mask at low resolution and scaling it up.

### 5.5 Fake nails
- HandLandmarker, `numHands: 2`.
- Per finger: tip landmark (4, 8, 12, 16, 20) and DIP/IP landmark (3, 7, 11, 15, 19).
- **Nail placement:** the axis runs from DIP to tip. The nail base sits about 35–45% of the way from tip back toward DIP. Nail width is proportional to segment length, with a per-finger factor (thumb widest, pinky narrowest). Fake nails **extend past the fingertip** by the chosen length (short, medium, long, extra long), which also hides tracking imprecision. All factors go in config.
- **Back of hand only:** nails are visible only when the back of the hand faces the camera. Work out which side faces the camera from the palm normal (cross product of wrist→index-MCP and wrist→pinky-MCP) combined with handedness and mirroring. Hide nails when the palm faces the camera. Add a debug toggle to verify this.
- **Shapes:** square, squoval, round, oval, almond, coffin/ballerina, stiletto. Each shape is a parametric path scaled to nail width and length.
- **Finishes:** solid cream, gloss, matte, chrome, glitter, French tip, ombré, and image designs (PNG texture mapped onto the nail shape).
- Light shading: a slight curvature gradient across the nail width plus a gloss highlight strip, so nails look 3D rather than flat stickers.
- Show a hint in the UI: *"Show the back of your hand, fingers spread."*
- **Known limitation:** landmark-based nails are approximate. Natural nail edges aren't detected. Document this. A nail segmentation model could improve it in the future.

### 5.6 Photo-upload fallback
If camera permission is denied or unavailable, let the user upload or take a photo. Run the same trackers in `IMAGE` mode and the same renderer on the still image. The image stays on the device.

### 5.7 Performance targets
- Desktop: 30 fps or more. Mid-range Android: 20 fps or more. Recent iPhone: 30 fps or more.
- First try-on ready in under 4 s on 4G (show a progress indicator while models load; cache them with the browser cache headers Pages provides).
- An on-screen debug HUD (`?debug=1`) showing fps, detection time, render time and the landmark overlay.
- Adaptive quality: if fps stays under 18 for 2 s, lower the detection resolution and blur quality.

---

## 6. SDK Public API

```ts
import { TryOn } from 'tryon-sdk';

const tryon = await TryOn.create({
  container: document.getElementById('tryon')!, // or omit to use built-in modal
  assetsBaseUrl: 'https://cdn.jsdelivr.net/gh/<user>/tryon-sdk@v0.1.0/dist/', // where models/wasm live
  catalog: '/products.json',          // URL or inline object
  ui: 'modal',                        // 'modal' | 'none' (headless)
  mirror: true,
  locale: 'en',
  onAddToCart: ({ productId, shadeId }) => { /* brand's cart logic */ },
  onCapture: (blob) => { /* PNG snapshot */ },
  onError: (err) => console.error(err),
});

await tryon.open({ productId: 'lip-001', shadeId: 'ruby' }); // opens camera + applies product
tryon.setShade('lip-001', 'nude-rose');
tryon.addToLook({ productId: 'blush-002', shadeId: 'peach' }); // layer products
tryon.removeFromLook('blush-002');
tryon.setIntensity('lip-001', 0.7);   // 0–1
tryon.compare(true);                  // before/after split view
const png = await tryon.capture();
tryon.switchCamera();
tryon.close();                        // stops camera, frees GPU
tryon.on('tracking-lost', () => {});
```

**Script-tag usage (for non-developers at brands):**
```html
<script src="https://cdn.jsdelivr.net/gh/<user>/tryon-sdk@v0.1.0/dist/tryon.iife.js"></script>
<button data-tryon-product="lip-001" data-tryon-shade="ruby">Try it on</button>
<script>TryOn.autoInit({ catalog: '/products.json' });</script>
```
`autoInit` finds every `[data-tryon-product]` button and wires it up.

Build outputs: `dist/tryon.esm.js`, `dist/tryon.iife.js`, type definitions, and the models/wasm/assets folders.

---

## 7. Product Catalogue Schema

```jsonc
{
  "brand": "Demo Beauty",
  "version": 1,
  "products": [
    {
      "id": "lip-001",
      "name": "Velvet Matte Lipstick",
      "category": "lipstick",        // see list below
      "shades": [
        { "id": "ruby", "name": "Ruby", "hex": "#9B1B30", "finish": "matte", "opacity": 0.85 },
        { "id": "nude-rose", "name": "Nude Rose", "hex": "#C27C7C", "finish": "satin", "opacity": 0.75 }
      ]
    },
    {
      "id": "shadow-010",
      "name": "Sunset Trio",
      "category": "eyeshadow",
      "shades": [
        { "id": "sunset", "name": "Sunset",
          "tones": { "lid": "#E8B07A", "crease": "#B5603A", "outer": "#5A2A1E" },
          "finish": "shimmer", "opacity": 0.6 }
      ]
    },
    {
      "id": "nail-020",
      "name": "Press-On Almond Set",
      "category": "nails",
      "shades": [
        { "id": "rose-chrome", "name": "Rose Chrome", "hex": "#D8A1A8",
          "finish": "chrome", "shape": "almond", "length": "medium" },
        { "id": "classic-french", "name": "Classic French", "hex": "#F4E1DC",
          "finish": "french", "tipHex": "#FFFFFF", "shape": "squoval", "length": "short" },
        { "id": "daisy-art", "name": "Daisy Art", "finish": "design",
          "texture": "assets/nails/daisy.png", "shape": "coffin", "length": "long" }
      ]
    }
  ]
}
```

**Categories:** `lipstick`, `liquid-lipstick`, `lip-gloss`, `lip-liner`, `lip-stain`, `foundation`, `concealer`, `blush`, `bronzer`, `contour`, `highlighter`, `eyeshadow`, `eyeliner`, `kajal`, `mascara`, `false-lashes`, `lenses`, `brow`, `nails`.
**Finishes:** `matte`, `satin`, `cream`, `gloss`, `shimmer`, `metallic`, `glitter`, `chrome`, `french`, `ombre`, `design`.
Optional per-shade fields: `opacity`, `intensityDefault`, `style` (eyeliner: `thin|thick|winged`; lashes: `natural|volume|dramatic`), `tones`, `texture`, `shape`, `length`, `tipHex`, `gradientHex`.

Validate the catalogue at load time (hand-written validator, no heavy library) and show clear error messages for bad entries.

---

## 8. Phases (build in this order)

Each phase ends with: lint + typecheck + tests passing, a commit, a CHANGELOG entry, and a short "How to test" note for me.

### Phase 0: Project setup
- Init the repo, Vite + TS strict, ESLint, Prettier, Vitest.
- Two Vite configs (demo site, SDK library).
- GitHub Actions workflow: on push to `main`, run lint, typecheck and tests, build, and deploy the demo to GitHub Pages (see Section 9).
- README skeleton, LICENSE, THIRD_PARTY_LICENSES.md, CHANGELOG.md.
- **Done when:** a "Hello TryOn" page is live at the Pages URL over HTTPS.

### Phase 1: Camera and face tracking
- Camera module with all permission states and a front/back switch.
- FaceLandmarker wrapper (self-hosted model/wasm, GPU→CPU fallback).
- One Euro smoothing, tracking-lost fade.
- `?debug=1` HUD with fps/timings and a landmark overlay, plus a region-overlay toggle that shows every region from 5.3 in a different colour.
- **Done when:** on my phone the landmarks follow my face smoothly and every region outline sits in the right place, including with the mouth open and eyes closed.

### Phase 2: Render engine
- WebGL2 pipeline: video texture, polygon masks via earcut, Gaussian feathering, all blend modes, finish logic (matte/satin/gloss/shimmer), lighting adaptation.
- Canvas 2D fallback.
- Unit tests for colour maths (hex→linear RGB, blend functions) and polygon utilities.
- **Done when:** a test effect (solid colour on the lips region) renders smoothly with soft edges.

### Phase 3: Lips
- Lipstick (all finishes), liquid lipstick, lip gloss (clear and tinted), lip liner, lip stain.
- Intensity slider support.
- **Done when:** shades look natural, stay inside the lips, keep teeth clean when talking or smiling, and gloss shows moving highlights.

### Phase 4: Face
- Foundation, concealer, blush, bronzer, contour, highlighter.
- **Done when:** effects are subtle and natural with no hard edges at the hairline, jaw or around the eyes, and they track when I turn my head about 30° either way.

### Phase 5: Eyes and brows
- Eyeshadow (1–3 tones), eyeliner (thin/thick/winged), kajal, mascara, false lashes (generate 3 lash PNG styles), coloured lenses, brows.
- Blink handling.
- **Done when:** everything follows the eyes and lids, blinking looks correct, and lenses are covered by the lids naturally.

### Phase 6: Fake nails
- HandLandmarker wrapper (loaded only for nail products), nail geometry, back-of-hand detection, all shapes, lengths and finishes, design textures (generate 4–6 simple original designs: daisy, hearts, marble, leopard, stars, abstract lines).
- Hint UI and back-camera suggestion.
- **Done when:** nails sit on all five fingers of either hand, follow movement, disappear when the palm turns toward the camera, and every shape and finish renders correctly.

### Phase 7: Looks, capture and photo mode
- Layer multiple products into a look, using the correct draw order.
- Before/after compare (draggable split).
- Capture a snapshot as PNG, with an optional small watermark from config.
- Photo-upload fallback mode.
- **Done when:** I can build a full look, compare it, save a photo, and use it all on an uploaded photo with the camera blocked.

### Phase 8: SDK packaging and built-in UI
- Final public API (Section 6), `autoInit`, events, catalogue validation.
- Built-in modal UI: close button, camera switch, product/shade swatches, intensity slider, compare, capture, "Add to cart" (calls `onAddToCart`). Mobile-first, accessible (labels, focus trap, keyboard support), themeable via CSS variables (`--tryon-accent`, `--tryon-radius`, `--tryon-font`).
- ESM + IIFE builds, typings, and assets in `dist/`. Tag `v0.1.0` so jsDelivr can serve it.
- **Done when:** a plain HTML file anywhere can load the SDK from jsDelivr and run a try-on.

### Phase 9: Demo store site
- A small, polished demo store: product grid across all categories (at least 3 shades each), product page with a "Try it on" button, and a "Build a full look" page.
- Use only the public SDK API, as a real brand would.
- **Done when:** the demo is live and feels like a real store experience I can show to brands.

### Phase 10: QA, performance and docs
- Device test checklist (write it to `docs/QA.md`, then I run it):
  - Android Chrome (budget + mid-range), Samsung Internet
  - iPhone Safari (iOS 16+), iPad Safari
  - Desktop Chrome, Edge, Firefox, Safari
  - Low light, bright light, glasses, beard, different skin tones, head turns, talking, smiling
- Performance pass against 5.7, plus adaptive quality.
- `INTEGRATION.md` for brands: script-tag setup, catalogue format, theming, events, privacy statement.
- **Done when:** the checklist passes and docs are complete.

---

## 9. Free Hosting and Repo Visibility (decide before Phase 0)

| Option | Repo | Hosting | Notes |
|---|---|---|---|
| **A (simplest)** | Public | GitHub Pages | Free. Code is visible to anyone. Use an "All rights reserved" proprietary LICENSE so others may not legally reuse it. |
| **B (code stays private)** | Private | Cloudflare Pages (free plan) connected to the GitHub repo | Code is hidden. GitHub Pages on private repos requires a paid GitHub plan, so it's not used here. |

- **SDK CDN:** jsDelivr serves files from **public** GitHub repos for free (`cdn.jsdelivr.net/gh/<user>/<repo>@<tag>/...`). With option B, serve the SDK from the Cloudflare Pages URL instead.
- In Phase 0, implement the deploy workflow for the chosen option. Default: **Option A**, unless I say B.

---

## 10. Privacy Statement (show in UI and docs)

> "Your camera stays on your device. The try-on runs entirely in your browser — no images or video are uploaded, stored, or shared."

---

## 11. Future Roadmap (don't build now)
- Nail segmentation model for exact nail edges
- Skin-tone detection to recommend foundation shades
- Clothing try-on (needs a commercially licensed model and a GPU server, which is not free)
- Brand dashboard: catalogue upload, license keys, analytics
- Shopify/WooCommerce plugins
- Bangla localisation
