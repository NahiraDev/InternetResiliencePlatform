export class Scheduler {
    task;
    options;
    timer;
    running = false;
    constructor(task, options) {
        this.task = task;
        this.options = options;
    }
    start(signal) {
        if (this.timer)
            return;
        const run = () => {
            if (this.running)
                return;
            this.running = true;
            void this.task(signal).finally(() => {
                this.running = false;
            });
        };
        if (this.options.runImmediately)
            run();
        this.timer = setInterval(run, this.options.intervalMs);
    }
    stop() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    isRunning() {
        return this.timer !== undefined;
    }
}
//# sourceMappingURL=Scheduler.js.map