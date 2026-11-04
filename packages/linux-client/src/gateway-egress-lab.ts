/**
 * Real Linux gateway/egress laboratory.
 *
 * The lab builds a **real** WireGuard tunnel between two network namespaces and places an
 * external destination behind the tunnel peer, so that a route through the tunnel interface can
 * be proven end to end:
 *
 * ```
 *   client namespace (the device under control)          peer namespace (the gateway)
 *   ┌───────────────────────────────────────┐             ┌────────────────────────────────┐
 *   │ irpv0  10.200.0.1/24  ─── veth ──────┼─────────────┼── 10.200.0.2/24                 │
 *   │ irpwg0 10.90.0.2/32   (WireGuard)    │   UDP/51820  │ wgw0   10.90.0.1/32            │
 *   │ route 198.51.100.10/32 dev irpwg0    │◄────────────►│ 198.51.100.10:port (listener)  │
 *   └───────────────────────────────────────┘             └────────────────────────────────┘
 * ```
 *
 * The destination (`198.51.100.10`) is **only** reachable through the tunnel: the underlay
 * carries the WireGuard UDP transport, and the destination prefix is routed through the tunnel
 * interface by the canonical routing engine. The peer observes the TCP connection's source
 * address, which is the tunnel address (`10.90.0.2`) — proof that the traffic was encapsulated,
 * carried across the tunnel and decapsulated by the peer.
 *
 * Nothing here simulates a tunnel: the kernel's WireGuard implementation performs the handshake,
 * `wg` configures the peers, and the route is installed with `ip route replace`.
 *
 * The lab requires privileges the test environment may not have (CAP_NET_ADMIN over the current
 * network namespace, or an equivalent user namespace). {@link detectGatewayEgressLabSupport}
 * reports the exact missing requirement instead of hiding it.
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  mkdir,
  mkdtemp as makeTempDirectory,
  readFile,
  rm as removeDirectory,
  writeFile as writeTextFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const CAP_NET_ADMIN_BIT = 12n;
const CAP_SYS_ADMIN_BIT = 21n;

export interface GatewayEgressLabSupport {
  readonly supported: boolean;
  /** One human-readable reason per missing requirement; empty when supported. */
  readonly reasons: readonly string[];
}

export interface GatewayEgressLabOptions {
  /** Tunnel interface in the client namespace. */
  readonly tunnelInterface?: string;
  /** Tunnel interface in the peer namespace. */
  readonly peerTunnelInterface?: string;
  /** Underlay interface in the client namespace. */
  readonly underlayInterface?: string;
  /** Underlay interface in the peer namespace. */
  readonly peerUnderlayInterface?: string;
  /** Underlay address of the client namespace. */
  readonly clientUnderlayAddress?: string;
  /** Underlay address of the peer namespace. */
  readonly peerUnderlayAddress?: string;
  /** Tunnel address of the client namespace. */
  readonly clientTunnelAddress?: string;
  /** Tunnel address of the peer namespace. */
  readonly peerTunnelAddress?: string;
  /** The external destination that lives behind the tunnel peer. */
  readonly destination?: string;
  /** TCP port of the external destination. */
  readonly destinationPort?: number;
  /** Prefix routed through the tunnel. */
  readonly allowedDestinationCidr?: string;
  /** UDP port of the WireGuard peer. */
  readonly peerPort?: number;
}

export interface GatewayEgressLab {
  readonly tunnelInterface: string;
  readonly peerTunnelInterface: string;
  readonly underlayInterface: string;
  readonly clientUnderlayAddress: string;
  readonly peerUnderlayAddress: string;
  readonly clientTunnelAddress: string;
  readonly peerTunnelAddress: string;
  readonly destination: string;
  readonly destinationPort: number;
  readonly allowedDestinationCidr: string;
  readonly peerPort: number;
  /** The peer's public key (the client configures it as its tunnel peer). */
  readonly peerPublicKey: string;
  /** Directory that holds the client private key as a systemd-style credential. */
  readonly credentialsDirectory: string;
  /** Credential reference (the file name inside {@link credentialsDirectory}). */
  readonly credentialRef: string;
  /** The environment that configures the production WireGuard integration. */
  readonly environment: Readonly<Record<string, string>>;
  /** Runs a command inside the peer namespace. */
  peer(args: readonly string[]): Promise<string>;
  /** `wg show` output for the client interface. */
  clientWireguard(args: readonly string[]): Promise<string>;
  /** `wg show` output for the peer interface. */
  peerWireguard(args: readonly string[]): Promise<string>;
  /** The kernel's route decision for the external destination. */
  routeGet(destination: string): Promise<string>;
  /** Source addresses the external destination observed for accepted connections. */
  observedPeerAddresses(): Promise<string[]>;
  /** Starts the TCP listener behind the tunnel peer. */
  startDestinationListener(): Promise<void>;
  /** Stops the TCP listener so the destination refuses connections. */
  stopDestinationListener(): Promise<void>;
  /** Removes every resource the lab created. */
  teardown(): Promise<void>;
}

