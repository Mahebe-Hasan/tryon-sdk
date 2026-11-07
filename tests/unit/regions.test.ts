import { describe, expect, it } from 'vitest';
import { FaceLandmarker } from '@mediapipe/tasks-vision';
import {
  connectionsToPaths,
  joinChains,
  polygonArea,
  type Connection,
} from '../../src/sdk/tracking/paths';
import { allRegionIndices, computeRegions } from '../../src/sdk/tracking/regions';

const edges = (pairs: [number, number][]): Connection[] =>
  pairs.map(([start, end]) => ({ start, end }));

describe('connectionsToPaths', () => {
  it('orders a shuffled closed loop', () => {
    const { closed, open } = connectionsToPaths(
      edges([
        [3, 4],
        [1, 2],
        [4, 1],
        [2, 3],
      ]),
    );
    expect(open).toEqual([]);
    expect(closed).toHaveLength(1);
    expect(closed[0]).toHaveLength(4);
    expect(new Set(closed[0])).toEqual(new Set([1, 2, 3, 4]));
  });

  it('returns open chains end to end', () => {
    const { open } = connectionsToPaths(
      edges([
        [2, 3],
        [1, 2],
      ]),
    );
    expect(open).toHaveLength(1);
    expect([open[0], [...(open[0] ?? [])].reverse()]).toContainEqual([1, 2, 3]);
  });

  it('splits MediaPipe lips into outer and inner loops', () => {
    const { closed } = connectionsToPaths(FaceLandmarker.FACE_LANDMARKS_LIPS);
    expect(closed).toHaveLength(2);
    const outer = closed.find((l) => l.includes(61));
    const inner = closed.find((l) => l.includes(78));
    expect(outer).toHaveLength(20);
    expect(inner).toHaveLength(20);
  });

  it('splits MediaPipe brows into two open chains', () => {
    const { open, closed } = connectionsToPaths(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW);
    expect(closed).toEqual([]);
    expect(open).toHaveLength(2);
  });

  it('builds a 36-point face oval and 16-point eyes', () => {
    expect(connectionsToPaths(FaceLandmarker.FACE_LANDMARKS_FACE_OVAL).closed[0]).toHaveLength(36);
    expect(connectionsToPaths(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE).closed[0]).toHaveLength(16);
  });
});

describe('geometry', () => {
  it('polygonArea of a unit square is ±1', () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    expect(Math.abs(polygonArea(sq))).toBe(1);
  });

  it('joinChains reverses the second chain when needed', () => {
    const a = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const b = [
      { x: 0, y: 1 },
      { x: 10, y: 1 },
    ];
    expect(joinChains(a, b).map((p) => p.x)).toEqual([0, 10, 10, 0]);
  });
});

describe('computeRegions', () => {
  // Synthetic "face": 478 points on a grid; we only check structure, not positions.
  const landmarks = Array.from({ length: 478 }, (_, i) => ({
    x: (i % 22) / 22,
    y: Math.floor(i / 22) / 22,
    z: 0,
  }));

  it('uses only valid landmark indices', () => {
    const idx = allRegionIndices();
    expect(Math.min(...idx)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...idx)).toBeLessThan(478);
  });

  it('produces every region from the build plan for both sides', () => {
    const regions = computeRegions(landmarks, 640, 480);
    const ids = new Set(regions.map((r) => r.id));
    expect(ids.size).toBe(regions.length);
    for (const id of [
      'lips',
      'lipLine',
      'faceSkin',
      'highlightNose',
      'highlightCupidsBow',
    ] as const) {
      expect(ids.has(id)).toBe(true);
    }
    for (const base of [
      'underEye',
      'cheek',
      'contourCheek',
      'contourJaw',
      'contourNose',
      'highlightCheek',
      'highlightBrowBone',
      'eyelid',
      'lashLine',
      'linerWing',
      'waterline',
      'brow',
      'iris',
    ]) {
      expect(ids.has(`${base}.R` as never)).toBe(true);
      expect(ids.has(`${base}.L` as never)).toBe(true);
    }
  });

  it('lips polygon has the outer loop first (larger) and the inner loop second', () => {
    const lips = computeRegions(landmarks, 640, 480).find((r) => r.id === 'lips');
    expect(lips?.shape.kind).toBe('polygon');
    if (lips?.shape.kind !== 'polygon') return;
    const [outer, inner] = lips.shape.loops;
    expect(Math.abs(polygonArea(outer ?? []))).toBeGreaterThanOrEqual(
      Math.abs(polygonArea(inner ?? [])),
    );
  });
});
