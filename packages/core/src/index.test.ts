import { describe, expect, it } from 'vitest';

import * as core from './index.js';

describe('@miara/core', () => {
  it('exposes every ARCHITECTURE module', () => {
    for (const name of [
      'liara',
      'tools',
      'policy',
      'workflows',
      'diagnosis',
      'llm',
      'timeline',
      'db',
    ]) {
      expect(core).toHaveProperty(name);
    }
    expect(core.CORE_PACKAGE).toBe('@miara/core');
  });
});
