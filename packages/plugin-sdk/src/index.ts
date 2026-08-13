export type PluginPermission =
  | 'network.read'
  | 'network.write'
  | 'vpn.connect'
  | 'dns.modify'
  | 'config.read'
  | 'config.write'
  | 'telemetry.publish'
  | 'metrics.export'
  | 'notifications.send'
  | 'filesystem.read'
  | 'filesystem.write'
  | 'plugin.install'
  | 'plugin.update';
export type PluginType =
  | 'dns-provider'
  | 'vpn-provider'
  | 'proxy-provider'
  | 'tunnel-provider'
  | 'network-analyzer'
  | 'health-checker'
  | 'routing-engine'
  | 'metrics-exporter'
  | 'logger'
  | 'notification-provider'
  | 'storage-provider'
  | 'authentication-provider'
  | 'ai-module'
  | 'ui-extension'
  | 'cli-extension'
  | 'automation-module';
export type ActivationEvent =
  | 'onStartup'
  | `onCommand:${string}`
  | `onEvent:${string}`
  | `onCapability:${string}`
  | `onConfig:${string}`;
export interface PluginDependency {
  id: string;
  version: string;
  optional?: boolean;
}
export interface ConfigurationSchema {
  type: 'object';
  properties: Record<string, ConfigProperty>;
  required?: string[];
  encrypted?: string[];
  version?: string;
}
export interface ConfigProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  items?: ConfigProperty;
  properties?: Record<string, ConfigProperty>;
  description?: string;
}
export interface PluginManifest {
  id: string;
  name: string;
  displayName: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  license: string;
  repository?: string;
  engineVersion: string;
  minimumPlatformVersion: string;
  permissions: PluginPermission[];
  dependencies: PluginDependency[];
  optionalDependencies: PluginDependency[];
  entry: string;
  activationEvents: ActivationEvent[];
  configurationSchema?: ConfigurationSchema;
  capabilities: PluginType[];
  signature?: string;
  checksum?: string;
}
export type PluginStatus =
  | 'installed'
  | 'validated'
  | 'resolved'
  | 'loaded'
  | 'initialized'
  | 'active'
  | 'suspended'
  | 'disabled'
  | 'failed'
  | 'uninstalled'
  | 'destroyed';
export interface PluginHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  memoryBytes: number;
  cpuUserMicros: number;
  activationTimeMs: number;
  crashCount: number;
  restartCount: number;
  message?: string;
  checkedAt: string;
}
export interface PluginLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
export interface TypedEvent<T = unknown> {
  type: string;
  payload: T;
  priority?: number;
  timestamp: string;
  source: string;
}
export interface PluginEventApi {
  publish<T>(type: string, payload: T, priority?: number): Promise<void>;
  subscribe<T>(type: string, handler: (event: TypedEvent<T>) => Promise<void> | void): () => void;
  request<TReq, TRes>(type: string, payload: TReq, timeoutMs?: number): Promise<TRes>;
  broadcast<T>(type: string, payload: T): Promise<void>;
}
export interface PluginConfigurationApi<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  get(): Readonly<T>;
  update(patch: Partial<T>): Promise<T>;
  onReload(handler: (config: T) => void | Promise<void>): () => void;
}
export interface PluginContext<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  manifest: PluginManifest;
  logger: PluginLogger;
  events: PluginEventApi;
  config: PluginConfigurationApi<TConfig>;
  api: PluginApi;
  requirePermission(permission: PluginPermission): void;
}
export interface PluginApi {
  network: CapabilityApi;
  dns: CapabilityApi;
  vpn: CapabilityApi;
  routing: CapabilityApi;
  storage: CapabilityApi;
  configuration: CapabilityApi;
  logging: CapabilityApi;
  telemetry: CapabilityApi;
  security: CapabilityApi;
  metrics: CapabilityApi;
  notification: CapabilityApi;
  scheduler: CapabilityApi;
  events: PluginEventApi;
}
export interface CapabilityApi {
  readonly name: string;
  call<T = unknown>(operation: string, input?: unknown): Promise<T>;
}
export interface InternetResiliencePlugin<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> {
  manifest: PluginManifest;
  install?(context: PluginContext<TConfig>): Promise<void> | void;
  validate?(context: PluginContext<TConfig>): Promise<void> | void;
  initialize?(context: PluginContext<TConfig>): Promise<void> | void;
  activate?(context: PluginContext<TConfig>): Promise<void> | void;
  suspend?(context: PluginContext<TConfig>): Promise<void> | void;
  resume?(context: PluginContext<TConfig>): Promise<void> | void;
  reload?(context: PluginContext<TConfig>): Promise<void> | void;
  update?(context: PluginContext<TConfig>, fromVersion: string): Promise<void> | void;
  disable?(context: PluginContext<TConfig>): Promise<void> | void;
  enable?(context: PluginContext<TConfig>): Promise<void> | void;
  uninstall?(context: PluginContext<TConfig>): Promise<void> | void;
  destroy?(context: PluginContext<TConfig>): Promise<void> | void;
  health?(): Promise<Partial<PluginHealth>> | Partial<PluginHealth>;
  migrateConfig?(
    config: Record<string, unknown>,
    fromVersion: string,
    toVersion: string,
  ): Promise<Record<string, unknown>> | Record<string, unknown>;
}
export abstract class BasePlugin<
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> implements InternetResiliencePlugin<TConfig> {
  abstract manifest: PluginManifest;
  protected context?: PluginContext<TConfig>;
  initialize(context: PluginContext<TConfig>): void {
    this.context = context;
  }
  health(): Partial<PluginHealth> {
    return { status: 'healthy', message: `${this.manifest.id} ready` };
  }
  protected log(message: string, meta?: Record<string, unknown>): void {
    this.context?.logger.info(message, meta);
  }
}
export const definePlugin = <T extends InternetResiliencePlugin>(plugin: T): T => plugin;
