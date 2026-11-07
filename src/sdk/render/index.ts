import { Canvas2DRenderer } from './fallback2d';
import { WebGLRenderer } from './renderer';
import type { Renderer, RendererKind } from './types';

export type RendererPreference = 'auto' | RendererKind;

/** WebGL2 when available (and preferred), otherwise the Canvas 2D fallback. */
export function createRenderer(pref: RendererPreference = 'auto'): Renderer {
  if (pref !== 'canvas2d') {
    const gl = WebGLRenderer.create();
    if (gl) return gl;
  }
  return new Canvas2DRenderer();
}

export * from './types';
export * from './color';
