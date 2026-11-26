export type SecureConfigErrorCode =
  | 'storage_unavailable'
  | 'key_missing'
  | 'unsafe_permissions'
  | 'unsafe_location'
  | 'corrupt'
  | 'not_configured'
  | 'invalid_configuration';

/** Messages are safe to print and to return to the portal: they never contain configuration values. */
export class SecureConfigError extends Error {
  constructor(
    readonly code: SecureConfigErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SecureConfigError';
  }
}
