import { z } from 'zod';
export declare const ConfigSchema: z.ZodObject<{
    app: z.ZodObject<{
        name: z.ZodString;
        version: z.ZodString;
        environment: z.ZodEnum<{
            development: "development";
            staging: "staging";
            production: "production";
            test: "test";
        }>;
    }, z.core.$strip>;
    api: z.ZodObject<{
        host: z.ZodString;
        port: z.ZodCoercedNumber<unknown>;
    }, z.core.$strip>;
    logger: z.ZodObject<{
        level: z.ZodEnum<{
            error: "error";
            debug: "debug";
            info: "info";
            warn: "warn";
            fatal: "fatal";
        }>;
        file: z.ZodOptional<z.ZodString>;
        json: z.ZodDefault<z.ZodBoolean>;
        color: z.ZodDefault<z.ZodBoolean>;
        rotation: z.ZodOptional<z.ZodObject<{
            maxBytes: z.ZodDefault<z.ZodNumber>;
            maxFiles: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    telemetry: z.ZodObject<{
        enabled: z.ZodBoolean;
        prometheus: z.ZodDefault<z.ZodBoolean>;
        serviceName: z.ZodDefault<z.ZodString>;
        otlpEndpoint: z.ZodOptional<z.ZodString>;
        otlpTracesEndpoint: z.ZodOptional<z.ZodString>;
        otlpMetricsEndpoint: z.ZodOptional<z.ZodString>;
        otlpHeaders: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        sampleRatio: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        exportIntervalMs: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        exportTimeoutMs: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    }, z.core.$strip>;
    providers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        timeoutMs: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        protocols: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            udp: "udp";
            tcp: "tcp";
            doh: "doh";
            dot: "dot";
        }>>>;
    }, z.core.$strip>>>;
    benchmark: z.ZodDefault<z.ZodObject<{
        intervalMs: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
        question: z.ZodDefault<z.ZodObject<{
            name: z.ZodString;
            recordType: z.ZodEnum<{
                A: "A";
                AAAA: "AAAA";
                CNAME: "CNAME";
                TXT: "TXT";
                MX: "MX";
                NS: "NS";
            }>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    dns: z.ZodDefault<z.ZodObject<{
        strategy: z.ZodDefault<z.ZodEnum<{
            custom: "custom";
            "lowest-latency": "lowest-latency";
            "highest-availability": "highest-availability";
            "lowest-packet-loss": "lowest-packet-loss";
            balanced: "balanced";
            "privacy-first": "privacy-first";
            "security-first": "security-first";
        }>>;
        failover: z.ZodDefault<z.ZodObject<{
            failureThreshold: z.ZodDefault<z.ZodNumber>;
            recoveryThreshold: z.ZodDefault<z.ZodNumber>;
            cooldownMs: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strip>>;
        dnssec: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            requireValidation: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>;
        cache: z.ZodDefault<z.ZodObject<{
            ttlMs: z.ZodDefault<z.ZodNumber>;
            warmDomains: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    plugins: z.ZodDefault<z.ZodObject<{
        directory: z.ZodDefault<z.ZodString>;
        enabled: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type AppConfig = z.infer<typeof ConfigSchema>;
export interface ConfigLoaderOptions {
    configDir?: string;
    environment?: AppConfig['app']['environment'];
    env?: NodeJS.ProcessEnv;
}
export declare class ConfigLoader {
    private readonly options;
    private lastGood?;
    constructor(options?: ConfigLoaderOptions);
    load(): AppConfig;
    watch(onChange: (config: AppConfig) => void): () => void;
    getLastGood(): AppConfig | undefined;
}
export declare const loadConfig: (options?: ConfigLoaderOptions) => AppConfig;
//# sourceMappingURL=index.d.ts.map