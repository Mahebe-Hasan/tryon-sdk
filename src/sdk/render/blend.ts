import blendGlsl from './shaders/blend.glsl?raw';
import labGlsl from './shaders/lab.glsl?raw';

/** GLSL blend-mode library (`blendMode(b, s, mode)`), injected at `//#include blend`. */
export const BLEND_GLSL = blendGlsl;
/** GLSL CIELAB conversions + specular estimate, injected at `//#include lab`. */
export const LAB_GLSL = labGlsl;

export function withIncludes(source: string): string {
  return source.replace('//#include blend', BLEND_GLSL).replace('//#include lab', LAB_GLSL);
}
