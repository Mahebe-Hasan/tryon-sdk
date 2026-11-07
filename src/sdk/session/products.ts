import {
  LIP_CATEGORIES,
  LIP_FINISHES,
  LIP_FINISH_PARAMS,
  LIP_RECIPES,
  pigmentParams,
  type LipCategory,
  type LipFinish,
} from '../render/recipes';
import {
  EYESHADOW_RECIPE,
  FACE_CATEGORIES,
  FACE_RECIPES,
  facePigmentParams,
  layerParams,
  type FaceCategory,
  type FaceFinish,
} from '../render/faceRecipes';
import type { EffectSpec } from './faceView';

export type ProductCategory = LipCategory | FaceCategory;
export type ProductFinish = LipFinish | FaceFinish;

/** A product as a shop describes it — no rendering knobs. */
export interface Product {
  id: string;
  category: ProductCategory;
  /** Shade, '#RRGGBB' (ideally measured from the real product under daylight/D65). */
  color: string;
  /** Defaults to the category's usual finish; unsupported finishes fall back to it. */
  finish?: ProductFinish;
  /** 0–1 shopper intensity slider (how heavily it is applied). Default 1. */
  intensity?: number;
  /** Eyeshadow only: up to three tones. Without it, `color` goes on lid + a softer crease. */
  tones?: { lid?: string; crease?: string; outer?: string };
}

/** @deprecated use Product */
export type LipProduct = Product & { category: LipCategory; finish?: LipFinish };

/** Realistic application order (build plan §5.4): base first, lips last. */
export const DRAW_ORDER: readonly ProductCategory[] = [
  'foundation',
  'skin-tint',
  'concealer',
  'contour',
  'bronzer',
  'blush',
  'highlighter',
  'eyeshadow',
  'lip-liner',
  'lip-stain',
  'lipstick',
  'liquid-lipstick',
  'lip-gloss',
];

export function isLipCategory(c: ProductCategory): c is LipCategory {
  return (LIP_CATEGORIES as readonly string[]).includes(c);
}

export function isFaceCategory(c: ProductCategory): c is FaceCategory {
  return (FACE_CATEGORIES as readonly string[]).includes(c);
}

/** Finishes a category supports (first = default). */
export function finishesFor(c: ProductCategory): readonly ProductFinish[] {
  if (isLipCategory(c)) {
    const d = LIP_RECIPES[c].defaultFinish;
    return [d, ...LIP_FINISHES.filter((f) => f !== d)];
  }
  if (c === 'eyeshadow') return EYESHADOW_RECIPE.finishes;
  const r = FACE_RECIPES[c];
  return [r.defaultFinish, ...r.finishes.filter((f) => f !== r.defaultFinish)];
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Turn one product into render effects (eyeshadow can produce up to three). */
export function productEffects(p: Product): EffectSpec[] {
  const intensity = clamp01(p.intensity ?? 1);
  const allowed = finishesFor(p.category);
  const finish = p.finish && allowed.includes(p.finish) ? p.finish : (allowed[0] as ProductFinish);

  if (isLipCategory(p.category)) {
    const recipe = LIP_RECIPES[p.category];
    const lf = finish as LipFinish;
    return [
      {
        id: p.id,
        regions: recipe.regions,
        color: p.color,
        blend: 'pigment',
        finish: 'satin',
        opacity: recipe.opacity * LIP_FINISH_PARAMS[lf].opacityScale * intensity,
        feather: recipe.feather,
        featherInset: recipe.featherInset,
        pigment: pigmentParams(p.category, lf),
        lipHighlight: recipe.regions.includes('lips'),
      },
    ];
  }

  const ff = finish as FaceFinish;
  if (p.category === 'eyeshadow') {
    const e = EYESHADOW_RECIPE;
    const tones = p.tones;
    type Zone = 'lid' | 'crease' | 'outer';
    const parts: [Zone, string | undefined, number][] = tones
      ? [
          ['crease', tones.crease, e.crease.density],
          ['lid', tones.lid ?? p.color, e.lid.density],
          ['outer', tones.outer, e.outer.density],
        ]
      : [
          ['crease', p.color, e.crease.density * e.singleShadeCreaseScale],
          ['lid', p.color, e.lid.density],
        ];
    return parts
      .filter((x): x is [Zone, string, number] => typeof x[1] === 'string')
      .map(([zone, color, density]) => ({
        id: `${p.id}:${zone}`,
        regions: e[zone].regions,
        color,
        blend: 'layer' as const,
        finish: 'satin' as const,
        opacity: 1,
        feather: e[zone].feather,
        featherInset: 0,
        layer: layerParams(density, 0, ff, intensity),
      }));
  }

  const r = FACE_RECIPES[p.category];
  if (r.technique === 'pigment') {
    return [
      {
        id: p.id,
        regions: r.regions,
        color: p.color,
        blend: 'pigment',
        finish: 'satin',
        opacity: 1,
        feather: r.feather,
        featherInset: r.featherInset,
        pigment: facePigmentParams(r, ff, intensity),
      },
    ];
  }
  return [
    {
      id: p.id,
      regions: r.regions,
      color: p.color,
      blend: 'layer',
      finish: 'satin',
      opacity: 1,
      feather: r.feather,
      featherInset: r.featherInset,
      layer: layerParams(r.density, r.glow, ff, intensity),
    },
  ];
}

/** Effects for a full look, in application order. Later products of a category win ties. */
export function lookEffects(products: readonly Product[]): EffectSpec[] {
  const order = (c: ProductCategory): number => DRAW_ORDER.indexOf(c);
  return [...products]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => order(a.p.category) - order(b.p.category) || a.i - b.i)
    .flatMap(({ p }) => productEffects(p));
}

/** Single lip product → its effect (kept for compatibility). */
export function lipProductEffect(p: LipProduct): EffectSpec {
  return productEffects(p)[0] as EffectSpec;
}
