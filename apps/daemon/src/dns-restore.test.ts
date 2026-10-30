import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DnsRestoreJournal, parseResolvectlDns, type Exec } from './dns-restore.js';

const dirs: string[] = [];
const path = (): string => { const d = mkdtempSync(join(tmpdir(), 'irp-dns-')); dirs.push(d); return join(d, 'dns-original.json'); };
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
const recorder = (current: string) => {
  const calls: string[][] = [];
  const exec: Exec = async (file, args) => { calls.push([file, ...args]); return { stdout: args[0] === 'dns' && args.length === 2 ? current : '' }; };
  return { calls, exec };
};

describe('parseResolvectlDns', () => {
  it('parses v4/v6 lists and empty lists', () => {
    expect(parseResolvectlDns('Link 2 (eth0): 192.168.1.1 2001:db8::1\n')).toEqual(['192.168.1.1', '2001:db8::1']);
    expect(parseResolvectlDns('Link 2 (eth0):\n')).toEqual([]);
  });
});

describe('DnsRestoreJournal', () => {
  it('captures once, before the first change, and restores the original list', async () => {
    const p = path();
    const first = recorder('Link 2 (eth0): 192.168.1.1');
    const j = new DnsRestoreJournal(p, first.exec);
    await j.captureBeforeChange('eth0');
    expect(JSON.parse(readFileSync(p, 'utf8')).servers).toEqual(['192.168.1.1']);
    await j.captureBeforeChange('eth0'); // later provider switches must not overwrite the original
    expect(first.calls.filter((c) => c.join(' ') === 'resolvectl dns eth0')).toHaveLength(1);
    expect(await j.restore()).toEqual({ restored: true, link: 'eth0' });
    expect(first.calls.at(-1)).toEqual(['resolvectl', 'dns', 'eth0', '192.168.1.1']);
    expect(existsSync(p)).toBe(false);
  });

  it('survives a restart: a new journal instance can undo the recorded change', async () => {
    const p = path();
    await new DnsRestoreJournal(p, recorder('Link 2 (eth0): 9.9.9.9').exec).captureBeforeChange('eth0');
    const after = recorder('');
    const j = new DnsRestoreJournal(p, after.exec);
    expect(j.pending()).toBe(true);
    await j.restore();
    expect(after.calls).toEqual([['resolvectl', 'dns', 'eth0', '9.9.9.9']]);
  });

  it('reverts to link defaults when there was no original resolver list', async () => {
    const p = path();
    const r = recorder('Link 2 (eth0):');
    const j = new DnsRestoreJournal(p, r.exec);
    await j.captureBeforeChange('eth0');
    await j.restore();
    expect(r.calls.at(-1)).toEqual(['resolvectl', 'revert', 'eth0']);
  });

  it('keeps the record when restore fails so it can be retried', async () => {
    const p = path();
    const j = new DnsRestoreJournal(p, recorder('Link 2 (eth0): 1.1.1.1').exec);
    await j.captureBeforeChange('eth0');
    const failing = new DnsRestoreJournal(p, async () => { throw new Error('resolved down'); });
    await expect(failing.restore()).rejects.toThrow('resolved down');
    expect(existsSync(p)).toBe(true);
  });

  it('does nothing without a journal path or record', async () => {
    expect(await new DnsRestoreJournal(undefined, recorder('').exec).restore()).toEqual({ restored: false });
  });
});
