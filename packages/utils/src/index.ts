export const sleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
export const nowIso = (): string => new Date().toISOString();
export const isDefined = <T>(value: T | undefined | null): value is T => value !== undefined && value !== null;
