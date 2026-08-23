/** Supabase reports failures as a plain `{ message }` object rather than an Error,
 *  so rethrowing it directly loses the stack and defeats `instanceof Error` checks. */
export function databaseError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error);
  return new Error(message, { cause: error });
}

export async function single<T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw databaseError(error);
  if (data === null) throw new Error("Expected one database row");
  return data as T;
}

export async function rows<T>(
  request: PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await request;
  if (error) throw databaseError(error);
  return (data ?? []) as T[];
}
