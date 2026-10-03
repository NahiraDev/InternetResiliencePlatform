/**
 * Persistence integration and database model auditing for issue #281
 * (issue #272 Section J, tasks 3 and 4).
 *
 * Task 4: persistence is integrated where required, but local recovery must not
 * depend on database availability. `DegradableStore` keeps an authoritative
 * in-memory mirror: reads always succeed, writes degrade to memory when the
 * database is unavailable, and the pending set is drained on recovery.
 *
 * Task 3: every important model is audited for producer, consumer, lifecycle,
 * retention, indexing and failure behaviour. A model that cannot answer all six
 * is registered as a finding rather than silently assumed correct.
 */

import { deepFreeze, nowIso } from '../domain/ids.js';
import type { StateClass } from '../state/state-classification.js';

export const MODEL_DIMENSIONS = [
  'producer',
  'consumer',
  'lifecycle',
  'retention',
  'indexing',
  'failureBehavior',
] as const;

export type ModelDimension = (typeof MODEL_DIMENSIONS)[number];

export interface ModelAuditInput {
  readonly name: string;
  readonly stateClass: StateClass;
  readonly producer?: string;
  readonly consumer?: string;
  readonly lifecycle?: string;
  readonly retention?: string;
  readonly indexing?: readonly string[];
  readonly failureBehavior?: string;
}

export interface ModelAuditFinding {
  readonly model: string;
  readonly dimension: ModelDimension;
  readonly severity: 'MINOR' | 'MAJOR';
  readonly issue: string;
  readonly fix: string;
}

export interface ModelAuditResult {
  readonly models: readonly string[];
  readonly complete: readonly string[];
  readonly findings: readonly ModelAuditFinding[];
  readonly auditedDimensions: number;
}

const present = (value: string | undefined): boolean => value !== undefined && value.trim().length > 0;

/**
 * Audits declared models against all six required dimensions.
 *
 * A missing `retention` on a durable model is MAJOR, because unbounded growth
 * eventually takes down the process that must keep local control working. A
 * missing `failureBehavior` is MAJOR because it means the code does not know
 * what happens when the database is unavailable.
 */
export const auditModels = (models: readonly ModelAuditInput[]): ModelAuditResult => {
  const findings: ModelAuditFinding[] = [];
  const complete: string[] = [];

  for (const model of models) {
    let issues = 0;

    if (!present(model.producer)) {
      issues += 1;
      findings.push({
        model: model.name,
        dimension: 'producer',
        severity: 'MAJOR',
        issue: `'${model.name}' declares no producer`,
        fix: 'Name the component that writes this model.',
      });
    }
    if (!present(model.consumer)) {
      issues += 1;
      findings.push({
        model: model.name,
        dimension: 'consumer',
        severity: 'MAJOR',
        issue: `'${model.name}' declares no consumer`,
        fix: 'Name the component that reads this model, or mark it write-only.',
      });
    }
    if (!present(model.lifecycle)) {
      issues += 1;
      findings.push({
        model: model.name,
        dimension: 'lifecycle',
        severity: 'MINOR',
        issue: `'${model.name}' declares no lifecycle`,
        fix: 'Describe how records are created, updated and closed.',
      });
    }
    if (!present(model.retention)) {
      issues += 1;
      findings.push({
        model: model.name,
        dimension: 'retention',
        severity: 'MAJOR',
        issue: `'${model.name}' declares no retention policy`,
        fix: 'Declare a retention window or an explicit "retain indefinitely" justification.',
      });
    }
    if (!model.indexing || model.indexing.length === 0) {
      issues += 1;
      findings.push({
        model: model.name,
        dimension: 'indexing',
        severity: 'MINOR',
        issue: `'${model.name}' declares no indexes`,
        fix: 'Declare the indexes its query patterns require, or justify none.',
      });
    }
    if (!present(model.failureBehavior)) {
      issues += 1;
      findings.push({
        model: model.name,
        dimension: 'failureBehavior',
        severity: 'MAJOR',
        issue: `'${model.name}' declares no failure behavior`,
        fix: 'State what happens when the database is unavailable; it must not block local recovery.',
      });
    }

    if (issues === 0) complete.push(model.name);
  }

  return deepFreeze({
    models: Object.freeze(models.map((model) => model.name).sort()),
    complete: Object.freeze(complete.sort()),
    findings: Object.freeze(findings),
    auditedDimensions: models.length * MODEL_DIMENSIONS.length,
  });
};

