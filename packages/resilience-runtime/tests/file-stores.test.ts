import { afterEach, describe, expect, it } from 'vitest';
import { appendFileSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCanonicalRuntime, FileDecisionStore, FileIncidentStore } from '../src/index.js';
import type { DecisionRecord, Incident } from '../src/domain/types.js';

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'irp-stores-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const decision = (id: string, extra: Record<string, unknown> = {}): DecisionRecord =>
  ({ decisionId: id, runtimeStateBefore: 'idle', runtimeStateAfter: 'idle', ...extra }) as unknown as DecisionRecord;
const incident = (id: string): Incident => ({ id, severity: 'warning', summary: id }) as unknown as Incident;

describe('FileDecisionStore', () => {
  it('survives a restart and returns records by id', async () => {
    const path = join(tmp(), 'state', 'decisions.jsonl');
    const first = new FileDecisionStore(path);
    await first.put(decision('d1'));
    await first.put(decision('d2'));
    first.close();

    const second = new FileDecisionStore(path);
    expect((await second.list()).map((d) => d.decisionId)).toEqual(['d1', 'd2']);
    expect((await second.get('d2'))?.decisionId).toBe('d2');
    expect(await second.get('missing')).toBeUndefined();
  });

  it('keeps the latest version of a record that is written twice', async () => {
    const path = join(tmp(), 'decisions.jsonl');
    const store = new FileDecisionStore(path);
    await store.put(decision('d1', { note: 'first' }));
    await store.put(decision('d1', { note: 'second' }));
    store.close();
    const reopened = new FileDecisionStore(path);
    const rows = await reopened.list();
    expect(rows).toHaveLength(1);
    expect((rows[0] as unknown as { note: string }).note).toBe('second');
  });

  it('drops a torn final line left by a crash and heals the file', async () => {
    const path = join(tmp(), 'decisions.jsonl');
    const store = new FileDecisionStore(path);
    await store.put(decision('d1'));
    store.close();
    appendFileSync(path, '{"decisionId":"d2","runtimeSta'); // power loss mid-append

    const reopened = new FileDecisionStore(path);
    expect((await reopened.list()).map((d) => d.decisionId)).toEqual(['d1']);
    expect(reopened.status().droppedTornTail).toBe(true);
    await reopened.put(decision('d3'));
    reopened.close();
    // After healing, every line parses: the torn bytes did not corrupt the next append.
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines.map((l) => (JSON.parse(l) as { decisionId: string }).decisionId)).toEqual(['d1', 'd3']);
  });

  it('skips corrupt lines in the middle and reports them', async () => {
    const path = join(tmp(), 'decisions.jsonl');
    writeFileSync(
      path,
      `${JSON.stringify(decision('a'))}\nnot json\n${JSON.stringify({ unrelated: true })}\n${JSON.stringify(decision('b'))}\n`,
    );
    const store = new FileDecisionStore(path);
    expect((await store.list()).map((d) => d.decisionId)).toEqual(['a', 'b']);
    expect(store.status().skippedCorruptLines).toBe(2);
  });

  it('stays bounded: compaction keeps only the newest records', async () => {
    const path = join(tmp(), 'decisions.jsonl');
    const store = new FileDecisionStore(path, { maxRecords: 5 });
    for (let i = 0; i < 40; i += 1) await store.put(decision(`d${String(i).padStart(2, '0')}`));
    const ids = (await store.list()).map((d) => d.decisionId);
    expect(ids.length).toBeLessThanOrEqual(10);
    expect(ids.at(-1)).toBe('d39');
    expect(store.status().compactions).toBeGreaterThan(0);
    expect(readFileSync(path, 'utf8').trim().split('\n').length).toBeLessThanOrEqual(10);
  });

  it('creates files readable only by the owner', async () => {
    const path = join(tmp(), 'decisions.jsonl');
    const store = new FileDecisionStore(path);
    await store.put(decision('d1'));
    expect(statSync(path).mode & 0o077).toBe(0);
  });

  it('rejects an invalid retention bound', () => {
    expect(() => new FileDecisionStore(join(tmp(), 'x.jsonl'), { maxRecords: 0 })).toThrow(RangeError);
  });
});

describe('FileIncidentStore', () => {
  it('persists incidents across instances', async () => {
    const path = join(tmp(), 'incidents.jsonl');
    const a = new FileIncidentStore(path);
    await a.put(incident('i1'));
    a.close();
    expect((await new FileIncidentStore(path).list()).map((i) => i.id)).toEqual(['i1']);
  });
});

describe('ResilienceRuntime with durable stores', () => {
  it('records a real cycle decision that a new runtime instance can read back', async () => {
    const dir = tmp();
    const decisionStore = new FileDecisionStore(join(dir, 'decisions.jsonl'));
    const incidentStore = new FileIncidentStore(join(dir, 'incidents.jsonl'));
    const { runtime } = createCanonicalRuntime({
      executionMode: 'simulation',
      runtimeId: 'durable-test',
      decisionStore,
      incidentStore,
    });
    const record = await runtime.cycle({ mode: 'simulation' });
    decisionStore.close();
    incidentStore.close();

    const restarted = new FileDecisionStore(join(dir, 'decisions.jsonl'));
    const rows = await restarted.list();
    expect(rows.map((r) => r.decisionId)).toContain(record.decisionId);
    restarted.close();
  });
});
