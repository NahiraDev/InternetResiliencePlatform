#!/usr/bin/env node

// Keep the historical entry point stable for CI while upgrading application
// coverage from import-only checks to real process/HTTP end-to-end checks.
await import('./package-e2e.mjs');
