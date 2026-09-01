import { describe, expect, it } from 'vitest';
import { KernelError, KernelRuntime } from './index.js';

const waitForAbort = (signal: AbortSignal): Promise<never> => new Promise((_, reject) => {
  if (signal.aborted) return reject(signal.reason);
  signal.addEventListener('abort', () => reject(signal.reason), { once: true });
});

describe('kernel cancellation and timeouts', () => {
  it('enforces workflow timeout and propagates abort to the operation context', async () => {
    const kernel = new KernelRuntime();
    kernel.registerContract({
      namespace: 'health',
      version: '1.0.0',
      operations: {
        slow: {
          capability: 'health.inspect',
          execute: async (_input, context) => waitForAbort(context.signal),
        },
      },
    });

    await expect(kernel.workflows.run({
      id: 'timeout-test',
      trigger: 'test',
      timeoutMs: 10,
      steps: [{ id: 'slow', action: 'health.slow', capability: 'health.inspect' }],
    }, kernel.context())).rejects.toMatchObject({
      code: 'WORKFLOW_TIMEOUT',
    });
  });

  it('enforces operation timeout and aborts the operation context', async () => {
    const kernel = new KernelRuntime();
    kernel.registerContract({
      namespace: 'health',
      version: '1.0.0',
      operations: {
        slow: {
          capability: 'health.inspect',
          execute: async (_input, context) => waitForAbort(context.signal),
        },
      },
    });

    await expect(kernel.execute('health', 'slow', undefined, { timeoutMs: 10 })).rejects.toMatchObject({
      code: 'OPERATION_TIMEOUT',
    });
  });

  it('rejects invalid timeout values before scheduling a timer', async () => {
    const kernel = new KernelRuntime();
    await expect(kernel.execute('health', 'missing', undefined, { timeoutMs: -1 })).rejects.toBeInstanceOf(KernelError);
  });
});
