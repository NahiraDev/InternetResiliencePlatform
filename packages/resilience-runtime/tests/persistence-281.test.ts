import { describe, expect, it } from 'vitest';
import {
  EVENT_TAXONOMY,
  EVENT_TAXONOMY_VERSION,
  IDENTITY_FIELDS,
  PIPELINE_STAGES,
  eventsForStage,
  eventDefinition,
  identityFor,
  isKnownEvent,
  validateEvent,
} from '../src/events/event-taxonomy.js';
import {
  ClassifiedTelemetrySink,
  EvidencePreservingEventSink,
  TELEMETRY_CLASSES,
  TELEMETRY_CLASSIFICATIONS,
  classificationFor,
  isRegisteredTelemetry,
} from '../src/events/evidence-sink.js';
import { runtimeMetricNames } from '../src/telemetry/telemetry.js';
import {
  STATE_CLASSES,
  STATE_CLASS_SPECS,
  auditStatePlacement,
  mayBlockLocalControl,
  specFor,
} from '../src/state/state-classification.js';
import {
  MODEL_DIMENSIONS,
  auditModels,
  DegradableStore,
  type DegradablePersistence,
} from '../src/persistence/degradable-persistence.js';
import { reconstructTrace, traceEvent, type TraceEvent } from '../src/verification/incident-trace.js';

const T0 = Date.parse('2026-10-03T00:00:00.000Z');
const iso = (offset = 0) => new Date(T0 + offset).toISOString();

describe('#281 t1: versioned event taxonomy', () => {
  it('declares every pipeline stage', () => {
    for (const stage of [
      'trigger',
      'evidence',
      'diagnosis',
      'candidate',
      'decision',
      'policy',
      'safety',
      'plan',
      'action',
      'verification',
      'outcome',
    ] as const) {
      expect(PIPELINE_STAGES).toContain(stage);
    }
  });

  it('assigns every event a stage and a schema version', () => {
    for (const definition of EVENT_TAXONOMY) {
      expect(PIPELINE_STAGES).toContain(definition.stage);
      expect(definition.schemaVersion).toBe(EVENT_TAXONOMY_VERSION);
      expect(definition.description.length).toBeGreaterThan(0);
    }
  });

  it('declares identity requirements per event', () => {
    expect(eventDefinition('runtime.cycle.started')?.requiredIdentity).toEqual(['correlationId']);
    expect(eventDefinition('runtime.execution.started')?.requiredIdentity).toEqual([
      'correlationId',
      'decisionId',
      'transactionId',
    ]);
  });

  it('declares the three identity fields distinctly', () => {
    expect([...IDENTITY_FIELDS]).toEqual(['correlationId', 'decisionId', 'transactionId']);
  });

  it('covers every stage with at least one event', () => {
    for (const stage of PIPELINE_STAGES) {
      expect(eventsForStage(stage).length).toBeGreaterThan(0);
    }
  });

  it('rejects an unknown event type', () => {
    expect(validateEvent('runtime.does-not-exist', { correlationId: 'c' })).toEqual({
      valid: false,
      reasons: ['unknown-event-type:runtime.does-not-exist'],
    });
    expect(isKnownEvent('runtime.does-not-exist')).toBe(false);
  });

  it('reports missing identity fields', () => {
    const result = validateEvent('runtime.execution.started', { correlationId: 'c' });
    expect(result.valid).toBe(false);
    expect(result.reasons).toEqual(['missing-identity:decisionId', 'missing-identity:transactionId']);
    expect(result.stage).toBe('action');
  });

  it('accepts a fully identified event', () => {
    expect(
      validateEvent('runtime.execution.started', {
        correlationId: 'c',
        decisionId: 'd',
        transactionId: 't',
      }).valid,
    ).toBe(true);
  });

  it('treats empty identity values as missing', () => {
    const result = validateEvent('runtime.cycle.started', { correlationId: '' });
    expect(result.reasons).toEqual(['missing-identity:correlationId']);
  });
});

