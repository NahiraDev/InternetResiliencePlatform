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

  constructor(
    private readonly runtime: ResilienceRuntime,
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
      await Promise.race([
        this.runtime.cycle({ mode: this.config.mode }),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error(`runtime cycle exceeded execution budget of ${budgetMs}ms`)),
            budgetMs,
          );
          timer.unref?.();
        }),
      ]);
    } catch {
      this.skippedTotal++;
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
    };
  }
}
