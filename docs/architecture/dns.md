# DNS Architecture

DNS is one of the first diagnostic boundaries in the network resilience model because name-resolution failure can be mistaken for general Internet failure.

## Responsibilities

The DNS subsystem is responsible for resolver configuration/selection where supported, DNS measurements, result normalization, caching behavior where implemented, and reporting DNS-specific health signals.

## Diagnostic boundary

A DNS failure should be distinguished from:

- successful DNS resolution followed by transport failure;
- successful transport followed by TLS failure;
- successful HTTP connection followed by application failure.

## Safety

Reading DNS health and configuration is observational. DNS mutation is a consequential operation and must require an explicit capability, policy authorization, bounded execution, and post-change verification.

## Verification

After a resolver change, verification should measure both resolution success and the downstream connectivity outcome. A resolver responding successfully does not prove that the complete network path is healthy.

## Implementation status

Use the current DNS package implementation and tests as the source of truth for supported resolver providers, cache behavior, and mutation capabilities.
