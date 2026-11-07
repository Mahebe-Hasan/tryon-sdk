import blendGlsl from './shaders/blend.glsl?raw';

/** GLSL blend-mode library (`blendMode(b, s, mode)`), injected into shaders at `//#include blend`. */
export const BLEND_GLSL = blendGlsl;

export function withIncludes(source: string): string {
  return source.replace('//#include blend', BLEND_GLSL);
}
