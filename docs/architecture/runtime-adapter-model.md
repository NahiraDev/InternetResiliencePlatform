# Runtime Adapter Model

`RuntimeAdapterRegistry` requires each adapter to declare adapter id, subsystem, version, capabilities, supported actions, simulation/safe/live support, required permissions, required kernel capabilities, verification support, and recovery support. Unknown capabilities throw rather than being inferred from method names.

Default deterministic adapters cover network intelligence, connectivity, DNS including `dns_plain`, `dns_doh`, `dns_dot`, routing, tunnel, failover, kernel, and plugin subsystems. Tests use deterministic adapters and never perform host network mutation unless a future opt-in host integration suite explicitly enables it.
