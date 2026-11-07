#version 300 es
// Composites one effect onto the frame through its feathered mask.
precision highp float;
in vec2 v_uv;
out vec4 o;

uniform sampler2D u_base;   // composite so far
uniform sampler2D u_video;  // original camera frame, mipmapped
uniform sampler2D u_mask;   // feathered coverage (r)
uniform sampler2D u_stats;  // mipmapped mask-weighted diffuse Lab (see stats.frag.glsl)

uniform vec3 u_color;       // product colour, sRGB 0-1
uniform int u_mode;         // BLEND_MODES index; 6 = pigment (lip products)
uniform float u_opacity;
// 0 = soft edge centred on the outline; 1 = soft edge entirely inside (no bleed outside).
uniform float u_featherInset;

// Region statistics lookup (mip level ≈ region size, sampled at the region centre).
uniform vec2 u_regionCenter;
uniform float u_regionLod;

uniform float u_lightAdapt;
uniform float u_refLum;     // generic modes: luminance 0-1
uniform float u_refL;       // pigment: L* reference

// Texture detail: high-pass of the original frame (pixel - local average at u_detailLod).
uniform float u_detailLod;
uniform float u_detail;
uniform float u_specThresh;
uniform float u_specGain;

// Generic finish (non-pigment modes)
uniform float u_matte;
uniform float u_highlightKeep;
uniform float u_gloss;
uniform float u_metal;

// Pigment (lip products) — Shiseido US10939742 / LipAT (WACV 2024) method
uniform vec3 u_productLab;
uniform float u_kL;
uniform float u_kC;
uniform float u_roughness;
uniform float u_specScale;
uniform float u_specTint;
uniform vec4 u_glossSpot;   // centre xy (px), radii along/across lip axis (px)
uniform vec2 u_glossAxis;   // unit lip axis
uniform float u_glossSpotStrength;
// Coverage products (foundation, skin tint, concealer) reuse the pigment path:
uniform float u_shift;      // how far the region mean moves to the product (1 = lipstick)
uniform float u_smooth;     // fine-detail softening (foundation fills fine lines)

// Thin layer (blush, bronzer, contour, eyeshadow, highlighter)
uniform vec3 u_productLin;  // product colour lit by the scene, linear RGB
uniform float u_density;
uniform float u_glow;

// Sparkle (shimmer/metallic), anchored to the face
uniform float u_sparkle;
uniform float u_sparkleDensity;
uniform mat3 u_faceXform;   // frame px -> face space
uniform vec2 u_size;        // frame px
uniform float u_time;

//#include blend
//#include lab

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float sparkleAt(float spec) {
  vec2 fp = (u_faceXform * vec3(v_uv * u_size, 1.0)).xy * u_sparkleDensity;
  float h = hash(floor(fp));
  float twinkle = 0.5 + 0.5 * sin(u_time * 5.0 + h * 50.0);
  float dotShape = smoothstep(0.45, 0.0, length(fract(fp) - 0.5));
  return step(0.92, h) * dotShape * twinkle * (0.6 + spec);
}

