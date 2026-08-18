import { describe, expect, it } from 'vitest';
import { Logger, type LogRecord, type Transport } from './index.js';

class MemoryTransport implements Transport {
  records: LogRecord[] = [];
  write(record: LogRecord): void {
    this.records.push(record);
  }
}

describe('structured logger', () => {
  it('emits production fields and redacts sensitive values', () => {
    const transport = new MemoryTransport();
    const logger = new Logger([transport], 'debug', { service: 'irp-api', environment: 'test' });
    logger.info('request completed', {
      requestId: 'req-1',
      traceId: 'trace-1',
      spanId: 'span-1',
      component: 'http',
      operation: 'GET /ready',
      duration: 4,
      status: 200,
      authorization: 'Bearer secret',
      nested: { password: 'secret' },
    });
    expect(transport.records[0]).toMatchObject({
      level: 'info',
      service: 'irp-api',
      environment: 'test',
      requestId: 'req-1',
      traceId: 'trace-1',
      spanId: 'span-1',
      component: 'http',
      operation: 'GET /ready',
      duration: 4,
      status: 200,
    });
    expect(JSON.stringify(transport.records[0])).not.toContain('Bearer secret');
    expect(JSON.stringify(transport.records[0])).not.toContain('password":"secret');
  });

  it('honors log levels including fatal', () => {
    const transport = new MemoryTransport();
    const logger = new Logger([transport], 'warn');
    logger.info('ignored');
    logger.warn('kept');
    logger.fatal('fatal kept');
    expect(transport.records.map((r) => r.level)).toEqual(['warn', 'fatal']);
  });
});
