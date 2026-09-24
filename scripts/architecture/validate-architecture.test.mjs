import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const validator = join(process.cwd(), 'scripts/architecture/validate-architecture.mjs');

const writeFixture = (root, source = '') => {
  mkdirSync(join(root, 'packages/resilience-runtime/src'), { recursive: true });
  mkdirSync(join(root, 'packages/connectivity'), { recursive: true });
  mkdirSync(join(root, 'packages/routing'), { recursive: true });
  mkdirSync(join(root, 'packages/dns'), { recursive: true });
  mkdirSync(join(root, 'packages/gateway-registry'), { recursive: true });
  mkdirSync(join(root, 'packages/tunnel'), { recursive: true });
  mkdirSync(join(root, 'packages/network-intelligence'), { recursive: true });
  mkdirSync(join(root, 'packages/historical-analysis'), { recursive: true });
  mkdirSync(join(root, 'packages/security'), { recursive: true });
  mkdirSync(join(root, 'packages/telemetry'), { recursive: true });
  mkdirSync(join(root, 'apps/daemon/src'), { recursive: true });
  mkdirSync(join(root, 'docs/architecture'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), '');
  writeFileSync(join(root, 'docs/architecture/IRP-SUPERPLATFORM-REFERENCE-ARCHITECTURE.md'), '');
  writeFileSync(join(root, 'packages/resilience-runtime/src/index.ts'), '');
  writeFileSync(join(root, 'packages/resilience-runtime/src/canonical-runtime-composition.ts'), '');
  writeFileSync(join(root, 'apps/daemon/src/index.ts'), source);
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: { 'architecture:check': 'node scripts/architecture/validate-architecture.mjs' }
  }));
  writeFileSync(join(root, 'docs/architecture/IRP-ARCHITECTURE-CONTRACT.json'), JSON.stringify({
    schemaVersion: 1,
    status: 'binding',
    canonicalRuntime: {
      package: '@irp/resilience-runtime',
      symbol: 'ResilienceRuntime',
      composition: 'createCanonicalRuntime',
      productionAuthorityCount: 1
    },
    hostEntrypoints: ['apps/daemon/src/index.ts'],
    domainOwners: {
      connectivity: '@irp/connectivity',
      routing: '@irp/routing',
      dns: '@irp/dns',
      gateway: '@irp/gateway-registry',
      tunnel: '@irp/tunnel',
      intelligence: '@irp/network-intelligence',
      historicalAnalysis: '@irp/historical-analysis',
      security: '@irp/security',
      telemetry: '@irp/telemetry'
    }
  }));
};

describe('architecture contract gate', () => {
  it('passes for the repository baseline', () => {
    expect(() => execFileSync(process.execPath, [validator], { cwd: process.cwd(), stdio: 'pipe' })).not.toThrow();
  });

  it('blocks a production NetworkAutopilot reference', () => {
    const root = mkdtempSync(join(tmpdir(), 'irp-architecture-'));
    writeFixture(root, "import { NetworkAutopilot } from './legacy.js';\nexport const runtime = NetworkAutopilot;");
    expect(() => execFileSync(process.execPath, [validator], {
      cwd: process.cwd(),
      env: { ...process.env, IRP_ARCHITECTURE_ROOT: root }
    })).toThrow();
  });
});
