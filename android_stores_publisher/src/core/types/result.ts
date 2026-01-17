export type Result<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(
  code: string,
  message: string,
  details?: unknown,
): Result<never> {
  return { ok: false, error: { code, message, details } };
}

