export interface QueueMessage<T = unknown> {
    id: string;
    name: string;
    payload: T;
    attempts: number;
    enqueuedAt: Date;
}
export type QueueHandler<T = unknown> = (message: QueueMessage<T>) => Promise<void> | void;
export interface Queue {
    enqueue<T>(name: string, payload: T): Promise<QueueMessage<T>>;
    process<T>(name: string, handler: QueueHandler<T>): void;
    size(name?: string): number;
}
export type QueueOverflowPolicy = 'reject' | 'drop-oldest' | 'drop-newest';
export interface BoundedQueueOptions {
    /** Maximum retained messages across all names. Defaults to 1000. Must be >= 1. */
    readonly maxSize?: number;
    /**
     * Overflow behavior once `maxSize` is reached:
     * - `reject` (default): throw `QueueBackpressureError` so the producer
     *   applies backpressure instead of growing memory without bound.
     * - `drop-oldest`: evict the oldest retained message and count it as dropped.
     * - `drop-newest`: refuse the incoming message and count it as dropped.
     */
    readonly overflowPolicy?: QueueOverflowPolicy;
}
export interface QueueStatus {
    readonly size: number;
    readonly maxSize: number;
    readonly overflowPolicy: QueueOverflowPolicy;
    readonly enqueuedTotal: number;
    readonly rejectedTotal: number;
    readonly droppedTotal: number;
    readonly processedTotal: number;
}
export declare class QueueBackpressureError extends Error {
    readonly queueName: string;
    readonly size: number;
    readonly limit: number;
    readonly code = "QUEUE_BACKPRESSURE";
    constructor(queueName: string, size: number, limit: number);
}
export declare class MemoryQueue implements Queue {
    private readonly messages;
    private readonly handlers;
    private readonly maxSize;
    private readonly overflowPolicy;
    private enqueuedTotal;
    private rejectedTotal;
    private droppedTotal;
    private processedTotal;
    constructor(options?: BoundedQueueOptions);
    enqueue<T>(name: string, payload: T): Promise<QueueMessage<T>>;
    process<T>(name: string, handler: QueueHandler<T>): void;
    size(name?: string): number;
    status(): QueueStatus;
}
//# sourceMappingURL=index.d.ts.map