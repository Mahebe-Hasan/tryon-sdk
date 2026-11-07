import earcut from 'earcut';
import type { RegionShape } from '../tracking/regions';
import type { Vec2 } from '../tracking/paths';

/**
 * Turns region shapes into triangle lists (x,y pairs in frame pixels) that the WebGL
 * renderer rasterises into a mask texture. Overlapping triangles are fine: the mask pass
 * blends with MAX, so coverage never exceeds 1.
 */

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Polygon with holes: loops[0] is the outline, the rest are holes (even-odd look). */
export function polygonTriangles(loops: readonly (readonly Vec2[])[]): number[] {
  const valid = loops.filter((l) => l.length >= 3);
  const outer = valid[0];
  if (!outer) return [];
  const coords: number[] = [];
  const holes: number[] = [];
  valid.forEach((loop, i) => {
    if (i > 0) holes.push(coords.length / 2);
    for (const p of loop) coords.push(p.x, p.y);
  });
  const idx = earcut(coords, holes.length ? holes : undefined, 2);
  const out = new Array<number>(idx.length * 2);
  idx.forEach((v, i) => {
    out[i * 2] = coords[v * 2] as number;
    out[i * 2 + 1] = coords[v * 2 + 1] as number;
  });
  return out;
}

/** Thick stroke: a quad per segment plus round discs at every vertex (round joins/caps). */
export function polylineTriangles(
  points: readonly Vec2[],
  width: number,
  closed = false,
  roundSegments = 8,
): number[] {
  const out: number[] = [];
  const r = width / 2;
  if (points.length === 0 || r <= 0) return out;
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i] as Vec2;
    const b = points[(i + 1) % n] as Vec2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = (-dy / len) * r;
    const ny = (dx / len) * r;
    out.push(a.x + nx, a.y + ny, b.x + nx, b.y + ny, b.x - nx, b.y - ny);
    out.push(a.x + nx, a.y + ny, b.x - nx, b.y - ny, a.x - nx, a.y - ny);
  }
  for (const p of points) out.push(...circleTriangles(p, r, roundSegments));
  return out;
}

export function circleTriangles(c: Vec2, radius: number, segments = 32): number[] {
  const out: number[] = [];
  if (radius <= 0) return out;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    out.push(
      c.x,
      c.y,
      c.x + Math.cos(a0) * radius,
      c.y + Math.sin(a0) * radius,
      c.x + Math.cos(a1) * radius,
      c.y + Math.sin(a1) * radius,
    );
  }
  return out;
}

/** Triangles for a shape, plus (for clipped circles) the clip polygon's triangles. */
export function shapeTriangles(shape: RegionShape): { fill: number[]; clip: number[] | null } {
  switch (shape.kind) {
    case 'polygon':
      return { fill: polygonTriangles(shape.loops), clip: null };
    case 'polyline':
      return { fill: polylineTriangles(shape.points, shape.width, shape.closed), clip: null };
    case 'circle':
      return {
        fill: circleTriangles(shape.center, shape.radius, 48),
        clip: shape.clip ? polygonTriangles([shape.clip]) : null,
      };
  }
}

export function shapeBBox(shape: RegionShape): BBox | null {
  const b: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (x: number, y: number, pad = 0): void => {
    b.minX = Math.min(b.minX, x - pad);
    b.minY = Math.min(b.minY, y - pad);
    b.maxX = Math.max(b.maxX, x + pad);
    b.maxY = Math.max(b.maxY, y + pad);
  };
  switch (shape.kind) {
    case 'polygon':
      for (const p of shape.loops[0] ?? []) add(p.x, p.y);
      break;
    case 'polyline':
      for (const p of shape.points) add(p.x, p.y, shape.width / 2);
      break;
    case 'circle':
      add(shape.center.x, shape.center.y, shape.radius);
      break;
  }
  return Number.isFinite(b.minX) ? b : null;
}

export function unionBBox(boxes: readonly (BBox | null)[]): BBox | null {
  let out: BBox | null = null;
  for (const b of boxes) {
    if (!b) continue;
    out = out
      ? {
          minX: Math.min(out.minX, b.minX),
          minY: Math.min(out.minY, b.minY),
          maxX: Math.max(out.maxX, b.maxX),
          maxY: Math.max(out.maxY, b.maxY),
        }
      : { ...b };
  }
  return out;
}

/** Sum of absolute triangle areas (for tests). */
export function trianglesArea(tris: readonly number[]): number {
  let a = 0;
  for (let i = 0; i + 5 < tris.length; i += 6) {
    const [x0, y0, x1, y1, x2, y2] = tris.slice(i, i + 6) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    a += Math.abs((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)) / 2;
  }
  return a;
}
