// sRGB <-> CIELAB (D65). Keep in sync with rgbToLab / labToRgb in src/sdk/render/color.ts.

vec3 srgbToLinear3(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

vec3 linearToSrgb3(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

const vec3 WHITE_D65 = vec3(0.95047, 1.0, 1.08883);

vec3 labF3(vec3 t) {
  return mix((24389.0 / 27.0 * t + 16.0) / 116.0, pow(max(t, 0.0), vec3(1.0 / 3.0)),
             step(216.0 / 24389.0, t));
}

vec3 labFInv3(vec3 t) {
  vec3 t3 = t * t * t;
  return mix((116.0 * t - 16.0) / (24389.0 / 27.0), t3, step(216.0 / 24389.0, t3));
}

vec3 rgb2lab(vec3 c) {
  vec3 l = srgbToLinear3(clamp(c, 0.0, 1.0));
  vec3 xyz = vec3(
    dot(l, vec3(0.4124564, 0.3575761, 0.1804375)),
    dot(l, vec3(0.2126729, 0.7151522, 0.0721750)),
    dot(l, vec3(0.0193339, 0.1191920, 0.9503041))) / WHITE_D65;
  vec3 f = labF3(xyz);
  return vec3(116.0 * f.y - 16.0, 500.0 * (f.x - f.y), 200.0 * (f.y - f.z));
}

vec3 lab2rgb(vec3 lab) {
  float fy = (lab.x + 16.0) / 116.0;
  vec3 f = vec3(fy + lab.y / 500.0, fy, fy - lab.z / 200.0);
  vec3 xyz = labFInv3(f) * WHITE_D65;
  vec3 l = vec3(
    dot(xyz, vec3(3.2404542, -1.5371385, -0.4985314)),
    dot(xyz, vec3(-0.9692660, 1.8760108, 0.0415560)),
    dot(xyz, vec3(0.0556434, -0.2040259, 1.0572252)));
  return clamp(linearToSrgb3(l), 0.0, 1.0);
}

// Specular (shine) estimate on lips/skin: brightness above the local average, only on
// already-bright pixels. Approximates the diffuse/specular split (dichromatic model) that
// LipAT does with a shadow/highlight filter. Returns 0..1 (grey highlight).
float specEstimate(float L, float localL, float thresh, float gain) {
  return clamp((L - localL - thresh) * gain, 0.0, 1.0) * smoothstep(0.3, 0.7, L);
}
