# Gateways and Tunnels

A gateway is an authorized network endpoint that IRP may evaluate as a connectivity path. A tunnel is the transport mechanism used when a gateway-backed path requires encapsulation or secure transport.

## Separation of concerns

- Gateway registry owns identity, authorization, capabilities, lifecycle metadata, and health.
- Tunnel providers own provider-specific establishment and teardown.
- Core owns policy, selection, verification, and recovery decisions.
- Clients display and request permitted actions.

## Lifecycle

```text
Discover → Authorize → Score → Select → Establish → Verify → Maintain
                                      ↓                    ↓
                                   Reject              Recover/Teardown
```

IRP must never treat an arbitrary endpoint as an implicitly trusted gateway. Credentials and keys are provisioned through an explicit enrollment or administration flow.

## Provider neutrality

Core contracts must not depend on one tunnel implementation. Provider adapters implement a shared lifecycle and conformance contract.