const DEFAULT_TUNNEL_INTERFACE = 'irpwg0';
const DEFAULT_PEER_TUNNEL_INTERFACE = 'irpwgs';
const DEFAULT_UNDERLAY_INTERFACE = 'irpv0';
const DEFAULT_PEER_UNDERLAY_INTERFACE = 'irpv1';
const DEFAULT_CLIENT_UNDERLAY = '10.200.0.1';
const DEFAULT_PEER_UNDERLAY = '10.200.0.2';
const DEFAULT_CLIENT_TUNNEL = '10.90.0.2';
const DEFAULT_PEER_TUNNEL = '10.90.0.1';
const DEFAULT_DESTINATION = '198.51.100.10';
const DEFAULT_DESTINATION_PORT = 18080;
const DEFAULT_ALLOWED_CIDR = '198.51.100.0/24';
const DEFAULT_PEER_PORT = 51820;
const CREDENTIAL_REF = 'irp-wireguard-peer-key';

/** Listener that records the remote address of every accepted connection. */
const LISTENER_SCRIPT = [
  "const net = require('node:net');",
  "const fs = require('node:fs');",
  'const [host, port, record] = process.argv.slice(1);',
  'const server = net.createServer((socket) => {',
  "  try { fs.appendFileSync(record, String(socket.remoteAddress) + '\\n'); } catch { /* ignore */ }",
  '  socket.end();',
  '});',
  "server.listen(Number(port), host, () => process.stdout.write('ready\\n'));",
  "process.on('SIGTERM', () => server.close(() => process.exit(0)));",
].join('\n');

const run = async (
  file: string,
  args: readonly string[],
  timeoutMs = 10_000,
): Promise<{ stdout: string; stderr: string }> => {
  const result = await execFileAsync(file, [...args], { timeout: timeoutMs, maxBuffer: 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

/** Runs a command and feeds `input` to its stdin (used for `wg pubkey`). */
const runWithInput = async (
  file: string,
  args: readonly string[],
  input: string,
): Promise<string> =>
  new Promise<string>((resolve, reject) => {
    const child = spawn(file, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += String(chunk)));
    child.stderr.on('data', (chunk) => (stderr += String(chunk)));
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(new Error(`${file} ${args.join(' ')} failed (${String(code)}): ${stderr.trim()}`));
    });
    child.stdin.end(input);
  });

const quietly = async (file: string, args: readonly string[]): Promise<void> => {
  try {
    await run(file, args, 5_000);
  } catch {
    /* cleanup only */
  }
};

