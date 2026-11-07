/**
 * Phase 126 — Chaos, Resilience & Hardware-in-the-Loop Validation.
 *
 * Experiment definitions with a steady-state hypothesis, a bounded blast
 * radius, abort conditions and guaranteed cleanup. Faults are injected only
 * through a `FaultInjectionPort` (simulation, lab or hardware-in-the-loop
 * rig). Experiments targeting live production are refused unless explicitly
 * authorised with an approval, and the cleanup always runs.
 */
import type { FaultKind } from '../scenario-lab/faults.js';
export type ExperimentEnvironment = 'simulation' | 'lab' | 'hil' | 'production';
export interface SteadyStateProbe {
    readonly name: string;
    check(): Promise<{
        ok: boolean;
        value?: number;
    }> | {
        ok: boolean;
        value?: number;
    };
}
export interface ChaosExperiment {
    readonly id: string;
    readonly environment: ExperimentEnvironment;
    readonly fault: FaultKind;
    readonly targets: readonly string[];
    readonly durationMs: number;
    readonly maxTargets: number;
    readonly steadyState: readonly SteadyStateProbe[];
    /** Probes that, if failing during injection, abort the experiment immediately. */
    readonly abortOn?: readonly SteadyStateProbe[];
    readonly approvalId?: string;
    /** Pause between probes while the fault is active. */
    readonly pollMs?: number;
}
export interface FaultInjectionPort {
    inject(fault: FaultKind, targets: readonly string[], signal: AbortSignal): Promise<void>;
    /** Must be idempotent and safe to call when nothing was injected. */
    restore(fault: FaultKind, targets: readonly string[]): Promise<void>;
}
export interface ChaosResult {
    readonly experimentId: string;
    readonly status: 'passed' | 'failed-hypothesis' | 'aborted' | 'refused' | 'inject-failed';
    readonly reasons: readonly string[];
    readonly steadyBefore: readonly string[];
    readonly violations: readonly string[];
    readonly restored: boolean;
    readonly startedAtMs: number;
    readonly endedAtMs: number;
}
export declare const validateExperiment: (e: ChaosExperiment) => readonly string[];
export declare const runChaosExperiment: (e: ChaosExperiment, port: FaultInjectionPort, options?: {
    readonly signal?: AbortSignal;
    readonly nowMs?: () => number;
}) => Promise<ChaosResult>;
//# sourceMappingURL=chaos-validation.d.ts.map