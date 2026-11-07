#version 300 es
// Full-screen triangle pair. v_uv (0,0) = top-left of the image in every offscreen pass.
in vec2 a_pos;
out vec2 v_uv;

void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
