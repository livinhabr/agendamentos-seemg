import { google } from "googleapis";
import { env } from "../env";
import { FastifyBaseLogger } from "fastify";

export interface CreateEventParams {
  calendarId: string;
  summary: string;
  description: string;
  start: string; // ISO format
  end: string;   // ISO format
  attendees?: string[];
  timezone?: string;
  logger: FastifyBaseLogger;
}

export async function createCalendarEvent(params: CreateEventParams) {
  const { calendarId, summary, description, start, end, attendees, timezone, logger } = params;

  if (!env.GOOGLE_CALENDAR_CLIENT_EMAIL || !env.GOOGLE_CALENDAR_PRIVATE_KEY) {
    logger.warn("Google Calendar credentials not configured. Skipping real calendar event creation.");
    return { error: "missing_credentials" };
  }

  try {
    const privateKey = env.GOOGLE_CALENDAR_PRIVATE_KEY.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_CALENDAR_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

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
  logger: FastifyBaseLogger;
}

export async function checkCalendarAvailability(params: CheckAvailabilityParams) {
  const { calendarId, start, end, timezone, logger } = params;

  if (!env.GOOGLE_CALENDAR_CLIENT_EMAIL || !env.GOOGLE_CALENDAR_PRIVATE_KEY) {
    logger.warn("Google Calendar credentials not configured. Returning mock available.");
    return { available: true, conflicts: [] };
  }

  try {
    const privateKey = env.GOOGLE_CALENDAR_PRIVATE_KEY.replace(/\\n/g, '\n');

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: env.GOOGLE_CALENDAR_CLIENT_EMAIL,
        private_key: privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

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
