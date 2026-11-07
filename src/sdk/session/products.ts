import {
  LIP_FINISH_PARAMS,
  LIP_RECIPES,
  pigmentParams,
  type LipCategory,
  type LipFinish,
} from '../render/recipes';
import type { EffectSpec } from './faceView';

/** A lip product as a shop describes it — no rendering knobs. */
export interface LipProduct {
  id: string;
  category: LipCategory;
  /** Shade, '#RRGGBB' (ideally measured from the real product under daylight/D65). */
  color: string;
  /** Defaults to the category's usual finish. */
  finish?: LipFinish;
  /** 0–1 shopper intensity slider (how heavily it is applied). Default 1. */
  intensity?: number;
}

/** Turn a lip product into a render effect using the category + finish recipe. */
export function lipProductEffect(p: LipProduct): EffectSpec {
  const recipe = LIP_RECIPES[p.category];
  const finish = p.finish ?? recipe.defaultFinish;
  const intensity = Math.min(1, Math.max(0, p.intensity ?? 1));
  return {
    id: p.id,
    regions: recipe.regions,
    color: p.color,
    blend: 'pigment',
    finish: 'satin', // generic finish is unused by the pigment technique
    opacity: recipe.opacity * LIP_FINISH_PARAMS[finish].opacityScale * intensity,
    feather: recipe.feather,
    featherInset: recipe.featherInset,
    pigment: pigmentParams(p.category, finish),
    lipHighlight: recipe.regions.includes('lips'),
  };
}