describe('#281 t7: correlation, decision and transaction id semantics', () => {
  it('mints only the correlation id at trigger', () => {
    expect(identityFor({ correlationId: 'c' }, 'trigger')).toEqual({ correlationId: 'c' });
  });

  it('inherits the decision id from diagnosis onward', () => {
    const scope = { correlationId: 'c', decisionId: 'd' };
    expect(identityFor(scope, 'diagnosis')).toEqual({ correlationId: 'c', decisionId: 'd' });
    expect(identityFor(scope, 'plan')).toEqual({ correlationId: 'c', decisionId: 'd' });
  });

  it('does not backfill a decision id before diagnosis', () => {
    const scope = { correlationId: 'c', decisionId: 'd' };
    expect(identityFor(scope, 'evidence')).toEqual({ correlationId: 'c' });
  });

  it('adds the transaction id only from action onward', () => {
    const scope = { correlationId: 'c', decisionId: 'd', transactionId: 't' };
    expect(identityFor(scope, 'action')).toEqual({
      correlationId: 'c',
      decisionId: 'd',
      transactionId: 't',
    });
    expect(identityFor(scope, 'plan')).toEqual({ correlationId: 'c', decisionId: 'd' });
  });
});

describe('#281 t5: end-to-end traceability', () => {
  const fullChain = (): TraceEvent[] => {
    const scope = { correlationId: 'c1', decisionId: 'd1', transactionId: 't1' };
    const types = [
      'runtime.cycle.started',
      'runtime.observation.updated',
      'runtime.incident.detected',
      'runtime.candidate.generated',
      'runtime.decision.recorded',
      'runtime.policy.evaluated',
      'runtime.safety.assessed',
      'runtime.plan.created',
      'runtime.execution.started',
      'runtime.execution.completed',
      'runtime.verification.started',
      'runtime.verification.completed',
      'runtime.outcome.verified',
    ];
    return types.map((type, index) => {
      const built = traceEvent({ type, ...scope, at: iso(index * 100), nowMs: T0 });
      if ('error' in built) throw new Error(`taxonomy rejected ${type}: ${built.error.join(',')}`);
      return built;
    });
  };

  it('rebuilds a complete incident chain', () => {
    const trace = reconstructTrace(fullChain(), 'c1');
    expect(trace.complete).toBe(true);
    expect(trace.gaps).toEqual([]);
    expect(trace.decisionIds).toEqual(['d1']);
    expect(trace.transactionIds).toEqual(['t1']);
    expect(trace.stagesMissing).toEqual([]);
  });

  it('reconstructs from unsorted events', () => {
    const trace = reconstructTrace([...fullChain()].reverse(), 'c1');
    expect(trace.complete).toBe(true);
  });

  it('reports a missing stage rather than smoothing over it', () => {
    const chain = fullChain().filter((event) => event.stage !== 'safety');
    const trace = reconstructTrace(chain, 'c1');
    expect(trace.complete).toBe(false);
    expect(trace.stagesMissing).toContain('safety');
    expect(trace.gaps.some((gap) => gap.reason === 'missing-stage')).toBe(true);
  });

  it('detects out-of-order stages', () => {
    const chain = fullChain();
    const swapped = [...chain];
    const planIndex = swapped.findIndex((event) => event.stage === 'plan');
    const actionIndex = swapped.findIndex((event) => event.stage === 'action');
    const timeSwap = swapped[planIndex]!.at;
    swapped[planIndex] = { ...swapped[planIndex]!, at: iso(9999) };
    swapped[actionIndex] = { ...swapped[actionIndex]!, at: iso(1) };
    expect(timeSwap).toBeDefined();
    const trace = reconstructTrace(swapped, 'c1');
    expect(trace.gaps.some((gap) => gap.reason === 'out-of-order')).toBe(true);
  });

  it('forks correctly across several decisions in one correlation', () => {
    const chain = fullChain();
    const second = chain
      .filter((event) => event.stage !== 'trigger' && event.stage !== 'evidence')
      .map((event) => traceEvent({
        type: event.type,
        correlationId: 'c1',
        decisionId: 'd2',
        transactionId: 't2',
        at: event.at,
        nowMs: T0,
      }))
      .filter((event): event is TraceEvent => !('error' in event));
    const trace = reconstructTrace([...chain, ...second], 'c1');
    expect(trace.decisionIds).toEqual(['d1', 'd2']);
    expect(trace.transactionIds).toEqual(['t1', 't2']);
  });

  it('isolates one correlation id from another', () => {
    const other = fullChain().map((event) => ({ ...event, correlationId: 'c2' }));
    const trace = reconstructTrace([...fullChain(), ...other], 'c1');
    expect(trace.events.every((event) => event.correlationId === 'c1')).toBe(true);
  });

  it('reports no reconstruction for an unknown correlation', () => {
    const trace = reconstructTrace(fullChain(), 'missing');
    expect(trace.reconstructed).toBe(false);
    expect(trace.events).toEqual([]);
  });

  it('rejects a trace event missing required identity', () => {
    const built = traceEvent({ type: 'runtime.execution.started', correlationId: 'c1' });
    expect('error' in built).toBe(true);
  });
});

