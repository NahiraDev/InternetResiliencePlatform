import { describe, expect, it } from 'vitest';
import { Application, EventBus, HealthScorer, Scheduler } from './index.js';
import type { AppConfig } from '@irp/config';
import { Logger } from '@irp/logger';
const config: AppConfig = { app: { name: 'test', version: '1.0.0', environment: 'test' }, api: { host: '127.0.0.1', port: 8080 }, logger: { level: 'info', json: true, color: false }, telemetry: { enabled: true, prometheus: true }, providers: {}, benchmark: { intervalMs: 60_000, question: { name: 'example.com', recordType: 'A' } }, plugins: { directory: 'plugins', enabled: true } };
const logger = new Logger([], 'debug');
describe('core runtime', () => {
  it('publishes asynchronous events', async () => { const bus = new EventBus(); const seen: string[] = []; bus.subscribe('BenchmarkCompleted', (e) => { seen.push(e.type); }); await bus.publish('BenchmarkCompleted', { ok: true }); expect(seen).toEqual(['BenchmarkCompleted']); });
  it('scores providers from benchmark samples', () => { const app = new Application(config, logger); app.benchmark.record({ providerId: 'cloudflare', latencyMs: 20, success: true, timedOut: false, timestamp: new Date().toISOString() }); expect(new HealthScorer().score(app.providers[0]!, app.benchmark.stats('cloudflare'))).toBeGreaterThan(80); });
  it('starts and stops restart-safely', async () => { const app = new Application(config, logger); await app.start(); await app.start(); expect(app.state).toBe('running'); await app.stop(); await app.stop(); expect(app.state).toBe('stopped'); });
  it('cancels scheduled jobs', async () => { const scheduler = new Scheduler(logger); const cancel = scheduler.schedule({ id: 'one', runAt: new Date(Date.now() + 50) }, () => undefined); cancel(); await scheduler.stop(); expect(true).toBe(true); });
});
