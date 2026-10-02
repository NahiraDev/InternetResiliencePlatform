import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = (() => {
  const cwd = process.cwd();
  if (existsSync(join(cwd, 'AGENTS.md'))) return cwd;
  const candidate = resolve(cwd, '../..');
  if (existsSync(join(candidate, 'AGENTS.md'))) return candidate;
  return cwd;
})();
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');
const exists = (rel: string) => existsSync(join(repoRoot, rel));

describe('Issue #284: deployment/build/startup/readiness/shutdown contract', () => {
  it('canonical host entrypoints exist and compose through the canonical boundary', () => {
    for (const entry of ['apps/daemon/src/index.ts', 'packages/linux-client/src/index.ts']) {
      expect(exists(entry), `${entry} missing`).toBe(true);
      const source = read(entry);
      expect(source).toContain('createCanonicalRuntime');
      expect(source).not.toMatch(/new\s+ResilienceRuntime/);
    }
  });

  it('daemon handles shutdown signals and stays observable', () => {
    const daemon = read('apps/daemon/src/index.ts');
    expect(daemon).toContain('SIGTERM');
    expect(daemon).toContain('createCanonicalRuntime');
  });

  it('linux systemd unit enforces least-privilege service identity', () => {
    const unit = 'packages/linux-client/systemd/irp-linux-client.service';
    expect(exists(unit), `${unit} missing`).toBe(true);
    const text = read(unit);
    for (const directive of [
      'User=irp',
      'Group=irp',
      'NoNewPrivileges=true',
      'ProtectSystem=strict',
    ]) {
      expect(text).toContain(directive);
    }
  });

  it('every workspace package exposes the standard build/lint/test/typecheck gates', () => {
    const pkg = JSON.parse(read('packages/resilience-runtime/package.json')) as {
      scripts?: Record<string, string>;
    };
    for (const script of ['build', 'lint', 'test', 'typecheck']) {
      expect(pkg.scripts?.[script], `missing ${script} script`).toBeTruthy();
    }
  });
});