describe('#281 t6: evidence preserved when exporters fail', () => {
  it('retains the event locally when the exporter throws', async () => {
    const sink = new EvidencePreservingEventSink({
      external: {
        exportEvent: () => {
          throw new Error('collector-down');
        },
      },
      nowMs: () => T0,
    });
    await sink.emit('runtime.cycle.started', { correlationId: 'c1' });
    expect(sink.events).toHaveLength(1);
    expect(sink.events[0]!.event).toBe('runtime.cycle.started');
  });

  it('retains the event when the exporter rejects asynchronously', async () => {
    const sink = new EvidencePreservingEventSink({
      external: { exportEvent: async () => { throw new Error('async-down'); } },
    });
    await expect(sink.emit('runtime.cycle.started', { correlationId: 'c1' })).resolves.toBeUndefined();
    expect(sink.events).toHaveLength(1);
  });

  it('never propagates an exporter failure to the caller', async () => {
    const sink = new EvidencePreservingEventSink({
      external: { exportEvent: () => { throw new Error('down'); } },
    });
    await expect(sink.emit('runtime.cycle.started', { correlationId: 'c1' })).resolves.toBeUndefined();
  });

  it('counts export failures into telemetry without throwing', async () => {
    const counters: Record<string, number> = {};
    const sink = new EvidencePreservingEventSink({
      external: { exportEvent: () => { throw new Error('down'); } },
      telemetry: {
        increment: (metric) => {
          counters[metric] = (counters[metric] ?? 0) + 1;
        },
      },
    });
    await sink.emit('runtime.cycle.started', { correlationId: 'c1' });
    expect(counters['runtime_event_export_failures_total']).toBe(1);
  });

  it('survives a telemetry sink that itself throws', async () => {
    const sink = new EvidencePreservingEventSink({
      external: { exportEvent: () => { throw new Error('down'); } },
      telemetry: {
        increment: () => {
          throw new Error('telemetry-down');
        },
      },
    });
    await expect(sink.emit('runtime.cycle.started', { correlationId: 'c1' })).resolves.toBeUndefined();
  });

  it('retains invalid events rather than discarding evidence', async () => {
    const sink = new EvidencePreservingEventSink({ nowMs: () => T0 });
    // Missing decisionId/transactionId, so it fails taxonomy validation.
    await sink.emit('runtime.execution.started', { correlationId: 'c1' });
    expect(sink.events).toHaveLength(1);
    expect(sink.droppedInvalid()).toBe(0);
    expect(sink.invalidCount()).toBe(1);
    expect(sink.invalidReasons()).toContain('missing-identity:decisionId');
  });

  it('exports invalid events too, because evidence is not optional', async () => {
    const exported: string[] = [];
    const sink = new EvidencePreservingEventSink({
      external: { exportEvent: (event) => { exported.push(event.event); } },
    });
    await sink.emit('runtime.execution.started', { correlationId: 'c1' });
    expect(exported).toEqual(['runtime.execution.started']);
  });

  it('can be configured to drop invalid events explicitly', async () => {
    const sink = new EvidencePreservingEventSink({ rejectInvalidEvents: true });
    await sink.emit('runtime.execution.started', { correlationId: 'c1' });
    expect(sink.events).toHaveLength(0);
    expect(sink.droppedInvalid()).toBe(1);
  });

  it('keeps unknown event types verbatim', async () => {
    const sink = new EvidencePreservingEventSink();
    await sink.emit('custom.local.event', { correlationId: 'c1' });
    expect(sink.events).toHaveLength(1);
    expect(sink.invalidCount()).toBe(1);
  });

  it('does not build trace events for invalid events', async () => {
    const sink = new EvidencePreservingEventSink({ nowMs: () => T0 });
    await sink.emit('runtime.execution.started', { correlationId: 'c1' });
    expect(sink.traceEvents()).toHaveLength(0);
  });

  it('retains trace events for reconstruction', async () => {
    const sink = new EvidencePreservingEventSink({ nowMs: () => T0 });
    await sink.emit('runtime.cycle.started', { correlationId: 'c1' });
    expect(sink.traceEvents()).toHaveLength(1);
    expect(reconstructTrace(sink.traceEvents(), 'c1').reconstructed).toBe(true);
  });

  it('bounds local evidence retention', async () => {
    const sink = new EvidencePreservingEventSink({ maxLocalEvents: 2, nowMs: () => T0 });
    for (let n = 0; n < 5; n += 1) {
      await sink.emit('runtime.cycle.started', { correlationId: `c${n}` });
    }
    expect(sink.events).toHaveLength(2);
  });

  it('works with no exporter configured', async () => {
    const sink = new EvidencePreservingEventSink();
    await expect(sink.emit('runtime.cycle.started', { correlationId: 'c1' })).resolves.toBeUndefined();
    expect(sink.events).toHaveLength(1);
  });
});

