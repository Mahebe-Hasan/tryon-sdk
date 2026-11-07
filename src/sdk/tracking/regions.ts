import { FaceLandmarker } from '@mediapipe/tasks-vision';
import {
  centroid,
  connectionsToPaths,
  dist,
  joinChains,
  lerp,
  polygonArea,
  smoothClosed,
  type Connection,
  type Vec2,
} from './paths';
import type { Point3 } from './smoothing';

/*
 * Face regions (build plan §5.3). "L"/"R" are the SUBJECT's left/right (MediaPipe convention),
 * so the R regions appear on the image's left in an unmirrored frame.
 *
 * Lips, eyes, brows, iris and face oval come from MediaPipe's exported connection constants.
 * Everything else uses hand-picked mesh indices below — check them with `?debug=1` → Regions,
 * and tune here (or with the factors in REGION_CONFIG) rather than in effect code.
 */

export type RegionShape =
  /** Filled with the even-odd rule, so later loops cut holes (e.g. inner lips, eyes). */
  | { kind: 'polygon'; loops: Vec2[][] }
  /** Stroke along points. `width` in pixels. */
  | { kind: 'polyline'; points: Vec2[]; width: number; closed?: boolean }
  /** `clip` (optional) limits the circle, e.g. iris inside the eyelid opening. */
  | { kind: 'circle'; center: Vec2; radius: number; clip?: Vec2[] };

export type RegionId =
  | 'lips'
  | 'lipLine'
  | 'faceSkin'
  | 'underEye.R'
  | 'underEye.L'
  | 'cheek.R'
  | 'cheek.L'
  | 'contourCheek.R'
  | 'contourCheek.L'
  | 'contourJaw.R'
  | 'contourJaw.L'
  | 'contourNose.R'
  | 'contourNose.L'
  | 'highlightCheek.R'
  | 'highlightCheek.L'
  | 'highlightNose'
  | 'highlightCupidsBow'
  | 'highlightBrowBone.R'
  | 'highlightBrowBone.L'
  | 'eyelid.R'
  | 'eyelid.L'
  | 'eyelidLid.R'
  | 'eyelidLid.L'
  | 'eyelidCrease.R'
  | 'eyelidCrease.L'
  | 'eyelidOuter.R'
  | 'eyelidOuter.L'
  | 'lashLine.R'
  | 'lashLine.L'
  | 'linerWing.R'
  | 'linerWing.L'
  | 'waterline.R'
  | 'waterline.L'
  | 'brow.R'
  | 'brow.L'
  | 'iris.R'
  | 'iris.L';

export type RegionGroup = 'lips' | 'skin' | 'cheeks' | 'contour' | 'highlight' | 'eyes' | 'brows';

export interface Region {
  id: RegionId;
  group: RegionGroup;
  shape: RegionShape;
}

/** Size factors, all relative to face width (distance between landmarks 234 and 454). */
export const REGION_CONFIG = {
  cheekRadius: 0.11,
  contourWidth: 0.07,
  jawContourWidth: 0.06,
  noseContourWidth: 0.03,
  highlightWidth: 0.04,
  lashLineWidth: 0.012,
  waterlineWidth: 0.006,
  wingLength: 0.07,
  /** How much the liner wing tilts up (0 = straight out, 1 = 45°). */
  wingLift: 0.55,
  /** Brow-bone highlight position between brow (0) and lid crease (1). */
  browBoneT: 0.3,
  /** Cupid's-bow highlight: move the lip points this far toward the philtrum. */
  cupidsBowT: 0.35,
  /** Extra curve points per lip-outline segment (0 = MediaPipe's straight segments). */
  lipCurveSubdivisions: 3,
  /**
   * Eyeshadow zones as fractions of the way from the lash line (0) to the brow (1):
   * lid = 0…lidTop, crease band = creaseBottom…creaseTop, outer V = outer third up to outerTop.
   */
  eyeshadow: { lidTop: 0.45, creaseBottom: 0.3, creaseTop: 0.72, outerTop: 0.6, outerPoints: 4 },
};

