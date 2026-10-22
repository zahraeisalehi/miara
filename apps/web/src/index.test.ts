import { describe, expect, it } from 'vitest';

import { DEPENDS_ON, WEB_PORT } from './index.js';

describe('@miara/web', () => {
  it('reserves port 3100 and links to @miara/core', () => {
    expect(WEB_PORT).toBe(3100);
    expect(DEPENDS_ON).toBe('@miara/core');
  });
});
