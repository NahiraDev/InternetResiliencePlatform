import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = (() => {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(directory, 'AGENTS.md'))) {
    const parent = dirname(directory);
    if (parent === directory) return directory;
    directory = parent;
  }
  return directory;
})();
const read = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8');
const exists = (rel: string) => existsSync(join(repoRoot, rel));

describe('Issue #284: deployment/build/startup/readiness/shutdown contract', () => {
  it('canonical host entrypoints exist and compose through the canonical boundary', () => {
    for (const entry of [
      'apps/daemon/src/index.ts',
      'packages/linux-client/src/index.ts',
      'apps/api/src/index.ts',
      'apps/cli/src/index.ts',
    ]) {
      expect(exists(entry), `${entry} missing`).toBe(true);
      const source = read(entry);
      expect(source).toContain('createCanonicalRuntime');
      expect(source).not.toMatch(/new\s+ResilienceRuntime/);
    }
  });

  it('observe-only clients remain interfaces, not privileged orchestrators', () => {
    for (const entry of [
      'packages/macos-client/src/index.ts',
      'packages/windows-client/src/index.ts',
    ]) {
      expect(exists(entry), `${entry} missing`).toBe(true);
      const source = read(entry);
      expect(source).not.toContain('createCanonicalRuntime');
      expect(source).not.toMatch(/new\s+ResilienceRuntime/);
      expect(source).not.toMatch(/new\s+DeterministicPlanner/);
      expect(source).not.toMatch(/new\s+PrivilegedMutationBoundary/);
    }
    expect(read('packages/macos-client/src/index.ts')).toContain('autonomousMode: false');
    expect(read('packages/windows-client/src/index.ts')).toContain('autonomousMode: false');
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

  it('macOS launchd unit keeps the observe-only client supervised and bounded', () => {
    const unit = 'packages/macos-client/launchd/com.nahiradev.irp.macos-client.plist';
    expect(exists(unit), `${unit} missing`).toBe(true);
    const text = read(unit);
    for (const directive of [
      '<string>com.nahiradev.irp.macos-client</string>',
      '<string>Background</string>',
      '<integer>5</integer>',
    ]) {
      expect(text).toContain(directive);
    }
  });

  it('every workspace package exposes the standard build/lint/test/typecheck gates', () => {
    const manifests: string[] = [];
    for (const root of ['apps', 'packages']) {
      for (const name of readdirSync(join(repoRoot, root))) {
        const manifest = join(repoRoot, root, name, 'package.json');
        if (existsSync(manifest)) manifests.push(manifest);
      }
    }
    expect(manifests.length).toBeGreaterThan(1);
    for (const manifest of manifests) {
      const pkg = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string;
        scripts?: Record<string, string>;
      };
      for (const script of ['build', 'lint', 'test', 'typecheck']) {
        expect(pkg.scripts?.[script], `${pkg.name ?? manifest} missing ${script} script`).toBeTruthy();
      }
    }
  });
});
