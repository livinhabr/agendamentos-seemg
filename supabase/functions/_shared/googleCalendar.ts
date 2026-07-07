import * as jose from "npm:jose";

export interface Logger {
  info: (obj: any, msg?: string) => void;
  warn: (obj: any, msg?: string) => void;
  error: (obj: any, msg?: string) => void;
}

export interface CreateEventParams {
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
  calendarId: string;
  start: string; // ISO format
  end: string;   // ISO format
  timezone?: string;
  logger: Logger;
}

/**
 * Generate a Google OAuth 2.0 Access Token using a Service Account JWT.
 */
async function getAccessToken(clientEmail: string, privateKey: string, logger: Logger): Promise<string | null> {
  try {
    const alg = 'RS256';
    const cleanKey = privateKey.replace(/\\n/g, '\n');
    const privateKeyObj = await jose.importPKCS8(cleanKey, alg);

    const jwt = await new jose.SignJWT({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token',
    })
      .setProtectedHeader({ alg, typ: 'JWT' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKeyObj);

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    if (!tokenResponse.ok) {
      const errTxt = await tokenResponse.text();
      logger.error({ status: tokenResponse.status, errTxt }, "Failed to get Google Access Token");
      return null;
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  } catch (err: any) {
    logger.error({ err: err.message }, "Exception in getAccessToken");
    return null;
  }
}

export async function createCalendarEvent(params: CreateEventParams) {
  const { calendarId, summary, description, start, end, attendees, timezone, logger } = params;

  const clientEmail = Deno.env.get("GOOGLE_CALENDAR_CLIENT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_CALENDAR_PRIVATE_KEY")?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    logger.warn({}, "Google Calendar credentials not configured. Skipping real calendar event creation.");
    return { error: "missing_credentials" };
  }

  const token = await getAccessToken(clientEmail, privateKey, logger);
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
  } catch (error: any) {
    logger.error({ err: error.message }, "Exception creating Google Calendar event");
    return { error: "exception" };
  }
}

export async function checkCalendarAvailability(params: CheckAvailabilityParams) {
  const { calendarId, start, end, timezone, logger } = params;

  const clientEmail = Deno.env.get("GOOGLE_CALENDAR_CLIENT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_CALENDAR_PRIVATE_KEY")?.replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey) {
    logger.warn({}, "Google Calendar credentials not configured. Returning mock available.");
    return { available: true, conflicts: [] };
  }

  const token = await getAccessToken(clientEmail, privateKey, logger);
  if (!token) return { available: false, error: "auth_failed", conflicts: [] };

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
  } catch (error: any) {
    logger.error({ err: error.message }, "Exception checking Google Calendar freebusy");
    return { available: false, error: "exception", conflicts: [] };
  }
}
