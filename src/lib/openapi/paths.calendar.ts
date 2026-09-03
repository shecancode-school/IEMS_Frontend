import {
  bearer,
  errorResponse,
  jsonBody,
  jsonResponse,
  pathId,
  rangeQuery,
  str,
  strEnum,
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITY,
  EVENT_MODES,
} from "./shared";

const calendarItem = { $ref: "#/components/schemas/CalendarItem" };
const calendarFeed = { $ref: "#/components/schemas/CalendarFeed" };
const activity = { $ref: "#/components/schemas/Activity" };

const activityBody = {
  type: "object",
  required: ["title", "start", "end"],
  properties: {
    title: str({ minLength: 2 }),
    description: str(),
    type: strEnum(ACTIVITY_TYPES),
    start: str({ format: "date-time" }),
    end: str({ format: "date-time" }),
    mode: strEnum(EVENT_MODES),
    location: str(),
    visibility: strEnum(ACTIVITY_VISIBILITY),
    attendees: {
      type: "array",
      items: { type: "object", properties: { email: str({ format: "email" }), name: str() } },
    },
    eventId: str({ description: "Link the activity to a ticketed event." }),
    ownerId: str({
      description:
        "Schedule on another staff member's calendar. Requires the staff:manage capability.",
    }),
  },
};

