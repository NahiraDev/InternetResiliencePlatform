import { networkInterfaces } from 'node:os';
export class IPv6Metric {
    async measure(_signal) {
        return Object.values(networkInterfaces())
            .flatMap((i) => i ?? [])
            .some((i) => i.family === 'IPv6' && !i.internal);
    }
}
//# sourceMappingURL=IPv6Metric.js.map