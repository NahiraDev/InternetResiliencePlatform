#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '@irp/config';
import { Application } from '@irp/core';
import { createLogger } from '@irp/logger';
import { ConnectivityMonitor, NetworkMonitoringService } from '@irp/network';
import { MetricsRegistry } from '@irp/telemetry';
import {
  ControlClientError,
  controlRequest,
  createCanonicalRuntime,
  resolveControlSocketPath,
} from '@irp/resilience-runtime';

import { assessDaemon, EXIT, summarizeDecision } from './diagnostics.js';
import { existsSync } from 'node:fs';

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = EXIT.error,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export const createRuntime = () => new Application(loadConfig(), createLogger('error'));
export const printJson = (value: unknown) => console.log(JSON.stringify(value, null, 2));

export const createProgram = (): Command => {
  const program = new Command();
  program.name('irp').description('Internet Resilience Platform CLI').version('0.1.0');
  program
    .command('version')
    .description('Show version information')
    .action(() => console.log('InternetResiliencePlatform 0.1.0'));
  program
    .command('config')
    .description('Print effective configuration')
    .action(() => printJson(loadConfig()));
  program
    .command('providers')
    .description('List configured DNS providers')
    .action(() =>
      printJson(
        createRuntime().providers.map((p) => ({ id: p.id, name: p.name, metadata: p.metadata() })),
      ),
    );
  program
    .command('benchmark')
    .description('Run DNS benchmark')
    .action(async () => printJson(await createRuntime().benchmark.run(createRuntime().providers)));
  program
    .command('metrics')
    .description('Print runtime metrics')
    .action(() => {
      const metrics = new MetricsRegistry();
      metrics.collectRuntime();
      printJson(metrics.snapshot());
    });
  program
    .command('events')
    .description('Print recent runtime events')
    .action(() => printJson(createRuntime().events.snapshot()));
  const network = program.command('network').description('Network intelligence commands');
  network
    .command('status')
    .description('Show connectivity status')
    .action(async () => printJson(await new ConnectivityMonitor().status()));
  network
    .command('check')
    .description('Run network probes and print connectivity score')
    .action(async () => {
      const snapshot = await new NetworkMonitoringService().runOnce();
      const dns = snapshot.measurements.find((m) => m.probeType === 'dns');
      printJson({
        dnsStatus: dns?.success ? 'ok' : 'failed',
        latency: dns?.latency ?? null,
        connectivityScore: snapshot.score.score,
        status: snapshot.status,
        detectedIssues: snapshot.issues,
      });
    });
  const socketFor = (opts: { socket?: string }): string => {
    const path = opts.socket ?? resolveControlSocketPath(process.env);
    if (!path) throw new CliError('no control socket path could be resolved; pass --socket <path>');
    return path;
  };
  const ask = async (
    opts: { socket?: string },
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<unknown> => {
    try {
      return await controlRequest(socketFor(opts), method, path, body);
    } catch (error) {
      if (error instanceof ControlClientError && error.code === 'unreachable')
        throw new CliError(
          `${error.message}. Start the daemon (systemctl start irp-daemon) or pass --socket <path>.`,
          EXIT.unreachable,
        );
      throw error;
    }
  };
  const remote = (command: Command): Command =>
    command.option('--socket <path>', 'daemon control socket (default: resolved from environment)');

  const probe = async (opts: { socket?: string }) => {
    const [health, snapshot, decisions] = await Promise.all([
      ask(opts, 'GET', '/v1/health'),
      ask(opts, 'GET', '/v1/snapshot'),
      ask(opts, 'GET', '/v1/decisions'),
    ]);
    return { health, snapshot, decisions, assessment: assessDaemon({ health, snapshot, decisions }) };
  };
  remote(
    program.command('status').description('One-screen daemon state: reachable, mode, health, last decision'),
  ).action(async (opts: { socket?: string }) => {
    const { assessment } = await probe(opts);
    printJson({ reachable: true, state: assessment.state, ...assessment.summary, findings: assessment.findings });
    process.exitCode = assessment.exitCode;
  });
  remote(program.command('reload').description('Ask the running daemon to reload its configuration')).action(
    async (opts: { socket?: string }) => printJson(await ask(opts, 'POST', '/v1/reload')),
  );

  const runtime = program
    .command('runtime')
    .description('Inspect and drive the running daemon runtime (talks to the daemon, not a copy)');
  const view = (name: string, path: string, description: string) =>
    remote(runtime.command(name).description(description)).action(async (opts: { socket?: string }) =>
      printJson(await ask(opts, 'GET', path)),
    );
  view('status', '/v1/health', 'Show daemon runtime health');
  view('snapshot', '/v1/snapshot', 'Show the daemon runtime snapshot');
  remote(
    runtime
      .command('decisions')
      .description('List recorded decisions: outcome, why blocked, executed vs verified')
      .option('--raw', 'print the full decision records'),
  ).action(async (opts: { socket?: string; raw?: boolean }) => {
    const records = (await ask(opts, 'GET', '/v1/decisions')) as unknown[];
    printJson(opts.raw ? records : records.map(summarizeDecision));
  });
  view('incidents', '/v1/incidents', 'List incidents recorded by the daemon');
  view('capabilities', '/v1/capabilities', 'List adapter capabilities of the daemon runtime');
  remote(
    runtime
      .command('cycle')
      .description('Run one runtime cycle in the daemon (safe by default; never live)')
      .option('--simulate', 'run the cycle in simulation mode')
      .option('--live', 'refused: live mode is configured on the daemon, not requested by the CLI'),
  ).action(async (opts: { socket?: string; simulate?: boolean; live?: boolean }) => {
    if (opts.live)
      throw new CliError(
        'live cycles cannot be requested from the CLI; configure the daemon with IRP_RUNTIME_MODE=live and IRP_ENABLE_LIVE_ROUTE_MUTATION=true',
      );
    printJson(await ask(opts, 'POST', '/v1/cycle', { mode: opts.simulate ? 'simulation' : 'safe' }));
  });
  runtime
    .command('local-simulation')
    .description('SIMULATION ONLY: run a throwaway in-process runtime. Not the daemon; changes nothing.')
    .action(async () => {
      const rt = (await createCanonicalRuntime({ executionMode: 'simulation' })).runtime;
      printJson({
        notice: 'local in-process simulation; this is NOT the running daemon',
        snapshot: await rt.getRuntimeSnapshot(),
      });
    });

  remote(
    program
      .command('doctor')
      .option('--full', 'also run local network probes (read-only)')
      .description('Diagnose installation, daemon reachability, authorization and recovery state (read-only)'),
  ).action(async (opts: { socket?: string; full?: boolean }) => {
    const socket = opts.socket ?? resolveControlSocketPath(process.env) ?? null;
    const installed = {
      systemdUnit: existsSync('/etc/systemd/system/irp-daemon.service') || existsSync('/lib/systemd/system/irp-daemon.service'),
      installDirectory: existsSync('/opt/irp/daemon/dist/index.js'),
    };
    const report: Record<string, unknown> = { socket, installed };
    try {
      const { health, assessment } = await probe(opts);
      const h = health as Record<string, unknown>;
      report.running = true;
      report.state = assessment.state;
      report.summary = assessment.summary;
      report.findings = assessment.findings;
      report.authorization = h.authorization;
      report.storage = h.storage;
      report.recovery = h.recovery;
      process.exitCode = assessment.exitCode;
    } catch (error) {
      if (!(error instanceof CliError) && !(error instanceof ControlClientError)) throw error;
      report.running = false;
      report.state = 'unreachable';
      report.findings = [
        {
          level: 'error',
          code: 'daemon-unreachable',
          message: error.message,
          hint:
            installed.systemdUnit || installed.installDirectory
              ? 'IRP is installed but not running: systemctl start irp-daemon (then journalctl -u irp-daemon)'
              : 'IRP does not appear to be installed here: run scripts/install-linux.sh, or start apps/daemon manually',
        },
      ];
      process.exitCode = EXIT.unreachable;
    }
    if (opts.full) report.localNetwork = await new ConnectivityMonitor().status();
    printJson(report);
  });
  return program;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  createProgram()
    .parseAsync()
    .catch((error: unknown) => {
      console.error(`irp: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = error instanceof CliError ? error.exitCode : EXIT.error;
    });
}
