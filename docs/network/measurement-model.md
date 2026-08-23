# Network Measurement Model

IRP decisions depend on measurements that are comparable, attributable and time-bounded.

## Measurement dimensions

The current network-intelligence implementation exposes concepts including latency, jitter, packet loss, DNS, HTTP/TLS, bandwidth, gateway/public-IP and regional/provider information. These measurements feed network snapshots and quality evaluation.

## Evidence lifecycle

```text
Probe / provider
      ↓
Measurement
      ↓
Normalization
      ↓
Snapshot
      ↓
Quality score / diagnosis
      ↓
Decision input
      ↓
Action
      ↓
Verification measurement
```

## Provenance

Measurements should carry enough provenance to answer:

- where the observation originated;
- when it was collected;
- which destination and protocol were used;
- which provider/path was active;
- which measurement method produced it;
- whether the result was local, remote or federated.

## Regional evidence

Federated regional probes are evidence producers, not decision authorities. Their signed observations are accepted only after authentication, freshness and policy validation.

## Safety

Measurement endpoints are bounded. Network probing must not become unrestricted scanning or SSRF. Destination validation, redirect handling, IPv4/IPv6 handling and metadata/private-network protections remain mandatory.

## Analytics

Raw measurements and derived analytics are distinct. Aggregation must preserve provenance and must not allow a derived score to be mistaken for direct evidence.
