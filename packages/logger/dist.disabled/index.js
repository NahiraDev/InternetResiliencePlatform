import pino from 'pino';
import { appendFileSync, mkdirSync, renameSync, statSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
const colors = {
    debug: '\u001B[36m',
    info: '\u001B[32m',
    warn: '\u001B[33m',
    error: '\u001B[31m',
    fatal: '\u001B[35m',
};
const sensitiveKey = /(password|secret|token|authorization|cookie|api[-_]?key|database_url|jwt|session)/i;
const redact = (value) => {
    if (value instanceof Error) {
        return {
            type: value.name,
            message: value.message,
            ...(value.stack ? { stack: value.stack } : {}),
        };
    }
    if (Array.isArray(value))
        return value.map(redact);
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            sensitiveKey.test(key) ? '[REDACTED]' : redact(item),
        ]));
    }
    return value;
};
const normalizeError = (value) => {
    if (!value)
        return undefined;
    if (value instanceof Error)
        return {
            type: value.name,
            message: value.message,
            ...(value.stack ? { stack: value.stack } : {}),
        };
    if (typeof value === 'object') {
        const record = redact(value);
        return {
            type: String(record.type ?? record.name ?? 'Error'),
            message: String(record.message ?? 'unknown error'),
            ...(typeof record.code === 'string' ? { code: record.code } : {}),
            ...(typeof record.category === 'string' ? { category: record.category } : {}),
            ...(typeof record.stack === 'string' ? { stack: record.stack } : {}),
        };
    }
    return { type: 'Error', message: String(value) };
};
class PinoTransport {
    instance;
    constructor(instance) {
        this.instance = instance;
    }
    write(record) {
        this.instance[record.level](record.context ?? {}, record.message);
    }
}
class ConsoleTransport {
    options;
    constructor(options = { json: true }) {
        this.options = options;
    }
    write(record) {
        const line = this.options.json === false
            ? `${colors[record.level]}[${record.level.toUpperCase()}]${colors.debug} ${record.message}`
            : JSON.stringify(record);
        console.log(line);
    }
}
class FileTransport {
    filePath;
    rotation;
    constructor(filePath, rotation) {
        this.filePath = filePath;
        this.rotation = rotation;
        mkdirSync(dirname(filePath), { recursive: true });
    }
    write(record) {
        const line = `${JSON.stringify(record)}\n`;
        appendFileSync(this.filePath, line);
        if (this.rotation) {
            const stats = statSync(this.filePath);
            if (stats.size > this.rotation.maxBytes) {
                for (let i = this.rotation.maxFiles - 1; i > 0; i--) {
                    const old = `${this.filePath}.${i}`;
                    const next = `${this.filePath}.${i + 1}`;
                    if (existsSync(old))
                        renameSync(old, next);
                }
                renameSync(this.filePath, `${this.filePath}.1`);
            }
        }
    }
}
export class Logger {
    transports;
    minLevel;
    baseContext;
    rank = {
        debug: 10,
        info: 20,
        warn: 30,
        error: 40,
        fatal: 50,
    };
    constructor(transports = [new ConsoleTransport()], minLevel = 'info', baseContext = {}) {
        this.transports = transports;
        this.minLevel = minLevel;
        this.baseContext = baseContext;
    }
    log(level, message, context) {
        if (this.rank[level] < this.rank[this.minLevel])
            return;
        const merged = redact({ ...this.baseContext, ...context });
        const error = normalizeError(merged.error);
        const record = {
            timestamp: new Date().toISOString(),
            level,
            message,
            ...(typeof merged.service === 'string' ? { service: merged.service } : {}),
            ...(typeof merged.environment === 'string' ? { environment: merged.environment } : {}),
            ...(typeof merged.requestId === 'string' ? { requestId: merged.requestId } : {}),
            ...(typeof merged.traceId === 'string' ? { traceId: merged.traceId } : {}),
            ...(typeof merged.spanId === 'string' ? { spanId: merged.spanId } : {}),
            ...(typeof merged.component === 'string' ? { component: merged.component } : {}),
            ...(typeof merged.operation === 'string' ? { operation: merged.operation } : {}),
            ...(typeof merged.duration === 'number' ? { duration: merged.duration } : {}),
            ...(typeof merged.status === 'string' || typeof merged.status === 'number'
                ? { status: merged.status }
                : {}),
            ...(error ? { error } : {}),
            ...(Object.keys(merged).length ? { context: merged } : {}),
        };
        this.transports.forEach((t) => t.write(record));
    }
    debug(m, c) {
        this.log('debug', m, c);
    }
    info(m, c) {
        this.log('info', m, c);
    }
    warn(m, c) {
        this.log('warn', m, c);
    }
    error(m, c) {
        this.log('error', m, c);
    }
    fatal(m, c) {
        this.log('fatal', m, c);
    }
    child(context) {
        return new Logger(this.transports, this.minLevel, { ...this.baseContext, ...context });
    }
}
export const createLogger = (options = {}) => {
    const normalized = typeof options === 'string' ? { level: options } : options;
    const level = normalized.level ?? 'info';
    if (normalized.pretty) {
        const instance = pino({
            level,
            base: { service: normalized.service ?? 'internet-resilience-platform' },
            transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
        });
        return new Logger([new PinoTransport(instance)], level, { service: normalized.service });
    }
    const transports = [new ConsoleTransport(normalized)];
    if (normalized.file) {
        transports.push(new FileTransport(normalized.file, normalized.rotation));
    }
    return new Logger(transports, level, { service: normalized.service });
};
//# sourceMappingURL=index.js.map