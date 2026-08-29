import type { AgentRecommendation, InternetEvidence } from './types.js';
import { InternetIntelligenceAgent } from './agent.js';

export interface InternetEvidenceSource {
  read(): Promise<InternetEvidence>;
}

export interface InternetIntelligenceMonitorOptions {
  intervalMs?: number;
  runImmediately?: boolean;
  onRecommendation?: (recommendation: AgentRecommendation) => void | Promise<void>;
}

/**
 * Schedules analysis of an existing IRP evidence source. It never owns probing,
 * routing, policy, tunnel or execution logic.
 */
export class InternetIntelligenceMonitor {
  private readonly intervalMs: number;
  private readonly runImmediately: boolean;
  private readonly onRecommendation: ((recommendation: AgentRecommendation) => void | Promise<void>) | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<AgentRecommendation | null> | undefined;

  constructor(
    private readonly source: InternetEvidenceSource,
    private readonly agent: InternetIntelligenceAgent = new InternetIntelligenceAgent(),
    options: InternetIntelligenceMonitorOptions = {},
  ) {
    this.intervalMs = Math.max(1_000, Math.min(86_400_000, options.intervalMs ?? 60_000));
    this.runImmediately = options.runImmediately ?? true;
    this.onRecommendation = options.onRecommendation;
  }

  start(): void {
    if (this.timer) return;
    if (this.runImmediately) void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async runOnce(): Promise<AgentRecommendation | null> {
    if (this.running) return null;
    this.running = this.collectAndAnalyze();
    try {
      return await this.running;
    } finally {
      this.running = undefined;
    }
  }

  private async collectAndAnalyze(): Promise<AgentRecommendation | null> {
    try {
      const evidence = await this.source.read();
      const recommendation = await this.agent.observe(evidence);
      await this.onRecommendation?.(recommendation);
      return recommendation;
    } catch {
      // Intelligence is advisory; evidence/probe failures must not stop the control loop.
      return null;
    }
  }
}
