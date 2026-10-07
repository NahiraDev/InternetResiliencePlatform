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

export class QueueBackpressureError extends Error {
  readonly code = 'QUEUE_BACKPRESSURE';
  constructor(
    readonly queueName: string,
    readonly size: number,
    readonly limit: number,
  ) {
    super(
      `queue backpressure: '${queueName}' at capacity (${size}/${limit}); producer must retry later or shed load`,
    );
    this.name = 'QueueBackpressureError';
  }
}

const DEFAULT_MAX_SIZE = 1000;

export class MemoryQueue implements Queue {
  private readonly messages: QueueMessage[] = [];
  private readonly handlers = new Map<string, QueueHandler>();
  private readonly maxSize: number;
  private readonly overflowPolicy: QueueOverflowPolicy;
  private enqueuedTotal = 0;
  private rejectedTotal = 0;
  private droppedTotal = 0;
  private processedTotal = 0;

  constructor(options: BoundedQueueOptions = {}) {
    const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    if (!Number.isInteger(maxSize) || maxSize < 1) {
      throw new RangeError(`maxSize must be an integer >= 1, got ${maxSize}`);
    }
    this.maxSize = maxSize;
    this.overflowPolicy = options.overflowPolicy ?? 'reject';
  }

  async enqueue<T>(name: string, payload: T): Promise<QueueMessage<T>> {
    if (this.messages.length >= this.maxSize) {
      if (this.overflowPolicy === 'reject') {
        this.rejectedTotal++;
        throw new QueueBackpressureError(name, this.messages.length, this.maxSize);
      }
      if (this.overflowPolicy === 'drop-oldest') {
        this.messages.shift();
        this.droppedTotal++;
      } else {
        this.droppedTotal++;
        this.rejectedTotal++;
        throw new QueueBackpressureError(name, this.messages.length, this.maxSize);
      }
    }
    const message: QueueMessage<T> = {
      id: crypto.randomUUID(),
      name,
      payload,
      attempts: 0,
      enqueuedAt: new Date(),
    };
    this.messages.push(message);
    this.enqueuedTotal++;
    const handler = this.handlers.get(name) as QueueHandler<T> | undefined;
    if (handler) {
      message.attempts += 1;
      await handler(message);
      this.messages.splice(this.messages.indexOf(message), 1);
      this.processedTotal++;
    }
    return message;
  }
  process<T>(name: string, handler: QueueHandler<T>): void {
    this.handlers.set(name, handler as QueueHandler);
  }
  size(name?: string): number {
    return name
      ? this.messages.filter((message) => message.name === name).length
      : this.messages.length;
  }
  status(): QueueStatus {
    return Object.freeze({
      size: this.messages.length,
      maxSize: this.maxSize,
      overflowPolicy: this.overflowPolicy,
      enqueuedTotal: this.enqueuedTotal,
      rejectedTotal: this.rejectedTotal,
      droppedTotal: this.droppedTotal,
      processedTotal: this.processedTotal,
    });
  }
}