const readCaps = (): bigint | undefined => {
  try {
    const match = /^CapEff:\s*([0-9a-fA-F]+)\s*$/m.exec(readFileSync('/proc/self/status', 'utf8'));
    return match?.[1] ? BigInt(`0x${match[1]}`) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Establishes, by actually trying, whether this process can build the lab.
 *
 * The checks are specific on purpose: a caller that cannot run the lab must be able to report
 * *why* rather than silently skipping.
 */
export async function detectGatewayEgressLabSupport(): Promise<GatewayEgressLabSupport> {
  const reasons: string[] = [];
  if (process.platform !== 'linux') {
    return {
      supported: false,
      reasons: [`gateway egress verification requires Linux, not ${process.platform}`],
    };
  }

  for (const [binary, versionArgs] of [
    ['ip', ['-V']],
    ['wg', ['--version']],
    ['nsenter', ['--version']],
  ] as const) {
    try {
      await run(binary, versionArgs, 5_000);
    } catch {
      reasons.push(`the '${binary}' binary is not installed or not on PATH`);
    }
  }

  const caps = readCaps();
  if (caps === undefined) {
    reasons.push('cannot read CapEff from /proc/self/status, so privileges cannot be confirmed');
  } else {
    if ((caps & (1n << CAP_NET_ADMIN_BIT)) === 0n)
      reasons.push('the process lacks CAP_NET_ADMIN (needed to create the tunnel and the route)');
    if ((caps & (1n << CAP_SYS_ADMIN_BIT)) === 0n)
      reasons.push(
        'the process lacks CAP_SYS_ADMIN (needed to create the peer network namespace)',
      );
  }

  if (reasons.length === 0) {
    const probe = `irpwglab${String(process.pid).slice(-6)}`;
    try {
      await run('ip', ['link', 'add', probe, 'type', 'wireguard'], 5_000);
    } catch (error) {
      reasons.push(
        `the kernel refused to create a WireGuard interface: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      await quietly('ip', ['link', 'del', probe]);
    }
  }

  return { supported: reasons.length === 0, reasons };
}

/**
 * Builds the lab.
 *
 * The caller must already run in a namespace where the lab is permitted (see
 * {@link detectGatewayEgressLabSupport}).
 */
export async function createGatewayEgressLab(
  options: GatewayEgressLabOptions = {},
): Promise<GatewayEgressLab> {
  const tunnelInterface = options.tunnelInterface ?? DEFAULT_TUNNEL_INTERFACE;
  const peerTunnelInterface = options.peerTunnelInterface ?? DEFAULT_PEER_TUNNEL_INTERFACE;
  const underlayInterface = options.underlayInterface ?? DEFAULT_UNDERLAY_INTERFACE;
  const peerUnderlayInterface = options.peerUnderlayInterface ?? DEFAULT_PEER_UNDERLAY_INTERFACE;
  const clientUnderlayAddress = options.clientUnderlayAddress ?? DEFAULT_CLIENT_UNDERLAY;
  const peerUnderlayAddress = options.peerUnderlayAddress ?? DEFAULT_PEER_UNDERLAY;
  const clientTunnelAddress = options.clientTunnelAddress ?? DEFAULT_CLIENT_TUNNEL;
  const peerTunnelAddress = options.peerTunnelAddress ?? DEFAULT_PEER_TUNNEL;
  const destination = options.destination ?? DEFAULT_DESTINATION;
  const destinationPort = options.destinationPort ?? DEFAULT_DESTINATION_PORT;
  const allowedDestinationCidr = options.allowedDestinationCidr ?? DEFAULT_ALLOWED_CIDR;
  const peerPort = options.peerPort ?? DEFAULT_PEER_PORT;

  const workDirectory = await makeTempDirectory(join(tmpdir(), 'irp-gateway-egress-'));
  const credentialsDirectory = join(workDirectory, 'credentials');
  const recordFile = join(workDirectory, 'observed-sources.txt');
  const peerKeyFile = join(workDirectory, 'peer.key');

  let peerProcess: ChildProcess | undefined;
  let listener: ChildProcess | undefined;

  const peer = async (args: readonly string[]): Promise<string> => {
    if (!peerProcess?.pid) throw new Error('the peer namespace is not running');
    const result = await run('nsenter', ['-t', String(peerProcess.pid), '-n', ...args], 10_000);
    return result.stdout;
  };

  const teardown = async (): Promise<void> => {
    if (listener && listener.exitCode === null && listener.signalCode === null)
      listener.kill('SIGKILL');
    listener = undefined;
    if (peerProcess && peerProcess.exitCode === null && peerProcess.signalCode === null)
      peerProcess.kill('SIGKILL');
    peerProcess = undefined;
    await quietly('ip', ['link', 'del', 'dev', tunnelInterface]);
    await quietly('ip', ['link', 'del', 'dev', underlayInterface]);
    await removeDirectory(workDirectory, { recursive: true, force: true });
  };

  try {
    // The underlay: a veth pair between the current namespace and the peer namespace.
    await run('ip', ['link', 'set', 'lo', 'up']);
    await run('ip', [
      'link',
      'add',
      underlayInterface,
      'type',
      'veth',
      'peer',
      'name',
      peerUnderlayInterface,
    ]);
    peerProcess = spawn('unshare', ['-n', 'sleep', '600'], { stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the peer namespace did not start')), 5_000);
      peerProcess!.once('spawn', () => {
        clearTimeout(timer);
        resolve();
      });
      peerProcess!.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    // Give the child a moment to enter its new namespace before moving the interface into it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (!peerProcess.pid) throw new Error('the peer namespace process has no pid');
    await run('ip', ['link', 'set', peerUnderlayInterface, 'netns', String(peerProcess.pid)]);
    await run('ip', ['addr', 'add', `${clientUnderlayAddress}/24`, 'dev', underlayInterface]);
    await run('ip', ['link', 'set', underlayInterface, 'up']);
    await peer(['ip', 'addr', 'add', `${peerUnderlayAddress}/24`, 'dev', peerUnderlayInterface]);
    await peer(['ip', 'link', 'set', peerUnderlayInterface, 'up']);
    await peer(['ip', 'link', 'set', 'lo', 'up']);

    // WireGuard key material: real keys, generated by the real tool.
    const clientPrivateKey = (await run('wg', ['genkey'])).stdout.trim();
    const clientPublicKey = (await runWithInput('wg', ['pubkey'], `${clientPrivateKey}\n`)).trim();
    const peerPrivateKey = (await run('wg', ['genkey'])).stdout.trim();
    const peerPublicKey = (await runWithInput('wg', ['pubkey'], `${peerPrivateKey}\n`)).trim();
    await writeTextFile(peerKeyFile, `${peerPrivateKey}\n`, { mode: 0o600 });

    // The gateway peer: a real WireGuard interface that accepts the client's tunnel address.
    // The client interface itself is owned by the production provider and is therefore not
    // created here — the provider creates it, configures it and removes it again.
    await peer(['ip', 'link', 'add', peerTunnelInterface, 'type', 'wireguard']);
    await peer([
      'wg',
      'set',
      peerTunnelInterface,
      'listen-port',
      String(peerPort),
      'private-key',
      peerKeyFile,
      'peer',
      clientPublicKey,
      'allowed-ips',
      `${clientTunnelAddress}/32`,
    ]);
    await peer(['ip', 'addr', 'add', `${peerTunnelAddress}/32`, 'dev', peerTunnelInterface]);
    await peer(['ip', 'link', 'set', peerTunnelInterface, 'up']);
    await peer(['ip', 'route', 'add', `${clientTunnelAddress}/32`, 'dev', peerTunnelInterface]);
    // The external destination only exists behind the tunnel peer.
    await peer(['ip', 'addr', 'add', `${destination}/32`, 'dev', 'lo']);

    // The client credential: a systemd-style private credential file.
    await mkdir(credentialsDirectory, { recursive: true, mode: 0o700 });
    await writeTextFile(join(credentialsDirectory, CREDENTIAL_REF), `${clientPrivateKey}\n`, {
      mode: 0o600,
    });

    const environment: Record<string, string> = {
      IRP_TUNNEL_ENABLED: '1',
      IRP_WIREGUARD_ENDPOINT_HOST: peerUnderlayAddress,
      IRP_WIREGUARD_ENDPOINT_PORT: String(peerPort),
      IRP_WIREGUARD_PEER_PUBLIC_KEY: peerPublicKey,
      IRP_WIREGUARD_CREDENTIAL_REF: CREDENTIAL_REF,
      IRP_WIREGUARD_INTERFACE_NAME: tunnelInterface,
      IRP_WIREGUARD_ADDRESS_CIDR: `${clientTunnelAddress}/32`,
      IRP_WIREGUARD_ALLOWED_IPS: allowedDestinationCidr,
      IRP_WIREGUARD_KEEPALIVE_SECONDS: '25',
      IRP_WIREGUARD_AUTOCONNECT: '0',
      IRP_WIREGUARD_ROUTING_MODE: 'splitTunnel',
      CREDENTIALS_DIRECTORY: credentialsDirectory,
    };

    const startDestinationListener = async (): Promise<void> => {
      if (listener && listener.exitCode === null && listener.signalCode === null) return;
      if (!peerProcess?.pid) throw new Error('the peer namespace is not running');
      const child = spawn(
        'nsenter',
        [
          '-t',
          String(peerProcess.pid),
          '-n',
          process.execPath,
          '-e',
          LISTENER_SCRIPT,
          destination,
          String(destinationPort),
          recordFile,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      listener = child;
      let stderr = '';
      child.stderr?.on('data', (chunk) => (stderr += String(chunk)));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`the destination listener did not start: ${stderr}`)),
          10_000,
        );
        child.stdout?.on('data', (chunk) => {
          if (String(chunk).includes('ready')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`the destination listener exited early (code ${String(code)}): ${stderr}`));
        });
      });
    };

    const stopDestinationListener = async (): Promise<void> => {
      const child = listener;
      listener = undefined;
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGKILL');
      await exited;
    };

    return {
      tunnelInterface,
      peerTunnelInterface,
      underlayInterface,
      clientUnderlayAddress,
      peerUnderlayAddress,
      clientTunnelAddress,
      peerTunnelAddress,
      destination,
      destinationPort,
      allowedDestinationCidr,
      peerPort,
      peerPublicKey,
      credentialsDirectory,
      credentialRef: CREDENTIAL_REF,
      environment,
      peer,
      clientWireguard: async (args) =>
        (await run('wg', ['show', tunnelInterface, ...args])).stdout,
      peerWireguard: async (args) =>
        await peer(['wg', 'show', peerTunnelInterface, ...args]),
      routeGet: async (target) => {
        try {
          return (await run('ip', ['route', 'get', target])).stdout.trim();
        } catch {
          // `ip route get` exits non-zero when the destination has no route at all.
          return '';
        }
      },
      observedPeerAddresses: async () => {
        try {
          const content = await readFile(recordFile, 'utf8');
          return content
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        } catch {
          return [];
        }
      },
      startDestinationListener,
      stopDestinationListener,
      teardown,
    };
  } catch (error) {
    await teardown();
    throw error;
  }
}
