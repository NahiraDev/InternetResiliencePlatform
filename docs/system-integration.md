# System DNS Integration

The platform DNS manager is cross-platform by design. Linux uses `resolvectl` for systemd-resolved and can be extended for NetworkManager, netplan, and `/etc/resolv.conf` fallback. Windows uses PowerShell DNS Client commands. macOS uses `networksetup` and cache commands compatible with SystemConfiguration-backed setups.

All operations are designed to snapshot current configuration, apply provider addresses, validate command success, and rollback on failure while preserving existing configuration where possible.
