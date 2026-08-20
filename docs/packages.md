# Packages

## @irp/core

Provides project interfaces, dependency injection, application lifecycle, and plugin registration.

## @irp/config

Loads YAML configuration files, merges environment overlays, validates schemas, and exposes a future hot-reload API.

## @irp/logger

Emits structured JSON logs through console or file transports with debug, info, warn, and error levels.

## @irp/network

Provides network interface discovery, IPv4/IPv6 capability detection, connectivity status hooks, and latency measurement helpers.

## @irp/dns

Defines DNS resolver, provider, health check, and benchmark abstractions for later DNS automation.

## @irp/telemetry

Collects metrics snapshots, endpoint observations, and component health with a Prometheus-compatible direction.

## @irp/auto-optimization

Provides the opt-in automatic optimization safety pipeline. It evaluates recommendations against trust, policy, confidence, risk, cooldown, and budget guardrails before delegating validation, execution, verification, and rollback to the resilience runtime.

## @irp/historical-analysis

Provides bounded historical measurement queries, aggregate and per-probe reports, latency percentiles, metric-aware trend analysis, and deterministic JSON/CSV exports over the existing benchmark data.

## @irp/types

Contains shared platform-wide TypeScript types.

## @irp/utils

Contains dependency-free helper functions shared by packages and applications.
