/**
 * Server-side bridge from the encrypted store to the environment-based configuration the platform
 * already reads. Opt-in: only the secure entrypoint calls it, so tests and development are unaffected.
 * Variables already present in the environment always win, exactly as before.
 */
import { SecureConfigError } from './errors.js';
import { CONFIG_FIELDS, findProblems } from './fields.js';
import { SecureConfigStore } from './store.js';

export interface LoadResult {
  /** Names only. */
  fromStore: string[];
  fromEnvironment: string[];
}

export const loadSecureConfig = async (
  env: NodeJS.ProcessEnv = process.env,
  store?: Pick<SecureConfigStore, 'read'>,
): Promise<LoadResult> => {
  const source = store ?? (await SecureConfigStore.open());
  const document = await source.read();
  if (!document)
    throw new SecureConfigError(
      'not_configured',
      'No secure configuration has been saved yet. Run: pnpm config:portal',
    );

  const effective: Record<string, string> = {};
  const fromStore: string[] = [];
  const fromEnvironment: string[] = [];
  for (const { name } of CONFIG_FIELDS) {
    const current = env[name]?.trim();
    const saved = document.values[name];
    if (current) {
      effective[name] = current;
      fromEnvironment.push(name);
    } else if (saved !== undefined) {
      effective[name] = saved;
      fromStore.push(name);
    }
  }

  const missing = CONFIG_FIELDS.filter((f) => f.required && !effective[f.name]).map(
    (f) => `${f.name} is missing`,
  );
  // Environment-provided values keep their existing behaviour; only stored values are judged here.
  const invalid = Object.entries(findProblems(effective))
    .filter(([name]) => fromStore.includes(name))
    .map(([name, problem]) => `${name} is invalid: ${problem}`);
  const problems = [...missing, ...invalid];
  if (problems.length)
    throw new SecureConfigError(
      'invalid_configuration',
      `Secure configuration is not usable (values are never printed):\n- ${problems.join('\n- ')}\nRun: pnpm config:portal`,
    );

  for (const name of fromStore) env[name] = effective[name];
  return { fromStore, fromEnvironment };
};
