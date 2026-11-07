export type Exec = (file: string, args: readonly string[]) => Promise<{
    stdout: string;
}>;
/** `resolvectl dns eth0` prints `Link 2 (eth0): 1.1.1.1 8.8.8.8` (or an empty list). */
export declare const parseResolvectlDns: (stdout: string) => string[];
export declare class DnsRestoreJournal {
    private readonly path;
    private readonly exec;
    constructor(path: string | undefined, exec: Exec);
    private read;
    private write;
    /** Records the link's current resolvers unless an original is already on file. */
    captureBeforeChange(link: string): Promise<void>;
    /** True when a change is on record that has not been undone. */
    pending(): boolean;
    /** Puts the original resolvers back; an empty original means "revert to link defaults". */
    restore(): Promise<{
        restored: boolean;
        link?: string;
    }>;
}
//# sourceMappingURL=dns-restore.d.ts.map