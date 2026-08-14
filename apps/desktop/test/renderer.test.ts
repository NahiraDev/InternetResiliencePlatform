import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('Phase 20 renderer shell', () => {
  const source = readFileSync(new URL('../src/renderer/renderer.ts', import.meta.url), 'utf8');
  it('contains all required pages and live/demo source indicators', () => {
    for (const page of [
      'Dashboard',
      'Network',
      'Security',
      'Tunnels',
      'DNS',
      'Decisions',
      'Settings',
      'Diagnostics',
    ])
      expect(source).toContain(page);
    expect(source).toContain("${snapshot.network?.source ?? 'LIVE'} MODE");
    expect(source).toContain('UNAVAILABLE');
  });
  it('uses the preload platform bridge rather than Node or shell commands', () => {
    expect(source).toContain('window.platform');
    expect(source).not.toMatch(/child_process|exec\(|spawn\(|ipcRenderer|require\(/);
  });
});
