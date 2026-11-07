# TryOn SDK — Project Rules

Browser-based, real-time virtual try-on for makeup and fake (press-on) nails, built as a
standalone, embeddable SDK. The full spec lives in `virtual-tryon-build-plan.md` — read the
relevant section before starting a phase.

## Rules

1. **No paid services, no backend, no API keys.** Everything runs in the browser. If something seems to need a server, stop and ask.
2. **Privacy first:** camera frames and photos never leave the device. No uploads, no tracking, no third-party analytics. After the first load, the SDK must not make any network requests except loading its own model and asset files.
3. **Only use dependencies with licenses that allow commercial use** (MIT, Apache-2.0, BSD, ISC). List every dependency and its license in `THIRD_PARTY_LICENSES.md`.
4. **TypeScript, strict mode.** Keep modules small and focused.
5. **Work one phase at a time.** At the end of each phase: run lint, typecheck and tests, commit with a clear message, update `CHANGELOG.md`, then stop and explain how to test the phase on phone and laptop.
6. **Mobile is the main target.** Test on mobile-sized viewports first. Keep each frame light enough to run smoothly on mid-range Android phones.
7. **No copyrighted brand assets.** Use invented sample product names and shades and generated nail designs.
8. **Keep the SDK framework-agnostic** (vanilla TS, no React inside the SDK). The demo site may use plain TS too.
9. When unsure about a visual detail, build it with a config value so it can be tuned later instead of hardcoding it.

## Hosting decision

Option A: public GitHub repo, demo on GitHub Pages, SDK via jsDelivr. LICENSE is proprietary ("All rights reserved").

## Commands

- `npm run dev` — demo dev server (`src/demo`, served on localhost)
- `npm run build` — SDK library build (`dist/`) + demo build (`dist-demo/`)
- `npm run lint` — ESLint + Prettier check
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest unit tests (`tests/unit`)

## Layout

- `src/sdk/` — the SDK (public API in `index.ts`). No DOM framework, no demo code.
- `src/demo/` — the demo store; must only use the public SDK API.
- `public/` — self-hosted MediaPipe models (`models/`, committed), wasm (`wasm/`, gitignored,
  copied from node_modules by the `postinstall` script), and generated assets.
- Makeup rendering follows `docs/RENDERING_RESEARCH.md`. Never expose blend modes to
  shoppers: products are category + shade + finish + intensity, and `src/sdk/render/recipes.ts`
  maps them to rendering parameters. Base new categories on researched methods and real data.
- Face region index sets live in `src/sdk/tracking/regions.ts`; verify changes with
  `?debug=1&regions=1&ids=1`. "L"/"R" = the subject's left/right (MediaPipe convention).
