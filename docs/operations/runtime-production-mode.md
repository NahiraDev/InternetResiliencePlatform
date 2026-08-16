# Runtime Production Mode

Daemon startup order is configuration, security, runtime stores/events, adapters, observation providers, runtime, scheduler, readiness. Shutdown stops the scheduler, blocks new actions, flushes runtime state through existing stores/sinks, and then stops the application. Scheduler configuration includes enabled flag, mode, cycle interval, max concurrent cycles, cooldown, and execution budget.

Production live mutation remains opt-in and must be backed by policy approval, declared adapter capability, kernel capability where required, verification, rollback/recovery, audit records, and idempotency.
