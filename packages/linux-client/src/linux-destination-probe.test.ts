import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeContext } from '@irp/resilience-runtime';
import { parseDestination } from '@irp/routing';
import {
  LinuxTcpDestinationProbe,
  TCP_PROBE_SCRIPT,
  type ProbeCommandResult,
  type ProbeCommandRunner,
} from './linux-destination-probe.js';

const context = {} as RuntimeContext;

/** Records every command and replies with a scripted result. */
class ScriptedRunner implements ProbeCommandRunner {
  readonly calls: { file: string; args: readonly string[]; timeoutMs: number }[] = [];
  constructor(private readonly reply: Partial<ProbeCommandResult> & { stdout?: string }) {}
  async run(file: string, args: readonly string[], options: { timeoutMs: number }) {
    this.calls.push({ file, args, timeoutMs: options.timeoutMs });
    return {
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      ...this.reply,
    } satisfies ProbeCommandResult;
  }
}

const line = (outcome: string, code?: string, latencyMs = 3) =>
  `${JSON.stringify({ outcome, ...(code ? { code } : {}), latencyMs })}\n`;

describe('LinuxTcpDestinationProbe outcome mapping', () => {
  const verify = async (stdout: string, extra: Partial<ProbeCommandResult> = {}) => {
    const probe = new LinuxTcpDestinationProbe({
      port: 8080,
      runner: new ScriptedRunner({ stdout, ...extra }),
    });
    return probe.verifyDestination(parseDestination('10.98.0.10'), context);
  };

  it('reports a completed TCP connection as reachable', async () => {
    const outcome = await verify(line('connected'));
    expect(outcome.status).toBe('reachable');
    expect(outcome.service).toBe('10.98.0.10:8080');
  });

  it('does not call a refused connection reachable: the path is up but the service is not', async () => {
    const outcome = await verify(line('refused', 'ECONNREFUSED'));
    expect(outcome.status).toBe('degraded');
    expect(outcome.reason).toMatch(/refused/);
  });

  it.each([
    ['timeout', 'ETIMEDOUT'],
    ['unreachable', 'ENETUNREACH'],
    ['unreachable', 'EHOSTUNREACH'],
    ['error', 'ECONNRESET'],
  ])('reports %s (%s) as failed', async (kind, code) => {
    const outcome = await verify(line(kind, code));
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toContain(code);
  });

  it('reports a missing binary as unknown, never as reachable', async () => {
    const outcome = await verify('', { exitCode: 1, errorCode: 'ENOENT' });
    expect(outcome.status).toBe('unknown');
    expect(outcome.reason).toMatch(/not installed/);
  });

  it('reports a failing `ip netns exec` (missing namespace or privilege) as unknown with the cause', async () => {
    const outcome = await verify('', {
      exitCode: 1,
      stderr: 'setting the network namespace "nope" failed: No such file or directory',
    });
    expect(outcome.status).toBe('unknown');
    expect(outcome.reason).toMatch(/No such file or directory/);
  });

  it('reports a hung probe process as unknown', async () => {
    const outcome = await verify('', { exitCode: 1, timedOut: true });
    expect(outcome.status).toBe('unknown');
    expect(outcome.reason).toMatch(/PROBE_TIMEOUT/);
  });

  it('rejects unparseable or out-of-contract output instead of guessing', async () => {
    expect((await verify('not json')).status).toBe('unknown');
    expect((await verify(line('definitely-fine'))).status).toBe('unknown');
  });

  it('does not run anything for destinations that are not IP addresses', async () => {
    const runner = new ScriptedRunner({ stdout: line('connected') });
    const probe = new LinuxTcpDestinationProbe({ port: 8080, runner });
    for (const raw of ['example.com', '10.98.0.0/24', 'default']) {
      const outcome = await probe.verifyDestination(parseDestination(raw), context);
      expect(outcome.status).toBe('unknown');
    }
    expect(runner.calls).toEqual([]);
  });

  it('prefers the destination port over the configured default', async () => {
    const runner = new ScriptedRunner({ stdout: line('connected') });
    const probe = new LinuxTcpDestinationProbe({ port: 8080, runner });
    await probe.verifyDestination({ ...parseDestination('10.98.0.10'), port: 9443 }, context);
    expect(runner.calls[0]?.args).toContain('9443');
    expect(runner.calls[0]?.args).not.toContain('8080');
  });
});

