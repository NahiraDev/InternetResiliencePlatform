/**
 * Web Control Center static asset tests.
 *
 * Verifies the IRP web app ships with well-formed HTML, CSS, and JS that
 * reference the correct design tokens and API endpoints. No mock data; these
 * tests only assert the production assets are present and consistent.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_DIR = fileURLToPath(new URL('..', import.meta.url));

describe('IRP Web Control Center', () => {
  it('ships an index.html', () => {
    const html = readFileSync(join(WEB_DIR, 'index.html'), 'utf8');
    expect(html).toContain('<title>IRP Control Center</title>');
    expect(html).toContain('/web/style.css');
    expect(html).toContain('/web/src/app.js');
  });

  it('uses IRP design tokens in CSS', () => {
    const css = readFileSync(join(WEB_DIR, 'style.css'), 'utf8');
    expect(css).toContain('--bg: #0A0F1C');
    expect(css).toContain('--primary: #6AA9FF');
    expect(css).toContain('--ok: #4ADE9A');
    expect(css).toContain('--warn: #F5C26B');
    expect(css).toContain('--danger: #FF7A85');
  });

  it('connects to real API endpoints (no mock data)', () => {
    const js = readFileSync(join(WEB_DIR, 'src/app.js'), 'utf8');
    expect(js).toContain('/api/v1/platform/status');
    expect(js).toContain('/api/v1/auth/login');
    expect(js).toContain('/api/v1/auth/register');
    expect(js).toContain('accessToken');
    // Must not contain actual mock data generation patterns
    expect(js).not.toMatch(/Math\.random\(\)/);
    expect(js).not.toMatch(/mockData|sampleData|demoData|fakeData/);
  });
});
