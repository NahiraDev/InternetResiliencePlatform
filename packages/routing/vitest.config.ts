import { fileURLToPath } from 'node:url';
import { defineProject } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));
const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineProject({
  root,

  resolve: {
    alias: {
      '@irp/connectivity': r('../connectivity/src/index.ts'),
      '@irp/events': r('../events/src/index.ts'),
      '@irp/kernel': r('../kernel/src/index.ts'),
      '@irp/shared': r('../shared/src/index.ts'),
      '@irp/telemetry': r('../telemetry/src/index.ts'),
    },
  },

  test: {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**'],
  },
});
