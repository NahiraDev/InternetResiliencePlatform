import { describe, expect, it } from 'vitest';
import { NotificationIncidentCenter } from './notifications.js';

const incident = {
  classification: 'primary_failure',
  rootCause: 'DNS resolution degraded',
  affectedComponents: ['dns', 'network'],
  evidence: ['dns probe failed'],
  correlationReason: 'Multiple DNS probes failed in the same observation window.',
  confidence: 0.92,
};

describe('NotificationIncidentCenter', () => {
  it('creates one logical incident for repeated matching failures', async () => {
    const center = new NotificationIncidentCenter();
    const first = await center.open(incident);
    const second = await center.open(incident);

    expect(second.id).toBe(first.id);
    expect(second.occurrenceCount).toBe(2);
    expect((await center.listIncidents()).length).toBe(1);
    expect((await center.listNotifications()).length).toBe(2);
  });

  it('preserves critical severity for security failures', async () => {
    const center = new NotificationIncidentCenter();
    const created = await center.open({ ...incident, classification: 'security_failure', confidence: 0.7 });

    expect(created.severity).toBe('critical');
    expect(created.status).toBe('open');
    expect((await center.listNotifications())[0]?.actionable).toBe(true);
  });

  it('supports acknowledge then resolve and emits recovery notification', async () => {
    const center = new NotificationIncidentCenter();
    const created = await center.open(incident);
    const acknowledged = await center.acknowledge(created.id);
    const resolved = await center.resolve(created.id);

    expect(acknowledged?.status).toBe('acknowledged');
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.resolvedAt).toBeTruthy();
    expect((await center.listNotifications()).some((item) => item.type === 'incident-resolved')).toBe(true);
  });

  it('does not reopen a resolved incident as a new identity', async () => {
    const center = new NotificationIncidentCenter();
    const created = await center.open(incident);
    await center.resolve(created.id);
    const reopened = await center.open(incident);

    expect(reopened.id).toBe(created.id);
    expect(reopened.status).toBe('open');
    expect(reopened.occurrenceCount).toBe(2);
  });

  it('marks notifications read idempotently', async () => {
    const center = new NotificationIncidentCenter();
    await center.open(incident);
    const notification = (await center.listNotifications())[0];
    expect(notification).toBeTruthy();
    const read = await center.markRead(notification!.id);
    expect(read?.readAt).toBeTruthy();
    expect((await center.listNotifications(100, true)).length).toBe(0);
    expect(await center.markRead(notification!.id)).toEqual(read);
  });
});
