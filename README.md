# TryOn SDK

Browser-based, real-time virtual try-on for makeup and press-on nails. Runs entirely on the
user's device — no app, no backend, no uploads.

> Your camera stays on your device. The try-on runs entirely in your browser — no images or
> video are uploaded, stored, or shared.

**Status:** Phase 0 (project setup). See [CHANGELOG.md](CHANGELOG.md) and
[virtual-tryon-build-plan.md](virtual-tryon-build-plan.md).

**Demo:** https://mahebe-hasan.github.io/tryon-sdk/

## Quick start (development)

```bash
npm install
npm run dev        # demo on http://localhost:5173 (also on your LAN IP)
npm run lint
npm run typecheck
npm test
npm run build      # dist/ (SDK) + dist-demo/ (demo site)
```

## Planned usage

```html
<script src="https://cdn.jsdelivr.net/gh/mahebe-hasan/tryon-sdk@v0.1.0/dist/tryon.iife.js"></script>
<button data-tryon-product="lip-001" data-tryon-shade="ruby">Try it on</button>
<script>
  TryOn.autoInit({ catalog: '/products.json' });
</script>
```

Integration docs for brands will live in `INTEGRATION.md` (Phase 10).

## License

Proprietary — all rights reserved. See [LICENSE](LICENSE).
