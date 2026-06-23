import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

// Admin client for backend operations (e.g. validating existence of records)
// NEVER SEND TO FRONTEND OR LOG IT
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper to get user from Bearer token
export async function getUserFromToken(token: string) {
  // Create a temporary client with just the anon key to hit the auth API
  const authClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  
  const { data, error } = await authClient.auth.getUser(token);
  return { user: data.user, error };
}
