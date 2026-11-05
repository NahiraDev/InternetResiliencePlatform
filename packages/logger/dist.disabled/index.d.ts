export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface LogRecord {
    timestamp: string;
    level: LogLevel;
    message: string;
    service?: string;
    environment?: string;
    requestId?: string;
    traceId?: string;
    spanId?: string;
    component?: string;
    operation?: string;
    duration?: number;
    status?: string | number;
    error?: {
        type: string;
        message: string;
        code?: string;
        category?: string;
        stack?: string;
    };
    context?: Record<string, unknown>;
}
export interface Transport {
    write(record: LogRecord): void;
}
export interface LoggerOptions {
    level?: LogLevel;
    pretty?: boolean;
    service?: string;
    file?: string;
    json?: boolean;
    color?: boolean;
    rotation?: {
        maxBytes: number;
        maxFiles: number;
    };
}
export declare class Logger {
    private readonly transports;
    private readonly minLevel;
    private readonly baseContext;
    private readonly rank;
    constructor(transports?: Transport[], minLevel?: LogLevel, baseContext?: Record<string, unknown>);
    private log;
    debug(m: string, c?: Record<string, unknown>): void;
    info(m: string, c?: Record<string, unknown>): void;
    warn(m: string, c?: Record<string, unknown>): void;
    error(m: string, c?: Record<string, unknown>): void;
    fatal(m: string, c?: Record<string, unknown>): void;
    child(context: Record<string, unknown>): Logger;
}
export declare const createLogger: (options?: LoggerOptions | LogLevel) => Logger;
//# sourceMappingURL=index.d.ts.map