import { supabaseAdmin } from "./supabase.ts";

export interface Logger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

export interface CreateEventParams {
  atendente_id: string;
  calendarId: string;
  summary: string;
  description: string;
  start: string; // ISO format
  end: string;   // ISO format
  attendees?: string[];
  timezone?: string;
  logger: Logger;
}

export interface CheckAvailabilityParams {
  atendente_id: string;
  calendarId: string;
  start: string; // ISO format
  end: string;   // ISO format
  timezone?: string;
  logger: Logger;
}

/**
 * Fetch and optionally refresh the OAuth 2.0 Access Token for a given attendant.
 */
async function getOAuthToken(atendente_id: string, logger: Logger): Promise<string | null> {
  try {
    const { data: conn, error } = await supabaseAdmin
      .from("atendente_google_connections")
      .select("id, access_token, refresh_token, token_expiry, status")
      .eq("atendente_id", atendente_id)
      .eq("status", "connected")
      .maybeSingle();

    if (error || !conn) {
      logger.warn({ atendente_id }, "No active Google connection found for attendant");
      return null;
    }

    const now = new Date();
    const expiry = new Date(conn.token_expiry);
    
    // Refresh token if it expires in less than 5 minutes
    if (expiry.getTime() - now.getTime() < 5 * 60 * 1000) {
      if (!conn.refresh_token) {
        logger.error({ atendente_id }, "Token expired but no refresh_token available");
        return null;
      }

      const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
      const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

      if (!clientId || !clientSecret) {
        logger.error({}, "Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET");
        return null;
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: conn.refresh_token,
        }),
      });

      if (!tokenResponse.ok) {
        const errTxt = await tokenResponse.text();
        logger.error({ status: tokenResponse.status, errTxt }, "Failed to refresh token");
        // Mark as error
        await supabaseAdmin.from("atendente_google_connections").update({ status: "error" }).eq("id", conn.id);
        return null;
      }

      const tokenData = await tokenResponse.json();
      const newExpiry = new Date();
      newExpiry.setSeconds(newExpiry.getSeconds() + (tokenData.expires_in || 3600));

      const { error: updateError } = await supabaseAdmin
        .from("atendente_google_connections")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || conn.refresh_token, // keep old if not provided
          token_expiry: newExpiry.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);

      if (updateError) {
        logger.error({ updateError }, "Failed to save new access token to db");
      }

      return tokenData.access_token;
    }

    return conn.access_token;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, "Exception in getOAuthToken");
    return null;
  }
}

export async function createCalendarEvent(params: CreateEventParams) {
  const { atendente_id, calendarId, summary, description, start, end, attendees, timezone, logger } = params;

  const token = await getOAuthToken(atendente_id, logger);
  if (!token) return { error: "auth_failed" };

  try {
    const eventToInsert = {
      summary,
      description,
      start: {
        dateTime: start,
        timeZone: timezone || 'America/Sao_Paulo',
      },
      end: {
        dateTime: end,
        timeZone: timezone || 'America/Sao_Paulo',
      },
      attendees: attendees && attendees.length > 0 ? attendees.map(email => ({ email })) : undefined,
    };

    const sendUpdates = attendees && attendees.length > 0 ? "all" : "none";
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=${sendUpdates}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventToInsert),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        eventId: data.id,
        htmlLink: data.htmlLink,
        raw: data,
      };
    } else {
      const errTxt = await response.text();
      logger.error({ status: response.status, data: errTxt }, "Failed to create Google Calendar event");
      return { error: "api_error" };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: message }, "Exception creating Google Calendar event");
    return { error: "exception" };
  }
}

export async function checkCalendarAvailability(params: CheckAvailabilityParams) {
  const { atendente_id, calendarId, start, end, timezone, logger } = params;

  const token = await getOAuthToken(atendente_id, logger);
  if (!token) {
    // If we can't authorize, we assume not available rather than mocking available,
    // to avoid booking over a calendar we can't check.
    logger.warn({ atendente_id }, "Could not get token for attendant. Marking as unavailable.");
    return { available: false, error: "auth_failed", conflicts: [] };
  }

  try {
    const url = 'https://www.googleapis.com/calendar/v3/freeBusy';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: start,
        timeMax: end,
        timeZone: timezone || 'America/Sao_Paulo',
        items: [{ id: calendarId }]
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const busy = data.calendars?.[calendarId]?.busy || [];
      return {
        available: busy.length === 0,
        conflicts: busy
      };
    } else {
      const errTxt = await response.text();
      logger.error({ status: response.status, data: errTxt }, "Failed to query Google Calendar freebusy");
      return { available: false, error: "api_error", conflicts: [] };
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ err: message }, "Exception checking Google Calendar freebusy");
    return { available: false, error: "exception", conflicts: [] };
  }
}
