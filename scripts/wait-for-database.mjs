#!/usr/bin/env node
import { Client } from 'pg';

const url = process.env.DATABASE_URL;
const timeoutMs = Number(process.env.DATABASE_READY_TIMEOUT_MS ?? 60_000);
const intervalMs = Number(process.env.DATABASE_READY_INTERVAL_MS ?? 1_000);
const deadline = Date.now() + timeoutMs;

if (!url) {
  console.error(JSON.stringify({ level: 'error', msg: 'DATABASE_URL is required before startup' }));
  process.exit(1);
}

let attempt = 0;
while (Date.now() < deadline) {
  attempt += 1;
  const client = new Client({ connectionString: url, connectionTimeoutMillis: Math.min(intervalMs, 5_000) });
  try {
    await client.connect();
    await client.query('select 1');
    await client.end();
    console.log(JSON.stringify({ level: 'info', msg: 'database readiness confirmed', attempt }));
    process.exit(0);
  } catch (error) {
    try { await client.end(); } catch {}
    console.log(JSON.stringify({ level: 'warn', msg: 'database not ready', attempt, error: error instanceof Error ? error.message : String(error) }));
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
console.error(JSON.stringify({ level: 'error', msg: 'database readiness timed out', timeoutMs, attempt }));
process.exit(1);
