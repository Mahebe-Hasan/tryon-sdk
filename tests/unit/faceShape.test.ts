import { describe, expect, it } from 'vitest';
import {
  FACE_SHAPES,
  classifyFaceShape,
  type FaceShape,
  type FaceShapeFeatures,
} from '../../src/sdk/tracking/faceShape';
import { FACE_SHAPE_PLACEMENTS, CONCEALER_RECIPES } from '../../src/sdk/render/placements';
import { BLUSH_STYLES } from '../../src/sdk/render/faceRecipes';
import { productEffects } from '../../src/sdk/session/products';
import { computeRegions, type RegionId } from '../../src/sdk/tracking/regions';
import { polylineTriangles, trianglesArea } from '../../src/sdk/render/mask';
import { CompareSlider } from '../../src/sdk/session/compare';

/** Real measurements (MediaPipe on labelled reference faces, 2026-11-08). */
const SAMPLES: [FaceShape, Omit<FaceShapeFeatures, 'yaw'>][] = [
  ['oval', { length: 1.179, forehead: 0.868, jaw: 0.789, jawAngle: 134.83 }],
  ['oval', { length: 1.173, forehead: 0.859, jaw: 0.782, jawAngle: 135.19 }],
  ['oblong', { length: 1.201, forehead: 0.865, jaw: 0.787, jawAngle: 135.87 }],
  ['oblong', { length: 1.202, forehead: 0.865, jaw: 0.806, jawAngle: 131.43 }],
  ['oblong', { length: 1.203, forehead: 0.857, jaw: 0.805, jawAngle: 132.96 }],
  ['diamond', { length: 1.194, forehead: 0.852, jaw: 0.777, jawAngle: 136.49 }],
  ['diamond', { length: 1.209, forehead: 0.856, jaw: 0.778, jawAngle: 137.37 }],
  ['round', { length: 1.118, forehead: 0.871, jaw: 0.773, jawAngle: 136.13 }],
  ['round', { length: 1.152, forehead: 0.844, jaw: 0.79, jawAngle: 141.78 }],
  ['heart', { length: 1.164, forehead: 0.878, jaw: 0.771, jawAngle: 139.17 }],
  ['heart', { length: 1.178, forehead: 0.876, jaw: 0.776, jawAngle: 138.38 }],
  ['heart', { length: 1.145, forehead: 0.873, jaw: 0.754, jawAngle: 141.16 }],
  ['triangle', { length: 1.135, forehead: 0.836, jaw: 0.793, jawAngle: 133.94 }],
  ['square', { length: 1.14, forehead: 0.799, jaw: 0.851, jawAngle: 128.87 }],
];

describe('face shape classification', () => {
  it('matches the labelled calibration faces', () => {
    for (const [shape, f] of SAMPLES) {
      expect(classifyFaceShape({ ...f, yaw: 1 }).shape, `${shape} ${JSON.stringify(f)}`).toBe(
        shape,
      );
    }
  });

  it('returns a distance for every shape', () => {
    const { distances } = classifyFaceShape({
      length: 1.165,
      forehead: 0.865,
      jaw: 0.79,
      jawAngle: 135.5,
      yaw: 1,
    });
    expect(Object.keys(distances).sort()).toEqual([...FACE_SHAPES].sort());
  });
});

