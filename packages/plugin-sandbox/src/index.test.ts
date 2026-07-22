import { describe, expect, it } from 'vitest';
import { PluginSandbox, CapabilityViolation } from './index.js';
import { SampleDnsProvider } from '@irp/plugin-samples';
describe('plugin sandbox permissions', () => { it('prevents unauthorized API access', () => { const p = new SampleDnsProvider(); expect(() => new PluginSandbox().assert(p.manifest, 'vpn.connect')).toThrow(CapabilityViolation); }); it('runs isolated code without process access', () => { const p = new SampleDnsProvider(); expect(new PluginSandbox().execute(p.manifest, 'typeof process', {})).toBe('undefined'); }); });
