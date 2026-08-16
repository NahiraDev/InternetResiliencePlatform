import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: workspaceRoot,
  test: {
    environment: 'node',
    include: ['packages/resilience-runtime/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['packages/resilience-runtime/src/**/*.ts'],
      exclude: ['packages/resilience-runtime/src/index.ts'],
    },
  },
});
