import { existsSync, readFileSync, watch } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { fileURLToPath } from 'node:url';

const ProviderConfigSchema = z.object({
  enabled: z.boolean().default(true),
  timeoutMs: z.coerce.number().int().min(100).max(30_000).default(2_000),
  protocols: z.array(z.enum(['udp', 'tcp', 'doh', 'dot'])).default(['udp', 'tcp']),
});

export const ConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    version: z.string(),
    environment: z.enum(['development', 'staging', 'production', 'test']),
  }),
  api: z.object({
    host: z.string(),
    port: z.coerce.number().int().min(1).max(65535),
  }),
  logger: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    file: z.string().optional(),
    json: z.boolean().default(true),
    color: z.boolean().default(false),
    rotation: z.object({
      maxBytes: z.number().int().min(1000).default(10_485_760),
      maxFiles: z.number().int().min(1).default(10),
    }).optional(),
  }),
  telemetry: z.object({
    enabled: z.boolean(),
    prometheus: z.boolean().default(true),
  }),
  providers: z.record(ProviderConfigSchema).default({}),
  benchmark: z.object({
    intervalMs: z.coerce.number().int().min(1_000).default(60_000),
    question: z.object({
      name: z.string(),
      recordType: z.enum(['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'NS']),
    }).default({ name: 'example.com', recordType: 'A' }),
  }).default({}),
  dns: z.object({
    strategy: z.enum(['lowest-latency', 'highest-availability', 'lowest-packet-loss', 'balanced', 'privacy-first', 'security-first', 'custom']).default('balanced'),
    failover: z.object({
      failureThreshold: z.number().int().min(1).default(2),
      recoveryThreshold: z.number().int().min(1).default(2),
      cooldownMs: z.number().int().min(0).default(30000),
    }).default({}),
    dnssec: z.object({
      enabled: z.boolean().default(true),
      requireValidation: z.boolean().default(false),
    }).default({}),
    cache: z.object({
      ttlMs: z.number().int().min(1000).default(300000),
      warmDomains: z.array(z.string()).default(['example.com']),
    }).default({}),
  }).default({}),
  plugins: z.object({
    directory: z.string().default('plugins'),
    enabled: z.boolean().default(true),
  }).default({}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export interface ConfigLoaderOptions {
  configDir?: string;
  environment?: AppConfig['app']['environment'];
  env?: NodeJS.ProcessEnv;
}


const findConfigDir = (startDir: string): string => {
  let current = startDir;
  while (true) {
    const candidate = join(current, 'config');
    if (existsSync(join(candidate, 'default.yaml'))) return candidate;
    const parent = dirname(current);
    if (parent === current) return join(startDir, 'config');
    current = parent;
  }
};

const packageRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const merge = (base: unknown, overlay: unknown): unknown => {
  if (typeof base !== 'object' || base === null || typeof overlay !== 'object' || overlay === null) return overlay ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
    if (value !== undefined) out[key] = merge(out[key], value);
  }
  return out;
};

export class ConfigLoader {
  private lastGood?: AppConfig;

  constructor(private readonly options: ConfigLoaderOptions = {}) {}

  load(): AppConfig {
    const env = this.options.env ?? process.env;
    const environment = this.options.environment ?? (env.NODE_ENV as AppConfig['app']['environment'] | undefined) ?? 'development';

    const configDir = this.options.configDir ?? findConfigDir(packageRoot);
    const defaultConfigFile = join(configDir, 'default.yaml');
    const configFile = join(configDir, `${environment}.yaml`);

    let fileConfig: unknown = {};
    if (existsSync(defaultConfigFile)) {
      fileConfig = merge(fileConfig, parse(readFileSync(defaultConfigFile, 'utf-8')) ?? {});
    }
    if (existsSync(configFile)) {
      fileConfig = merge(fileConfig, parse(readFileSync(configFile, 'utf-8')) ?? {});
    }

    const envConfig = {
      app: {
        name: env.APP_NAME,
        version: env.APP_VERSION,
        environment,
      },
      api: {
        host: env.API_HOST,
        port: env.API_PORT,
      },
      logger: {
        level: env.LOG_LEVEL,
        file: env.LOG_FILE,
      },
      telemetry: {
        enabled: env.TELEMETRY_ENABLED,
      },
      dns: {
        strategy: env.DNS_STRATEGY,
        failover: {
          failureThreshold: env.DNS_FAILOVER_THRESHOLD,
          recoveryThreshold: env.DNS_RECOVERY_THRESHOLD,
          cooldownMs: env.DNS_COOLDOWN_MS,
        },
        dnssec: {
          enabled: env.DNSSEC_ENABLED,
          requireValidation: env.DNSSEC_REQUIRE_VALIDATION,
        },
        cache: {
          ttlMs: env.DNS_CACHE_TTL_MS,
        },
      },
    };

    const merged = merge(fileConfig, envConfig);
    const result = ConfigSchema.parse(merged);
    this.lastGood = result;
    return result;
  }

  watch(onChange: (config: AppConfig) => void): () => void {
    const env = this.options.env ?? process.env;
    const environment = this.options.environment ?? (env.NODE_ENV as AppConfig['app']['environment'] | undefined) ?? 'development';
    const configDir = this.options.configDir ?? findConfigDir(packageRoot);
    const configFile = join(configDir, `${environment}.yaml`);

    if (!existsSync(configFile)) {
      return () => undefined;
    }

    const watcher = watch(configFile, () => {
      const config = this.load();
      onChange(config);
    });

    return () => watcher.close();
  }
}

export const loadConfig = (options?: ConfigLoaderOptions): AppConfig => new ConfigLoader(options).load();
