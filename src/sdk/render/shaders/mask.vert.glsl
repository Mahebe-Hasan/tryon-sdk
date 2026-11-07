#version 300 es
// Region triangles in frame pixels → clip space (no y flip: row 0 of the target = top).
in vec2 a_pos;
uniform vec2 u_size;

void main() {
  gl_Position = vec4(a_pos / u_size * 2.0 - 1.0, 0.0, 1.0);
}
