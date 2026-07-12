#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig } from '@irp/config';
const program = new Command();
program.name('irp').description('Internet Resilience Platform CLI').version('0.1.0');
program.command('version').description('Show version information').action(() => console.log('InternetResiliencePlatform 0.1.0'));
program.command('doctor').description('Run environment diagnostics').action(() => console.log('Doctor checks are not implemented yet.'));
program.command('status').description('Show platform status').action(() => console.log('Status checks are not implemented yet.'));
program.command('config').description('Print effective configuration').action(() => console.log(JSON.stringify(loadConfig(), null, 2)));
program.command('benchmark').description('Run DNS benchmark placeholder').action(() => console.log('Benchmarking is planned for Phase 2.'));
program.parse();
