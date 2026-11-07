import { NodeCommandRunner } from './wireguard.js';
const NFT_COMMAND = 'nft';
const DEFAULT_TUNNEL_INTERFACE = 'irpwg0';
const DEFAULT_TABLE = 'irp_killswitch';
const DEFAULT_TIMEOUT_MS = 10_000;
export class NftablesKillSwitch {
    commandRunner;
    tunnelInterface;
    allowedUdpPorts;
    tableName;
    commandTimeoutMs;
    constructor(options = {}) {
        this.commandRunner = options.commandRunner ?? new NodeCommandRunner();
        this.tunnelInterface = options.tunnelInterface ?? DEFAULT_TUNNEL_INTERFACE;
        this.allowedUdpPorts = [...(options.allowedUdpPorts ?? [51820])];
        this.tableName = options.tableName ?? DEFAULT_TABLE;
        this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_TIMEOUT_MS;
        if (!/^[A-Za-z0-9_.-]{1,15}$/.test(this.tunnelInterface))
            throw new Error('kill-switch tunnel interface name is invalid');
        if (!/^[A-Za-z0-9_.-]{1,60}$/.test(this.tableName))
            throw new Error('kill-switch table name is invalid');
        if (this.allowedUdpPorts.length === 0 || this.allowedUdpPorts.some((port) => !Number.isInteger(port) || port < 1 || port > 65535))
            throw new Error('kill-switch allowed UDP ports must be integers between 1 and 65535');
        if (!Number.isInteger(this.commandTimeoutMs) || this.commandTimeoutMs <= 0)
            throw new Error('kill-switch commandTimeoutMs must be a positive integer');
    }
    async enable(tunnelId) {
        assertTunnelId(tunnelId);
        await this.runQuiet(['delete', 'table', 'inet', this.tableName]);
        await this.run(['add', 'table', 'inet', this.tableName]);
        try {
            await this.run(['add', 'chain', 'inet', this.tableName, 'output', '{', 'type', 'filter', 'hook', 'output', 'priority', '0', ';', 'policy', 'drop', ';', '}']);
            await this.run(['add', 'rule', 'inet', this.tableName, 'output', 'oifname', 'lo', 'accept']);
            await this.run(['add', 'rule', 'inet', this.tableName, 'output', 'ct', 'state', 'established,related', 'accept']);
            await this.run(['add', 'rule', 'inet', this.tableName, 'output', 'oifname', this.tunnelInterface, 'accept']);
            for (const port of this.allowedUdpPorts)
                await this.run(['add', 'rule', 'inet', this.tableName, 'output', 'udp', 'dport', String(port), 'accept']);
        }
        catch (error) {
            await this.runQuiet(['delete', 'table', 'inet', this.tableName]);
            throw error instanceof Error ? new Error(`kill switch enable failed: ${error.message}`) : new Error('kill switch enable failed');
        }
    }
    async disable(tunnelId) {
        assertTunnelId(tunnelId);
        await this.runQuiet(['delete', 'table', 'inet', this.tableName]);
    }
    async status(tunnelId) {
        assertTunnelId(tunnelId);
        const result = await this.commandRunner.run(NFT_COMMAND, ['list', 'table', 'inet', this.tableName], { timeoutMs: this.commandTimeoutMs });
        if (result.exitCode === 0)
            return 'enabled';
        if (/No such file or directory|No such file|table .* does not exist/i.test(result.stderr))
            return 'disabled';
        if (/Operation not permitted|permission denied|ENOENT|not found/i.test(result.stderr))
            return 'unsupported';
        return 'unknown';
    }
    async run(args) {
        const result = await this.commandRunner.run(NFT_COMMAND, args, { timeoutMs: this.commandTimeoutMs });
        if (result.exitCode !== 0)
            throw new Error(result.stderr || `nft ${args.join(' ')} failed`);
    }
    async runQuiet(args) {
        await this.commandRunner.run(NFT_COMMAND, args, { timeoutMs: this.commandTimeoutMs });
    }
}
function assertTunnelId(tunnelId) {
    if (typeof tunnelId !== 'string' || tunnelId.length === 0 || tunnelId.length > 128)
        throw new Error('kill switch requires a non-empty tunnel id');
}
//# sourceMappingURL=kill-switch.js.map