/** Remote persistence port. Failure is expected and must be survivable. */
export interface DegradablePersistence {
  load(key: string): Promise<unknown | undefined>;
  save(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
  /** True when the remote store is currently usable. */
  available(): boolean;
}

export interface DegradableStoreOptions {
  readonly persistence?: DegradablePersistence;
  readonly telemetry?: { increment(metric: string, value?: number): void };
  /** Keys retained in the local mirror. */
  readonly maxLocalEntries?: number;
}

interface LocalEntry {
  readonly value: unknown;
  readonly writtenAt: string;
}

/**
 * A store whose local mirror is authoritative for reads.
 *
 * Reads never touch the database on the hot path, which is what guarantees local
 * recovery works while the database is down. Writes go to memory first, then to
 * the database; when the database fails the entry is queued in `pending` and
 * retried by `drain()`.
 */
export class DegradableStore {
  private readonly local = new Map<string, LocalEntry>();
  private readonly pendingWrites = new Map<string, unknown>();
  private readonly maxLocalEntries: number;

  constructor(private readonly options: DegradableStoreOptions = {}) {
    this.maxLocalEntries = Math.max(1, options.maxLocalEntries ?? 10_000);
  }

  /** Always succeeds: reads are served from the authoritative local mirror. */
  get(key: string): unknown {
    return this.local.get(key)?.value;
  }

  has(key: string): boolean {
    return this.local.has(key);
  }

  /** Local mirror first, then best-effort persistence. Never throws. */
  async set(key: string, value: unknown): Promise<'persisted' | 'queued'> {
    this.local.set(key, { value, writtenAt: nowIso() });
    while (this.local.size > this.maxLocalEntries) {
      this.local.delete(this.local.keys().next().value as string);
    }

    const persistence = this.options.persistence;
    if (!persistence) return 'queued';
    if (!persistence.available()) {
      this.pendingWrites.set(key, value);
      this.count('runtime_persistence_failures_total');
      return 'queued';
    }
    try {
      await persistence.save(key, value);
      this.pendingWrites.delete(key);
      return 'persisted';
    } catch {
      this.pendingWrites.set(key, value);
      this.count('runtime_persistence_failures_total');
      return 'queued';
    }
  }

  async remove(key: string): Promise<void> {
    this.local.delete(key);
    this.pendingWrites.delete(key);
    const persistence = this.options.persistence;
    if (!persistence || !persistence.available()) return;
    try {
      await persistence.remove(key);
    } catch {
      this.count('runtime_persistence_failures_total');
    }
  }

  pending(): readonly string[] {
    return Object.freeze([...this.pendingWrites.keys()].sort());
  }

  pendingCount(): number {
    return this.pendingWrites.size;
  }

  /**
   * Retries queued writes. Safe to call repeatedly; successful entries leave the
   * queue. Returns what remains, so the caller can observe unresolved loss.
   */
  async drain(): Promise<readonly string[]> {
    const persistence = this.options.persistence;
    if (!persistence || !persistence.available()) return this.pending();
    for (const [key, value] of [...this.pendingWrites]) {
      try {
        await persistence.save(key, value);
        this.pendingWrites.delete(key);
      } catch {
        this.count('runtime_persistence_failures_total');
      }
    }
    return this.pending();
  }

  /** Hydrates the local mirror from the database when it becomes available. */
  async hydrate(keys: readonly string[]): Promise<number> {
    const persistence = this.options.persistence;
    if (!persistence || !persistence.available()) return 0;
    let loaded = 0;
    for (const key of keys) {
      try {
        const value = await persistence.load(key);
        if (value !== undefined) {
          this.local.set(key, { value, writtenAt: nowIso() });
          loaded += 1;
        }
      } catch {
        this.count('runtime_persistence_failures_total');
      }
    }
    return loaded;
  }

  size(): number {
    return this.local.size;
  }

  snapshot(): {
    readonly localEntries: number;
    readonly pendingWrites: number;
    readonly remoteAvailable: boolean;
    readonly degraded: boolean;
  } {
    return deepFreeze({
      localEntries: this.local.size,
      pendingWrites: this.pendingWrites.size,
      remoteAvailable: this.options.persistence?.available() ?? false,
      degraded: this.pendingWrites.size > 0,
    });
  }

  private count(metric: string): void {
    try {
      this.options.telemetry?.increment(metric);
    } catch {
      // Telemetry is optional; never propagate.
    }
  }
}