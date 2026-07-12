import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogRecord { timestamp: string; level: LogLevel; message: string; context?: Record<string, unknown>; }
export interface Transport { write(record: LogRecord): void; }
export class ConsoleTransport implements Transport { write(record: LogRecord): void { const line = JSON.stringify(record); record.level === 'error' ? console.error(line) : console.log(line); } }
export class FileTransport implements Transport { constructor(private readonly filePath: string) { mkdirSync(dirname(filePath), { recursive: true }); } write(record: LogRecord): void { appendFileSync(this.filePath, `${JSON.stringify(record)}\n`); } }
export class Logger { constructor(private readonly transports: Transport[] = [new ConsoleTransport()], private readonly minLevel: LogLevel = 'info') {} private rank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }; log(level: LogLevel, message: string, context?: Record<string, unknown>): void { if (this.rank[level] < this.rank[this.minLevel]) return; const record: LogRecord = { timestamp: new Date().toISOString(), level, message, ...(context ? { context } : {}) }; this.transports.forEach((t) => t.write(record)); } debug(m: string, c?: Record<string, unknown>): void { this.log('debug', m, c); } info(m: string, c?: Record<string, unknown>): void { this.log('info', m, c); } warn(m: string, c?: Record<string, unknown>): void { this.log('warn', m, c); } error(m: string, c?: Record<string, unknown>): void { this.log('error', m, c); } }
export const createLogger = (level: LogLevel = 'info'): Logger => new Logger([new ConsoleTransport()], level);
