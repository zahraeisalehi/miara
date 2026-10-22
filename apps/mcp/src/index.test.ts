import { describe, expect, it } from 'vitest';

import { APP_NAME, DEPENDS_ON } from './index.js';

describe(APP_NAME, () => {
  it('links to @miara/core through the workspace', () => {
    expect(DEPENDS_ON).toBe('@miara/core');
  });
});
