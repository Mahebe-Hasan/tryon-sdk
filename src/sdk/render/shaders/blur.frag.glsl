#version 300 es
// One direction of a separable Gaussian blur on the (single-channel) mask.
precision highp float;
in vec2 v_uv;
out vec4 o;

uniform sampler2D u_tex;
uniform vec2 u_dir;    // one texel in the blur direction
uniform float u_sigma; // in texels

const int TAPS = 12;   // per side; wider blurs space the taps out (linear filtering fills gaps)

void main() {
  if (u_sigma < 0.5) {
    o = texture(u_tex, v_uv);
    return;
  }
  float stepT = max(1.0, 3.0 * u_sigma / float(TAPS));
  float sum = 0.0;
  float wsum = 0.0;
  for (int i = -TAPS; i <= TAPS; i++) {
    float x = float(i) * stepT;
    float w = exp(-0.5 * x * x / (u_sigma * u_sigma));
    sum += texture(u_tex, v_uv + u_dir * x).r * w;
    wsum += w;
  }
  o = vec4(sum / wsum, 0.0, 0.0, 1.0);
}
