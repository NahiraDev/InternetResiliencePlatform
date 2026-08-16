#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '@irp/config';
import { Application } from '@irp/core';
import { createLogger } from '@irp/logger';
import { ConnectivityMonitor, NetworkMonitoringService } from '@irp/network';
import { MetricsRegistry } from '@irp/telemetry';
import { ResilienceRuntime } from '@irp/resilience-runtime';

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
    .command('status')
    .description('Show platform status')
    .action(() => printJson({ status: createRuntime().state }));
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
  program
    .command('reload')
    .description('Validate configuration reload')
    .action(() => printJson({ reloaded: true, config: loadConfig() }));
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
  const runtime = program.command('runtime').description('Resilience runtime commands');
  const runtimeInstance = () => new ResilienceRuntime();
  runtime
    .command('status')
    .option('--json', 'print JSON output')
    .description('Show resilience runtime status')
    .action(async () => {
      const rt = runtimeInstance();
      const snapshot = await rt.getRuntimeSnapshot();
      printJson({
        runtimeId: rt.runtimeId,
        instanceId: rt.instanceId,
        state: snapshot.state,
        mode: snapshot.mode,
        health: snapshot.health,
      });
    });
  runtime
    .command('capabilities')
    .option('--json', 'print JSON output')
    .description('List resilience runtime capabilities')
    .action(async () => printJson(runtimeInstance().capabilities()));
  runtime
    .command('snapshot')
    .option('--json', 'print JSON output')
    .description('Show resilience runtime snapshot')
    .action(async () => printJson(await runtimeInstance().getRuntimeSnapshot()));
  runtime
    .command('decisions')
    .option('--json', 'print JSON output')
    .description('List resilience runtime decisions')
    .action(async () => printJson(await runtimeInstance().decisions.list()));
  runtime
    .command('incidents')
    .option('--json', 'print JSON output')
    .description('List resilience runtime incidents')
    .action(async () => printJson(await runtimeInstance().incidents.list()));
  runtime
    .command('cycle')
    .description('Run a resilience runtime cycle')
    .option('--simulate', 'force simulation mode')
    .option('--safe', 'run safe mode')
    .option(
      '--live',
      'request live mode; requires runtime authorization and is blocked by local CLI',
    )
    .option('--json', 'print JSON output')
    .action(async (opts: { simulate?: boolean; safe?: boolean; live?: boolean }) => {
      if (opts.live)
        throw new Error(
          'live runtime cycle requires API authorization and cannot be bypassed by CLI',
        );
      const rt = runtimeInstance();
      const record = await rt.cycle({ mode: opts.safe ? 'safe' : 'simulation' });
      printJson(record);
    });
  program
    .command('doctor')
    .option('--full', 'run full diagnostics')
    .description('Run environment diagnostics')
    .action(async (opts: { full?: boolean }) =>
      printJson({
        full: Boolean(opts.full),
        network: await new ConnectivityMonitor().status(),
        providers: createRuntime().providers.length,
      }),
    );
  return program;
};

if (import.meta.url === `file://${process.argv[1]}`) createProgram().parse();
