import "@supabase/functions-js/edge-runtime.d.ts";
import { logger } from "../_shared/logger.ts";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default {
  async fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Create an authenticated Supabase client using the provided token
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: { user }, error: userError } = await supabaseAuthClient.auth.getUser();
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let payload;
      try {
        payload = await request.json();
      } catch (_e) {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { atendente_id } = payload;
      if (!atendente_id) {
        return new Response(JSON.stringify({ error: "atendente_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Validate permission: Is the logged user a manager of the sector this attendant belongs to?
      // Since supabaseAuthClient uses the user's JWT, RLS applies.
      // If the user has access to the attendant's sector, they can read the attendant row.
      const { data: attendant, error: attendantError } = await supabaseAuthClient
        .from("atendentes")
        .select("id")
        .eq("id", atendente_id)
        .maybeSingle();

      if (attendantError || !attendant) {
        logger.warn({ atendente_id, user_id: user.id }, "Unauthorized attempt to disconnect calendar");
        return new Response(JSON.stringify({ error: "Forbidden: Not a manager of this attendant's sector" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // We have permission. Now let's fetch the connection using Admin client to get the tokens.
      const { data: connection } = await supabaseAdmin
        .from("atendente_google_connections")
        .select("access_token, refresh_token, status")
        .eq("atendente_id", atendente_id)
        .maybeSingle();

      if (connection) {
        // Optionally try to revoke the token from Google
        const tokenToRevoke = connection.refresh_token || connection.access_token;
        if (tokenToRevoke) {
          try {
            const revokeRes = await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenToRevoke}`, {
              method: "POST",
              headers: { "Content-type": "application/x-www-form-urlencoded" }
            });
            if (!revokeRes.ok) {
              logger.warn({ status: revokeRes.status }, "Google token revocation returned non-200");
            }
          } catch (e) {
            logger.warn({ err: e instanceof Error ? e.message : String(e) }, "Failed to reach Google token revocation endpoint");
          }
        }

        // Remove the tokens and connection by deleting the row
        const { error: updateError } = await supabaseAdmin
          .from("atendente_google_connections")
          .delete()
          .eq("atendente_id", atendente_id);

        if (updateError) {
          logger.error({ updateError }, "Failed to update connection status");
          return new Response(JSON.stringify({ error: "Failed to update connection" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "Error in auth-google-disconnect");
      return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }
};
