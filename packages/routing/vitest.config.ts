import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@irp/connectivity': r('../connectivity/src/index.ts'),
      '@irp/events': r('../events/src/index.ts'),
      '@irp/kernel': r('../kernel/src/index.ts'),
      '@irp/shared': r('../shared/src/index.ts'),
      '@irp/telemetry': r('../telemetry/src/index.ts'),
    },
  },
});
