import { type CommandRunner } from './wireguard.js';
import type { KillSwitch } from './index.js';
/** Linux nftables fail-closed output kill switch. */
export interface NftablesKillSwitchOptions {
    commandRunner?: CommandRunner;
    tunnelInterface?: string;
    allowedUdpPorts?: number[];
    tableName?: string;
    commandTimeoutMs?: number;
}
export declare class NftablesKillSwitch implements KillSwitch {
    private readonly commandRunner;
    private readonly tunnelInterface;
    private readonly allowedUdpPorts;
    private readonly tableName;
    private readonly commandTimeoutMs;
    constructor(options?: NftablesKillSwitchOptions);
    enable(tunnelId: string): Promise<void>;
    disable(tunnelId: string): Promise<void>;
    status(tunnelId: string): Promise<'enabled' | 'disabled' | 'unsupported' | 'unknown'>;
    private run;
    private runQuiet;
}
//# sourceMappingURL=kill-switch.d.ts.map