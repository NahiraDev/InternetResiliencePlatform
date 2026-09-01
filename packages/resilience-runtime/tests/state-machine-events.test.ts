import { describe, expect, it } from 'vitest';
import { RuntimeStateMachine } from '../src/state/state-machine.js';

describe('RuntimeStateMachine event consistency', () => {
  it('does not commit a state transition when the state event fails', async () => {
    const machine = new RuntimeStateMachine('idle', {
      emit: async (event) => {
        if (event === 'runtime.state.changed') throw new Error('event sink failed');
      },
    });

    await expect(machine.transition('observing')).rejects.toThrow('event sink failed');
    expect(machine.current()).toBe('idle');
  });
});
