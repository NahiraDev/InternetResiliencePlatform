import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('full-system assurance report checksum', () => {
  it('verifies the exact report bytes and preserves the content fingerprint', () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'irp-system-matrix-'));
    try {
      const script = fileURLToPath(new URL('./full-system-assurance.mjs', import.meta.url));
      execFileSync(process.execPath, [script], {
        env: {
          ...process.env,
          IRP_FULL_SYSTEM_OUTPUT: relative(process.cwd(), outputDir),
        },
        stdio: 'pipe',
      });
      const reportBytes = readFileSync(join(outputDir, 'system-matrix.json'));
      const manifest = readFileSync(join(outputDir, 'system-matrix.sha256'), 'utf8');
      const expectedHash = createHash('sha256').update(reportBytes).digest('hex');
      expect(manifest).toBe(`${expectedHash}  system-matrix.json\n`);
      execFileSync('sha256sum', ['-c', 'system-matrix.sha256'], {
        cwd: outputDir,
        stdio: 'pipe',
      });
      const report = JSON.parse(reportBytes.toString('utf8'));
      const contentHash = createHash('sha256')
        .update(JSON.stringify({ ...report, reportSha256: null }))
        .digest('hex');
      expect(report.reportSha256).toBe(contentHash);
      expect(report.schemaVersion).toBe(3);
      expect(report.verdict).toBe('PASS');
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
