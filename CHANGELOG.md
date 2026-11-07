# Changelog

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
