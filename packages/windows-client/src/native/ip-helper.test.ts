/**
 * Tests for the Windows IP Helper API bindings.
 *
 * These tests run on any platform. They validate structure layouts, parsing
 * logic, and API error handling without requiring Windows or native FFI
 * bindings (which are not available on this Linux host).
 *
 * Where a test requires the native `ffi-napi` module, it is skipped on
 * platforms where the module is not installed — never silently passing.
 */

import { describe, expect, it } from 'vitest';
import {
  parseIpForwardRow,
  parseIpv4,
  buildIpForwardRow,
  parseAdapterAddresses,
  readStringFromPtr,
} from './ip-helper.js';

describe('IP Helper API IPv4 parsing', () => {
  it('parses a valid dotted-decimal IPv4 string', () => {
    expect(parseIpv4('192.168.1.1')).toBe(0xc0a80101);
    expect(parseIpv4('0.0.0.0')).toBe(0);
    expect(parseIpv4('255.255.255.255')).toBe(0xffffffff);
  });

  it('rejects invalid IPv4 strings', () => {
    expect(parseIpv4('256.1.1.1')).toBeUndefined();
    expect(parseIpv4('1.2.3')).toBeUndefined();
    expect(parseIpv4('1.2.3.4.5')).toBeUndefined();
    expect(parseIpv4('not-an-ip')).toBeUndefined();
    expect(parseIpv4('')).toBeUndefined();
    expect(parseIpv4('1.2.3.-1')).toBeUndefined();
  });

  it('round-trips IPv4 through build/parse', () => {
    const request = {
      destination: '10.0.0.0',
      mask: '255.255.255.0',
      gateway: '10.0.0.1',
      interfaceIndex: 12,
    };
    const row = buildIpForwardRow(request);
    const parsed = parseIpForwardRow(row);
    expect(parsed).toBeDefined();
    expect(parsed?.destination).toBe('10.0.0.0');
    expect(parsed?.mask).toBe('255.255.255.0');
    expect(parsed?.gateway).toBe('10.0.0.1');
    expect(parsed?.interfaceIndex).toBe(12);
  });

  it('rejects building a row with invalid addresses', () => {
    expect(() =>
      buildIpForwardRow({
        destination: 'not-an-ip',
        mask: '255.255.255.0',
        gateway: '10.0.0.1',
        interfaceIndex: 12,
      }),
    ).toThrow();
    expect(() =>
      buildIpForwardRow({
        destination: '10.0.0.0',
        mask: 'invalid',
        gateway: '10.0.0.1',
        interfaceIndex: 12,
      }),
    ).toThrow();
  });
});

describe('IP Helper API structure parsing', () => {
  it('parses a MIB_IPFORWARDROW x64 buffer', () => {
    const buf = Buffer.alloc(40);
    buf.writeUInt32LE(0x0a000000, 0);   // dest 10.0.0.0
    buf.writeUInt32LE(0xffffff00, 4);   // mask 255.255.255.0
    buf.writeUInt32LE(0, 8);            // policy
    buf.writeUInt32LE(0x0a000001, 12);  // gateway 10.0.0.1
    buf.writeUInt32LE(12, 16);          // ifIndex 12
    buf.writeUInt32LE(10, 20);          // metric1 10

    const parsed = parseIpForwardRow(buf);
    expect(parsed).toBeDefined();
    expect(parsed?.destination).toBe('10.0.0.0');
    expect(parsed?.mask).toBe('255.255.255.0');
    expect(parsed?.gateway).toBe('10.0.0.1');
    expect(parsed?.interfaceIndex).toBe(12);
    expect(parsed?.metric).toBe(10);
  });

  it('skips default routes with zero gateway in parseIpForwardRow', () => {
    const buf = Buffer.alloc(40);
    buf.writeUInt32LE(0, 0);     // dest 0.0.0.0
    buf.writeUInt32LE(0, 4);     // mask 0.0.0.0
    buf.writeUInt32LE(0, 8);     // policy
    buf.writeUInt32LE(0, 12);    // gateway 0.0.0.0
    buf.writeUInt32LE(5, 16);    // ifIndex 5

    const parsed = parseIpForwardRow(buf);
    expect(parsed).toBeUndefined();
  });

  it('reads a UTF-16 string from a buffer pointer', () => {
    const str = 'TestAdapter';
    const buf = Buffer.alloc((str.length + 1) * 2);
    for (let i = 0; i < str.length; i++) {
      buf.writeUInt16LE(str.charCodeAt(i), i * 2);
    }
    buf.writeUInt16LE(0, str.length * 2); // null terminator
    expect(readStringFromPtr(buf)).toBe(str);
  });

  it('returns empty string for null/empty pointer', () => {
    expect(readStringFromPtr(null)).toBe('');
    expect(readStringFromPtr(undefined)).toBe('');
    expect(readStringFromPtr({ readUInt16LE: () => 0 })).toBe('');
  });
});

