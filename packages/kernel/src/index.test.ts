import { describe, expect, it, vi } from 'vitest';
import {
  CapabilityError,
  ConfigurationStore,
  DIContainer,
  FeatureFlags,
  KernelError,
  KernelRuntime,
  ResourceManager,
  StateMachine,
  createContract,
} from './index.js';

describe('network kernel', () => {
  it('enforces contract capabilities through the kernel execution pipeline', async () => {
    const kernel = new KernelRuntime();
    kernel.registerContract(createContract({ namespace: 'dns', version: '1.0.0', operations: { resolve: {
      capability: 'dns.resolve', execute: (input) => ({ input, records: ['127.0.0.1'] }),
    } } }));
    await expect(kernel.execute('dns', 'resolve', { name: 'example.com' }, { principal: { id: 'plugin', capabilities: [] } })).rejects.toBeInstanceOf(CapabilityError);
    await expect(kernel.execute('dns', 'resolve', { name: 'example.com' }, { principal: { id: 'plugin', capabilities: ['dns.resolve'] } })).resolves.toMatchObject({ records: ['127.0.0.1'] });
  });

  it('supports singleton and scoped DI services', async () => {
    const di = new DIContainer();
    di.register({ token: 'clock', name: 'main', lifetime: 'singleton', priority: 1, version: '1.0.0', lazy: true, factory: () => ({ id: Math.random() }) });
    di.register({ token: 'request', lifetime: 'scoped', priority: 1, version: '1.0.0', lazy: true, factory: () => ({ id: Math.random() }) });
    const scope = di.createScope();
    const clock = await di.resolve('clock', 'main');
    await expect(di.resolve('clock', 'main')).resolves.toBe(clock);
    const request = await scope.resolve('request');
    await expect(scope.resolve('request')).resolves.toBe(request);
  });

  it('runs every middleware again on message retry', async () => {
    const kernel = new KernelRuntime();
    const middlewareCalls: string[] = [];
    let attempts = 0;
    kernel.bus.use(async (message, next) => { middlewareCalls.push(`outer-${message.attempts}`); return next(); });
    kernel.bus.use(async (message, next) => { middlewareCalls.push(`inner-${message.attempts}`); return next(); });
    kernel.bus.on('Retryable', () => { attempts += 1; if (attempts === 1) throw new Error('retry'); return 'ok'; });
    await expect(kernel.bus.publish({ type: 'event', name: 'Retryable', payload: null, priority: 'normal', maxAttempts: 2, persist: false }, kernel.context())).resolves.toEqual(['ok']);
    expect(middlewareCalls).toEqual(['outer-1', 'inner-1', 'outer-2', 'inner-2']);
  });

  it('persists, retries and observes event pipeline messages', async () => {
    const kernel = new KernelRuntime();
    let attempts = 0;
    kernel.bus.on('PluginLoaded', () => { attempts += 1; if (attempts === 1) throw new Error('retry'); return true; });
    await expect(kernel.bus.publish({ type: 'event', name: 'PluginLoaded', payload: { id: 'sample' }, priority: 'critical', maxAttempts: 2, persist: true }, kernel.context())).resolves.toEqual([true]);
    expect(kernel.bus.persistedMessages()).toHaveLength(1);
    expect(kernel.metrics['message.PluginLoaded.count']).toBe(2);
  });

  it('requires every configuration migration step', () => {
    const config = new ConfigurationStore();
    config.set('network', { schemaVersion: 1, data: { mode: 'safe' }, migrations: {}, compatibleWith: [1], validate: (data) => data.mode ? [] : ['mode required'] });
    expect(() => config.migrate('network', 2)).toThrowError(KernelError);
    config.set('network', { schemaVersion: 1, data: { mode: 'safe' }, migrations: { 1: (data) => ({ ...(data as { mode: string }), timeoutMs: 5000 }) }, compatibleWith: [1], validate: (data) => data.mode ? [] : ['mode required'] });
    config.migrate('network', 2);
    expect(config.get<{ mode: string; timeoutMs: number }>('network')?.data.timeoutMs).toBe(5000);
  });

  it('replaces an existing resource timer without tripping the limit', () => {
    vi.useFakeTimers();
    try {
      const resources = new ResourceManager();
      resources.limits.maxTimers = 1;
      const first = vi.fn();
      const second = vi.fn();
      resources.timer('probe', 1000, first);
      resources.timer('probe', 0, second);
      vi.runAllTimers();
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
      resources.shutdown();
    } finally {
      vi.useRealTimers();
    }
  });

  it('runs workflows in simulation mode without executing actions', async () => {
    const kernel = new KernelRuntime();
    let executed = false;
    kernel.bus.on('vpn.connect', () => { executed = true; });
    const result = await kernel.workflows.run({ id: 'connect', trigger: 'manual', steps: [{ id: 'vpn', capability: 'vpn.connect', action: 'vpn.connect' }] }, kernel.context({ id: 'ai', capabilities: ['vpn.connect'] }), true);
    expect(result.simulated).toBe(true);
    expect(result.steps[0]?.status).toBe('predicted');
    expect(executed).toBe(false);
  });

  it('manages feature flags and typed state machines', () => {
    const flags = new FeatureFlags({ IRP_FEATURE_KERNEL_WORKFLOWS: 'true' });
    expect(flags.isEnabled('kernel.workflows')).toBe(true);
    const vpn = new StateMachine('disconnected', [{ from: 'disconnected', to: 'connected', event: 'connect' }] as const);
    expect(vpn.send('connect')).toBe('connected');
  });
});