describe('#281 t8: telemetry classification and leak prevention', () => {
  it('classifies every registered metric', () => {
    for (const entry of TELEMETRY_CLASSIFICATIONS) {
      expect(TELEMETRY_CLASSES).toContain(entry.telemetryClass);
      expect(entry.aggregateOnly).toBe(true);
    }
  });

  it('rejects unregistered metrics', () => {
    const sink = new ClassifiedTelemetrySink();
    sink.increment('runtime.secret_hostname_total');
    expect(sink.snapshot()['runtime.secret_hostname_total']).toBeUndefined();
    expect(sink.rejectedMetrics()).toBe(1);
  });

  it('accepts registered metrics', () => {
    const sink = new ClassifiedTelemetrySink();
    sink.increment('runtime_cycles_total', 2);
    expect(sink.snapshot()['runtime_cycles_total']).toBe(2);
  });

  it('ignores non-finite values', () => {
    const sink = new ClassifiedTelemetrySink();
    sink.increment('runtime_cycles_total', Number.NaN);
    expect(sink.snapshot()['runtime_cycles_total']).toBe(0);
  });

  it('keeps local values when the external sink throws', () => {
    const sink = new ClassifiedTelemetrySink({
      increment: () => { throw new Error('down'); },
      observe: () => { throw new Error('down'); },
    });
    sink.increment('runtime_cycles_total');
    expect(sink.snapshot()['runtime_cycles_total']).toBe(1);
    expect(sink.snapshot()['runtime_telemetry_failures_total']).toBe(1);
  });

  it('redacts secrets from event payloads before retention and export', async () => {
    const exported: { event: string; payload: Record<string, unknown> }[] = [];
    const sink = new EvidencePreservingEventSink({
      external: { exportEvent: (event) => { exported.push(event as never); } },
      rejectInvalidEvents: false,
    });
    await sink.emit('custom.event', {
      correlationId: 'c1',
      password: 'hunter2',
      url: 'https://user:pw@host.test',
    });
    expect(JSON.stringify(sink.events)).not.toContain('hunter2');
    expect(JSON.stringify(sink.events)).not.toContain('pw@host');
    expect(exported.length).toBe(1);
    expect(JSON.stringify(exported)).not.toContain('hunter2');
  });

  it('registers sink-generated invalid-event and redaction counters', () => {
    expect(isRegisteredTelemetry('runtime_event_invalid_total')).toBe(true);
    expect(isRegisteredTelemetry('runtime_telemetry_redactions_total')).toBe(true);
  });

  it('keeps the legacy metric registry aligned with classifications', () => {
    expect([...runtimeMetricNames].sort()).toEqual(
      TELEMETRY_CLASSIFICATIONS.map((entry) => entry.metric).sort(),
    );
  });

  it('knows which metrics are registered', () => {
    expect(isRegisteredTelemetry('runtime_cycles_total')).toBe(true);
    expect(isRegisteredTelemetry('nope')).toBe(false);
    expect(classificationFor('runtime_policy_denied_total')?.telemetryClass).toBe('security');
  });
});

