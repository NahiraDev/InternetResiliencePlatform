import { describe, expect, it } from 'vitest';
import { EndpointRegistry, scoreEndpoint } from './endpoint-registry.js';

const endpoint = {
  id: 'endpoint-1',
  hostname: 'example.net',
  address: '192.0.2.1',
  port: 443,
  protocol: 'https' as const,
  region: 'eu-west',
  provider: 'example',
  asn: 'AS64500',
};

describe('EndpointRegistry', () => {
  it('registers endpoints without exposing mutable state', () => {
    const registry = new EndpointRegistry({ now: () => new Date('2026-08-19T00:00:00.000Z') });
    const record = registry.register({ ...endpoint, tags: ['public'] });
    record.tags?.push('mutated');

    expect(registry.size()).toBe(1);
    expect(registry.get(endpoint.id)?.tags).toEqual(['public']);
    expect(registry.get(endpoint.id)?.health.status).toBe('new');
  });

  it('aggregates repeated healthy observations', () => {
    const registry = new EndpointRegistry({ maxObservationsPerEndpoint: 20 });
    registry.register(endpoint);

    for (let i = 0; i < 10; i += 1) {
      registry.observe({
        endpointId: endpoint.id,
        observedAt: new Date(2026, 7, 19, 0, 0, i).toISOString(),
        available: true,
        latencyMs: 30 + i,
        packetLossPercent: 0,
      });
    }

    const health = registry.get(endpoint.id)?.health;
    expect(health?.status).toBe('healthy');
    expect(health?.sampleCount).toBe(10);
    expect(health?.availabilityScore).toBe(100);
    expect(health?.confidence).toBe(100);
  });

  it('retires persistently failing endpoints', () => {
    const registry = new EndpointRegistry();
    registry.register(endpoint);
    for (let i = 0; i < 5; i += 1) {
      registry.observe({
        endpointId: endpoint.id,
        observedAt: new Date(2026, 7, 19, 1, 0, i).toISOString(),
        available: false,
        packetLossPercent: 100,
      });
    }
    expect(registry.get(endpoint.id)?.status).toBe('retired');
  });

  it('ranks healthy endpoints before degraded endpoints', () => {
    const registry = new EndpointRegistry();
    registry.register({ ...endpoint, id: 'healthy' });
    registry.register({ ...endpoint, id: 'degraded' });
    registry.observe({ endpointId: 'healthy', observedAt: new Date().toISOString(), available: true, latencyMs: 20 });
    registry.observe({ endpointId: 'degraded', observedAt: new Date().toISOString(), available: false, packetLossPercent: 100 });

    expect(registry.rank()[0]?.id).toBe('healthy');
  });

  it('rejects unknown endpoints and invalid observations', () => {
    const registry = new EndpointRegistry();
    expect(() => registry.observe({ endpointId: 'missing', observedAt: new Date().toISOString(), available: true })).toThrow(
      'unknown endpoint',
    );
    registry.register(endpoint);
    expect(() => registry.observe({ endpointId: endpoint.id, observedAt: 'invalid', available: true })).toThrow(
      'valid ISO timestamp',
    );
    expect(() => registry.observe({ endpointId: endpoint.id, observedAt: new Date().toISOString(), available: true, packetLossPercent: 101 })).toThrow(
      'between 0 and 100',
    );
  });

  it('keeps the aggregate score bounded', () => {
    expect(
      scoreEndpoint({
        endpointId: endpoint.id,
        status: 'healthy',
        reliabilityScore: 100,
        latencyScore: 100,
        availabilityScore: 100,
        confidence: 100,
        sampleCount: 10,
      }),
    ).toBe(100);
  });
});
