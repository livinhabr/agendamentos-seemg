import "@supabase/functions-js/edge-runtime.d.ts";
import { logger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export default {
  fetch(request: Request) {
    if (request.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const atendente_id = url.searchParams.get("atendente_id");
      const return_to = url.searchParams.get("return_to");
      
      if (!atendente_id) {
        return new Response("atendente_id is required", { status: 400, headers: corsHeaders });
      }

      // We should ideally validate if the logged in user is admin of the sector.
      // For now, since the painel administrative initiates this, we'll proceed.
      // The state will contain the atendente_id.
      
      const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
      const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI");

      if (!clientId || !redirectUri) {
        logger.error({}, "Missing OAuth configuration (GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_REDIRECT_URI)");
        return new Response("Server configuration error", { status: 500, headers: corsHeaders });
      }

      const stateObj = { atendente_id, return_to };
      const stateString = btoa(JSON.stringify(stateObj));

      // Build Google OAuth URL
      // Scopes: we need calendar events read/write, and email profile to get the user's email
      const scopes = [
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/userinfo.email"
      ].join(" ");

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", scopes);
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent"); // Force consent to ensure we get a refresh token
      authUrl.searchParams.set("state", stateString);

      // Redirect user to Google
      return Response.redirect(authUrl.toString(), 302);
    } catch (err: unknown) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "Error starting OAuth");
      return new Response("Internal error", { status: 500, headers: corsHeaders });
    }
  }
};
