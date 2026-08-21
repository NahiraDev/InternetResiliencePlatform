#!/usr/bin/env node

import { argv, env, exit } from 'node:process';

const DEFAULT_ENDPOINT = 'https://ipapi.co/json/';
const DEFAULT_EXPECTED_COUNTRY = 'IR';
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_TIMEOUT_MS = 30_000;
const MAX_LABEL_LENGTH = 120;

const getArg = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};

const endpoint = getArg('--endpoint') || env.IRP_REGIONAL_PROBE_URL || DEFAULT_ENDPOINT;
const expectedCountry = (getArg('--country') || env.IRP_EXPECTED_COUNTRY || DEFAULT_EXPECTED_COUNTRY).toUpperCase();
const timeoutMs = Math.min(
  Math.max(Number(getArg('--timeout') || env.IRP_REGIONAL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS), 1000),
  MAX_TIMEOUT_MS,
);
const label = (getArg('--label') || env.IRP_REGIONAL_PROBE_LABEL || 'regional-online-probe').slice(0, MAX_LABEL_LENGTH);

const startedAt = Date.now();

const fail = (message, details = {}) => {
  const result = {
    schemaVersion: 1,
    status: 'failed',
    deterministic: false,
    label,
    endpoint,
    expectedCountry,
    observed: null,
    durationMs: Date.now() - startedAt,
    error: message,
    ...details,
  };
  console.log(JSON.stringify(result, null, 2));
  exit(1);
};

let url;
try {
  url = new URL(endpoint);
  if (url.protocol !== 'https:') fail('Regional probe endpoint must use HTTPS.');
} catch {
  fail('Invalid regional probe endpoint URL.');
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json,text/plain;q=0.9',
      'user-agent': 'InternetResiliencePlatform-regional-probe/1',
    },
    redirect: 'error',
    signal: controller.signal,
  });

  if (!response.ok) fail(`Regional probe returned HTTP ${response.status}.`, { httpStatus: response.status });

  const contentType = response.headers.get('content-type') || '';
  let payload;
  if (contentType.includes('application/json')) {
    payload = await response.json();
  } else {
    payload = { ip: (await response.text()).trim() };
  }

  const ip = typeof payload?.ip === 'string' ? payload.ip.trim() : '';
  const country = typeof payload?.country === 'string'
    ? payload.country.trim().toUpperCase()
    : typeof payload?.country_code === 'string'
      ? payload.country_code.trim().toUpperCase()
      : '';

  if (!ip) fail('Regional probe response did not contain a public IP address.');
  if (!country) fail('Regional probe response did not contain a country code.');

  const matched = country === expectedCountry;
  const result = {
    schemaVersion: 1,
    status: matched ? 'passed' : 'mismatch',
    deterministic: false,
    label,
    endpoint,
    expectedCountry,
    observed: {
      ip,
      country,
      city: typeof payload?.city === 'string' ? payload.city : undefined,
      region: typeof payload?.region === 'string' ? payload.region : undefined,
      asn: typeof payload?.asn === 'string' ? payload.asn : undefined,
      org: typeof payload?.org === 'string' ? payload.org : undefined,
      timezone: typeof payload?.timezone === 'string' ? payload.timezone : undefined,
    },
    durationMs: Date.now() - startedAt,
  };

  console.log(JSON.stringify(result, null, 2));
  exit(matched ? 0 : 2);
} catch (error) {
  const message = error?.name === 'AbortError'
    ? `Regional probe timed out after ${timeoutMs} ms.`
    : error instanceof Error
      ? error.message
      : String(error);
  fail(message);
} finally {
  clearTimeout(timer);
}
