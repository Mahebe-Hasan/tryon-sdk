import { describe, expect, it } from 'vitest';
import {
  circleTriangles,
  polygonTriangles,
  polylineTriangles,
  shapeBBox,
  shapeTriangles,
  trianglesArea,
  unionBBox,
} from '../../src/sdk/render/mask';
import { faceMetrics } from '../../src/sdk/tracking/metrics';

const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];

describe('polygonTriangles', () => {
  it('triangulates a square into 2 triangles with the right area', () => {
    const tris = polygonTriangles([square(0, 0, 10)]);
    expect(tris).toHaveLength(12);
    expect(trianglesArea(tris)).toBeCloseTo(100);
  });

  it('cuts holes (lips: outer minus inner)', () => {
    const tris = polygonTriangles([square(0, 0, 10), square(3, 3, 4)]);
    expect(trianglesArea(tris)).toBeCloseTo(100 - 16);
  });

  it('ignores degenerate loops', () => {
    expect(polygonTriangles([])).toEqual([]);
    expect(polygonTriangles([[{ x: 0, y: 0 }]])).toEqual([]);
    const withBadHole = polygonTriangles([square(0, 0, 10), [{ x: 1, y: 1 }]]);
    expect(trianglesArea(withBadHole)).toBeCloseTo(100);
  });
});

describe('polylineTriangles', () => {
  it('covers at least length × width for a straight stroke', () => {
    const tris = polylineTriangles(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      10,
    );
    // quad (1000) + two round caps (≈ 78.5 each, overlapping the quad by half)
    expect(trianglesArea(tris)).toBeGreaterThan(1000);
  });

  it('returns nothing for zero width or no points', () => {
    expect(polylineTriangles([], 5)).toEqual([]);
    expect(polylineTriangles([{ x: 0, y: 0 }], 0)).toEqual([]);
  });

  it('adds the closing segment when closed', () => {
    const pts = square(0, 0, 10);
    const open = polylineTriangles(pts, 2, false, 4);
    const closed = polylineTriangles(pts, 2, true, 4);
    expect(closed.length - open.length).toBe(12);
  });
});

describe('circles and bounding boxes', () => {
  it('circle area approaches πr²', () => {
    expect(trianglesArea(circleTriangles({ x: 0, y: 0 }, 10, 256))).toBeCloseTo(Math.PI * 100, 0);
  });

  it('clipped circles return the clip polygon too', () => {
    const { fill, clip } = shapeTriangles({
      kind: 'circle',
      center: { x: 5, y: 5 },
      radius: 3,
      clip: square(0, 0, 10),
    });
    expect(fill.length).toBeGreaterThan(0);
    expect(trianglesArea(clip ?? [])).toBeCloseTo(100);
  });

  it('computes and unions bounding boxes (stroke width included)', () => {
    const a = shapeBBox({ kind: 'polygon', loops: [square(0, 0, 10)] });
    const b = shapeBBox({
      kind: 'polyline',
      points: [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
      ],
      width: 4,
    });
    expect(b).toEqual({ minX: 18, minY: 18, maxX: 32, maxY: 22 });
    expect(unionBBox([a, null, b])).toEqual({ minX: 0, minY: 0, maxX: 32, maxY: 22 });
    expect(unionBBox([null])).toBeNull();
  });
});

describe('faceMetrics', () => {
  it('maps the between-eyes point to the origin and face sides to ±0.5', () => {
    const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    lm[234] = { x: 0.25, y: 0.5, z: 0 };
    lm[454] = { x: 0.75, y: 0.5, z: 0 };
    lm[168] = { x: 0.5, y: 0.4, z: 0 };
    const m = faceMetrics(lm, 400, 300);
    expect(m.width).toBeCloseTo(200);
    expect(m.roll).toBeCloseTo(0);
    const apply = (x: number, y: number): [number, number] => {
      const t = m.transform;
      return [
        (t[0] as number) * x + (t[3] as number) * y + (t[6] as number),
        (t[1] as number) * x + (t[4] as number) * y + (t[7] as number),
      ];
    };
    const [u0, v0] = apply(200, 120);
    expect(u0).toBeCloseTo(0);
    expect(v0).toBeCloseTo(0);
    const [u1] = apply(300, 120);
    expect(u1).toBeCloseTo(0.5);
  });
});
