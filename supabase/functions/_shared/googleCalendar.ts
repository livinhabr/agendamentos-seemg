import { google } from "npm:googleapis@134.0.0";

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

export async function createCalendarEvent(params: CreateEventParams) {
  const { calendarId, summary, description, start, end, attendees, timezone, logger } = params;

  const clientEmail = Deno.env.get("GOOGLE_CALENDAR_CLIENT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_CALENDAR_PRIVATE_KEY");

  if (!clientEmail || !privateKey) {
    logger.warn({}, "Google Calendar credentials not configured. Skipping real calendar event creation.");
    return { error: "missing_credentials" };
  }

  try {
    const auth = new google.auth.JWT(
      clientEmail,
      undefined,
      privateKey.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar']
    );

    const calendar = google.calendar({ version: 'v3', auth });

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

    const response = await calendar.events.insert({
      calendarId,
      requestBody: eventToInsert,
      sendUpdates: attendees && attendees.length > 0 ? "all" : "none",
    });

    if (response.status >= 200 && response.status < 300 && response.data) {
      return {
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
        raw: response.data,
      };
    } else {
      logger.error({ status: response.status, data: response.data }, "Failed to create Google Calendar event");
      return { error: "api_error" };
    }
  } catch (error: any) {
    logger.error({ err: error.message }, "Exception creating Google Calendar event");
    return { error: "exception" };
  }
}

export interface CheckAvailabilityParams {
  calendarId: string;
  start: string; // ISO format
  end: string;   // ISO format
  timezone?: string;
  logger: Logger;
}

export async function checkCalendarAvailability(params: CheckAvailabilityParams) {
  const { calendarId, start, end, timezone, logger } = params;

  const clientEmail = Deno.env.get("GOOGLE_CALENDAR_CLIENT_EMAIL");
  const privateKey = Deno.env.get("GOOGLE_CALENDAR_PRIVATE_KEY");

  if (!clientEmail || !privateKey) {
    logger.warn({}, "Google Calendar credentials not configured. Returning mock available.");
    return { available: true, conflicts: [] };
  }

  try {
    const auth = new google.auth.JWT(
      clientEmail,
      undefined,
      privateKey.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/calendar']
    );
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: start,
        timeMax: end,
        timeZone: timezone || 'America/Sao_Paulo',
        items: [{ id: calendarId }]
      }
    });

    if (response.status >= 200 && response.status < 300 && response.data.calendars) {
      const busy = response.data.calendars[calendarId]?.busy || [];
      return {
        available: busy.length === 0,
        conflicts: busy
      };
    } else {
      logger.error({ status: response.status, data: response.data }, "Failed to query Google Calendar freebusy");
      return { available: false, error: "api_error", conflicts: [] };
    }
  } catch (error: any) {
    logger.error({ err: error.message }, "Exception checking Google Calendar freebusy");
    return { available: false, error: "exception", conflicts: [] };
  }
}
