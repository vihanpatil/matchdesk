import { describe, expect, it } from 'vitest';

import * as core from './index.js';

/**
 * The public surface of `packages/core`, asserted through the barrel rather
 * than through deep module paths.
 *
 * Coverage deliberately does NOT exempt barrel files: an earlier config
 * excluded `**\/index.ts` by glob, which would have let real logic live in any
 * index file completely unmeasured. Exercising the barrel here keeps the
 * exemption unnecessary.
 */
describe('@matchdesk/core public API', () => {
  it('exports exactly the intended surface', () => {
    expect(Object.keys(core).sort()).toEqual(['quantize', 'roundHalfUp']);
  });

  it('re-exports working implementations, not just names', () => {
    expect(core.roundHalfUp(2.5)).toBe(3);
    expect(core.quantize(0.1234564999)).toBe(0.123456);
  });
});
