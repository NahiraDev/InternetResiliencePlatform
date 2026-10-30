/**
 * Crash-safe journal for route mutations.
 *
 * `LinuxRouteExecutor` captures a pre-mutation snapshot so a failed or unverified change can
 * be undone. Held only in memory, that snapshot is lost if the process dies between the
 * `ip route replace` and its verification, leaving the host with a route nobody can roll back.
 * The journal writes the snapshot and the exact rollback command to disk *before* the kernel
 * is touched, so a restarted process can finish or undo the interrupted mutation.
 *
 * Durability: each entry is written to a temporary file, fsynced, atomically renamed into
 * place and the directory is fsynced, so a reader never observes a partial entry.
 */

import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';
import type { RouteSnapshot } from './linux-route-executor.js';

export type RouteJournalState = 'applying' | 'verified';

export interface RouteJournalEntry {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly state: RouteJournalState;
  readonly snapshot: RouteSnapshot;
  /**
   * Ordered `ip` argument vectors that undo the mutation. Computed before the mutation is
   * issued, so recovery never has to re-derive intent from a plan that no longer exists.
   */
  readonly rollbackCommands: readonly (readonly string[])[];
  readonly updatedAt: string;
}

export interface RouteJournal {
  write(entry: RouteJournalEntry): void;
  remove(planId: string): void;
  list(): { readonly entries: readonly RouteJournalEntry[]; readonly corrupt: readonly string[] };
}

/** Non-durable journal: the previous in-memory behaviour, for tests and explicit opt-out. */
export class MemoryRouteJournal implements RouteJournal {
  private readonly entries = new Map<string, RouteJournalEntry>();
  write(entry: RouteJournalEntry): void {
    this.entries.set(entry.planId, entry);
  }
  remove(planId: string): void {
    this.entries.delete(planId);
  }
  list() {
    return { entries: [...this.entries.values()], corrupt: [] as string[] };
  }
}

const FILE_SUFFIX = '.route.json';

/** Plan ids are caller-supplied; encode them so they can never escape the journal directory. */
const fileNameFor = (planId: string): string =>
  `${Buffer.from(planId, 'utf8').toString('base64url')}${FILE_SUFFIX}`;

const isEntry = (value: unknown): value is RouteJournalEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    e.schemaVersion === 1 &&
    typeof e.planId === 'string' &&
    (e.state === 'applying' || e.state === 'verified') &&
    typeof e.snapshot === 'object' &&
    e.snapshot !== null &&
    Array.isArray(e.rollbackCommands) &&
    e.rollbackCommands.every((c) => Array.isArray(c) && c.every((a) => typeof a === 'string'))
  );
};

export class FileRouteJournal implements RouteJournal {
  constructor(private readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  write(entry: RouteJournalEntry): void {
    const target = join(this.directory, fileNameFor(entry.planId));
    const temp = `${target}.${process.pid}.tmp`;
    const fd = openSync(temp, 'w', 0o600);
    try {
      writeSync(fd, JSON.stringify(entry));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, target);
    this.syncDirectory();
  }

  remove(planId: string): void {
    try {
      unlinkSync(join(this.directory, fileNameFor(planId)));
      this.syncDirectory();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  list(): { readonly entries: readonly RouteJournalEntry[]; readonly corrupt: readonly string[] } {
    const entries: RouteJournalEntry[] = [];
    const corrupt: string[] = [];
    for (const name of readdirSync(this.directory).sort()) {
      if (!name.endsWith(FILE_SUFFIX)) continue;
      try {
        const parsed: unknown = JSON.parse(readFileSync(join(this.directory, name), 'utf8'));
        if (isEntry(parsed)) entries.push(parsed);
        else corrupt.push(name);
      } catch {
        corrupt.push(name);
      }
    }
    return { entries, corrupt };
  }

  private syncDirectory(): void {
    const fd = openSync(this.directory, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