export const calendarPaths = {
  "/api/admin/calendar": {
    get: {
      tags: ["Calendar"],
      summary: "Unified calendar feed",
      description:
        "Ticketed events, staff activities and 1:1 bookings in one date range, all normalised " +
        "to the same item shape. What comes back is scoped by role: without the " +
        "`calendar:viewAll` capability you see only yourself, and another person's PRIVATE " +
        "activity or booking is always reduced to an opaque busy block. `includeGoogle=1` adds " +
        "the CALLER'S OWN Google Calendar events — never anyone else's, and they are not stored.",
      security: bearer,
      parameters: [
        ...rangeQuery,
        {
          name: "people",
          in: "query",
          schema: str(),
          description: "Comma-separated staff ids to filter by.",
        },
        {
          name: "sources",
          in: "query",
          schema: str(),
          description: "Comma-separated subset of EVENT, ACTIVITY, BOOKING, GOOGLE.",
        },
        {
          name: "includeGoogle",
          in: "query",
          schema: strEnum(["1"]),
          description: "Include your own Google Calendar events.",
        },
      ],
      responses: {
        200: jsonResponse("The merged feed", calendarFeed),
        400: errorResponse("Bad date range, or wider than 92 days"),
        401: errorResponse("Not a staff account"),
      },
    },
  },

  "/api/admin/calendar/day": {
    get: {
      tags: ["Calendar"],
      summary: "One day, grouped into per-person lanes",
      description:
        "The general daily calendar — who is doing what today. Returns the same items as the " +
        "feed plus a `lanes` array, one per staff member, and `unassigned` for org-wide events " +
        "with no host.",
      security: bearer,
      parameters: [
        {
          name: "date",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "Kigali calendar day, YYYY-MM-DD. Defaults to today.",
        },
      ],
      responses: {
        200: jsonResponse("The day", {
          allOf: [
            calendarFeed,
            {
              type: "object",
              properties: {
                date: str({ format: "date" }),
                lanes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      person: { $ref: "#/components/schemas/CalendarPerson" },
                      items: { type: "array", items: calendarItem },
                    },
                  },
                },
                unassigned: { type: "array", items: calendarItem },
              },
            },
          ],
        }),
        400: errorResponse("Bad date"),
        401: errorResponse("Not a staff account"),
      },
    },
  },

  "/api/admin/calendar/me": {
    get: {
      tags: ["Calendar"],
      summary: "My schedule",
      description:
        "The caller's own activities, the events they host and their bookings. Their Google " +
        "Calendar is included by default here — pass `includeGoogle=0` to leave it out.",
      security: bearer,
      parameters: [
        ...rangeQuery,
        { name: "includeGoogle", in: "query", schema: strEnum(["0"]) },
      ],
      responses: {
        200: jsonResponse("Your schedule", calendarFeed),
        400: errorResponse("Bad date range"),
        401: errorResponse("Not a staff account"),
      },
    },
  },

  "/api/admin/calendar/people": {
    get: {
      tags: ["Calendar"],
      summary: "Staff roster for the calendar filter",
      description:
        "Without `calendar:viewAll` this returns only the caller, so the filter cannot be used " +
        "to enumerate the organisation.",
      security: bearer,
      responses: {
        200: jsonResponse("The roster", {
          type: "object",
          properties: {
            people: {
              type: "array",
              items: {
                allOf: [
                  { $ref: "#/components/schemas/CalendarPerson" },
                  { type: "object", properties: { isYou: { type: "boolean" } } },
                ],
              },
            },
          },
        }),
        401: errorResponse("Not a staff account"),
      },
    },
  },

  "/api/calendar/ics": {
    get: {
      tags: ["Calendar"],
      summary: "iCalendar subscription feed",
      description:
        "Called two ways. With a bearer token and no `token` query, it mints a long-lived " +
        "subscription URL for the signed-in staff member. With `?token=<ics jwt>`, it returns " +
        "the feed itself as `text/calendar` — this is the URL you paste into Google Calendar or " +
        "Outlook. The feed URL IS the credential, so treat it like a password. Your own Google " +
        "events are excluded, since the subscribing calendar already has them.",
      parameters: [
        {
          name: "token",
          in: "query",
          schema: str(),
          description: "The ICS feed token. Omit to mint one (bearer auth required).",
        },
      ],
      responses: {
        200: {
          description: "The subscription URL, or the calendar itself",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { url: str({ format: "uri" }), webcalUrl: str() },
              },
            },
            "text/calendar": { schema: str() },
          },
        },
        401: errorResponse("Missing bearer token, or an invalid feed token"),
      },
    },
  },

  "/api/admin/activities": {
    get: {
      tags: ["Calendar"],
      summary: "List activities",
      security: bearer,
      parameters: [
        ...rangeQuery,
        { name: "owner", in: "query", schema: str() },
        { name: "type", in: "query", schema: strEnum(ACTIVITY_TYPES) },
      ],
      responses: {
        200: jsonResponse("Activities", {
          type: "object",
          properties: { activities: { type: "array", items: activity } },
        }),
        400: errorResponse("Bad date range"),
        401: errorResponse("Not a staff account"),
      },
    },
    post: {
      tags: ["Calendar"],
      summary: "Schedule an activity",
      description:
        "Creates the activity and, when it is online or has attendees, mirrors it onto the " +
        "owner's Google Calendar with a Meet link. A Google failure does not fail the request — " +
        "the activity is created and `warning` explains what is missing.",
      security: bearer,
      requestBody: jsonBody(activityBody),
      responses: {
        201: jsonResponse("Created", {
          type: "object",
          properties: { activity, warning: str({ nullable: true }) },
        }),
        400: errorResponse("Invalid activity details"),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Missing the calendar:write capability"),
        404: errorResponse("The chosen owner does not exist"),
      },
    },
  },

  "/api/admin/activities/{id}": {
    get: {
      tags: ["Calendar"],
      summary: "Read an activity",
      security: bearer,
      parameters: [pathId()],
      responses: {
        200: jsonResponse("The activity", { type: "object", properties: { activity } }),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Someone else's private activity"),
        404: errorResponse("Not found"),
      },
    },
    patch: {
      tags: ["Calendar"],
      summary: "Edit an activity",
      description:
        "Owner, or the staff:manage capability. The mirrored Google event is updated in step; " +
        "if that fails the activity is marked DESYNCED rather than silently diverging.",
      security: bearer,
      parameters: [pathId()],
      requestBody: jsonBody({ ...activityBody, required: [] }),
      responses: {
        200: jsonResponse("Updated", { type: "object", properties: { activity } }),
        400: errorResponse("Invalid activity details"),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Not yours to edit"),
        404: errorResponse("Not found"),
      },
    },
    delete: {
      tags: ["Calendar"],
      summary: "Cancel an activity",
      description:
        "A soft cancel: the record is kept, it leaves the calendar, and the mirrored Google " +
        "event is deleted so nobody turns up.",
      security: bearer,
      parameters: [pathId()],
      responses: {
        200: jsonResponse("Cancelled", {
          type: "object",
          properties: { cancelled: { type: "boolean" } },
        }),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Not yours to cancel"),
        404: errorResponse("Not found"),
      },
    },
  },
} as const;
