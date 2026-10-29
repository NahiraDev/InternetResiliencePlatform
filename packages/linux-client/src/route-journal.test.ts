import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileRouteJournal, MemoryRouteJournal, type RouteJournalEntry } from './route-journal.js';

const entry = (planId: string, state: RouteJournalEntry['state'] = 'applying'): RouteJournalEntry => ({
  schemaVersion: 1,
  planId,
  state,
  snapshot: {
    planId,
    target: '10.98.0.0/24',
    table: 'main',
    family: 'ipv4',
    exists: false,
    rawRoutes: [],
    restoreArgs: [],
    capturedAt: '2026-01-01T00:00:00.000Z',
  },
  rollbackCommands: [['-f', 'inet', 'route', 'del', '10.98.0.0/24']],
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('FileRouteJournal', () => {
  const withDir = (run: (dir: string) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'irp-journal-'));
    try {
      run(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('round-trips entries across instances and removes them', () =>
    withDir((dir) => {
      new FileRouteJournal(dir).write(entry('plan-1'));
      const reopened = new FileRouteJournal(dir);
      expect(reopened.list().entries).toEqual([entry('plan-1')]);
      reopened.remove('plan-1');
      reopened.remove('plan-1'); // idempotent
      expect(reopened.list().entries).toEqual([]);
    }));

  it('replaces an entry atomically and leaves no temporary files', () =>
    withDir((dir) => {
      const j = new FileRouteJournal(dir);
      j.write(entry('plan-1', 'applying'));
      j.write(entry('plan-1', 'verified'));
      expect(j.list().entries.map((e) => e.state)).toEqual(['verified']);
      expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    }));

  it('reports unreadable and malformed files instead of dropping them silently', () =>
    withDir((dir) => {
      const j = new FileRouteJournal(dir);
      j.write(entry('good'));
      writeFileSync(join(dir, 'torn.route.json'), '{"schemaVersion":1,"planId":');
      writeFileSync(join(dir, 'wrong-shape.route.json'), JSON.stringify({ schemaVersion: 1 }));
      const listed = j.list();
      expect(listed.entries.map((e) => e.planId)).toEqual(['good']);
      expect([...listed.corrupt].sort()).toEqual(['torn.route.json', 'wrong-shape.route.json']);
    }));

  it('encodes hostile plan ids so they cannot escape the journal directory', () =>
    withDir((dir) => {
      const j = new FileRouteJournal(dir);
      j.write(entry('../../etc/cron.d/evil'));
      expect(readdirSync(dir).every((n) => !n.includes('/') && !n.includes('..'))).toBe(true);
      expect(j.list().entries[0]?.planId).toBe('../../etc/cron.d/evil');
    }));

  it('creates the directory private to the owner', () =>
    withDir((dir) => {
      const nested = join(dir, 'a', 'b');
      new FileRouteJournal(nested);
      expect(readdirSync(join(dir, 'a'))).toEqual(['b']);
    }));
});

describe('MemoryRouteJournal', () => {
  it('stores and removes entries', () => {
    const j = new MemoryRouteJournal();
    j.write(entry('a'));
    expect(j.list().entries).toHaveLength(1);
    j.remove('a');
    expect(j.list().entries).toHaveLength(0);
  });
});