describe('LinuxTcpDestinationProbe command construction', () => {
  it('runs the fixed probe program inside the namespace with `ip netns exec`, never via a shell', async () => {
    const runner = new ScriptedRunner({ stdout: line('connected') });
    const probe = new LinuxTcpDestinationProbe({
      port: 8080,
      netns: 'irp-lab-src',
      timeoutMs: 1500,
      runner,
      nodeBinary: '/usr/bin/node',
    });
    await probe.probe('10.98.0.10');
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]).toMatchObject({
      file: 'ip',
      args: [
        'netns',
        'exec',
        'irp-lab-src',
        '/usr/bin/node',
        '-e',
        TCP_PROBE_SCRIPT,
        '10.98.0.10',
        '8080',
        '1500',
      ],
    });
  });

  it('runs the probe program directly in the host namespace when no namespace is given', async () => {
    const runner = new ScriptedRunner({ stdout: line('connected') });
    const probe = new LinuxTcpDestinationProbe({ port: 8080, runner, nodeBinary: '/usr/bin/node' });
    await probe.probe('10.98.0.10');
    expect(runner.calls[0]?.file).toBe('/usr/bin/node');
    expect(runner.calls[0]?.args.slice(0, 2)).toEqual(['-e', TCP_PROBE_SCRIPT]);
  });

  it('gives the probe process a deadline longer than the connection timeout', async () => {
    const runner = new ScriptedRunner({ stdout: line('connected') });
    await new LinuxTcpDestinationProbe({ port: 8080, timeoutMs: 1000, runner }).probe('10.98.0.10');
    expect(runner.calls[0]?.timeoutMs).toBeGreaterThan(1000);
  });

  it('clamps an absurd timeout instead of passing it through', async () => {
    const runner = new ScriptedRunner({ stdout: line('connected') });
    await new LinuxTcpDestinationProbe({ port: 8080, timeoutMs: 10 ** 9, runner }).probe('10.98.0.10');
    expect(runner.calls[0]?.args.at(-1)).toBe('30000');
  });

  it.each(['-n evil', 'a b', '../x', '', 'a;b', '$(id)'])(
    'rejects the unsafe namespace name %j at construction',
    (netns) => {
      expect(() => new LinuxTcpDestinationProbe({ port: 8080, netns })).toThrow(/namespace/);
    },
  );

  it.each([0, -1, 65_536, 1.5, Number.NaN])('rejects the invalid port %s at construction', (port) => {
    expect(() => new LinuxTcpDestinationProbe({ port })).toThrow(/port/);
  });

  it.each(['10.0.0.1; id', '$(id)', '-1', 'example.com', ''])(
    'never executes anything for the non-IP host %j',
    async (host) => {
      const runner = new ScriptedRunner({ stdout: line('connected') });
      const result = await new LinuxTcpDestinationProbe({ port: 8080, runner }).probe(host);
      expect(result.outcome).toBe('unavailable');
      expect(runner.calls).toEqual([]);
    },
  );
});

/**
 * Real TCP against a listener on the loopback interface of this host. It needs no privilege and
 * changes no host networking: it opens and closes one connection to a port this test owns.
 */
describe('LinuxTcpDestinationProbe against a real loopback socket', () => {
  const servers: Server[] = [];
  afterEach(async () => {
    while (servers.length) {
      const server = servers.pop()!;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  const listen = async (): Promise<number> => {
    const server = createServer((socket) => socket.end());
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no listener address');
    return address.port;
  };

  it('reports a listening port as reachable', async () => {
    const port = await listen();
    const probe = new LinuxTcpDestinationProbe({ port });
    const outcome = await probe.verifyDestination(parseDestination('127.0.0.1'), context);
    expect(outcome).toMatchObject({ status: 'reachable', service: `127.0.0.1:${port}` });
  });

  it('reports a closed port as a refusal, not as reachable', async () => {
    const port = await listen();
    // Close the listener, then probe the now-closed port: the kernel answers with RST.
    const server = servers.pop()!;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const probe = new LinuxTcpDestinationProbe({ port });
    const outcome = await probe.verifyDestination(parseDestination('127.0.0.1'), context);
    expect(outcome.status).toBe('degraded');
  });
});
