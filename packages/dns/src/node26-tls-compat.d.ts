import type { Buffer } from 'node:buffer';

declare module 'node:tls' {
  interface TLSSocket {
    once(event: 'data', listener: (chunk: Buffer) => void): this;
  }
}
