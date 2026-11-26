import { hashPassword } from '@irp/auth';
import type { SecureConfigStore } from '@irp/config/secure';

/** Same strength rule as platform account passwords (apps/api/src/index.ts). */
export const adminPasswordProblem = (password: string): string | undefined =>
  password.length >= 12 &&
  password.length <= 256 &&
  /[A-Z]/.test(password) &&
  /[a-z]/.test(password) &&
  /[0-9]/.test(password)
    ? undefined
    : 'Use 12-256 characters with upper case, lower case and a digit.';

export const setAdminPassword = async (
  store: Pick<SecureConfigStore, 'update'>,
  password: string,
): Promise<void> => {
  const problem = adminPasswordProblem(password);
  if (problem) throw new Error(problem);
  const adminPasswordHash = hashPassword(password);
  await store.update((current) => ({ ...current, adminPasswordHash }));
};
