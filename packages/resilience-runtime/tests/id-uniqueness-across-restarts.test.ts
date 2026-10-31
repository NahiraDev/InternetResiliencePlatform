import { describe, expect, it, vi } from 'vitest';

describe('runtime ids stay unique across process restarts', () => {
  it('a freshly loaded module (a restarted process) does not re-issue earlier ids', async () => {
    vi.resetModules();
    const first = await import('../src/domain/ids.js');
    const before = [first.nextId('decision'), first.nextId('decision')];
    vi.resetModules();
    const restarted = await import('../src/domain/ids.js');
    // Counter restarts at 1 again in the "new process"...
    const after = [restarted.nextId('decision'), restarted.nextId('decision')];
    expect(new Set([...before, ...after]).size).toBe(4);
  });

  it('ids remain ordered within a process', async () => {
    const { nextId } = await import('../src/domain/ids.js');
    const ids = Array.from({ length: 5 }, () => nextId('x'));
    expect([...ids].sort()).toEqual(ids);
  });

  it('a durable store keeps both runs when two processes issue their first decision id', async () => {
    const { FileDecisionStore } = await import('../src/persistence/file-stores.js');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'irp-ids-'));
    try {
      const path = join(dir, 'decisions.jsonl');
      vi.resetModules();
      const run1 = await import('../src/domain/ids.js');
      const a = new FileDecisionStore(path);
      await a.put({ decisionId: run1.nextId('decision') } as never);
      a.close();
      vi.resetModules();
      const run2 = await import('../src/domain/ids.js');
      const b = new FileDecisionStore(path);
      await b.put({ decisionId: run2.nextId('decision') } as never);
      expect((await b.list()).length).toBe(2);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
