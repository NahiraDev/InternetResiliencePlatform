import { describe, expect, it } from 'vitest';

import {
  compareVersions,
  computeWorkspaceClosure,
  extractExternalVersions,
} from './package-linux-bundle.mjs';

const manifest = (name, dependencies = {}) => ({
  dir: name.replace('@irp/', ''),
  manifest: { name, dependencies },
});

describe('computeWorkspaceClosure', () => {
  it('walks transitive @irp workspace dependencies breadth-first', () => {
    const manifests = new Map([
      ['@irp/linux-client', manifest('@irp/linux-client', { '@irp/routing': 'workspace:*', pg: '8.23.0' })],
      ['@irp/routing', manifest('@irp/routing', { '@irp/kernel': 'workspace:*' })],
      ['@irp/kernel', manifest('@irp/kernel')],
      ['@irp/unrelated', manifest('@irp/unrelated')],
    ]);

    const closure = computeWorkspaceClosure(manifests, '@irp/linux-client');

    expect([...closure.keys()].sort()).toEqual(['@irp/kernel', '@irp/linux-client', '@irp/routing']);
    // External dependencies (pg) and unrelated workspace packages are excluded.
    expect(closure.has('@irp/unrelated')).toBe(false);
  });

  it('fails closed when a workspace dependency is missing from packages/', () => {
    const manifests = new Map([
      ['@irp/linux-client', manifest('@irp/linux-client', { '@irp/missing': 'workspace:*' })],
    ]);

    expect(() => computeWorkspaceClosure(manifests, '@irp/linux-client')).toThrow(
      /@irp\/missing not found/,
    );
  });
});

describe('extractExternalVersions', () => {
  it('reads the top-level packages section, not the importers one', () => {
    const lockfile = [
      'importers:',
      '',
      "  packages/linux-client:",
      '    dependencies:',
      '      zod:',
      '        specifier: ^3.0.0',
      '        version: 3.9.9',
      '',
      'packages:',
      '',
      '  zod@3.9.9:',
      '    resolution: {integrity: sha512-…}',
      '',
    ].join('\n');

    const versions = extractExternalVersions(lockfile);

    expect(versions.get('zod')).toEqual(new Set(['3.9.9']));
  });

  it('handles quoted keys, scoped names and peer-suffixed versions', () => {
    const lockfile = [
      'packages:',
      '',
      "  '@opentelemetry/api@1.9.0':",
      '    resolution: {integrity: sha512-…}',
      '',
      '  pg-pool@3.14.0(pg@8.23.0):',
      '    resolution: {integrity: sha512-…}',
      '',
    ].join('\n');

    const versions = extractExternalVersions(lockfile);

    expect(versions.get('@opentelemetry/api')).toEqual(new Set(['1.9.0']));
    expect(versions.get('pg-pool')).toEqual(new Set(['3.14.0']));
  });
});

describe('compareVersions', () => {
  it('orders plain x.y.z versions ascending', () => {
    expect(compareVersions('1.7.0', '3.0.2')).toBeLessThan(0);
    expect(compareVersions('3.0.2', '3.0.3')).toBeLessThan(0);
    expect(compareVersions('10.3.1', '9.9.9')).toBeGreaterThan(0);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
  });
});
