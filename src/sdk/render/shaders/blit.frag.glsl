#version 300 es
// Final copy to the canvas. Offscreen textures store the image top row at v=0, while the
// default framebuffer shows clip y=+1 at the top, so flip here (and only here).
// Before/after compare: on one side of u_split (canvas x, 0-1) show the untouched frame.
precision mediump float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;     // with makeup
uniform sampler2D u_before;  // original frame
uniform float u_split;       // < 0 = compare off
uniform int u_beforeLow;     // 1: before where x < split, 0: before where x > split

void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  bool before = u_split >= 0.0 && ((u_beforeLow == 1) ? (v_uv.x < u_split) : (v_uv.x > u_split));
  o = vec4((before ? texture(u_before, uv) : texture(u_tex, uv)).rgb, 1.0);
}
