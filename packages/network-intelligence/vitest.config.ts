import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineProject({
  root,

  test: {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**'],
  },
});
