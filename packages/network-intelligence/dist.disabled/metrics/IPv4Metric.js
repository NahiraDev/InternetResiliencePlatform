import { networkInterfaces } from 'node:os';
export class IPv4Metric {
    async measure(_signal) {
        return Object.values(networkInterfaces())
            .flatMap((i) => i ?? [])
            .some((i) => i.family === 'IPv4' && !i.internal);
    }
}
//# sourceMappingURL=IPv4Metric.js.map