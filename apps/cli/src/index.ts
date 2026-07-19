#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '@irp/config';
import { Application } from '@irp/core';
import { createLogger } from '@irp/logger';
import { ConnectivityMonitor, NetworkMonitoringService } from '@irp/network';
import { MetricsRegistry } from '@irp/telemetry';

const runtime = () => new Application(loadConfig(), createLogger('error'));
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

const program = new Command();
program.name('irp').description('Internet Resilience Platform CLI').version('0.1.0');
program.command('version').description('Show version information').action(() => console.log('InternetResiliencePlatform 0.1.0'));
program.command('status').description('Show platform status').action(() => print({ status: runtime().state }));
program.command('config').description('Print effective configuration').action(() => print(loadConfig()));
program.command('providers').description('List configured DNS providers').action(() => print(runtime().providers.map((p) => ({ id: p.id, name: p.name, metadata: p.metadata() }))));
program.command('benchmark').description('Run DNS benchmark').action(async () => print(await runtime().benchmark.run(runtime().providers)));
program.command('metrics').description('Print runtime metrics').action(() => { const metrics = new MetricsRegistry(); metrics.collectRuntime(); print(metrics.snapshot()); });
program.command('events').description('Print recent runtime events').action(() => print(runtime().events.snapshot()));
program.command('reload').description('Validate configuration reload').action(() => print({ reloaded: true, config: loadConfig() }));
const network = program.command('network').description('Network intelligence commands');
network.command('status').description('Show connectivity status').action(async () => print(await new ConnectivityMonitor().status()));
network.command('check').description('Run network probes and print connectivity score').action(async () => { const snapshot = await new NetworkMonitoringService().runOnce(); const dns = snapshot.measurements.find((m) => m.probeType === 'dns'); print({ dnsStatus: dns?.success ? 'ok' : 'failed', latency: dns?.latency ?? null, connectivityScore: snapshot.score.score, status: snapshot.status, detectedIssues: snapshot.issues }); });
program.command('doctor').option('--full', 'run full diagnostics').description('Run environment diagnostics').action(async (opts: { full?: boolean }) => print({ full: Boolean(opts.full), network: await new ConnectivityMonitor().status(), providers: runtime().providers.length }));
program.parse();
