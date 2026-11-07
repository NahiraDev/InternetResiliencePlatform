export interface SchedulerOptions {
    intervalMs: number;
    runImmediately: boolean;
}
export declare class Scheduler {
    private readonly task;
    private readonly options;
    private timer;
    private running;
    constructor(task: (signal: AbortSignal) => Promise<void>, options: SchedulerOptions);
    start(signal: AbortSignal): void;
    stop(): void;
    isRunning(): boolean;
}
//# sourceMappingURL=Scheduler.d.ts.map