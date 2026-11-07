#version 300 es
// Final copy to the canvas. Offscreen textures store the image top row at v=0, while the
// default framebuffer shows clip y=+1 at the top, so flip here (and only here).
precision mediump float;
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_tex;

void main() {
  o = vec4(texture(u_tex, vec2(v_uv.x, 1.0 - v_uv.y)).rgb, 1.0);
}
