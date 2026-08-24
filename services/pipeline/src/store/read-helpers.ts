export async function single<T>(
  request: PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T> {
  const { data, error } = await request;
  if (error) throw error;
  if (data === null) throw new Error("Expected one database row");
  return data as T;
}

export async function rows<T>(
  request: PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const { data, error } = await request;
  if (error) throw error;
  return (data ?? []) as T[];
}
