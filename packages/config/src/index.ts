import { existsSync, readFileSync, watch } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const ProviderConfigSchema = z.object({ enabled: z.boolean().default(true), timeoutMs: z.coerce.number().int().min(100).max(30_000).default(2_000), protocols: z.array(z.enum(['udp', 'tcp', 'doh', 'dot', 'dnscrypt', 'odoh', 'doq'])).default(['udp', 'tcp', 'doh', 'dot']) });
export const ConfigSchema = z.object({
  app: z.object({ name: z.string(), version: z.string(), environment: z.enum(['development', 'production', 'test']) }),
  api: z.object({ host: z.string(), port: z.coerce.number().int().min(1).max(65535) }),
  logger: z.object({ level: z.enum(['debug', 'info', 'warn', 'error']), file: z.string().optional(), json: z.boolean().default(true), color: z.boolean().default(false), rotation: z.object({ maxBytes: z.number().int().positive(), maxFiles: z.number().int().positive() }).optional() }),
  telemetry: z.object({ enabled: z.boolean(), prometheus: z.boolean().default(true) }),
  providers: z.record(ProviderConfigSchema).default({}),
  benchmark: z.object({ intervalMs: z.coerce.number().int().min(1_000).default(60_000), question: z.object({ name: z.string(), recordType: z.enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS']) }).default({ name: 'example.com', recordType: 'A' }) }).default({}),
  plugins: z.object({ directory: z.string().default('plugins'), enabled: z.boolean().default(true) }).default({}),
});
export type AppConfig = z.infer<typeof ConfigSchema>;
export interface ConfigLoaderOptions { configDir?: string; environment?: AppConfig['app']['environment']; env?: NodeJS.ProcessEnv; }
const merge = (base: unknown, overlay: unknown): unknown => { if (typeof base !== 'object' || base === null || typeof overlay !== 'object' || overlay === null) return overlay ?? base; const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }; for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) if (value !== undefined) out[key] = merge(out[key], value); return out; };
export class ConfigLoader { private lastGood?: AppConfig; constructor(private readonly options: ConfigLoaderOptions = {}) {} load(): AppConfig { const env = this.options.env ?? process.env; const environment = this.options.environment ?? (env.NODE_ENV as AppConfig['app']['environment'] | undefined) ?? 'development'; const configDir = this.options.configDir ?? join(process.cwd(), 'config'); const read = (name: string): unknown => existsSync(join(configDir, name)) ? parse(readFileSync(join(configDir, name), 'utf8')) : {}; const raw = merge(read('default.yaml'), read(`${environment}.yaml`)); const withEnv = merge(raw, { app: { environment }, api: { host: env.IRP_API_HOST, port: env.IRP_API_PORT }, logger: { level: env.IRP_LOG_LEVEL, file: env.IRP_LOG_FILE }, telemetry: { enabled: env.IRP_TELEMETRY_ENABLED === undefined ? undefined : env.IRP_TELEMETRY_ENABLED === 'true' } }); const parsed = ConfigSchema.parse(withEnv); this.lastGood = parsed; return parsed; } validate(candidate: unknown): AppConfig { const parsed = ConfigSchema.parse(candidate); this.lastGood = parsed; return parsed; } watch(onChange: (config: AppConfig) => void, onInvalid: (error: unknown, rollback: AppConfig | undefined) => void = () => undefined): () => void { const configDir = this.options.configDir ?? join(process.cwd(), 'config'); const watcher = watch(configDir, { persistent: false }, () => { try { onChange(this.load()); } catch (error) { onInvalid(error, this.lastGood); } }); return () => watcher.close(); } }
  logger: z.object({ level: z.enum(['debug', 'info', 'warn', 'error']), file: z.string().optional() }),
  telemetry: z.object({ enabled: z.boolean() }),
  dns: z.object({
    strategy: z.enum(['lowest-latency', 'highest-availability', 'lowest-packet-loss', 'balanced', 'privacy-first', 'security-first', 'custom']).default('balanced'),
    failover: z.object({ failureThreshold: z.number().int().min(1).default(2), recoveryThreshold: z.number().int().min(1).default(2), cooldownMs: z.number().int().min(0).default(30000) }).default({}),
    dnssec: z.object({ enabled: z.boolean().default(true), requireValidation: z.boolean().default(false) }).default({}),
    cache: z.object({ ttlMs: z.number().int().min(1000).default(300000), warmDomains: z.array(z.string()).default(['example.com']) }).default({}),
  }).default({}),
});
export type AppConfig = z.infer<typeof ConfigSchema>;
export interface ConfigLoaderOptions { configDir?: string; environment?: AppConfig['app']['environment']; env?: NodeJS.ProcessEnv; }
const merge = (base: unknown, overlay: unknown): unknown => {
  if (typeof base !== 'object' || base === null || typeof overlay !== 'object' || overlay === null) return overlay ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) { if (value !== undefined) out[key] = merge(out[key], value); }
  return out;
};
export class ConfigLoader {
  constructor(private readonly options: ConfigLoaderOptions = {}) {}
  load(): AppConfig { const env = this.options.env ?? process.env; const environment = this.options.environment ?? (env.NODE_ENV as AppConfig['app']['environment'] | undefined) ?? 'development'; const configDir = this.options.configDir ?? join(process.cwd(), 'config'); const read = (name: string): unknown => existsSync(join(configDir, name)) ? parse(readFileSync(join(configDir, name), 'utf8')) : {}; const raw = merge(read('default.yaml'), read(`${environment}.yaml`)); const withEnv = merge(raw, { app: { environment }, api: { host: env.IRP_API_HOST, port: env.IRP_API_PORT }, logger: { level: env.IRP_LOG_LEVEL, file: env.IRP_LOG_FILE }, telemetry: { enabled: env.IRP_TELEMETRY_ENABLED === undefined ? undefined : env.IRP_TELEMETRY_ENABLED === 'true' }, dns: { strategy: env.IRP_DNS_STRATEGY } }); return ConfigSchema.parse(withEnv); }
  watch(_onChange: (config: AppConfig) => void): () => void { return () => undefined; }
}
export const loadConfig = (options?: ConfigLoaderOptions): AppConfig => new ConfigLoader(options).load();
