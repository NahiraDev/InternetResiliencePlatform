import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['packages/core/src/index.ts'],
      exclude: [
        '**/dist/**',
        '**/node_modules/**',
        '**/*.config.*',
        '**/apps/**',
        '**/packages/{auth,database,events,network,queue,sdk,shared,telemetry,types,utils}/src/**',
      ],
    },
  },
});
