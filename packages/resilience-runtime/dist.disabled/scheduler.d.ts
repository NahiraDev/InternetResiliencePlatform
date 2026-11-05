import type { RuntimeMode } from './domain/types.js';
import type { ResilienceRuntime } from './runtime.js';
export interface RuntimeSchedulerConfig {
    enabled: boolean;
    mode: RuntimeMode;
    cycleIntervalMs: number;
    maxConcurrentCycles: number;
    cooldownMs: number;
    executionBudgetMs: number;
}
export declare class RuntimeScheduler {
    private readonly runtime;
    readonly config: RuntimeSchedulerConfig;
    private timer;
    private active;
    private lastRun;
    runsTotal: number;
    skippedTotal: number;
    overlapPreventedTotal: number;
    failedTotal: number;
    lastFailure: string | undefined;
    constructor(runtime: Pick<ResilienceRuntime, 'cycle'>, config: RuntimeSchedulerConfig);
    start(): void;
    runOnce(): Promise<void>;
    /** Resolves once no scheduled cycle is running (or false after `timeoutMs`). */
    whenIdle(timeoutMs: number): Promise<boolean>;
    stop(): void;
    status(): {
        lastFailure?: string;
        enabled: boolean;
        active: number;
        runsTotal: number;
        skippedTotal: number;
        overlapPreventedTotal: number;
        failedTotal: number;
    };
}
//# sourceMappingURL=scheduler.d.ts.map