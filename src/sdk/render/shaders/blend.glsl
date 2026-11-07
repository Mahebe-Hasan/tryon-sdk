// Blend modes (W3C Compositing & Blending). b = backdrop, s = source, sRGB 0-1.
// Keep in sync with src/sdk/render/color.ts. Mode indices match BLEND_MODES there.

vec3 bMultiply(vec3 b, vec3 s) { return b * s; }

vec3 bScreen(vec3 b, vec3 s) { return b + s - b * s; }

vec3 bOverlay(vec3 b, vec3 s) {
  return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5000001, b));
}

vec3 softD(vec3 b) {
  return mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.2500001, b));
}

vec3 bSoftLight(vec3 b, vec3 s) {
  vec3 lo = b - (1.0 - 2.0 * s) * b * (1.0 - b);
  vec3 hi = b + (2.0 * s - 1.0) * (softD(b) - b);
  return mix(lo, hi, step(0.5000001, s));
}

float lumW(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

vec3 clipColor(vec3 c) {
  float l = lumW(c);
  float n = min(min(c.r, c.g), c.b);
  float x = max(max(c.r, c.g), c.b);
  if (n < 0.0) c = l + (c - l) * l / (l - n);
  if (x > 1.0) c = l + (c - l) * (1.0 - l) / (x - l);
  return c;
}

vec3 bColor(vec3 b, vec3 s) { return clipColor(s + (lumW(b) - lumW(s))); }

vec3 blendMode(vec3 b, vec3 s, int mode) {
  if (mode == 1) return bMultiply(b, s);
  if (mode == 2) return bScreen(b, s);
  if (mode == 3) return bOverlay(b, s);
  if (mode == 4) return bSoftLight(b, s);
  if (mode == 5) return bColor(b, s);
  return s;
}
