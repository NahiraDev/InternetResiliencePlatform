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

export class RuntimeScheduler {
  private timer: NodeJS.Timeout | undefined;
  private active = 0;
  private lastRun = 0;
  runsTotal = 0;
  skippedTotal = 0;
  overlapPreventedTotal = 0;
  failedTotal = 0;
  lastFailure: string | undefined;

  constructor(
    private readonly runtime: Pick<ResilienceRuntime, 'cycle'>,
    readonly config: RuntimeSchedulerConfig,
  ) {}

  start() {
    if (!this.config.enabled || this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.config.cycleIntervalMs);
  }

  async runOnce() {
    const now = Date.now();
    if (this.active >= this.config.maxConcurrentCycles) {
      this.overlapPreventedTotal++;
      this.skippedTotal++;
      return;
    }
    if (now - this.lastRun < this.config.cooldownMs) {
      this.skippedTotal++;
      return;
    }
    this.active++;
    this.lastRun = now;
    try {
      this.runsTotal++;
      const budgetMs = Math.max(1, this.config.executionBudgetMs);
      // The runtime validates this deadline before every mutation via its
      // canonical validation and safety kernel.  Racing the cycle against a
      // timer used to mark a still-running cycle as finished, which allowed a
      // second scheduler tick to contend with it and hid the actual outcome.
      // Keep the scheduler active until the canonical runtime has completed.
      await this.runtime.cycle({
        mode: this.config.mode,
        deadline: new Date(now + budgetMs).toISOString(),
      });
      this.lastFailure = undefined;
    } catch (error) {
      this.failedTotal++;
      this.skippedTotal++;
      this.lastFailure = error instanceof Error ? error.message : String(error);
    } finally {
      this.active--;
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  status() {
    return {
      enabled: this.config.enabled,
      active: this.active,
      runsTotal: this.runsTotal,
      skippedTotal: this.skippedTotal,
      overlapPreventedTotal: this.overlapPreventedTotal,
      failedTotal: this.failedTotal,
      ...(this.lastFailure === undefined ? {} : { lastFailure: this.lastFailure }),
    };
  }
}
