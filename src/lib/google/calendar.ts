import { randomUUID } from "node:crypto";
import { CALENDAR_API } from "./config";
import { GoogleApiError, GoogleAuthError, isRetryable } from "./errors";
import { requireGoogleSession, type GoogleSession } from "./tokens";
import { cached, invalidateAdmin } from "./cache";
import { toInterval, type GoogleDate, type Interval } from "./normalize";

export type { Interval };

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: GoogleDate;
  end?: GoogleDate;
  conferenceData?: {
    entryPoints?: { entryPointType?: string; uri?: string }[];
    createRequest?: { status?: { statusCode?: string } };
  };
};

/* One place where a Google HTTP call happens, so retry, error typing and the
   401-means-reconnect rule are all decided once. */
async function call<T>(
  session: GoogleSession,
  path: string,
  init: RequestInit = {},
  attempt = 0
): Promise<T> {
  const res = await fetch(`${CALENDAR_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (res.ok) return (res.status === 204 ? undefined : await res.json()) as T;

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; errors?: { reason?: string }[] };
  };
  const reason = body.error?.errors?.[0]?.reason ?? "";
  const message = body.error?.message ?? `Google Calendar returned ${res.status}`;

  /* the token was refreshed moments ago by getGoogleSession, so a 401 here
     means the grant itself is gone, not that we simply need a new token */
  if (res.status === 401) throw new GoogleAuthError();

  if (isRetryable(res.status, reason) && attempt < 2) {
    const backoff = 250 * 2 ** attempt + Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, backoff));
    return call<T>(session, path, init, attempt + 1);
  }

  throw new GoogleApiError(message, res.status, reason);
}

/* Opaque busy blocks — no titles, no attendees, nothing personal. This is the
   only thing we ever read from someone else's calendar. */
export async function freeBusy(
  adminId: string,
  timeMin: Date,
  timeMax: Date
): Promise<Interval[]> {
  const key = `${adminId}|busy|${timeMin.toISOString()}|${timeMax.toISOString()}`;
  return cached(key, async () => {
    const session = await requireGoogleSession(adminId);
    const data = await call<{
      calendars?: Record<string, { busy?: { start: string; end: string }[] }>;
    }>(session, "/freeBusy", {
      method: "POST",
      body: JSON.stringify({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: session.calendarId }],
      }),
    });
    const busy = data.calendars?.[session.calendarId]?.busy ?? [];
    return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
  });
}

export type NormalizedGoogleEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string;
  meetLink: string | null;
  htmlLink: string | null;
};

/* The caller's OWN events, with titles. Never fetched for anyone else and
   never written to the database — see docs and the /api/calendar guard. */
export async function listEvents(
  adminId: string,
  timeMin: Date,
  timeMax: Date
): Promise<NormalizedGoogleEvent[]> {
  const key = `${adminId}|events|${timeMin.toISOString()}|${timeMax.toISOString()}`;
  return cached(key, async () => {
    const session = await requireGoogleSession(adminId);
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const data = await call<{ items?: GoogleEvent[] }>(
      session,
      `/calendars/${encodeURIComponent(session.calendarId)}/events?${params}`
    );

    return (data.items ?? [])
      .filter((e) => e.status !== "cancelled")
      .flatMap((e) => {
        const interval = toInterval(e.start, e.end);
        if (!interval) return [];
        return [
          {
            id: e.id,
            title: e.summary ?? "(no title)",
            start: interval.start,
            end: interval.end,
            allDay: Boolean(e.start?.date),
            location: e.location ?? "",
            meetLink: meetLinkOf(e),
            htmlLink: e.htmlLink ?? null,
          },
        ];
      });
  });
}

function meetLinkOf(e: GoogleEvent): string | null {
  if (e.hangoutLink) return e.hangoutLink;
  const entry = e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video");
  return entry?.uri ?? null;
}

export type InsertEventInput = {
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  attendees?: { email: string; name?: string }[];
  withMeet?: boolean;
  /* "all" lets Google send its own invitations; "none" when we send our own
     branded email and a second Google invite would just be noise */
  sendUpdates?: "all" | "none";
};

export type InsertedEvent = { id: string; meetLink: string | null; htmlLink: string | null };

export async function insertEvent(
  adminId: string,
  input: InsertEventInput
): Promise<InsertedEvent> {
  const session = await requireGoogleSession(adminId);
  const params = new URLSearchParams({
    sendUpdates: input.sendUpdates ?? "none",
    ...(input.withMeet ? { conferenceDataVersion: "1" } : {}),
  });

  const created = await call<GoogleEvent>(
    session,
    `/calendars/${encodeURIComponent(session.calendarId)}/events?${params}`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: input.title,
        description: input.description ?? "",
        location: input.location ?? "",
        start: { dateTime: input.start.toISOString(), timeZone: "Africa/Kigali" },
        end: { dateTime: input.end.toISOString(), timeZone: "Africa/Kigali" },
        attendees: (input.attendees ?? []).map((a) => ({
          email: a.email,
          displayName: a.name,
        })),
        ...(input.withMeet
          ? {
              conferenceData: {
                createRequest: {
                  requestId: randomUUID(),
                  conferenceSolutionKey: { type: "hangoutsMeet" },
                },
              },
            }
          : {}),
      }),
    }
  );

  invalidateAdmin(adminId);

  let meetLink = meetLinkOf(created);
  /* conferenceData.createRequest is asynchronous: the insert can return with
     status "pending" and no link yet. One short re-read usually has it; if not
     we store null rather than blocking the caller, and the link is filled in
     the next time the event is read. */
  if (input.withMeet && !meetLink) {
    await new Promise((r) => setTimeout(r, 1200));
    const refetched = await getEvent(adminId, created.id).catch(() => null);
    meetLink = refetched ? meetLinkOf(refetched) : null;
  }

  return { id: created.id, meetLink, htmlLink: created.htmlLink ?? null };
}

export async function getEvent(adminId: string, eventId: string): Promise<GoogleEvent> {
  const session = await requireGoogleSession(adminId);
  return call<GoogleEvent>(
    session,
    `/calendars/${encodeURIComponent(session.calendarId)}/events/${encodeURIComponent(eventId)}`
  );
}

export async function patchEvent(
  adminId: string,
  eventId: string,
  patch: Partial<{ summary: string; description: string; location: string; start: Date; end: Date }>
): Promise<void> {
  const session = await requireGoogleSession(adminId);
  await call(
    session,
    `/calendars/${encodeURIComponent(session.calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.location !== undefined ? { location: patch.location } : {}),
        ...(patch.start ? { start: { dateTime: patch.start.toISOString(), timeZone: "Africa/Kigali" } } : {}),
        ...(patch.end ? { end: { dateTime: patch.end.toISOString(), timeZone: "Africa/Kigali" } } : {}),
      }),
    }
  );
  invalidateAdmin(adminId);
}

/* Deleting an event that is already gone is a success, not a failure — the
   desired end state is "not on the calendar". */
export async function deleteEvent(adminId: string, eventId: string): Promise<void> {
  const session = await requireGoogleSession(adminId);
  try {
    await call(
      session,
      `/calendars/${encodeURIComponent(session.calendarId)}/events/${encodeURIComponent(eventId)}`,
      { method: "DELETE" }
    );
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return;
    throw err;
  } finally {
    invalidateAdmin(adminId);
  }
}
