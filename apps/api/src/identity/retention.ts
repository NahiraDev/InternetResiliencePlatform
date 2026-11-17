import type { IdentityRepositories, RetentionPolicy, RetentionResult } from './types.js';

const DAY_MS = 86_400_000;

const positiveInt = (raw: string | undefined, name: string): number | undefined => {
  if (raw === undefined || raw.trim() === '') return undefined;
  if (!/^\d+$/.test(raw.trim()) || Number(raw) < 1) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }
  return Number(raw);
};

/**
 * IRP_RETENTION_GRACE_DAYS  (default 7)  – how long expired sessions/tokens are kept past expiry.
 * IRP_AUDIT_RETENTION_DAYS  (default unset = keep audit logs forever; set it only to match your policy).
 * IRP_RETENTION_INTERVAL_MINUTES (default 60; 0 disables the background job).
 */
export const resolveRetention = (
  env: NodeJS.ProcessEnv = process.env,
): { policy: RetentionPolicy; intervalMs: number } => {
  const grace = positiveInt(env.IRP_RETENTION_GRACE_DAYS, 'IRP_RETENTION_GRACE_DAYS') ?? 7;
  const audit = positiveInt(env.IRP_AUDIT_RETENTION_DAYS, 'IRP_AUDIT_RETENTION_DAYS');
  const rawInterval = env.IRP_RETENTION_INTERVAL_MINUTES?.trim();
  let minutes = 60;
  if (rawInterval) {
    if (!/^\d+$/.test(rawInterval))
      throw new Error(
        `IRP_RETENTION_INTERVAL_MINUTES must be a non-negative integer, got "${rawInterval}"`,
      );
    minutes = Number(rawInterval);
  }
  return {
    policy: {
      graceMs: grace * DAY_MS,
      auditRetentionMs: audit === undefined ? null : audit * DAY_MS,
    },
    intervalMs: minutes * 60_000,
  };
};

export interface RetentionJob {
  runOnce(): Promise<RetentionResult | null>;
  stop(): void;
}

/** Runs purgeExpired periodically. Failures are logged and retried next tick; they never crash the API. */
export const startRetentionJob = (
  repos: Pick<IdentityRepositories, 'retention'>,
  config: { policy: RetentionPolicy; intervalMs: number },
  log: (message: string) => void = (m) => console.warn(m),
): RetentionJob => {
  let running = false;
  const runOnce = async (): Promise<RetentionResult | null> => {
    if (running) return null;
    running = true;
    try {
      return await repos.retention.purgeExpired(config.policy);
    } catch (error) {
      log(`retention purge failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      running = false;
    }
  };
  if (config.intervalMs <= 0) return { runOnce, stop() {} };
  const timer = setInterval(() => void runOnce(), config.intervalMs);
  timer.unref();
  return { runOnce, stop: () => clearInterval(timer) };
};
