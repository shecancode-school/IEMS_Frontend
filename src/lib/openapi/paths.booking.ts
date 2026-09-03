import {
  errorResponse,
  jsonBody,
  jsonResponse,
  str,
  strEnum,
} from "./shared";

/* The public booking surface. Every endpoint here is unauthenticated by
   design — a visitor booking time with a facilitator is not signed in to
   anything — which is exactly why these paths, and only these, are safe to
   publish in the integration spec at /api/openapi.json. */

const host = { $ref: "#/components/schemas/BookingHost" };
const slotDay = { $ref: "#/components/schemas/SlotDay" };

export const bookingPaths = {
  "/api/book/hosts": {
    get: {
      tags: ["Booking"],
      summary: "Who can be booked",
      description:
        "Staff members who have opted in to bookings. Only public details are returned — never " +
        "an email address.",
      responses: {
        200: jsonResponse("Bookable people", {
          type: "object",
          properties: { hosts: { type: "array", items: host } },
        }),
      },
    },
  },

  "/api/book/{slug}/slots": {
    get: {
      tags: ["Booking"],
      summary: "Free slots for one person",
      description:
        "Computed from their weekly hours minus their live Google free/busy, existing bookings, " +
        "blackouts, the required notice period and the booking horizon. `complete: false` means " +
        "their Google calendar could not be read, so the times may not all genuinely be free.",
      parameters: [
        {
          name: "slug",
          in: "path",
          required: true,
          schema: str(),
          description: "The host's public booking slug.",
        },
        {
          name: "from",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "First Kigali day. Defaults to today.",
        },
        {
          name: "to",
          in: "query",
          schema: { type: "string", format: "date" },
          description: "Last Kigali day, inclusive. At most 31 days after `from`.",
        },
      ],
      responses: {
        200: jsonResponse("Free slots", {
          type: "object",
          properties: {
            slug: str(),
            name: str(),
            timezone: str({ example: "Africa/Kigali" }),
            slotMinutes: { type: "integer" },
            from: str({ format: "date" }),
            to: str({ format: "date" }),
            days: { type: "array", items: slotDay },
            complete: { type: "boolean" },
          },
        }),
        400: errorResponse("Bad date range, or wider than 31 days"),
        404: errorResponse("No such booking page"),
      },
    },
  },

  "/api/book/{slug}": {
    post: {
      tags: ["Booking"],
      summary: "Book a slot",
      description:
        "`start` must be the exact start of a currently free slot. It is re-checked against the " +
        "host's live availability before the booking is written — the list you were shown may " +
        "be a minute stale — and a unique index makes two simultaneous requests for the same " +
        "time resolve to one success and one 409. On success both parties are emailed, and the " +
        "meeting is put on the host's Google Calendar with a Meet link where possible.",
      parameters: [{ name: "slug", in: "path", required: true, schema: str() }],
      requestBody: jsonBody({
        type: "object",
        required: ["name", "email", "start"],
        properties: {
          name: str({ minLength: 2, maxLength: 120 }),
          email: str({ format: "email" }),
          phone: str({ maxLength: 40 }),
          topic: str({ maxLength: 500, description: "What they want to talk about." }),
          start: str({ format: "date-time" }),
        },
      }),
      responses: {
        201: jsonResponse("Booked", {
          type: "object",
          properties: {
            booking: {
              type: "object",
              properties: {
                id: str(),
                start: str({ format: "date-time" }),
                end: str({ format: "date-time" }),
                hostName: str(),
                meetLink: str({ nullable: true }),
                cancelUrl: str({ format: "uri" }),
              },
            },
          },
        }),
        400: errorResponse("Missing or invalid details"),
        404: errorResponse("No such booking page"),
        409: errorResponse("That time is no longer available"),
        429: errorResponse("Too many booking attempts — 5 per minute per IP"),
      },
    },
  },

  "/api/book/cancel/{token}": {
    get: {
      tags: ["Booking"],
      summary: "Look up a booking by its cancellation token",
      description: "Powers the confirmation page behind the emailed cancel link.",
      parameters: [{ name: "token", in: "path", required: true, schema: str() }],
      responses: {
        200: jsonResponse("The booking", {
          type: "object",
          properties: { booking: { $ref: "#/components/schemas/CancellableBooking" } },
        }),
        404: errorResponse("Unknown or already-removed token"),
      },
    },
    post: {
      tags: ["Booking"],
      summary: "Cancel a booking",
      description:
        "Idempotent — following the emailed link twice confirms rather than erroring. The " +
        "Google Calendar entry is deleted, the slot is released, and both parties are emailed.",
      parameters: [{ name: "token", in: "path", required: true, schema: str() }],
      responses: {
        200: jsonResponse("Cancelled", {
          type: "object",
          properties: {
            cancelled: { type: "boolean" },
            alreadyCancelled: { type: "boolean" },
          },
        }),
        404: errorResponse("Unknown token"),
      },
    },
  },

  "/api/events/{id}/ics": {
    get: {
      tags: ["Booking"],
      summary: "Add an event to your calendar",
      description:
        "An iCalendar file for one published event, by id or slug. Public — it carries the same " +
        "information as the event page.",
      parameters: [
        { name: "id", in: "path", required: true, schema: str(), description: "Event id or slug" },
      ],
      responses: {
        200: { description: "The calendar file", content: { "text/calendar": { schema: str() } } },
        404: errorResponse("No such published event"),
      },
    },
  },

  "/api/admin/bookings": {
    get: {
      tags: ["Booking"],
      summary: "Bookings you host",
      description:
        "With `calendar:viewAll` you may pass `host` to read someone else's. Without it the " +
        "parameter is ignored rather than rejected, so a stale link degrades to your own list.",
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: "status", in: "query", schema: strEnum(["PENDING", "CONFIRMED", "CANCELLED"]) },
        { name: "host", in: "query", schema: str() },
        { name: "from", in: "query", schema: { type: "string", format: "date" } },
        { name: "to", in: "query", schema: { type: "string", format: "date" } },
      ],
      responses: {
        200: jsonResponse("Your bookings", {
          type: "object",
          properties: {
            hostName: str({ nullable: true }),
            bookings: {
              type: "array",
              items: { $ref: "#/components/schemas/AdminBooking" },
            },
          },
        }),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Not allowed to host bookings"),
      },
    },
  },

  "/api/admin/bookings/{id}": {
    get: {
      tags: ["Booking"],
      summary: "One booking, with the requester's details",
      description:
        "The host and administrators only. Everyone else sees the anonymous busy block the " +
        "calendar feed already returns — a booking carries someone else's name, email and topic.",
      security: [{ bearerAuth: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      responses: {
        200: jsonResponse("The booking", {
          type: "object",
          properties: { booking: { $ref: "#/components/schemas/AdminBooking" } },
        }),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Not your booking"),
        404: errorResponse("Not found"),
      },
    },
    patch: {
      tags: ["Booking"],
      summary: "Move a booking to another time",
      description:
        "The new slot is recomputed from the host's rules and live free/busy exactly as a new " +
        "booking is — working here is not a reason to be allowed to double-book a colleague. " +
        "The Google entry is patched rather than replaced so an already-emailed Meet link keeps " +
        "working, and both sides are emailed the new time. The requester's cancel link is " +
        "reissued, which retires the one in the original email.",
      security: [{ bearerAuth: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      requestBody: jsonBody({
        type: "object",
        required: ["start"],
        properties: { start: { type: "string", format: "date-time" } },
      }),
      responses: {
        200: jsonResponse("Moved", {
          type: "object",
          properties: { booking: { $ref: "#/components/schemas/AdminBooking" } },
        }),
        400: errorResponse("Not a valid time"),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Not your booking"),
        404: errorResponse("Not found"),
        409: errorResponse("That time is not available, or the booking is cancelled"),
      },
    },
    delete: {
      tags: ["Booking"],
      summary: "Cancel a booking as the host",
      security: [{ bearerAuth: [] }],
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      responses: {
        200: jsonResponse("Cancelled", {
          type: "object",
          properties: {
            cancelled: { type: "boolean" },
            alreadyCancelled: { type: "boolean" },
          },
        }),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Not your booking"),
        404: errorResponse("Not found"),
      },
    },
  },

  "/api/admin/availability": {
    get: {
      tags: ["Booking"],
      summary: "Your booking rules",
      description:
        "Returns sensible defaults rather than a 404 when you have never set them up, so the " +
        "settings page always has something to render.",
      security: [{ bearerAuth: [] }],
      responses: {
        200: jsonResponse("Your availability", {
          type: "object",
          properties: { availability: { $ref: "#/components/schemas/Availability" } },
        }),
        401: errorResponse("Not a staff account"),
      },
    },
    put: {
      tags: ["Booking"],
      summary: "Save your booking rules",
      security: [{ bearerAuth: [] }],
      requestBody: jsonBody({ $ref: "#/components/schemas/Availability" }),
      responses: {
        200: jsonResponse("Saved", {
          type: "object",
          properties: { availability: { $ref: "#/components/schemas/Availability" } },
        }),
        400: errorResponse("Invalid settings, or bookable with no weekly hours"),
        401: errorResponse("Not a staff account"),
        403: errorResponse("Missing the bookings:host capability"),
        409: errorResponse("That booking link is already taken"),
      },
    },
  },
} as const;
