#version 300 es
// Composites one effect colour onto the frame through its feathered mask.
precision highp float;
in vec2 v_uv;
out vec4 o;

uniform sampler2D u_base;   // composite so far
uniform sampler2D u_video;  // original camera frame, mipmapped
uniform sampler2D u_mask;   // feathered coverage (r)
uniform sampler2D u_stats;  // mipmapped (r = lum * mask, g = mask) for the region mean

uniform vec3 u_color;       // sRGB 0-1
uniform int u_mode;         // BLEND_MODES index
uniform float u_opacity;
// 0 = soft edge centred on the outline; 1 = soft edge entirely inside (no bleed outside).
uniform float u_featherInset;

// Region mean luminance = (sum lum*mask) / (sum mask), read from a coarse mip of u_stats.
uniform vec2 u_regionCenter;
uniform float u_regionLod;
// Lighting adaptation strength and reference luminance.
uniform float u_lightAdapt;
uniform float u_refLum;
// Tint: exponent on (pixel / region mean) luminance. 1 = natural shading, >1 = more contrast.
uniform float u_tintContrast;

// Texture detail: high-pass of the original frame (pixel - local average at u_detailLod).
uniform float u_detailLod;
uniform float u_detail;

// Finish
uniform float u_matte;
uniform float u_highlightKeep;
uniform float u_gloss;
uniform float u_sparkle;
uniform float u_metal;

uniform mat3 u_faceXform;   // frame px -> face space
uniform float u_sparkleDensity;
uniform vec2 u_size;        // frame px
uniform float u_time;

//#include blend

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

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

  vec2 st = textureLod(u_stats, u_regionCenter, u_regionLod).rg;
  float meanL = st.g > 0.004 ? st.r / st.g : origL;
  meanL = max(meanL, 0.02);
  float adapt = mix(1.0, clamp(meanL / u_refLum, 0.45, 1.5), u_lightAdapt);
  vec3 c = clamp(u_color * adapt, 0.0, 1.0);

  float shadeRatio = pow(clamp(origL / meanL, 0.0, 3.0), u_tintContrast);
  vec3 res = blendMode(base, c, u_mode, shadeRatio);

  float hp = origL - lum(textureLod(u_video, v_uv, u_detailLod).rgb);
  float hpPos = max(hp, 0.0);
  res += u_detail * hp;                                   // keep lines/pores
  // matte: remove the shine the blend let through (multiply-like modes pass ~hp*c per channel)
  res -= u_matte * hpPos * (u_detail + (1.0 - u_detail) * c);
  res += u_highlightKeep * hpPos;                         // satin/cream: keep sheen
  float spec = smoothstep(0.02, 0.16, hp) * smoothstep(0.3, 0.75, origL);
  res += u_gloss * spec;                                  // gloss: white specular

  if (u_metal > 0.0) {
    res = mix(res, res * (0.55 + 1.1 * origL), u_metal);  // metallic: deeper shading contrast
  }
  if (u_sparkle > 0.0) {
    vec2 fp = (u_faceXform * vec3(v_uv * u_size, 1.0)).xy * u_sparkleDensity;
    vec2 cell = floor(fp);
    float h = hash(cell);
    float twinkle = 0.5 + 0.5 * sin(u_time * 5.0 + h * 50.0);
    float dotShape = smoothstep(0.45, 0.0, length(fract(fp) - 0.5));
    res += u_sparkle * step(0.92, h) * dotShape * twinkle * (0.6 + spec);
  }

  o = vec4(mix(base, clamp(res, 0.0, 1.0), m), 1.0);
}
