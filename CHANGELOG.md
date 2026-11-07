# Changelog

## [0.0.1] — 2026-11-07 — Phase 0: Project setup

- Vite + TypeScript (strict) project with ESLint, Prettier and Vitest.
- Two build configs: demo site (`vite.config.ts` → `dist-demo/`) and SDK library
  (`vite.sdk.config.ts` → `dist/tryon.esm.js`, `dist/tryon.iife.js`, `dist/types/`).
- "Hello TryOn" demo page that checks HTTPS, camera API and WebGL2 support and shows the
  privacy statement.
- GitHub Actions workflow: lint, typecheck, test, build, deploy demo to GitHub Pages on push
  to `main`.
- README, proprietary LICENSE, THIRD_PARTY_LICENSES.md, CLAUDE.md project rules.
