import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const validator = join(process.cwd(), 'scripts/architecture/validate-architecture.mjs');

describe('architecture contract gate', () => {
  it('passes for the repository baseline', () => {
    expect(() => execFileSync(process.execPath, [validator], { cwd: process.cwd(), stdio: 'pipe' })).not.toThrow();
  });

  it('is executable as a blocking gate when the contract is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'irp-architecture-'));
    mkdirSync(join(dir, 'scripts/architecture'), { recursive: true });
    writeFileSync(join(dir, 'scripts/architecture/validate-architecture.mjs'),
      'process.exit(1);');
    expect(() => execFileSync(process.execPath, [join(dir, 'scripts/architecture/validate-architecture.mjs')])).toThrow();
  });
});