void main() {
  vec3 base = texture(u_base, v_uv).rgb;
  float mRaw = texture(u_mask, v_uv).r;
  // The blurred outline sits at 0.5; remap so the soft edge moves inside the shape.
  float lo = 0.5 * u_featherInset;
  float m = clamp((mRaw - lo) / (1.0 - lo), 0.0, 1.0) * u_opacity;
  if (m <= 0.002) {
    o = vec4(base, 1.0);
    return;
  }

  vec3 orig = texture(u_video, v_uv).rgb;
  float origL = lum(orig);
  float localL = lum(textureLod(u_video, v_uv, u_detailLod).rgb);
  float hp = origL - localL;

  if (u_mode == 6) {
    // 1. Split into diffuse colour and specular shine.
    float s = specEstimate(origL, localL, u_specThresh, u_specGain);
    vec3 lab = rgb2lab(clamp(base - s, 0.0, 1.0));
    // 2. Region mean of the diffuse colour (mask-weighted, from the stats mip).
    vec4 st = textureLod(u_stats, u_regionCenter, u_regionLod);
    vec3 mu = st.a > 0.004
      ? vec3(st.r / st.a * 100.0, st.g / st.a * 255.0 - 128.0, st.b / st.a * 255.0 - 128.0)
      : lab;
    // 3. Shift the mean to the product colour, keep kL/kC of each pixel's own variation.
    vec3 tgt = mix(mu, u_productLab, u_shift);
    tgt.x += u_lightAdapt * clamp(mu.x - u_refL, -12.0, 12.0);
    vec3 nl = vec3(tgt.x + u_kL * (lab.x - mu.x), tgt.yz + u_kC * (lab.yz - mu.yz));
    if (u_smooth > 0.0) {
      // Soften fine lines/pores: remove part of the fine-scale lightness detail.
      float fineL = lum(textureLod(u_video, v_uv, max(u_detailLod - 1.0, 0.0)).rgb);
      nl.x -= u_smooth * (origL - fineL) * 90.0;
    }
    vec3 diffuse = lab2rgb(nl);
    // 4. Re-shape the shine for the finish: S' = 1 - (1 - S)^gamma, gamma = 2.42 e^(-1.55 r).
    float gamma = 2.42 * exp(-1.55 * u_roughness);
    float spec = (1.0 - pow(1.0 - s, gamma)) * u_specScale;
    // Synthetic wet highlight on the lower lip, broken up by the lip lines, scaled by light.
    if (u_glossSpotStrength > 0.0) {
      vec2 p = v_uv * u_size - u_glossSpot.xy;
      vec2 q = vec2(dot(p, u_glossAxis), dot(p, vec2(-u_glossAxis.y, u_glossAxis.x)));
      vec2 r = q / max(u_glossSpot.zw, vec2(1.0));
      float e = exp(-0.5 * dot(r, r) * 2.2);
      float lines = 0.5 + 0.5 * smoothstep(-0.03, 0.03, hp);
      spec += u_glossSpotStrength * e * lines * clamp(mu.x / 55.0, 0.35, 1.2);
    }
    spec = clamp(spec, 0.0, 1.0);
    vec3 specColor = mix(vec3(1.0), mix(u_color, vec3(1.0), 0.3), u_specTint);
    // 5. Recombine with a screen blend (softer than add), then sparkle.
    vec3 res = 1.0 - (1.0 - diffuse) * (1.0 - spec * specColor);
    if (u_sparkle > 0.0) res += u_sparkle * sparkleAt(spec) * mix(vec3(1.0), specColor, 0.5);
    o = vec4(mix(base, clamp(res, 0.0, 1.0), m), 1.0);
    return;
  }

  if (u_mode == 7) {
    // Thin translucent layer (Kubelka-Munk): light passes through the pigment, so each pixel
    // is multiplied — in linear light — by (product / own mean colour)^density.
    float s = specEstimate(origL, localL, u_specThresh, u_specGain);
    vec4 st = textureLod(u_stats, u_regionCenter, u_regionLod);
    vec3 mu = st.a > 0.004
      ? vec3(st.r / st.a * 100.0, st.g / st.a * 255.0 - 128.0, st.b / st.a * 255.0 - 128.0)
      : rgb2lab(clamp(orig - s, 0.0, 1.0));
    vec3 muLin = max(srgbToLinear3(lab2rgb(mu)), vec3(0.02));
    vec3 ratio = clamp(u_productLin / muLin, 0.0, 2.5);
    vec3 dLin = srgbToLinear3(clamp(base - s, 0.0, 1.0)) * pow(ratio, vec3(u_density));
    // Highlighter: light-reflecting pigment adds light where light falls on the skin.
    if (u_glow > 0.0) {
      float lit = clamp(origL / max(lum(lab2rgb(mu)), 0.05), 0.3, 1.8);
      dLin += u_glow * u_productLin * lit;
    }
    float gamma = 2.42 * exp(-1.55 * u_roughness);
    float spec = clamp((1.0 - pow(1.0 - s, gamma)) * u_specScale, 0.0, 1.0);
    vec3 specColor = mix(vec3(1.0), mix(u_color, vec3(1.0), 0.3), u_specTint);
    vec3 res = 1.0 - (1.0 - linearToSrgb3(dLin)) * (1.0 - spec * specColor);
    if (u_sparkle > 0.0) res += u_sparkle * sparkleAt(spec) * mix(vec3(1.0), specColor, 0.5);
    o = vec4(mix(base, clamp(res, 0.0, 1.0), m), 1.0);
    return;
  }

  // ---- Generic blend modes (face/eye effects until their phases add recipes) -----------
  float regionL = lum(textureLod(u_video, u_regionCenter, u_regionLod + 1.0).rgb);
  float adapt = mix(1.0, clamp(regionL / u_refLum, 0.45, 1.5), u_lightAdapt);
  vec3 c = clamp(u_color * adapt, 0.0, 1.0);
  vec3 res = blendMode(base, c, u_mode);

  float hpPos = max(hp, 0.0);
  res += u_detail * hp;
  res -= u_matte * hpPos * (u_detail + (1.0 - u_detail) * c);
  res += u_highlightKeep * hpPos;
  float spec = smoothstep(0.02, 0.16, hp) * smoothstep(0.3, 0.75, origL);
  res += u_gloss * spec;
  if (u_metal > 0.0) res = mix(res, res * (0.55 + 1.1 * origL), u_metal);
  if (u_sparkle > 0.0) res += u_sparkle * sparkleAt(spec);

  o = vec4(mix(base, clamp(res, 0.0, 1.0), m), 1.0);
}
