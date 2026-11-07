/**
 * Durable, file-backed implementations of the runtime's decision and incident ports.
 *
 * The in-memory stores lose every decision and incident on restart, so an operator could not
 * answer "what did the runtime do before it crashed?". These stores append one JSON line per
 * record and fsync before `put` resolves, so an acknowledged record survives power loss.
 *
 * Failure model:
 * - A torn final line (crash mid-append) is dropped on open and counted, never fatal.
 * - A corrupt line in the middle is skipped and counted; the rest of the log still loads.
 * - Growth is bounded: once the log holds twice `maxRecords` lines it is compacted to the newest
 *   `maxRecords` records through a temp file and an atomic rename.
 *
 * They add no authority: they implement the same ports as the in-memory stores.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync, } from 'node:fs';
import { dirname } from 'node:path';
/** Keyed, append-only JSON-lines log: the last line for a key wins. */
class KeyedJsonlLog {
    path;
    keyOf;
    isRecord;
    rows = new Map();
    lines = 0;
    skipped = 0;
    tornTail = false;
    compactions = 0;
    fd;
    maxRecords;
    constructor(path, keyOf, isRecord, options) {
        this.path = path;
        this.keyOf = keyOf;
        this.isRecord = isRecord;
        this.maxRecords = options.maxRecords ?? 10_000;
        if (!Number.isInteger(this.maxRecords) || this.maxRecords < 1)
            throw new RangeError('maxRecords must be a positive integer');
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        this.load();
        this.fd = openSync(path, 'a', 0o600);
    }
    load() {
        if (!existsSync(this.path))
            return;
        const text = readFileSync(this.path, 'utf8');
        if (text.length === 0)
            return;
        const endsClean = text.endsWith('\n');
        const lines = text.split('\n');
        if (lines[lines.length - 1] === '')
            lines.pop();
        lines.forEach((line, index) => {
            if (line.trim() === '')
                return;
            try {
                const parsed = JSON.parse(line);
                if (!this.isRecord(parsed))
                    throw new Error('unexpected record shape');
                this.rows.delete(this.keyOf(parsed));
                this.rows.set(this.keyOf(parsed), parsed);
                this.lines += 1;
            }
            catch {
                if (index === lines.length - 1 && !endsClean)
                    this.tornTail = true;
                else
                    this.skipped += 1;
            }
        });
        if (this.tornTail || this.skipped > 0)
            this.rewrite();
    }
    /** Rewrites the log from memory through a temp file so bad lines are not re-read forever. */
    rewrite() {
        const temp = `${this.path}.${process.pid}.tmp`;
        const fd = openSync(temp, 'w', 0o600);
        try {
            let body = '';
            for (const row of this.rows.values())
                body += `${JSON.stringify(row)}\n`;
            writeSync(fd, body);
            fsyncSync(fd);
        }
        finally {
            closeSync(fd);
        }
        renameSync(temp, this.path);
        this.lines = this.rows.size;
    }
    put(record) {
        const key = this.keyOf(record);
        writeSync(this.fd, `${JSON.stringify(record)}\n`);
        fsyncSync(this.fd);
        this.rows.delete(key);
        this.rows.set(key, record);
        this.lines += 1;
        if (this.lines >= this.maxRecords * 2)
            this.compact();
    }
    compact() {
        while (this.rows.size > this.maxRecords) {
            const oldest = this.rows.keys().next().value;
            this.rows.delete(oldest);
        }
        closeSync(this.fd);
        this.rewrite();
        this.fd = openSync(this.path, 'a', 0o600);
        this.compactions += 1;
    }
    get(key) {
        return this.rows.get(key);
    }
    list() {
        return [...this.rows.values()];
    }
    status() {
        return Object.freeze({
            path: this.path,
            records: this.rows.size,
            skippedCorruptLines: this.skipped,
            droppedTornTail: this.tornTail,
            compactions: this.compactions,
        });
    }
    close() {
        closeSync(this.fd);
    }
}
const isDecisionRecord = (value) => typeof value === 'object' &&
    value !== null &&
    typeof value.decisionId === 'string';
const isIncident = (value) => typeof value === 'object' && value !== null && typeof value.id === 'string';
export class FileDecisionStore {
    log;
    constructor(path, options = {}) {
        this.log = new KeyedJsonlLog(path, (r) => r.decisionId, isDecisionRecord, options);
    }
    async put(record) {
        this.log.put(record);
    }
    async list() {
        return this.log.list();
    }
    async get(id) {
        return this.log.get(id);
    }
    status() {
        return this.log.status();
    }
    close() {
        this.log.close();
    }
}
export class FileIncidentStore {
    log;
    constructor(path, options = {}) {
        this.log = new KeyedJsonlLog(path, (i) => i.id, isIncident, options);
    }
    async put(incident) {
        this.log.put(incident);
    }
    async list() {
        return this.log.list();
    }
    status() {
        return this.log.status();
    }
    close() {
        this.log.close();
    }
}
//# sourceMappingURL=file-stores.js.map