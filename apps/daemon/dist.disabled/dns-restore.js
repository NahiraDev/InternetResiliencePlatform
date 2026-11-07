/**
 * Remembers the resolvers a link used before IRP first changed them, so they can be put back.
 *
 * `resolvectl dns <link> <servers…>` overwrites the link's resolver list. Without a record of the
 * original list, "rollback" would only re-apply some other provider. The record is written (and
 * fsynced via atomic rename) BEFORE the first change, so a crash after the change still leaves
 * enough information to undo it on the next start.
 */
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
/** `resolvectl dns eth0` prints `Link 2 (eth0): 1.1.1.1 8.8.8.8` (or an empty list). */
export const parseResolvectlDns = (stdout) => {
    const line = stdout.trim().split('\n').at(-1) ?? '';
    const idx = line.indexOf(':');
    const list = idx >= 0 ? line.slice(idx + 1) : line;
    return list.split(/\s+/).filter((s) => /^[0-9a-fA-F:.]+(%\S+)?(#\S+)?$/.test(s));
};
export class DnsRestoreJournal {
    path;
    exec;
    constructor(path, exec) {
        this.path = path;
        this.exec = exec;
    }
    read() {
        if (!this.path)
            return undefined;
        try {
            const parsed = JSON.parse(readFileSync(this.path, 'utf8'));
            return parsed.schemaVersion === 1 && typeof parsed.link === 'string' && Array.isArray(parsed.servers)
                ? parsed
                : undefined;
        }
        catch {
            return undefined;
        }
    }
    write(record) {
        if (!this.path)
            return;
        mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
        const tmp = `${this.path}.tmp`;
        const fd = openSync(tmp, 'w', 0o600);
        try {
            writeSync(fd, JSON.stringify(record));
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
        renameSync(tmp, this.path);
    }
    /** Records the link's current resolvers unless an original is already on file. */
    async captureBeforeChange(link) {
        if (this.read())
            return;
        const { stdout } = await this.exec('resolvectl', ['dns', link]);
        this.write({ schemaVersion: 1, link, servers: parseResolvectlDns(stdout) });
    }
    /** True when a change is on record that has not been undone. */
    pending() {
        return this.read() !== undefined;
    }
    /** Puts the original resolvers back; an empty original means "revert to link defaults". */
    async restore() {
        const record = this.read();
        if (!record)
            return { restored: false };
        if (record.servers.length > 0)
            await this.exec('resolvectl', ['dns', record.link, ...record.servers]);
        else
            await this.exec('resolvectl', ['revert', record.link]);
        if (this.path)
            rmSync(this.path, { force: true });
        return { restored: true, link: record.link };
    }
}
//# sourceMappingURL=dns-restore.js.map