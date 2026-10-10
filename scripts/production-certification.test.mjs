import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Regression test: the certification report checksum manifest must verify
 * against the exact bytes of the published report file. The previous
 * implementation hashed a compact JSON serialization while writing
 * pretty-printed JSON, so `sha256sum -c certification-report.sha256` failed.
 */
describe('production certification report checksum', () => {
  it('writes a manifest that verifies against the exact report bytes', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'irp-cert-'));
    try {
      const script = fileURLToPath(new URL('./production-certification.mjs', import.meta.url));
      execFileSync(process.execPath, [script, '--output', outputDir], {
        stdio: 'ignore',
      });

      const reportPath = join(outputDir, 'certification-report.json');
      const manifestPath = join(outputDir, 'certification-report.sha256');
      const reportBytes = readFileSync(reportPath);
      const manifest = readFileSync(manifestPath, 'utf8');
      const expectedHash = createHash('sha256')
        .update(reportBytes)
        .digest('hex');

      expect(manifest).toBe(`${expectedHash}  certification-report.json\n`);

      // Also verify with the standard tool the docs tell operators to use.
      const verify = execFileSync('sha256sum', ['-c', 'certification-report.sha256'], {
        cwd: outputDir,
        stdio: 'ignore',
      });
      expect(verify).toBeDefined();
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it('still writes a valid JSON report with a stable shape', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'irp-cert-'));
    try {
      const script = fileURLToPath(new URL('./production-certification.mjs', import.meta.url));
      execFileSync(process.execPath, [script, '--output', outputDir], {
        stdio: 'ignore',
      });

      const report = JSON.parse(
        readFileSync(join(outputDir, 'certification-report.json'), 'utf8'),
      );
      expect(report.verdict).toBe('PENDING');
      expect(typeof report.generatedAt).toBe('string');
      expect(Array.isArray(report.checks)).toBe(true);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
