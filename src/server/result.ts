// A tiny Result type so services can report *expected* failures (invalid input,
// a taken username) as values instead of throwing. Unexpected failures still
// throw. Callers narrow on `ok`.
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
