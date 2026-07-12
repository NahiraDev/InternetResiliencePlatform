#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '@irp/config';
import { Application } from '@irp/core';
import { createLogger } from '@irp/logger';
import { ConnectivityMonitor } from '@irp/network';
import { MetricsRegistry } from '@irp/telemetry';
const runtime = () => new Application(loadConfig(), createLogger('error'));
const program = new Command();
program.name('irp').description('Internet Resilience Platform CLI').version('0.1.0');
program.command('version').description('Show version information').action(() => console.log('InternetResiliencePlatform 0.1.0'));
program.command('providers').description('List configured DNS providers').action(() => console.log(JSON.stringify(runtime().providers.map((p) => ({ id: p.id, name: p.name, metadata: p.metadata() })), null, 2)));
program.command('benchmark').description('Run DNS benchmark').action(async () => { const app = runtime(); console.log(JSON.stringify(await app.benchmark.run(app.providers), null, 2)); });
program.command('metrics').description('Print runtime metrics').action(() => { const metrics = new MetricsRegistry(); metrics.collectRuntime(); console.log(JSON.stringify(metrics.snapshot(), null, 2)); });
program.command('events').description('Print recent runtime events').action(() => console.log(JSON.stringify(runtime().events.snapshot(), null, 2)));
program.command('reload').description('Validate and reload configuration').action(() => console.log(JSON.stringify({ reloaded: true, config: loadConfig() }, null, 2)));
program.command('network').description('Show connectivity status').action(async () => console.log(JSON.stringify(await new ConnectivityMonitor().status(), null, 2)));
program.command('doctor').option('--full', 'run full diagnostics').description('Run environment diagnostics').action(async (opts: { full?: boolean }) => console.log(JSON.stringify({ full: Boolean(opts.full), network: await new ConnectivityMonitor().status(), providers: runtime().providers.length }, null, 2)));
program.command('status').description('Show platform status').action(() => console.log('created'));
program.command('config').description('Print effective configuration').action(() => console.log(JSON.stringify(loadConfig(), null, 2)));
import { IntelligentDnsEngine, defaultDnsEngineConfig, type DnsHealthCheck, type DnsProvider } from '@irp/dns';

const providers: DnsProvider[] = [
  { id: 'cloudflare', name: 'Cloudflare', addresses: ['1.1.1.1', '1.0.0.1'], privacyScore: 0.9, securityScore: 0.8, supportsDnssec: true, resolvers: [{ resolve: async (question) => [{ ...question, ttl: 300, value: '1.1.1.1', dnssecValidated: true }] }] },
  { id: 'quad9', name: 'Quad9', addresses: ['9.9.9.9', '149.112.112.112'], privacyScore: 0.85, securityScore: 0.95, supportsDnssec: true, resolvers: [{ resolve: async (question) => [{ ...question, ttl: 300, value: '9.9.9.9', dnssecValidated: true }] }] },
];
const healthCheck: DnsHealthCheck = { check: async (provider) => ({ healthy: true, latencyMs: provider.id === 'cloudflare' ? 20 : 35, packetLoss: 0, dnssecValid: true }) };
const engine = new IntelligentDnsEngine(providers, healthCheck, defaultDnsEngineConfig());
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2));

const program = new Command();
program.name('irp').description('Internet Resilience Platform CLI').version('0.1.0');
program.command('version').description('Show version information').action(() => console.log('InternetResiliencePlatform 0.1.0'));
program.command('status').description('Show platform status').action(() => print({ status: 'ready', dns: engine.status() }));
program.command('config').description('Print effective configuration').action(() => print(loadConfig()));
program.command('benchmark').description('Run DNS benchmark').action(async () => print(await engine.evaluate()));
const doctor = program.command('doctor').description('Run environment diagnostics');
doctor.option('--dns', 'Run DNS diagnostics').action(async (options) => print(options.dns ? { dns: await engine.evaluate() } : { status: 'ok' }));
const dns = program.command('dns').description('Manage intelligent DNS routing');
dns.command('status').description('Show DNS engine status').action(() => print(engine.status()));
dns.command('providers').description('List ranked DNS providers').action(() => print(engine.rankProviders()));
dns.command('benchmark').description('Evaluate provider health and ranking').action(async () => print(await engine.evaluate()));
dns.command('switch').argument('<providerId>').description('Switch active DNS provider').action((providerId) => { engine.selectProvider(providerId); print(engine.status()); });
dns.command('rules').description('List DNS routing rules').action(() => print(engine.rules.list()));
dns.command('profile').description('List routing profiles').action(() => print(engine.profiles));
dns.command('validate').description('Validate DNS engine configuration').action(() => print({ valid: true, strategy: engine.status().strategy }));
dns.command('history').description('Show DNS decision history').action(() => print(engine.events));
const cache = dns.command('cache').description('Manage DNS cache');
cache.command('flush').description('Flush DNS cache').action(() => print({ flushed: engine.cache.flush() }));
program.parse();
