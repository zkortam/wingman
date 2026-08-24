import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types.gen.js";

export type ServiceClient = SupabaseClient<Database>;

export function createServiceClient(
  input: {
    url?: string;
    serviceRoleKey?: string;
  } = {},
): ServiceClient {
  const url = input.url ?? process.env.SUPABASE_URL;
  const serviceRoleKey =
    input.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey)
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type { Database, Json } from "./types.gen.js";
