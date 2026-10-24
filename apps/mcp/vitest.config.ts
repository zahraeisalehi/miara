import { defineProject } from 'vitest/config';

// The CLI and stdio tests spawn processes / run full approval flows; under the parallel root run they need headroom.
export default defineProject({
  test: { name: '@miara/mcp', testTimeout: 20_000 },
});
