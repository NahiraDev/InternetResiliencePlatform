import { BasePlugin, type PluginManifest } from '@irp/plugin-sdk';
const manifest = (
  id: string,
  displayName: string,
  capabilities: PluginManifest['capabilities'],
  permissions: PluginManifest['permissions'],
): PluginManifest => ({
  id,
  name: id.replaceAll('.', '-'),
  displayName,
  version: '1.0.0',
  description: `${displayName} reference implementation`,
  author: 'Internet Resilience Platform',
  license: 'Apache-2.0',
  engineVersion: '^0.1.0',
  minimumPlatformVersion: '0.1.0',
  permissions,
  dependencies: [],
  optionalDependencies: [],
  entry: 'dist/index.js',
  activationEvents: ['onStartup'],
  capabilities,
  configurationSchema: {
    type: 'object',
    version: '1.0.0',
    properties: { enabled: { type: 'boolean', default: true } },
  },
});
export class SampleDnsProvider extends BasePlugin {
  manifest = manifest(
    'builtin.dns.provider',
    'Built-in DNS Provider',
    ['dns-provider'],
    ['network.read', 'dns.modify'],
  );
  async activate(): Promise<void> {
    this.log('DNS provider activated');
  }
}
export class SampleVpnProvider extends BasePlugin {
  manifest = manifest(
    'builtin.vpn.provider',
    'Built-in VPN Provider',
    ['vpn-provider'],
    ['network.read', 'vpn.connect'],
  );
}
export class SampleNotificationProvider extends BasePlugin {
  manifest = manifest(
    'builtin.notification.provider',
    'Built-in Notification Provider',
    ['notification-provider'],
    ['notifications.send'],
  );
}
export class SampleMetricsExporter extends BasePlugin {
  manifest = manifest(
    'builtin.metrics.exporter',
    'Built-in Metrics Exporter',
    ['metrics-exporter'],
    ['metrics.export', 'telemetry.publish'],
  );
}
export class SampleHealthChecker extends BasePlugin {
  manifest = manifest(
    'builtin.health.checker',
    'Built-in Health Checker',
    ['health-checker'],
    ['network.read', 'telemetry.publish'],
  );
}
export const builtinPlugins = () => [
  new SampleDnsProvider(),
  new SampleVpnProvider(),
  new SampleNotificationProvider(),
  new SampleMetricsExporter(),
  new SampleHealthChecker(),
];