// ---- Index sets from MediaPipe constants -------------------------------------------------

function loopsOf(c: readonly Connection[]): number[][] {
  return connectionsToPaths(c).closed;
}
function chainsOf(c: readonly Connection[]): number[][] {
  return connectionsToPaths(c).open;
}

const FL = FaceLandmarker;
const LIP_LOOPS = loopsOf(FL.FACE_LANDMARKS_LIPS);
const EYE_R = loopsOf(FL.FACE_LANDMARKS_RIGHT_EYE)[0] ?? [];
const EYE_L = loopsOf(FL.FACE_LANDMARKS_LEFT_EYE)[0] ?? [];
const BROW_R = chainsOf(FL.FACE_LANDMARKS_RIGHT_EYEBROW);
const BROW_L = chainsOf(FL.FACE_LANDMARKS_LEFT_EYEBROW);
const IRIS_R = loopsOf(FL.FACE_LANDMARKS_RIGHT_IRIS)[0] ?? [];
const IRIS_L = loopsOf(FL.FACE_LANDMARKS_LEFT_IRIS)[0] ?? [];
const OVAL = loopsOf(FL.FACE_LANDMARKS_FACE_OVAL)[0] ?? [];

// ---- Hand-picked index sets (outer corner → inner corner unless noted) ---------------------

const IDX = {
  R: {
    upperLid: [33, 246, 161, 160, 159, 158, 157, 173, 133],
    lowerLid: [33, 7, 163, 144, 145, 153, 154, 155, 133],
    lowerRing1: [130, 25, 110, 24, 23, 22, 26, 112, 243],
    lowerRing3: [35, 111, 117, 118, 119, 120, 121, 128, 245],
    /** Lower brow edge, outer → inner. */
    browLower: [46, 53, 52, 65, 55],
    /** Upper-lid crease ring, paired with browLower[0..3] for the brow bone. */
    creaseRing: [225, 224, 223, 222],
    cheekCenter: [50, 123],
    contourCheek: [93, 137, 147, 187],
    contourJaw: [132, 58, 172, 136, 150, 149, 176],
    contourNose: [193, 122, 196, 3, 51],
    highlightCheek: [143, 116, 117],
    irisCenter: 468,
    outerCorner: 33,
    innerCorner: 133,
  },
  L: {
    upperLid: [263, 466, 388, 387, 386, 385, 384, 398, 362],
    lowerLid: [263, 249, 390, 373, 374, 380, 381, 382, 362],
    lowerRing1: [359, 255, 339, 254, 253, 252, 256, 341, 463],
    lowerRing3: [265, 340, 346, 347, 348, 349, 350, 357, 465],
    browLower: [276, 283, 282, 295, 285],
    creaseRing: [445, 444, 443, 442],
    cheekCenter: [280, 352],
    contourCheek: [323, 366, 376, 411],
    contourJaw: [361, 288, 397, 365, 379, 378, 400],
    contourNose: [417, 351, 419, 248, 281],
    highlightCheek: [372, 345, 346],
    irisCenter: 473,
    outerCorner: 263,
    innerCorner: 362,
  },
  noseBridge: [168, 6, 197, 195],
  cupidsBow: [37, 0, 267],
  philtrum: 164,
  faceTop: 10,
  chin: 152,
  faceSideR: 234,
  faceSideL: 454,
} as const;

/** Every landmark index used by regions (for tests / debug). */
export function allRegionIndices(): number[] {
  const s = new Set<number>([
    ...LIP_LOOPS.flat(),
    ...EYE_R,
    ...EYE_L,
    ...BROW_R.flat(),
    ...BROW_L.flat(),
    ...IRIS_R,
    ...IRIS_L,
    ...OVAL,
  ]);
  const add = (v: unknown): void => {
    if (typeof v === 'number') s.add(v);
    else if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === 'object') Object.values(v).forEach(add);
  };
  add(IDX);
  return [...s].sort((a, b) => a - b);
}

