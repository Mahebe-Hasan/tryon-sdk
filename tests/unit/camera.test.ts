import { describe, expect, it } from 'vitest';
import { classifyCameraError } from '../../src/sdk/camera/camera';

const err = (name: string): Error => Object.assign(new Error(name), { name });

describe('classifyCameraError', () => {
  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-camera'],
    ['OverconstrainedError', 'no-camera'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'in-use'],
    ['WeirdError', 'error'],
  ])('%s → %s', (name, state) => {
    expect(classifyCameraError(err(name))).toBe(state);
  });

  it('handles DOMException-like objects and junk', () => {
    expect(classifyCameraError({ name: 'NotAllowedError' })).toBe('denied');
    expect(classifyCameraError('nope')).toBe('error');
    expect(classifyCameraError(null)).toBe('error');
  });
});