describe('face-shape placements', () => {
  const landmarks = Array.from({ length: 478 }, (_, i) => ({
    x: (i % 22) / 22,
    y: Math.floor(i / 22) / 22,
    z: 0,
  }));
  const ids = new Set(computeRegions(landmarks, 640, 480).map((r) => r.id));

  it('every placement points at regions that exist', () => {
    for (const shape of FACE_SHAPES) {
      const p = FACE_SHAPE_PLACEMENTS[shape];
      for (const id of [...p.contour, ...p.bronzer, ...p.highlighter, ...BLUSH_STYLES[p.blush]]) {
        expect(ids.has(id as RegionId), `${shape}: ${id}`).toBe(true);
      }
    }
  });

  it('follows the makeup-artist rules', () => {
    expect(FACE_SHAPE_PLACEMENTS.round.blush).toBe('vertical');
    expect(FACE_SHAPE_PLACEMENTS.round.contour).toContain('contourSideFace.R');
    expect(FACE_SHAPE_PLACEMENTS.oblong.contour).toEqual(
      expect.arrayContaining(['contourHairline', 'contourUnderChin']),
    );
    expect(FACE_SHAPE_PLACEMENTS.oblong.blush).toBe('sunkissed');
    expect(FACE_SHAPE_PLACEMENTS.square.contour).toContain('contourJawCorner.L');
    expect(FACE_SHAPE_PLACEMENTS.heart.highlighter).toContain('highlightChin');
  });

  it('products are placed for the face shape; an explicit blush style wins', () => {
    const blush = { id: 'b', category: 'blush' as const, color: '#e07a8f' };
    expect(productEffects(blush, 'round')[0]?.regions).toEqual([
      'blushVertical.R',
      'blushVertical.L',
    ]);
    expect(productEffects({ ...blush, style: 'apples' }, 'round')[0]?.regions).toEqual([
      'blushApples.R',
      'blushApples.L',
    ]);
    expect(
      productEffects({ id: 'c', category: 'contour', color: '#6e5548' }, 'oblong')[0]?.regions,
    ).toContain('contourHairline');
  });
});

describe('concealer types (standard colour theory)', () => {
  it('peach targets dark spots under the eyes; green targets redness only', () => {
    expect(CONCEALER_RECIPES.peach.target).toBe('dark');
    expect(CONCEALER_RECIPES.peach.regions).toEqual(['underEye.R', 'underEye.L']);
    expect(CONCEALER_RECIPES.green.target).toBe('red');
    const [green] = productEffects({
      id: 'g',
      category: 'concealer',
      color: '#a9d6a0',
      variant: 'green',
    });
    expect(green?.pigment?.target).toBe(2);
    const [bright] = productEffects({
      id: 'h',
      category: 'concealer',
      color: '#f6e4d5',
      variant: 'brighten',
    });
    expect(bright?.regions).toContain('highlightNose');
    expect(bright?.pigment?.target).toBe(0);
  });
});

describe('tapered strokes', () => {
  it('a taper covers less area than the full-width stroke', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const full = trianglesArea(polylineTriangles(pts, 20, false, 8));
    const taper = trianglesArea(polylineTriangles(pts, 20, false, 8, [20, 4]));
    expect(taper).toBeLessThan(full * 0.75);
  });
});

describe('compare slider mapping', () => {
  const stage = { clientWidth: 400, clientHeight: 800 } as HTMLElement;
  const slider = Object.create(CompareSlider.prototype) as CompareSlider;
  const at = (pos: number, mirrored: boolean) => {
    (slider as unknown as { pos: number }).pos = pos;
    return slider.toCanvas(stage, 720, 1280, mirrored);
  };

  it('maps the screen line to canvas x for object-fit: cover', () => {
    // 720×1280 in a 400×800 stage: scale 0.625 → 450 px wide, 25 px cropped each side.
    expect(at(0.5, false).split).toBeCloseTo(0.5);
    // Screen-left edge = canvas x 25 px (the 25 px left of it are cropped off-screen).
    expect(at(0, false).split).toBeCloseTo(25 / 450);
  });

  it('with a mirrored (front) camera, screen-left "before" is canvas-right', () => {
    const r = at(0.25, true);
    expect(r.beforeLow).toBe(false);
    expect(r.split).toBeCloseTo(1 - (100 + 25) / 450);
    expect(at(0.25, false).beforeLow).toBe(true);
  });

  it('line fully left = makeup everywhere; fully right = no makeup', () => {
    // Not mirrored: "before" is canvas x < split. Visible canvas x spans 25/450 … 425/450.
    expect(at(0, false).split).toBeLessThanOrEqual(25 / 450 + 1e-9); // nothing visible is before
    expect(at(1, false).split).toBeGreaterThanOrEqual(425 / 450 - 1e-9); // everything visible is before
  });
});
