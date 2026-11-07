# Third-Party Licenses

Every dependency must allow commercial use (MIT, Apache-2.0, BSD, ISC).

## Runtime (shipped in the SDK)

| Component                                   | License    | Source                                                                                                                     |
| ------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@mediapipe/tasks-vision` 1.2.2 (JS + WASM) | Apache-2.0 | npm package `license` field; wasm copied to `public/wasm/` by `scripts/copy-mediapipe.mjs`                                 |
| `face_landmarker.task` (float16, v1)        | Apache-2.0 | Bundles BlazeFace short-range, Face Mesh V2 and Blendshape V2. Each model card links its license to apache.org LICENSE-2.0 |

Model cards (checked 2026-11-07):

- BlazeFace short range: https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
- Face Mesh V2: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
- Blendshape V2: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf

Model downloaded from
`https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`.

Planned: `earcut` (ISC), `hand_landmarker.task` (Phase 6, re-check its model card).

## Development only (not shipped)

| Package                | License    |
| ---------------------- | ---------- |
| typescript             | Apache-2.0 |
| vite                   | MIT        |
| vitest                 | MIT        |
| eslint                 | MIT        |
| @eslint/js             | MIT        |
| typescript-eslint      | MIT        |
| eslint-config-prettier | MIT        |
| globals                | MIT        |
| prettier               | MIT        |
| @types/node            | MIT        |
