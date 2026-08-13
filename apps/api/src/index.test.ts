import { describe, expect, it } from 'vitest';
import { buildServer } from './index.js';

describe('phase 5 core API', () => {
  it('registers, authenticates, and protects organization resources', async () => {
    const app = await buildServer();
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'cto@example.com', name: 'CTO', password: 'Production12345' },
    });
    expect(register.statusCode).toBe(201);
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'cto@example.com', password: 'Production12345' },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().data.accessToken;
    const denied = await app.inject({ method: 'GET', url: '/api/v1/organizations' });
    expect(denied.statusCode).toBe(401);
    const org = await app.inject({
      method: 'POST',
      url: '/api/v1/organizations',
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Resilience Labs' },
    });
    expect(org.statusCode).toBe(201);
    const project = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${org.json().data.id}/projects`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Core Platform' },
    });
    expect(project.statusCode).toBe(201);
    const workspace = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${org.json().data.id}/workspaces`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Production', projectId: project.json().data.id, environment: 'production' },
    });
    expect(workspace.statusCode).toBe(201);
    await app.close();
  }, 15000);
});

describe('phase 6 network intelligence API', () => {
  it('runs probes and returns network measurements', async () => {
    const app = await buildServer();
    const run = await app.inject({ method: 'POST', url: '/api/v1/probes/run' });
    expect(run.statusCode).toBe(200);
    expect(run.json().data.score.score).toBeGreaterThanOrEqual(0);
    const health = await app.inject({ method: 'GET', url: '/api/v1/health/network' });
    expect(health.statusCode).toBe(200);
    const measurements = await app.inject({ method: 'GET', url: '/api/v1/measurements' });
    expect(measurements.statusCode).toBe(200);
    expect(measurements.json().data.length).toBeGreaterThan(0);
    await app.close();
  }, 15000);
});
