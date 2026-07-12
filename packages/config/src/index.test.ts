import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './index.js';

describe('loadConfig', () => {
  it('merges files and environment variables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'irp-config-'));
    writeFileSync(join(dir, 'default.yaml'), 'app:\n  name: Test\n  version: 1.0.0\n  environment: development\napi:\n  host: 127.0.0.1\n  port: 8080\nlogger:\n  level: info\ntelemetry:\n  enabled: true\n');
    const config = loadConfig({ configDir: dir, env: { IRP_API_PORT: '9090' } });
    expect(config.api.port).toBe(9090);
  });
});