describe('#281 t2: state class separation', () => {
  it('declares all six state classes', () => {
    for (const stateClass of [
      'ephemeral-runtime',
      'persistent-operational',
      'historical',
      'analytics',
      'configuration',
      'security',
    ] as const) {
      expect(STATE_CLASSES).toContain(stateClass);
      expect(specFor(stateClass).stateClass).toBe(stateClass);
    }
  });

  it('makes only ephemeral runtime state critical-path', () => {
    expect(mayBlockLocalControl('ephemeral-runtime')).toBe(true);
    expect(mayBlockLocalControl('security')).toBe(false);
    expect(mayBlockLocalControl('persistent-operational')).toBe(false);
    expect(mayBlockLocalControl('analytics')).toBe(false);
    expect(mayBlockLocalControl('historical')).toBe(false);
    expect(mayBlockLocalControl('configuration')).toBe(false);
  });

  it('keeps analytics recomputable and non-durable-critical', () => {
    const spec = specFor('analytics');
    expect(spec.criticalPath).toBe(false);
    expect(spec.retentionMs).toBeGreaterThan(0);
  });

  it('marks security state as sensitive', () => {
    expect(specFor('security').mayContainSensitivePayload).toBe(true);
  });

  it('flags offline-required state that is not critical-path', () => {
    const result = auditStatePlacement({
      assignments: { mutations: 'persistent-operational' },
      mustWorkOffline: ['mutations'],
    });
    expect(result.findings.some((finding) => finding.severity === 'MAJOR')).toBe(true);
  });

  it('flags durable critical-path state as an infrastructure dependency', () => {
    const result = auditStatePlacement({
      assignments: { trust: 'security' },
    });
    expect(result.findings).toEqual([]);
  });

  it('flags unknown state classes instead of leaving them unreported', () => {
    const result = auditStatePlacement({
      assignments: { mystery: 'unclassified-state' as never },
    });
    expect(result.unclassified).toEqual(['mystery']);
    expect(result.findings.some((finding) => finding.severity === 'MAJOR')).toBe(true);
  });

  it('passes a correctly classified placement', () => {
    const result = auditStatePlacement({
      assignments: { locks: 'ephemeral-runtime', decisions: 'persistent-operational' },
      mustWorkOffline: ['locks'],
    });
    expect(result.findings).toEqual([]);
  });

  it('declares every spec with a description', () => {
    for (const spec of STATE_CLASS_SPECS) {
      expect(spec.description.length).toBeGreaterThan(0);
      expect(typeof spec.durable).toBe('boolean');
    }
  });
});

describe('#281 t3: database model audit', () => {
  const complete = {
    name: 'decisions',
    stateClass: 'persistent-operational' as const,
    producer: 'canonical-decision-provider',
    consumer: 'ui + audit',
    lifecycle: 'created on decision, immutable',
    retention: '90 days',
    indexing: ['correlationId', 'createdAt'],
    failureBehavior: 'degrades to in-memory mirror',
  };

  it('audits six dimensions per model', () => {
    expect(MODEL_DIMENSIONS).toHaveLength(6);
    const result = auditModels([complete]);
    expect(result.auditedDimensions).toBe(6);
    expect(result.complete).toEqual(['decisions']);
  });

  it('flags a missing retention policy as MAJOR', () => {
    const result = auditModels([{ ...complete, retention: undefined }]);
    const finding = result.findings.find((entry) => entry.dimension === 'retention');
    expect(finding?.severity).toBe('MAJOR');
  });

  it('flags missing failure behavior as MAJOR', () => {
    const result = auditModels([{ ...complete, failureBehavior: undefined }]);
    expect(result.findings.some((f) => f.dimension === 'failureBehavior' && f.severity === 'MAJOR')).toBe(true);
  });

  it('flags a missing producer and consumer', () => {
    const result = auditModels([{ name: 'x', stateClass: 'analytics' as const }]);
    expect(result.findings.filter((f) => f.severity === 'MAJOR')).toHaveLength(4);
  });

  it('flags a missing index as MINOR', () => {
    const result = auditModels([{ ...complete, indexing: [] }]);
    const finding = result.findings.find((f) => f.dimension === 'indexing');
    expect(finding?.severity).toBe('MINOR');
  });

  it('gives every finding a concrete fix', () => {
    const result = auditModels([{ name: 'x', stateClass: 'analytics' as const }]);
    for (const finding of result.findings) {
      expect(finding.fix.length).toBeGreaterThan(0);
    }
  });
});

