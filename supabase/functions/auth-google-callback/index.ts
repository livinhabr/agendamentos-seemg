import "@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabase.ts";
import { logger } from "../_shared/logger.ts";

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
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      
      if (!code || !state) {
        return new Response("Missing code or state", { status: 400, headers: corsHeaders });
      }

      // Decode state
      let stateObj: Record<string, unknown>;
      try {
        stateObj = JSON.parse(atob(state));
      } catch (_e) {
        return new Response("Invalid state", { status: 400, headers: corsHeaders });
      }

      const atendente_id = stateObj.atendente_id as string;
      const return_to = stateObj.return_to as string | undefined;
      if (!atendente_id) {
        return new Response("Invalid state: missing atendente_id", { status: 400, headers: corsHeaders });
      }

      const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
      const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");

      if (!clientId || !clientSecret || !redirectUri) {
        logger.error({}, "Missing OAuth configuration (client_id, client_secret or redirect_uri)");
        return new Response("Server configuration error", { status: 500, headers: corsHeaders });
      }

      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        logger.error({ tokenData }, "Error exchanging code for token");
        return new Response("Failed to obtain tokens from Google", { status: 400, headers: corsHeaders });
      }

      // Fetch user profile to get email
      const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const profileData = await profileResponse.json();

      if (!profileResponse.ok) {
        logger.error({ profileData }, "Error fetching user profile from Google");
        return new Response("Failed to fetch user profile", { status: 400, headers: corsHeaders });
      }

      // We have tokens and email. Upsert to public.atendente_google_connections
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + (tokenData.expires_in || 3600));

      const connectionData = {
        atendente_id,
        google_email: profileData.email,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token, // might be undefined if not first auth
        token_expiry: expiryDate.toISOString(),
        scope: tokenData.scope,
        status: "connected",
        updated_at: new Date().toISOString(),
      };

      // Since refresh_token is only sent on first auth (or when prompt=consent),
      // we should not overwrite it with null if it's not present.
      
      const { data: existing } = await supabaseAdmin
        .from("atendente_google_connections")
        .select("id, refresh_token")
        .eq("atendente_id", atendente_id)
        .maybeSingle();

      const upsertData: Record<string, unknown> = { ...connectionData };

      if (existing) {
        upsertData.id = existing.id;
        if (!upsertData.refresh_token) {
          upsertData.refresh_token = existing.refresh_token; // keep old refresh token
        }
      } else {
        if (!upsertData.refresh_token) {
          logger.warn({ atendente_id }, "No refresh token received on first connect. This may cause issues later.");
        }
      }

      const { error: upsertError } = await supabaseAdmin
        .from("atendente_google_connections")
        .upsert(upsertData, { onConflict: "atendente_id" });

      if (upsertError) {
        logger.error({ upsertError }, "Error saving Google connection to database");
        return new Response("Failed to save connection", { status: 500, headers: corsHeaders });
      }

      // Redirect back to frontend
      const fallbackUrl = Deno.env.get("FRONTEND_URL") || Deno.env.get("PUBLIC_BASE_URL") || "http://localhost:8080/equipe-agenda";
      const finalRedirectUrl = return_to || fallbackUrl;
      return Response.redirect(finalRedirectUrl, 302);
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "Error in OAuth callback");
      return new Response("Internal error", { status: 500, headers: corsHeaders });
    }
  }
};
