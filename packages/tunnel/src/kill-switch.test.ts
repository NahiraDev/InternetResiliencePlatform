import { describe, expect, it } from 'vitest';
import { NftablesKillSwitch } from './kill-switch.js';
import type { CommandResult, CommandRunner } from './wireguard.js';

type Call = { command: string; args: string[] };

const createRunner = (behavior: { failOn?: RegExp; stderrByPattern?: Array<{ pattern: RegExp; stderr: string }> } = {}): { runner: CommandRunner; calls: Call[] } => {
  const calls: Call[] = [];
  const runner: CommandRunner = {
    async run(command, args): Promise<CommandResult> {
      calls.push({ command, args });
      for (const { pattern, stderr } of behavior.stderrByPattern ?? [])
        if (pattern.test(args.join(' '))) return { stdout: '', stderr, exitCode: 1 };
      if (behavior.failOn?.test(args.join(' '))) return { stdout: '', stderr: 'nft: operation failed', exitCode: 1 };
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  };
  return { runner, calls };
};

describe('NftablesKillSwitch', () => {
  it('installs a fail-closed output chain with loopback, established, tunnel and endpoint rules', async () => {
    const { runner, calls } = createRunner();
    const killSwitch = new NftablesKillSwitch({ commandRunner: runner, allowedUdpPorts: [51820] });
    await killSwitch.enable('wg-1');
    const commands = calls.map((call) => call.command + ' ' + call.args.join(' '));
    expect(commands.some((c) => c.includes('delete table inet irp_killswitch'))).toBe(true);
    expect(commands.some((c) => c.includes('add table inet irp_killswitch'))).toBe(true);
    expect(commands.some((c) => c.includes('policy drop'))).toBe(true);
    expect(commands.some((c) => c.includes('oifname lo accept'))).toBe(true);
    expect(commands.some((c) => c.includes('ct state established,related accept'))).toBe(true);
    expect(commands.some((c) => c.includes('oifname irpwg0 accept'))).toBe(true);
    expect(commands.some((c) => c.includes('udp dport 51820 accept'))).toBe(true);
    expect(commands.some((c) => c.includes('oifname "lo" accept'))).toBe(false);
  });

  it('removes the table on disable', async () => {
    const { runner, calls } = createRunner();
    const killSwitch = new NftablesKillSwitch({ commandRunner: runner });
    await killSwitch.disable('wg-1');
    expect(calls[0]?.args.join(' ')).toContain('delete table inet irp_killswitch');
  });

  it('reports enabled when the table exists and disabled when it does not', async () => {
    const enabled = createRunner();
    expect(await new NftablesKillSwitch({ commandRunner: enabled.runner }).status('wg-1')).toBe('enabled');
    const disabled = createRunner({ stderrByPattern: [{ pattern: /list table/, stderr: 'Error: No such file or directory' }] });
    expect(await new NftablesKillSwitch({ commandRunner: disabled.runner }).status('wg-1')).toBe('disabled');
  });

  it('reports unsupported when nft is unavailable or permission is denied', async () => {
    const missing = createRunner({ stderrByPattern: [{ pattern: /list table/, stderr: 'spawn nft ENOENT' }] });
    expect(await new NftablesKillSwitch({ commandRunner: missing.runner }).status('wg-1')).toBe('unsupported');
    const denied = createRunner({ stderrByPattern: [{ pattern: /list table/, stderr: 'Operation not permitted' }] });
    expect(await new NftablesKillSwitch({ commandRunner: denied.runner }).status('wg-1')).toBe('unsupported');
  });

  it('rolls back a partial installation when a rule fails', async () => {
    const { runner, calls } = createRunner({ failOn: /add rule/ });
    const killSwitch = new NftablesKillSwitch({ commandRunner: runner });
    await expect(killSwitch.enable('wg-1')).rejects.toThrow('kill switch enable failed');
    expect(calls.filter((call) => call.args.includes('delete')).length).toBe(2);
  });

  it('rejects invalid configuration and tunnel ids', async () => {
    const { runner } = createRunner();
    expect(() => new NftablesKillSwitch({ commandRunner: runner, tunnelInterface: 'invalid interface name that is too long' })).toThrow('tunnel interface name is invalid');
    const killSwitch = new NftablesKillSwitch({ commandRunner: runner });
    await expect(killSwitch.enable('')).rejects.toThrow('tunnel id');
    await expect(killSwitch.enable('x'.repeat(200))).rejects.toThrow('tunnel id');
  });
});