// ---- Region computation ------------------------------------------------------------------

/**
 * Compute all regions in pixel space of a `width`×`height` frame (unmirrored).
 * @param landmarks normalised 0–1 landmarks (478 points)
 */
export function computeRegions(
  landmarks: readonly Point3[],
  width: number,
  height: number,
  cfg = REGION_CONFIG,
): Region[] {
  const P = (i: number): Vec2 => {
    const p = landmarks[i];
    return p ? { x: p.x * width, y: p.y * height } : { x: 0, y: 0 };
  };
  const pts = (idx: readonly number[]): Vec2[] => idx.map(P);
  const faceW = dist(P(IDX.faceSideR), P(IDX.faceSideL));
  const up = normalize(sub(P(IDX.faceTop), P(IDX.chin)));

  const lipLoops = LIP_LOOPS.map((l) => smoothClosed(pts(l), cfg.lipCurveSubdivisions)).sort(
    (a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)),
  );
  const lipOuter = lipLoops[0] ?? [];
  const lipInner = lipLoops[1] ?? [];

  const browPoly = (chains: number[][]): Vec2[] => {
    const [a, b] = chains;
    return a && b ? joinChains(pts(a), pts(b)) : pts(chains.flat());
  };
  const browR = browPoly(BROW_R);
  const browL = browPoly(BROW_L);
  const eyeR = pts(EYE_R);
  const eyeL = pts(EYE_L);

  const regions: Region[] = [
    { id: 'lips', group: 'lips', shape: { kind: 'polygon', loops: [lipOuter, lipInner] } },
    {
      id: 'lipLine',
      group: 'lips',
      shape: { kind: 'polyline', points: lipOuter, width: faceW * 0.008, closed: true },
    },
    {
      id: 'faceSkin',
      group: 'skin',
      shape: { kind: 'polygon', loops: [pts(OVAL), eyeR, eyeL, browR, browL, lipOuter] },
    },
    {
      id: 'highlightNose',
      group: 'highlight',
      shape: { kind: 'polyline', points: pts(IDX.noseBridge), width: faceW * cfg.highlightWidth },
    },
    {
      id: 'highlightCupidsBow',
      group: 'highlight',
      shape: {
        kind: 'polyline',
        points: pts(IDX.cupidsBow).map((p) => lerp(p, P(IDX.philtrum), cfg.cupidsBowT)),
        width: faceW * cfg.highlightWidth * 0.5,
      },
    },
  ];

  for (const side of ['R', 'L'] as const) {
    const s = IDX[side];
    const eye = side === 'R' ? eyeR : eyeL;
    const brow = side === 'R' ? browR : browL;
    const iris = side === 'R' ? IRIS_R : IRIS_L;
    const upperLid = pts(s.upperLid);
    const lowerLid = pts(s.lowerLid);
    const browLower = pts(s.browLower);
    // Brow resampled to the lid's point count so we can interpolate lash line → brow.
    const browAligned = resample(browLower, upperLid.length);
    const lidLine = (t: number): Vec2[] => upperLid.map((p, i) => lerp(p, browAligned[i] ?? p, t));
    const es = cfg.eyeshadow;
    const creaseLo = lidLine(es.creaseBottom);
    const outerN = Math.max(2, Math.min(upperLid.length, es.outerPoints));

    const irisCenter = P(s.irisCenter);
    const irisRadius = iris.reduce((acc, i) => acc + dist(P(i), irisCenter), 0) / iris.length;

    const outer = P(s.outerCorner);
    const outward = normalize(sub(outer, P(s.innerCorner)));
    const wingDir = normalize(add(outward, scale(up, cfg.wingLift)));

    const crease = pts(s.creaseRing);
    const browBone = crease.map((c, i) => lerp(browLower[i] ?? c, c, cfg.browBoneT));

    regions.push(
      {
        id: `underEye.${side}`,
        group: 'skin',
        shape: { kind: 'polygon', loops: [[...pts(s.lowerRing1), ...pts(s.lowerRing3).reverse()]] },
      },
      {
        id: `cheek.${side}`,
        group: 'cheeks',
        shape: {
          kind: 'circle',
          center: centroid(pts(s.cheekCenter)),
          radius: faceW * cfg.cheekRadius,
        },
      },
      {
        id: `contourCheek.${side}`,
        group: 'contour',
        shape: { kind: 'polyline', points: pts(s.contourCheek), width: faceW * cfg.contourWidth },
      },
      {
        id: `contourJaw.${side}`,
        group: 'contour',
        shape: { kind: 'polyline', points: pts(s.contourJaw), width: faceW * cfg.jawContourWidth },
      },
      {
        id: `contourNose.${side}`,
        group: 'contour',
        shape: {
          kind: 'polyline',
          points: pts(s.contourNose),
          width: faceW * cfg.noseContourWidth,
        },
      },
      {
        id: `highlightCheek.${side}`,
        group: 'highlight',
        shape: {
          kind: 'polyline',
          points: pts(s.highlightCheek),
          width: faceW * cfg.highlightWidth,
        },
      },
      {
        id: `highlightBrowBone.${side}`,
        group: 'highlight',
        shape: { kind: 'polyline', points: browBone, width: faceW * cfg.highlightWidth * 0.6 },
      },
      {
        id: `eyelid.${side}`,
        group: 'eyes',
        shape: { kind: 'polygon', loops: [[...upperLid, ...[...browLower].reverse()]] },
      },
      {
        id: `eyelidLid.${side}`,
        group: 'eyes',
        shape: { kind: 'polygon', loops: [[...upperLid, ...lidLine(es.lidTop).reverse()]] },
      },
      {
        id: `eyelidCrease.${side}`,
        group: 'eyes',
        shape: { kind: 'polygon', loops: [[...creaseLo, ...lidLine(es.creaseTop).reverse()]] },
      },
      {
        id: `eyelidOuter.${side}`,
        group: 'eyes',
        shape: {
          kind: 'polygon',
          loops: [
            [...upperLid.slice(0, outerN), ...lidLine(es.outerTop).slice(0, outerN).reverse()],
          ],
        },
      },
      {
        id: `lashLine.${side}`,
        group: 'eyes',
        shape: { kind: 'polyline', points: upperLid, width: faceW * cfg.lashLineWidth },
      },
      {
        id: `linerWing.${side}`,
        group: 'eyes',
        shape: {
          kind: 'polyline',
          points: [outer, add(outer, scale(wingDir, faceW * cfg.wingLength))],
          width: faceW * cfg.lashLineWidth,
        },
      },
      {
        id: `waterline.${side}`,
        group: 'eyes',
        shape: { kind: 'polyline', points: lowerLid, width: faceW * cfg.waterlineWidth },
      },
      { id: `brow.${side}`, group: 'brows', shape: { kind: 'polygon', loops: [brow] } },
      {
        id: `iris.${side}`,
        group: 'eyes',
        shape: { kind: 'circle', center: irisCenter, radius: irisRadius, clip: eye },
      },
    );
  }
  return regions;
}

/** Resample a polyline to n points evenly spaced by arc length. */
function resample(pts: readonly Vec2[], n: number): Vec2[] {
  if (pts.length === 0 || n < 2) return [...pts];
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    cum.push((cum[i - 1] as number) + dist(pts[i - 1] as Vec2, pts[i] as Vec2));
  }
  const total = cum[cum.length - 1] as number;
  const out: Vec2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    while (j < pts.length - 2 && (cum[j + 1] as number) < d) j++;
    const seg = (cum[j + 1] as number) - (cum[j] as number) || 1;
    out.push(lerp(pts[j] as Vec2, pts[j + 1] ?? (pts[j] as Vec2), (d - (cum[j] as number)) / seg));
  }
  return out;
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}
function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}
function scale(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}
function normalize(a: Vec2): Vec2 {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
}
