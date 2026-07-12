import { describe, expect, it } from 'vitest';
import { Logger, type LogRecord, type Transport } from './index.js';

describe('Logger', () => {
  it('writes structured records', () => {
    const records: LogRecord[] = [];
    const transport: Transport = { write: (record) => records.push(record) };
    new Logger([transport], 'debug').info('hello', { service: 'test' });
    expect(records[0]?.message).toBe('hello');
    expect(records[0]?.context?.service).toBe('test');
  });
});
