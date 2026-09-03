import { errorResponse, jsonBody, jsonResponse, str, strEnum } from "./shared";

/* The integration surface: what someone embedding the organisation's calendar
   in their own website actually calls. Key-authenticated, versioned, and
   documented publicly — an integrator has to be able to read this without an
   account, or the key is useless to them. */

const apiKeyAuth = [{ apiKeyAuth: [] }];

export const integrationPaths = {
  "/api/v1/calendar": {
    get: {
      tags: ["Booking"],
      summary: "The organisation's calendar",
      description:
        "Published events and public staff sessions in one chronological list — the feed to " +
        "embed in another site.\n\n" +
        "Send your key as an `x-api-key` header. Request one at " +
        "[/docs](/docs); an administrator reviews each request.\n\n" +
        "Two kinds of item come back. `EVENT` is a ticketed event people register for and " +
        "carries a `url`, a `price` and capacity numbers. `ACTIVITY` is a session a staff " +
        "member published — a class, mentorship slot or office hours — with a `host` and no " +
        "registration. Sessions a staff member did not mark public never appear here.\n\n" +
        "All times are RFC 3339 instants; `day` is the Africa/Kigali calendar day, so you can " +
        "bucket by date without re-deriving the timezone.",
      security: apiKeyAuth,
      parameters: [
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "First Kigali day, YYYY-MM-DD. Defaults to today.",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "Last Kigali day, inclusive. Defaults to 90 days out; 366 days maximum.",
        },
      ],
      responses: {
        200: jsonResponse("The calendar", {
          type: "object",
          properties: {
            from: str({ format: "date" }),
            to: str({ format: "date" }),
            timezone: str({ example: "Africa/Kigali" }),
            count: { type: "integer" },
            items: { type: "array", items: { $ref: "#/components/schemas/CalendarFeedItem" } },
          },
        }),
        400: errorResponse("Bad date range, or wider than 366 days"),
        401: errorResponse("Missing or invalid API key"),
        403: errorResponse("The key does not carry the calendar:read scope"),
        429: errorResponse("Rate limit reached — see the Retry-After header"),
      },
    },
  },

  "/api/v1/availability": {
    get: {
      tags: ["Booking"],
      summary: "When bookable staff are busy",
      description:
        "Merged busy intervals for the people who publish a booking page, so you can show a " +
        "next-open-time on your own site without scraping ours.\n\n" +
        "**Times only.** No titles, no attendees, no locations, no organiser — what someone is " +
        "doing at 2pm is not part of this feed. Only staff who have published a booking page " +
        "appear at all, and their intervals are merged, so two back-to-back meetings read as " +
        "one block rather than revealing how many separate things they have on.\n\n" +
        "`complete: false` on a host means their Google calendar could not be read, so the " +
        "blocks are their IEMS bookings alone and a time shown as open may already be taken. " +
        "The booking itself is re-checked server-side, so a stale answer costs a rejected " +
        "attempt rather than a double-booking.\n\n" +
        "Requires the `calendar:freebusy` scope, which is granted separately from " +
        "`calendar:read`.",
      security: apiKeyAuth,
      parameters: [
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "First Kigali day, YYYY-MM-DD. Defaults to today.",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date" },
          description:
            "Last Kigali day, inclusive. Defaults to 14 days out; 62 days maximum, because " +
            "each day is a live free/busy read per host.",
        },
        {
          name: "host",
          in: "query",
          schema: str(),
          description: "One host's booking slug. Omit for everyone who is bookable.",
        },
      ],
      responses: {
        200: jsonResponse("Busy intervals per host", {
          type: "object",
          properties: {
            from: str({ format: "date" }),
            to: str({ format: "date" }),
            timezone: str({ example: "Africa/Kigali" }),
            hosts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  host: str({ description: "Their public booking slug." }),
                  name: str(),
                  slotMinutes: { type: "integer" },
                  busy: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        start: str({ format: "date-time" }),
                        end: str({ format: "date-time" }),
                      },
                    },
                  },
                  complete: {
                    type: "boolean",
                    description: "False when their Google calendar could not be read.",
                  },
                },
              },
            },
          },
        }),
        400: errorResponse("Bad date range, or wider than 62 days"),
        401: errorResponse("Missing or invalid API key"),
        403: errorResponse("The key does not carry the calendar:freebusy scope"),
        404: errorResponse("No bookable host with that slug"),
        429: errorResponse("Rate limit reached — see the Retry-After header"),
      },
    },
  },

  "/api/public/api-keys/request": {
    post: {
      tags: ["Public"],
      summary: "Request an API key",
      description:
        "Ask for access to the integration feed. No authentication — this is how an outside " +
        "developer gets started.\n\n" +
        "It never returns a key: an administrator reviews every request and the key is emailed " +
        "on approval. Limited to three requests per hour per address.",
      requestBody: jsonBody({
        type: "object",
        required: ["label", "contactName", "contactEmail", "purpose"],
        properties: {
          label: str({ minLength: 2, maxLength: 80, description: "What you are building." }),
          contactName: str({ minLength: 2, maxLength: 120 }),
          contactEmail: str({ format: "email", description: "Where the key will be sent." }),
          organisation: str({ maxLength: 120 }),
          website: str({ maxLength: 200, description: "Where the calendar will appear." }),
          purpose: str({
            minLength: 10,
            maxLength: 1000,
            description: "What the data will be used for.",
          }),
        },
      }),
      responses: {
        201: jsonResponse("Request received", {
          type: "object",
          properties: {
            requested: { type: "boolean" },
            id: str(),
            message: str(),
          },
        }),
        200: jsonResponse("You already have a request awaiting review", {
          type: "object",
          properties: { requested: { type: "boolean" }, message: str() },
        }),
        400: errorResponse("Missing or invalid details"),
        429: errorResponse("Too many requests — three per hour"),
      },
    },
  },
} as const;

/* the item shape both kinds share */
export const integrationSchemas = {
  CalendarFeedItem: {
    type: "object",
    properties: {
      id: str(),
      kind: strEnum(["EVENT", "ACTIVITY"]),
      title: str(),
      category: str({
        nullable: true,
        description: "Programme area. Null for staff sessions, which have no category.",
      }),
      type: str({ description: "WORKSHOP, BOOTCAMP… for events; CLASS, MENTORSHIP… for sessions." }),
      host: str({ nullable: true, description: "Who is running it." }),
      start: str({ format: "date-time" }),
      end: str({ format: "date-time", nullable: true }),
      day: str({ format: "date", description: "The Africa/Kigali calendar day." }),
      location: str({ description: '"Online" for online sessions.' }),
      price: str({ description: "Empty for sessions — there is nothing to pay." }),
      status: strEnum(["Upcoming", "Ongoing", "Completed", "Full"]),
      capacity: { type: "integer", nullable: true, description: "Null when uncapped." },
      remaining: { type: "integer", nullable: true },
      url: str({ nullable: true, description: "Event page path; null for sessions." }),
    },
  },
} as const;
