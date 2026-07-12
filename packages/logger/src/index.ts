import pino, { type Logger as PinoLogger } from 'pino';
import { appendFileSync, mkdirSync, renameSync, statSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  traceId?: string;
  requestId?: string;
  context?: Record<string, unknown>;
}

export interface Transport {
  write(record: LogRecord): void;
}

export interface LoggerOptions {
  level?: LogLevel;
  pretty?: boolean;
  service?: string;
  json?: boolean;
  color?: boolean;
  rotation?: { maxBytes: number; maxFiles: number };
}

const colors: Record<LogLevel, string> = {
  debug: '\u001B[36m',
  info: '\u001B[32m',
  warn: '\u001B[33m',
  error: '\u001B[31m',
};

class PinoTransport implements Transport {
  constructor(private readonly instance: PinoLogger) {}
  write(record: LogRecord): void {
    this.instance[record.level](record.context ?? {}, record.message);
  }
}

class ConsoleTransport implements Transport {
  constructor(private readonly options: LoggerOptions = { json: true }) {}
  write(record: LogRecord): void {
    const line = this.options.json === false
      ? `${colors[record.level]}[${record.level.toUpperCase()}]${colors.debug} ${record.message}`
      : JSON.stringify(record);
    console.log(line);
  }
}

class FileTransport implements Transport {
  constructor(private readonly filePath: string, private readonly rotation?: { maxBytes: number; maxFiles: number }) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  write(record: LogRecord): void {
    const line = `${JSON.stringify(record)}\n`;
    appendFileSync(this.filePath, line);

    if (this.rotation) {
      const stats = statSync(this.filePath);
      if (stats.size > this.rotation.maxBytes) {
        for (let i = this.rotation.maxFiles - 1; i > 0; i--) {
          const old = `${this.filePath}.${i}`;
          const next = `${this.filePath}.${i + 1}`;
          if (existsSync(old)) renameSync(old, next);
        }
        renameSync(this.filePath, `${this.filePath}.1`);
      }
    }
  }
}

export class Logger {
  private readonly rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

  constructor(
    private readonly transports: Transport[] = [new ConsoleTransport()],
    private readonly minLevel: LogLevel = 'info',
    private readonly baseContext: Record<string, unknown> = {},
  ) {}

  private log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (this.rank[level] < this.rank[this.minLevel]) return;

    const merged = { ...this.baseContext, ...context };
    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(typeof merged.traceId === 'string' ? { traceId: merged.traceId } : {}),
      ...(typeof merged.requestId === 'string' ? { requestId: merged.requestId } : {}),
      ...(Object.keys(merged).length ? { context: merged } : {}),
    };

    this.transports.forEach((t) => t.write(record));
  }

  debug(m: string, c?: Record<string, unknown>): void {
    this.log('debug', m, c);
  }

  info(m: string, c?: Record<string, unknown>): void {
    this.log('info', m, c);
  }

  warn(m: string, c?: Record<string, unknown>): void {
    this.log('warn', m, c);
  }

  error(m: string, c?: Record<string, unknown>): void {
    this.log('error', m, c);
  }

  child(context: Record<string, unknown>): Logger {
    return new Logger(this.transports, this.minLevel, { ...this.baseContext, ...context });
  }
}

export const createLogger = (options: LoggerOptions | LogLevel = {}): Logger => {
  const normalized = typeof options === 'string' ? { level: options } : options;
  const level = normalized.level ?? 'info';

  if (normalized.pretty) {
    const instance = pino({
      level,
      base: { service: normalized.service ?? 'internet-resilience-platform' },
      transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
    });
    return new Logger([new PinoTransport(instance)], level);
  }

  return new Logger([new ConsoleTransport(normalized)], level);
};
