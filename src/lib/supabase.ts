import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// No public/anonymous client is needed: petition data only crosses our server API.
let client: SupabaseClient | undefined;

export function getSupabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  client = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, {
        ...init,
        cache: "no-store",
        signal: init?.signal ?? AbortSignal.timeout(10_000),
      }),
    },
  });
  return client;
}
