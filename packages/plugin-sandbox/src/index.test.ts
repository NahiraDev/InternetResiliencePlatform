import { describe, expect, it } from 'vitest';
import { PluginSandbox, CapabilityViolation } from './index.js';
import { SampleDnsProvider } from '@irp/plugin-samples';

describe('plugin sandbox permissions', () => {
  it('prevents unauthorized API access', () => {
    const p = new SampleDnsProvider();
    expect(() => new PluginSandbox().assert(p.manifest, 'vpn.connect')).toThrow(
      CapabilityViolation,
    );
  });

  it('does not expose host process APIs', () => {
    const p = new SampleDnsProvider();
    expect(new PluginSandbox().execute(p.manifest, 'typeof process', {})).toBe('undefined');
    expect(new PluginSandbox().execute(p.manifest, 'typeof require', {})).toBe('undefined');
    expect(new PluginSandbox().execute(p.manifest, 'typeof Buffer', {})).toBe('undefined');
  });

  it('blocks dynamic code generation', () => {
    const p = new SampleDnsProvider();
    expect(() => new PluginSandbox().execute(p.manifest, 'eval("1 + 1")', {})).toThrow();
    expect(() => new PluginSandbox().execute(p.manifest, 'Function("return 1")()', {})).toThrow();
  });

  it('rejects invalid plugin code and configuration', () => {
    const p = new SampleDnsProvider();
    expect(() => new PluginSandbox(0)).toThrow(RangeError);
    expect(() => new PluginSandbox().execute(p.manifest, '', {})).toThrow(CapabilityViolation);
  });
});
