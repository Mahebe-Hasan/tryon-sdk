#version 300 es
// Writes mask-weighted CIELAB of the DIFFUSE colour (shine removed) plus the mask:
//   (L/100 * m, (a+128)/255 * m, (b+128)/255 * m, m)
// After mipmapping, a coarse mip at the region centre divided by its alpha gives the region's
// mean Lab — unaffected by what lies outside the mask (e.g. the dark inside of an open mouth).
precision highp float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_video;
uniform sampler2D u_mask;
uniform float u_detailLod;
uniform float u_specThresh;
uniform float u_specGain;

//#include lab

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  float m = texture(u_mask, v_uv).r;
  vec3 c = texture(u_video, v_uv).rgb;
  float L = lum(c);
  float s = specEstimate(L, lum(textureLod(u_video, v_uv, u_detailLod).rgb), u_specThresh, u_specGain);
  vec3 lab = rgb2lab(clamp(c - s, 0.0, 1.0));
  vec3 enc = vec3(lab.x / 100.0, (lab.y + 128.0) / 255.0, (lab.z + 128.0) / 255.0);
  o = vec4(clamp(enc, 0.0, 1.0) * m, m);
}
