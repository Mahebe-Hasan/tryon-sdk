import { describe, expect, it } from 'vitest';
import {
  LIP_CATEGORIES,
  LIP_FINISHES,
  LIP_FINISH_PARAMS,
  LIP_RECIPES,
  pigmentParams,
} from '../../src/sdk/render/recipes';
import { lipProductEffect } from '../../src/sdk/session/products';

describe('lip recipes', () => {
  it('every category × finish gives parameters in valid ranges', () => {
    for (const c of LIP_CATEGORIES) {
      for (const f of LIP_FINISHES) {
        const p = pigmentParams(c, f);
        for (const v of [
          p.kL,
          p.kC,
          p.roughness,
          p.specTint,
          p.glossSpot,
          p.sparkle,
          p.lightAdapt,
        ]) {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1);
        }
        expect(p.specScale).toBeGreaterThan(0);
        expect(p.sparkleDensity).toBeGreaterThan(0);
      }
    }
  });

  it('uses LipAT roughness: gloss 0.1, matte 0.7', () => {
    expect(LIP_FINISH_PARAMS.gloss.roughness).toBe(0.1);
    expect(LIP_FINISH_PARAMS.matte.roughness).toBe(0.7);
  });

  it('coverage is ordered: liquid lipstick > lipstick > stain > gloss', () => {
    const o = (c: keyof typeof LIP_RECIPES) => LIP_RECIPES[c].opacity;
    expect(o('liquid-lipstick')).toBeGreaterThan(o('lipstick'));
    expect(o('lipstick')).toBeGreaterThan(o('lip-stain'));
    expect(o('lip-stain')).toBeGreaterThan(o('lip-gloss'));
    // and full-coverage products hide more lip texture
    expect(LIP_RECIPES['liquid-lipstick'].kL).toBeLessThan(LIP_RECIPES['lip-gloss'].kL);
  });

  it('lips stay inside the lip line (inward feather)', () => {
    for (const c of ['lipstick', 'liquid-lipstick', 'lip-gloss', 'lip-stain'] as const) {
      expect(LIP_RECIPES[c].featherInset).toBe(1);
    }
  });
});

describe('lipProductEffect', () => {
  it('builds a pigment effect from category + shade, scaled by intensity', () => {
    const fx = lipProductEffect({
      id: 'x',
      category: 'lipstick',
      color: '#9b1b30',
      intensity: 0.5,
    });
    expect(fx.blend).toBe('pigment');
    expect(fx.regions).toEqual(['lips']);
    expect(fx.opacity).toBeCloseTo(LIP_RECIPES.lipstick.opacity * 0.5);
    expect(fx.pigment?.roughness).toBe(LIP_FINISH_PARAMS.satin.roughness); // default finish
    expect(fx.lipHighlight).toBe(true);
  });

  it('sheer finish lowers coverage; liner uses the lip line without a lip highlight', () => {
    const sheer = lipProductEffect({
      id: 's',
      category: 'lipstick',
      color: '#c27c7c',
      finish: 'sheer',
    });
    expect(sheer.opacity).toBeLessThan(LIP_RECIPES.lipstick.opacity);
    const liner = lipProductEffect({ id: 'l', category: 'lip-liner', color: '#7b2d4a' });
    expect(liner.regions).toEqual(['lipLine']);
    expect(liner.lipHighlight).toBe(false);
  });

  it('clamps intensity', () => {
    expect(
      lipProductEffect({ id: 'a', category: 'lipstick', color: '#000000', intensity: 3 }).opacity,
    ).toBeCloseTo(LIP_RECIPES.lipstick.opacity);
  });
});