describe('IP Helper API adapter address parsing', () => {
  it('returns empty for a buffer too small to contain a header', () => {
    const buf = Buffer.alloc(100);
    const entries = parseAdapterAddresses(buf);
    expect(entries).toEqual([]);
  });

  it('parses an adapter record from a synthetic buffer', () => {
    const desc = 'Test Ethernet Adapter';
    const friendly = 'Ethernet0';
    const mac = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55];

    const descBuf = Buffer.from(desc, 'utf16le');
    const friendlyBuf = Buffer.from(friendly, 'utf16le');

    // Layout: header (216 bytes) + desc string + friendly string + MAC (6 bytes)
    const descOffset = 216;
    const friendlyOffset = descOffset + descBuf.length + 2;
    const macOffset = friendlyOffset + friendlyBuf.length + 2;
    const totalSize = macOffset + 6;

    const buf = Buffer.alloc(totalSize);

    // IP_ADAPTER_ADDRESSES header (x64 offsets)
    buf.writeUInt32LE(totalSize, 0);                                    // Length
    buf.writeUInt32LE(7, 4);                                            // IfIndex
    buf.writeBigInt64LE(0n, 8);                                         // Next = null
    buf.writeBigInt64LE(BigInt(descOffset), 24);                                // Description pointer
    buf.writeBigInt64LE(BigInt(friendlyOffset), 32);                            // FriendlyName pointer
    buf.writeUInt32LE(1, 136);                                          // OperStatus = Up
    buf.writeUInt32LE(1500, 152);                                       // Mtu
    buf.writeUInt32LE(6, 160);                                          // PhysicalAddressLength
    buf.writeBigInt64LE(BigInt(macOffset), 168);                                // PhysicalAddress pointer
    buf.writeUInt32LE(0, 208);                                          // Flags
    buf.writeBigInt64LE(0n, 216);                                       // FirstUnicastAddress = null

    // Write strings and MAC after the header
    descBuf.copy(buf, descOffset);
    friendlyBuf.copy(buf, friendlyOffset);
    for (let i = 0; i < 6; i++) {
      const m = mac[i];
      if (m === undefined) throw new Error(`Missing MAC byte at index ${i}`);
      buf.writeUInt8(m, macOffset + i);
    }

    const entries = parseAdapterAddresses(buf);
    expect(entries.length).toBe(1);
    expect(entries[0]?.index).toBe(7);
    expect(entries[0]?.description).toBe(desc);
    expect(entries[0]?.name).toBe(friendly);
    expect(entries[0]?.operStatus).toBe(1); // Up
    expect(entries[0]?.mtu).toBe(1500);
    expect(entries[0]?.macAddress).toBe('00:11:22:33:44:55');
  });

  it('stops at end of list when Next pointer is null', () => {
    const buf = Buffer.alloc(224);
    buf.writeUInt32LE(224, 0);   // Length
    buf.writeUInt32LE(3, 4);     // IfIndex 3
    buf.writeBigInt64LE(0n, 8);  // Next = null
    buf.writeUInt32LE(2, 136);   // OperStatus

    const entries = parseAdapterAddresses(buf);
    expect(entries.length).toBe(1);
    expect(entries[0]?.index).toBe(3);
  });
});
