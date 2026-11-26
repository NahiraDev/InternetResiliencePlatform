import { CONFIG_FIELDS, loadSecureConfig } from '@irp/config/secure';

/** Removes configured secrets from a message before it reaches a terminal or log. */
export const redactConfigValues = (message: string, env: NodeJS.ProcessEnv): string => {
  const secrets: string[] = [];
  for (const { name, sensitive } of CONFIG_FIELDS) {
    const value = env[name];
    if (!sensitive || !value) continue;
    secrets.push(value);
    try {
      const url = new URL(value);
      for (const password of [url.password, url.searchParams.get('password')]) {
        if (!password) continue;
        secrets.push(password);
        try {
          secrets.push(decodeURIComponent(password));
        } catch {
          // malformed escape: the raw form is already collected
        }
      }
    } catch {
      // not a URL
    }
  }
  return secrets
    .filter((secret) => secret.length >= 4)
    .sort((a, b) => b.length - a.length)
    .reduce((text, secret) => text.split(secret).join('[REDACTED]'), message);
};

/**
 * Loads the locally stored configuration, then applies the defaults of a local production start.
 * The existing fail-closed checks of the API still run afterwards.
 */
export const prepareSecureEnvironment = async (
  env: NodeJS.ProcessEnv = process.env,
  store?: Parameters<typeof loadSecureConfig>[1],
) => {
  const result = await loadSecureConfig(env, store);
  env.NODE_ENV ||= 'production';
  env.API_HOST ||= '127.0.0.1';
  return result;
};
