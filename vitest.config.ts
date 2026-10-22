import { defineConfig } from 'vitest/config';

// One root `pnpm test` runs every workspace package as its own project.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*', 'examples/*'],
  },
});