describe('#281 t4: persistence degrades without blocking local recovery', () => {
  const persistence = (
    available: boolean,
    failOnWrite = false,
  ): DegradablePersistence => ({
    load: async () => undefined,
    save: async () => {
      if (failOnWrite) throw new Error('db-down');
    },
    remove: async () => undefined,
    available: () => available,
  });

  it('serves reads from the local mirror with no database at all', () => {
    const store = new DegradableStore();
    void store.set('k', { v: 1 });
    expect(store.get('k')).toEqual({ v: 1 });
  });

  it('queues writes when the database is unavailable', async () => {
    const store = new DegradableStore({ persistence: persistence(false) });
    expect(await store.set('k', 1)).toBe('queued');
    expect(store.pending()).toEqual(['k']);
  });

  it('still allows local reads while the database is down', async () => {
    const store = new DegradableStore({ persistence: persistence(false) });
    await store.set('k', 'value');
    expect(store.get('k')).toBe('value');
    expect(store.snapshot().degraded).toBe(true);
  });

  it('queues writes when the database throws', async () => {
    const store = new DegradableStore({ persistence: persistence(true, true) });
    expect(await store.set('k', 1)).toBe('queued');
    expect(store.pendingCount()).toBe(1);
  });

  it('persists when the database is healthy', async () => {
    const store = new DegradableStore({ persistence: persistence(true) });
    expect(await store.set('k', 1)).toBe('persisted');
    expect(store.pendingCount()).toBe(0);
  });

  it('drains queued writes once the database recovers', async () => {
    let available = false;
    const store = new DegradableStore({
      persistence: {
        load: async () => undefined,
        save: async () => undefined,
        remove: async () => undefined,
        available: () => available,
      },
    });
    await store.set('k', 1);
    expect(store.pendingCount()).toBe(1);
    available = true;
    expect(await store.drain()).toEqual([]);
    expect(store.pendingCount()).toBe(0);
  });

  it('leaves unresolved writes visible when draining fails', async () => {
    let available = false;
    const store = new DegradableStore({
      persistence: {
        load: async () => undefined,
        save: async () => { throw new Error('still-down'); },
        remove: async () => undefined,
        available: () => available,
      },
    });
    await store.set('k', 1);
    available = true;
    expect(await store.drain()).toEqual(['k']);
  });

  it('hydrates from the database when it becomes available', async () => {
    const store = new DegradableStore({
      persistence: {
        load: async (key) => ({ hydrated: key }),
        save: async () => undefined,
        remove: async () => undefined,
        available: () => true,
      },
    });
    expect(await store.hydrate(['a', 'b'])).toBe(2);
    expect(store.get('a')).toEqual({ hydrated: 'a' });
  });

  it('hydrates nothing while the database is down', async () => {
    const store = new DegradableStore({ persistence: persistence(false) });
    expect(await store.hydrate(['a'])).toBe(0);
  });

  it('removes locally even when the database is down', async () => {
    const store = new DegradableStore({ persistence: persistence(false) });
    await store.set('k', 1);
    await store.remove('k');
    expect(store.has('k')).toBe(false);
    expect(store.pendingCount()).toBe(0);
  });

  it('never throws from a failing telemetry sink', async () => {
    const store = new DegradableStore({
      persistence: persistence(false),
      telemetry: {
        increment: () => {
          throw new Error('telemetry-down');
        },
      },
    });
    await expect(store.set('k', 1)).resolves.toBe('queued');
  });

  it('bounds the local mirror', async () => {
    const store = new DegradableStore({ maxLocalEntries: 2 });
    await store.set('a', 1);
    await store.set('b', 2);
    await store.set('c', 3);
    expect(store.size()).toBe(2);
    expect(store.has('a')).toBe(false);
  });

  it('reports degradation state', async () => {
    const store = new DegradableStore({ persistence: persistence(false) });
    await store.set('k', 1);
    const snapshot = store.snapshot();
    expect(snapshot.remoteAvailable).toBe(false);
    expect(snapshot.degraded).toBe(true);
    expect(snapshot.pendingWrites).toBe(1);
  });
});