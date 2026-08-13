import { networkInterfaces } from 'node:os';
export class IPv6Metric {
  async measure(_signal: AbortSignal): Promise<boolean> {
    return Object.values(networkInterfaces())
      .flatMap((i) => i ?? [])
      .some((i) => i.family === 'IPv6' && !i.internal);
  }
}
