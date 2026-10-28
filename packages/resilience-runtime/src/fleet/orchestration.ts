/**
 * Phase 118 — Multi-Device Orchestration.
 *
 * Wave-based orchestration of an operation across devices with explicit
 * dependencies, bounded concurrency, per-device timeouts, abort and a failure
 * policy. The operation itself is submitted through an injected port to each
 * device's own canonical runtime; the orchestrator never mutates a device
 * directly and only targets devices the caller declares operational.
 */

export type DeviceStepStatus = 'succeeded' | 'failed' | 'skipped' | 'timed-out' | 'aborted';

export interface OrchestrationStep { readonly deviceId: string; readonly dependsOn?: readonly string[] }

export interface OrchestrationPlan {
  readonly planId: string;
  readonly operation: string;
  readonly steps: readonly OrchestrationStep[];
  readonly maxConcurrency: number;
  readonly perDeviceTimeoutMs: number;
  readonly onFailure: 'halt' | 'continue';
}

export interface DeviceOperationPort {
  /** Submits the operation to one device; resolves when that device's runtime reports the outcome. */
  run(deviceId: string, operation: string, signal: AbortSignal): Promise<{ ok: boolean; detail?: string }>;
}

export interface StepResult { readonly deviceId: string; readonly status: DeviceStepStatus; readonly wave: number; readonly detail?: string }
export interface OrchestrationResult {
  readonly planId: string;
  readonly outcome: 'completed' | 'partial' | 'halted' | 'aborted';
  readonly results: readonly StepResult[];
  readonly waves: readonly (readonly string[])[];
}

export class OrchestrationPlanError extends Error {
  constructor(message: string) { super(message); this.name = 'OrchestrationPlanError'; }
}

/** Topologically layers steps into waves; throws on unknown dependencies, duplicates and cycles. */
export const planWaves = (steps: readonly OrchestrationStep[]): readonly (readonly string[])[] => {
  const ids = new Set<string>();
  for (const s of steps) { if (ids.has(s.deviceId)) throw new OrchestrationPlanError(`duplicate step for device ${s.deviceId}`); ids.add(s.deviceId); }
  for (const s of steps) for (const d of s.dependsOn ?? []) if (!ids.has(d)) throw new OrchestrationPlanError(`${s.deviceId} depends on unknown device ${d}`);
  const remaining = new Map(steps.map((s) => [s.deviceId, new Set(s.dependsOn ?? [])]));
  const waves: string[][] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()].filter(([, deps]) => deps.size === 0).map(([id]) => id).sort();
    if (ready.length === 0) throw new OrchestrationPlanError(`dependency cycle among ${[...remaining.keys()].sort().join(',')}`);
    waves.push(ready);
    for (const id of ready) remaining.delete(id);
    for (const deps of remaining.values()) for (const id of ready) deps.delete(id);
  }
  return Object.freeze(waves.map((w) => Object.freeze(w)));
};

const withTimeout = async <T>(p: (s: AbortSignal) => Promise<T>, ms: number, parent: AbortSignal): Promise<{ timedOut: boolean; value?: T }> => {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  parent.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<{ timedOut: true }>((resolve) => { timer = setTimeout(() => { ctl.abort(); resolve({ timedOut: true }); }, ms); });
    return await Promise.race([p(ctl.signal).then((value) => ({ timedOut: false as const, value })), timeout]);
  } finally { if (timer) clearTimeout(timer); parent.removeEventListener('abort', onAbort); }
};

export const runOrchestration = async (
  plan: OrchestrationPlan, port: DeviceOperationPort, options: { readonly signal?: AbortSignal; readonly isOperational?: (deviceId: string) => boolean } = {},
): Promise<OrchestrationResult> => {
  if (!Number.isInteger(plan.maxConcurrency) || plan.maxConcurrency < 1) throw new OrchestrationPlanError('maxConcurrency must be a positive integer');
  if (plan.perDeviceTimeoutMs <= 0) throw new OrchestrationPlanError('perDeviceTimeoutMs must be positive');
  const waves = planWaves(plan.steps);
  const deps = new Map(plan.steps.map((s) => [s.deviceId, s.dependsOn ?? []]));
  const signal = options.signal ?? new AbortController().signal;
  const results: StepResult[] = [];
  const status = new Map<string, DeviceStepStatus>();
  let halted = false;
  for (let w = 0; w < waves.length; w += 1) {
    const wave = waves[w] as readonly string[];
    const queue = [...wave];
    const worker = async () => {
      for (;;) {
        const id = queue.shift();
        if (id === undefined) return;
        const record = (s: DeviceStepStatus, detail?: string) => { status.set(id, s); results.push(Object.freeze({ deviceId: id, status: s, wave: w, ...(detail ? { detail } : {}) })); };
        if (signal.aborted) { record('aborted'); continue; }
        if (halted) { record('skipped', 'plan-halted'); continue; }
        if ((deps.get(id) ?? []).some((d) => status.get(d) !== 'succeeded')) { record('skipped', 'dependency-not-succeeded'); continue; }
        if (options.isOperational && !options.isOperational(id)) { record('skipped', 'device-not-operational'); if (plan.onFailure === 'halt') halted = true; continue; }
        try {
          const r = await withTimeout((s) => port.run(id, plan.operation, s), plan.perDeviceTimeoutMs, signal);
          if (r.timedOut) record('timed-out');
          else if (signal.aborted) record('aborted');
          else if (r.value?.ok) record('succeeded', r.value.detail);
          else record('failed', r.value?.detail);
        } catch (e) { record('failed', e instanceof Error ? e.message : 'operation-error'); }
        if (status.get(id) !== 'succeeded' && status.get(id) !== 'skipped' && plan.onFailure === 'halt') halted = true;
      }
    };
    await Promise.all(Array.from({ length: Math.min(plan.maxConcurrency, wave.length) }, worker));
  }
  const failed = results.some((r) => r.status === 'failed' || r.status === 'timed-out');
  const ok = results.every((r) => r.status === 'succeeded');
  const outcome = signal.aborted ? 'aborted' : ok ? 'completed' : halted ? 'halted' : failed || results.some((r) => r.status === 'skipped') ? 'partial' : 'completed';
  return Object.freeze({ planId: plan.planId, outcome, results: Object.freeze(results.sort((a, b) => a.wave - b.wave || a.deviceId.localeCompare(b.deviceId))), waves });
};
