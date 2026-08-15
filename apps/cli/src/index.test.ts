import { describe, expect, it, vi } from 'vitest';
import { createProgram, printJson } from './index.js';

describe('CLI command registration', () => {
  it('registers core commands without parsing process argv at import time', () => {
    const commands = createProgram().commands.map((command) => command.name());
    expect(commands).toEqual(
      expect.arrayContaining([
        'version',
        'status',
        'config',
        'providers',
        'benchmark',
        'metrics',
        'events',
        'reload',
        'network',
        'doctor',
      ]),
    );
  });
  it('serializes command output as stable pretty JSON', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    printJson({ status: 'created' });
    expect(spy).toHaveBeenCalledWith('{\n  "status": "created"\n}');
    spy.mockRestore();
  });
});
