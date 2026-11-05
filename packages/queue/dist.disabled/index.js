export class QueueBackpressureError extends Error {
    queueName;
    size;
    limit;
    code = 'QUEUE_BACKPRESSURE';
    constructor(queueName, size, limit) {
        super(`queue backpressure: '${queueName}' at capacity (${size}/${limit}); producer must retry later or shed load`);
        this.queueName = queueName;
        this.size = size;
        this.limit = limit;
        this.name = 'QueueBackpressureError';
    }
}
const DEFAULT_MAX_SIZE = 1000;
export class MemoryQueue {
    messages = [];
    handlers = new Map();
    maxSize;
    overflowPolicy;
    enqueuedTotal = 0;
    rejectedTotal = 0;
    droppedTotal = 0;
    processedTotal = 0;
    constructor(options = {}) {
        const maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
        if (!Number.isInteger(maxSize) || maxSize < 1) {
            throw new RangeError(`maxSize must be an integer >= 1, got ${maxSize}`);
        }
        this.maxSize = maxSize;
        this.overflowPolicy = options.overflowPolicy ?? 'reject';
    }
    async enqueue(name, payload) {
        if (this.messages.length >= this.maxSize) {
            if (this.overflowPolicy === 'reject') {
                this.rejectedTotal++;
                throw new QueueBackpressureError(name, this.messages.length, this.maxSize);
            }
            if (this.overflowPolicy === 'drop-oldest') {
                this.messages.shift();
                this.droppedTotal++;
            }
            else {
                this.droppedTotal++;
                this.rejectedTotal++;
                throw new QueueBackpressureError(name, this.messages.length, this.maxSize);
            }
        }
        const message = {
            id: crypto.randomUUID(),
            name,
            payload,
            attempts: 0,
            enqueuedAt: new Date(),
        };
        this.messages.push(message);
        this.enqueuedTotal++;
        const handler = this.handlers.get(name);
        if (handler) {
            message.attempts += 1;
            await handler(message);
            this.messages.splice(this.messages.indexOf(message), 1);
            this.processedTotal++;
        }
        return message;
    }
    process(name, handler) {
        this.handlers.set(name, handler);
    }
    size(name) {
        return name
            ? this.messages.filter((message) => message.name === name).length
            : this.messages.length;
    }
    status() {
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
//# sourceMappingURL=index.js.map