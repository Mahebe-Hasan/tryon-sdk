#version 300 es
// Writes (lum * mask, mask). After mipmapping, a coarse mip at the region centre gives
// sum(lum*mask)/sum(mask) = the region's mean luminance, unaffected by what lies outside the
// mask (e.g. the dark inside of an open mouth).
precision mediump float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_video;
uniform sampler2D u_mask;

void main() {
  float m = texture(u_mask, v_uv).r;
  float l = dot(texture(u_video, v_uv).rgb, vec3(0.299, 0.587, 0.114));
  o = vec4(l * m, m, 0.0, 1.0);
}
