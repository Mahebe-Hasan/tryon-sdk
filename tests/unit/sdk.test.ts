import { describe, expect, it } from 'vitest';
import { VERSION, PRIVACY_STATEMENT, checkSupport } from '../../src/sdk/index';
import pkg from '../../package.json';

describe('sdk entry', () => {
  it('VERSION matches package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });

  it('exposes the privacy statement', () => {
    expect(PRIVACY_STATEMENT).toMatch(/stays on your device/);
  });

  it('checkSupport reports missing features without throwing', () => {
    const fakeWindow = {
      isSecureContext: false,
      navigator: {},
      document: {
        createElement: () => ({ getContext: () => null }),
      },
    } as unknown as Window;
    expect(checkSupport(fakeWindow)).toEqual({
      secureContext: false,
      camera: false,
      webgl2: false,
    });
  });
});
