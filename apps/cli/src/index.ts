#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '@irp/config';
import { Application } from '@irp/core';
import { createLogger } from '@irp/logger';
import { ConnectivityMonitor } from '@irp/network';
import { MetricsRegistry } from '@irp/telemetry';

const runtime = () => new Application(loadConfig(), createLogger('error'));
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));
const program = new Command();
program.name('irp').description('Internet Resilience Platform CLI').version('0.1.0');
program.command('version').description('Show version information').action(() => console.log('InternetResiliencePlatform 0.1.0'));
program.command('status').description('Show platform status').action(() => print({ status: runtime().state }));
program.command('config').description('Print effective configuration').action(() => print(loadConfig()));
program.command('providers').description('List configured DNS providers').action(() => print(runtime().providers));
program.command('benchmark').description('Print benchmark snapshot').action(() => print(runtime().benchmark.snapshot()));
program.command('metrics').description('Print runtime metrics').action(() => { const metrics = new MetricsRegistry(); metrics.collectRuntime(); print(metrics.snapshot()); });
program.command('events').description('Print recent runtime events').action(() => print(runtime().events.snapshot()));
program.command('reload').description('Validate configuration reload').action(() => print({ reloaded: true, config: loadConfig() }));
program.command('network').description('Show connectivity status').action(async () => print(await new ConnectivityMonitor().status()));
program.command('doctor').option('--full', 'run full diagnostics').description('Run environment diagnostics').action(async (opts: { full?: boolean }) => print({ full: Boolean(opts.full), network: await new ConnectivityMonitor().status(), providers: runtime().providers.length }));
program.parse();
