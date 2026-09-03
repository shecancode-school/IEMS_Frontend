/* The pre-existing API surface: public event reads, attendee auth and
   registration, plus-one invitations, gate scanning and the admin console.

   Moved here verbatim when the spec was split into modules — the calendar,
   booking and Google endpoints live in their own files alongside this one. */

import {
  bearer,
  errorResponse,
  jsonBody,
  jsonResponse,
  str,
  strEnum,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_TYPES,
  GENDERS,
  GUEST_TYPES,
  PARTICIPANT_STATUSES,
  NOTIFICATION_KINDS,
  NOTIFICATION_SEVERITIES,
  STACKS,
  TICKET_STATUSES,
} from "./shared";

export const corePaths = {
    /* --------------------------------------------------- Public event reads */
    "/api/events/upcoming": {
      get: {
        tags: ["Public"],
        summary: "Upcoming events",
        description: "Published events that haven't started yet, soonest first.",
        responses: {
          200: jsonResponse("Upcoming events", {
            type: "object",
            properties: {
              events: { type: "array", items: { $ref: "#/components/schemas/PublicEvent" } },
            },
          }),
        },
      },
    },
    "/api/events/by-date": {
      get: {
        tags: ["Public"],
        summary: "Events on a date",
        parameters: [
          {
            name: "date",
            in: "query",
            required: true,
            schema: str({ format: "date", example: "2026-07-18" }),
            description: "Calendar day in YYYY-MM-DD.",
          },
        ],
        responses: {
          200: jsonResponse("Events that day", {
            type: "object",
            properties: {
              date: str(),
              events: { type: "array", items: { $ref: "#/components/schemas/PublicEvent" } },
            },
          }),
          400: errorResponse("Missing or malformed date"),
        },
      },
    },
    "/api/events/{id}": {
      parameters: [
        { name: "id", in: "path", required: true, schema: str(), description: "Event id or slug." },
      ],
      get: {
        tags: ["Public"],
        summary: "Get event by id or slug",
        responses: {
          200: jsonResponse("The event", {
            type: "object",
            properties: { event: { $ref: "#/components/schemas/PublicEvent" } },
          }),
          404: errorResponse("Event not found"),
        },
      },
    },
    "/api/events/{id}/capacity": {
      parameters: [
        { name: "id", in: "path", required: true, schema: str(), description: "Event id or slug." },
      ],
      get: {
        tags: ["Public"],
        summary: "Event capacity and available slots",
        responses: {
          200: jsonResponse("Capacity", { $ref: "#/components/schemas/Capacity" }),
          404: errorResponse("Event not found"),
        },
      },
    },
    "/api/events/{id}/stats": {
      parameters: [
        { name: "id", in: "path", required: true, schema: str(), description: "Event id or slug." },
      ],
      get: {
        tags: ["Public"],
        summary: "Public event statistics",
        description: "Registration, check-in and stack counts — no personal data.",
        responses: {
          200: jsonResponse("Stats", { $ref: "#/components/schemas/EventStats" }),
          404: errorResponse("Event not found"),
        },
      },
    },

    /* -------------------------------------------------------- Auth (session) */
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh the access token",
        description:
          "Rotates the httpOnly refresh cookie and returns a new 15-minute access token.",
        security: [{ refreshAuth: [] }],
        responses: {
          200: jsonResponse("New access token", {
            type: "object",
            properties: { accessToken: str(), expiresIn: { type: "integer", example: 900 } },
          }),
          401: errorResponse("Missing/expired/replayed refresh token"),
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Log out",
        description: "Revokes the refresh token and clears the cookie.",
        security: [{ refreshAuth: [] }],
        responses: { 200: jsonResponse("Signed out", { type: "object", properties: { message: str() } }) },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current participant",
        description: "The identity behind the access token. For the full profile use GET /api/me.",
        security: bearer,
        responses: {
          200: jsonResponse("Current participant", {
            type: "object",
            properties: { participant: { $ref: "#/components/schemas/Participant" } },
          }),
          401: errorResponse("Missing or non-attendee token"),
          404: errorResponse("Registration not found"),
        },
      },
    },

    /* ------------------------------------------------ Participant extensions */
    "/api/me/complete": {
      post: {
        tags: ["Attendee"],
        summary: "Complete registration and issue the ticket",
        description:
          "Verifies every mandatory profile field (name, phone, gender, stack, photo) is set, " +
          "then issues the ticket. Set fields first via PATCH /api/me and POST /api/me/photo.",
        security: bearer,
        responses: {
          200: jsonResponse("Ticket issued", {
            type: "object",
            properties: {
              status: str(),
              ticket: {
                type: "object",
                properties: { id: str(), ticketNumber: str(), code: str() },
              },
            },
          }),
          403: errorResponse("Email not verified"),
          409: errorResponse("Event at capacity"),
          422: errorResponse("Profile incomplete — response lists what's missing"),
        },
      },
    },
    "/api/me/events": {
      get: {
        tags: ["Attendee"],
        summary: "My registered events",
        description: "Every event the participant is registered for (matched by email).",
        security: bearer,
        responses: {
          200: jsonResponse("Registered events", {
            type: "object",
            properties: {
              events: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    registrationStatus: str(),
                    hasTicket: { type: "boolean" },
                    event: { $ref: "#/components/schemas/PublicEvent" },
                  },
                },
              },
            },
          }),
          401: errorResponse("Missing or non-attendee token"),
        },
      },
    },
    "/api/me/tickets": {
      get: {
        tags: ["Attendee"],
        summary: "My ticket history",
        description: "Live and checked-in (archived) passes across all my registrations.",
        security: bearer,
        responses: {
          200: jsonResponse("Ticket history", {
            type: "object",
            properties: {
              tickets: { type: "array", items: { $ref: "#/components/schemas/Ticket" } },
            },
          }),
          401: errorResponse("Missing or non-attendee token"),
        },
      },
    },

    /* ---------------------------------------------------------------- Tickets */
    "/api/tickets/me": {
      get: {
        tags: ["Attendee"],
        summary: "My ticket",
        security: bearer,
        responses: {
          200: jsonResponse("My ticket (with QR)", {
            type: "object",
            properties: { ticket: { $ref: "#/components/schemas/Ticket" } },
          }),
          401: errorResponse("Missing or non-attendee token"),
          404: errorResponse("No ticket yet"),
        },
      },
    },
    "/api/tickets/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      get: {
        tags: ["Attendee"],
        summary: "Get ticket by id",
        description: "Visible to the ticket owner or any admin.",
        security: bearer,
        responses: {
          200: jsonResponse("The ticket", {
            type: "object",
            properties: { ticket: { $ref: "#/components/schemas/Ticket" } },
          }),
          401: errorResponse("Not authenticated"),
          403: errorResponse("Not your ticket"),
          404: errorResponse("Ticket not found"),
        },
      },
    },
    "/api/tickets/{id}/download": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      get: {
        tags: ["Attendee"],
        summary: "Download ticket PDF",
        description: "Returns the printable pass as application/pdf. Owner or admin.",
        security: bearer,
        responses: {
          200: {
            description: "PDF pass",
            content: { "application/pdf": { schema: str({ format: "binary" }) } },
          },
          401: errorResponse("Not authenticated"),
          403: errorResponse("Not your ticket"),
          404: errorResponse("Ticket not found"),
        },
      },
    },
    "/api/tickets/{id}/cancel": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      post: {
        tags: ["Attendee"],
        summary: "Cancel a ticket",
        description: "Owner or admin; only a VALID ticket. Releases the capacity slot.",
        security: bearer,
        responses: {
          200: jsonResponse("Cancelled", {
            type: "object",
            properties: {
              ticket: {
                type: "object",
                properties: {
                  id: str(),
                  status: str(),
                  cancelledAt: str({ format: "date-time" }),
                },
              },
            },
          }),
          403: errorResponse("Not your ticket"),
          404: errorResponse("Ticket not found"),
          409: errorResponse("Ticket not cancellable"),
        },
      },
    },
    "/api/tickets/validate": {
      post: {
        tags: ["Scanner"],
        summary: "Validate a ticket (no check-in)",
        description: "Read-only validity check from a QR token or ticket code. Does not consume the pass.",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          properties: { qr: str({ description: "Signed QR token." }), code: str({ description: "Ticket code." }) },
        }),
        responses: {
          200: jsonResponse("Validity result", {
            type: "object",
            properties: {
              valid: { type: "boolean" },
              reason: str({ nullable: true, description: "REVOKED | ALREADY_USED | EXPIRED | UNKNOWN | UNSIGNED" }),
              ticket: { type: "object" },
            },
          }),
          400: errorResponse("Missing qr/code"),
          401: errorResponse("Not a scanner token"),
        },
      },
    },
    "/api/admin/tickets/{id}/regenerate-qr": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      post: {
        tags: ["Admin"],
        summary: "Regenerate a ticket's QR (admin)",
        description: "Rotates the ticket code, invalidating the old QR without cancelling the ticket.",
        security: bearer,
        responses: {
          200: jsonResponse("New QR", {
            type: "object",
            properties: {
              ticket: { type: "object", properties: { id: str(), ticketNumber: str() } },
              qrDataUrl: str(),
            },
          }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Ticket not found"),
          409: errorResponse("Ticket cancelled"),
        },
      },
    },
    "/api/admin/events/{id}/reminders": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      post: {
        tags: ["Admin"],
        summary: "Email reminders / updates to participants (Admin)",
        description:
          "Sends a reminder to every participant of the event. Include a `message` to send an " +
          "event-update blast instead. Intended for a cron/scheduler.",
        security: bearer,
        requestBody: jsonBody(
          { type: "object", properties: { message: str({ description: "Optional update text." }) } },
          false
        ),
        responses: {
          200: jsonResponse("Send summary", {
            type: "object",
            properties: {
              recipients: { type: "integer" },
              sent: { type: "integer" },
              failed: { type: "integer" },
            },
          }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Event not found"),
          409: errorResponse("No participants"),
        },
      },
    },

    /* ------------------------------------------------------------------ Public */
    "/api/events": {
      get: {
        tags: ["Public"],
        summary: "Public events feed",
        description:
          "Published, non-draft events for the landing page calendar and up-next card. " +
          "Cached in-process for 60s and downstream via Cache-Control.",
        responses: {
          200: jsonResponse("The public event list", {
            type: "object",
            properties: { events: { type: "array", items: { $ref: "#/components/schemas/Event" } } },
          }),
        },
      },
    },
    "/api/events/stream": {
      get: {
        tags: ["Public"],
        summary: "Live event-change channel (SSE)",
        description:
          "Server-Sent Events stream. Emits `{ scope }` whenever an event is created, " +
          "edited or re-postered, so the landing page refreshes without a reload. Carries " +
          "no private data.",
        responses: { 200: { description: "text/event-stream of change signals" } },
      },
    },

    /* -------------------------------------------------------------------- Auth */
    "/api/auth/request-link": {
      post: {
        tags: ["Auth"],
        summary: "Request a magic login link",
        description:
          "Emails a verification link if the address is registered for an OPEN event. " +
          "Always returns the same message so the endpoint can't probe the attendee list.",
        requestBody: jsonBody({
          type: "object",
          required: ["email"],
          properties: {
            email: str({ format: "email" }),
            eventSlug: str({ description: "Prefer this event when the email has several." }),
          },
        }),
        responses: {
          200: jsonResponse("Accepted (whether or not the email exists)", {
            type: "object",
            properties: { message: str() },
          }),
          400: errorResponse("Invalid email"),
        },
      },
    },
    "/api/auth/verify": {
      post: {
        tags: ["Auth"],
        summary: "Redeem a magic link for a session",
        description: "Consumes the one-time token and returns an attendee access token.",
        requestBody: jsonBody({
          type: "object",
          required: ["token"],
          properties: { token: str({ description: "The token from the magic-link URL." }) },
        }),
        responses: {
          200: jsonResponse("Attendee session issued", {
            type: "object",
            properties: { accessToken: str() },
          }),
          400: errorResponse("Link invalid or expired"),
          404: errorResponse("Registration not found"),
        },
      },
    },

    /* ---------------------------------------------------------------- Attendee */
    "/api/me": {
      get: {
        tags: ["Attendee"],
        summary: "My registration, event, ticket and plus-one",
        security: bearer,
        responses: {
          200: jsonResponse("The signed-in attendee's full picture", {
            type: "object",
            properties: {
              attendee: { type: "object" },
              event: { type: "object", nullable: true },
              ticket: {
                type: "object",
                nullable: true,
                properties: {
                  code: str(),
                  status: strEnum(TICKET_STATUSES),
                  qrDataUrl: str({ description: "Base64 PNG of the signed QR." }),
                },
              },
              plusOne: { type: "object", nullable: true },
            },
          }),
          401: errorResponse("Missing or non-attendee token"),
          404: errorResponse("Registration not found"),
        },
      },
      patch: {
        tags: ["Attendee"],
        summary: "Fill in missing profile details",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: str({ minLength: 2 }),
            phone: str({ minLength: 6 }),
            gender: strEnum(GENDERS),
            stack: strEnum(STACKS),
          },
        }),
        responses: {
          200: jsonResponse("Updated fields", { type: "object", properties: { attendee: { type: "object" } } }),
          401: errorResponse("Missing or non-attendee token"),
          403: errorResponse("Email not verified yet"),
          404: errorResponse("Registration not found"),
        },
      },
    },
    "/api/me/photo": {
      post: {
        tags: ["Attendee"],
        summary: "Upload profile photo and issue the ticket",
        description:
          "multipart/form-data with a `photo` image field (max 8MB). Completes the " +
          "registration and issues the QR ticket.",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["photo"],
                properties: { photo: str({ format: "binary" }) },
              },
            },
          },
        },
        responses: {
          200: jsonResponse("Photo stored, ticket issued", {
            type: "object",
            properties: { photoUrl: str(), ticketCode: str() },
          }),
          400: errorResponse("No image / wrong type / too large"),
          401: errorResponse("Missing or non-attendee token"),
          403: errorResponse("Email not verified yet"),
          409: errorResponse("Event at capacity"),
        },
      },
    },
    "/api/me/plus-one": {
      post: {
        tags: ["Plus-one"],
        summary: "Add a plus-one directly",
        description: "The participant fills the guest's details; the guest's ticket is issued and emailed.",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          required: ["email"],
          properties: {
            name: str({ minLength: 2, description: "Optional; defaults to \"Guest of <participant>\"." }),
            email: str({ format: "email" }),
          },
        }),
        responses: {
          201: jsonResponse("Plus-one created", { type: "object", properties: { plusOne: { type: "object" } } }),
          400: errorResponse("Invalid details / own email reused"),
          401: errorResponse("Missing or non-attendee token"),
          403: errorResponse("Not a participant"),
          409: errorResponse("Already has a plus-one / event closed / email taken"),
        },
      },
    },
    "/api/me/plus-one/invite": {
      post: {
        tags: ["Plus-one"],
        summary: "Generate a plus-one invite link",
        description: "Returns a link the guest uses to fill their own details; optionally emailed.",
        security: bearer,
        requestBody: jsonBody(
          {
            type: "object",
            properties: { email: str({ format: "email", description: "If set, the invite is emailed too." }) },
          },
          false
        ),
        responses: {
          200: jsonResponse("Invite link", { type: "object", properties: { inviteUrl: str() } }),
          401: errorResponse("Missing or non-attendee token"),
          403: errorResponse("Not a participant"),
          409: errorResponse("Already has a plus-one / event closed"),
        },
      },
    },
    "/api/plus-one/{token}": {
      parameters: [{ name: "token", in: "path", required: true, schema: str(), description: "The invite token." }],
      get: {
        tags: ["Plus-one"],
        summary: "Look up an invite",
        description: "Public — resolves the inviter and event behind an invite link.",
        responses: {
          200: jsonResponse("Invite context", {
            type: "object",
            properties: { participantName: str(), eventName: str(), email: str({ nullable: true }) },
          }),
          404: errorResponse("Invite invalid or expired"),
          409: errorResponse("Participant already has a plus-one"),
        },
      },
      post: {
        tags: ["Plus-one"],
        summary: "Claim an invite",
        description: "Public — the guest submits their details and their ticket is emailed.",
        requestBody: jsonBody({
          type: "object",
          required: ["email"],
          properties: {
            name: str({ minLength: 2 }),
            email: str({ format: "email" }),
          },
        }),
        responses: {
          201: jsonResponse("Registered; verification email sent", {
            type: "object",
            properties: { message: str() },
          }),
          400: errorResponse("Invalid details"),
          404: errorResponse("Invite invalid or expired"),
          409: errorResponse("Already has a plus-one / event closed"),
        },
      },
    },

    /* ----------------------------------------------------------------- Scanner */
    "/api/scan": {
      post: {
        tags: ["Scanner"],
        summary: "Scan a ticket QR at the gate",
        description:
          "Accepts a signed QR payload and check-ins the holder. Open to admins and " +
          "scanner accounts. The outcome is one of ACCEPTED, ALREADY_USED, INVALID, " +
          "REVOKED or EXPIRED.",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          required: ["qr"],
          properties: { qr: str({ description: "The signed QR token." }) },
        }),
        responses: {
          200: jsonResponse("Scan outcome (always 200, see `result`)", {
            $ref: "#/components/schemas/ScanEvent",
          }),
          400: errorResponse("Missing QR payload"),
          401: errorResponse("Not an admin or scanner token"),
        },
      },
    },
    "/api/admin/scans/stream": {
      get: {
        tags: ["Scanner"],
        summary: "Live gate feed (SSE)",
        description:
          "Server-Sent Events of scans and admin notifications. EventSource can't set " +
          "headers, so the access token is passed as the `token` query parameter. Open to " +
          "admin and scanner tokens.",
        parameters: [
          { name: "token", in: "query", required: true, schema: str(), description: "Admin or scanner access token." },
        ],
        responses: {
          200: { description: "text/event-stream of scans (`data:`) and notifications (`event: notification`)" },
          401: errorResponse("Invalid or wrong-kind token"),
        },
      },
    },

    /* ----------------------------------------------------------- Scanner auth */

    /* ------------------------------------------------------------------- Admin */
    "/api/admin/stats": {
      get: {
        tags: ["Admin"],
        summary: "Dashboard statistics",
        description: "Per-event fullness, check-ins, attendee breakdowns and the recent scan feed.",
        security: bearer,
        responses: {
          200: jsonResponse("Stats and recent scans", {
            type: "object",
            properties: {
              stats: { type: "array", items: { type: "object" } },
              recentScans: { type: "array", items: { type: "object" } },
            },
          }),
          401: errorResponse("Not an admin token"),
        },
      },
    },
    "/api/admin/attendees": {
      get: {
        tags: ["Admin"],
        summary: "List participants",
        description: "Live participants plus archived ticket-holder snapshots. Filterable; capped at 500 each.",
        security: bearer,
        parameters: [
          { name: "stack", in: "query", schema: strEnum(STACKS) },
          { name: "status", in: "query", schema: strEnum(PARTICIPANT_STATUSES) },
          {
            name: "registrationStatus",
            in: "query",
            schema: strEnum(["PENDING", "APPROVED", "REJECTED"]),
          },
          { name: "event", in: "query", schema: str(), description: "Event id." },
          { name: "q", in: "query", schema: str(), description: "Search name, email or phone." },
        ],
        responses: {
          200: jsonResponse("Matching participants", {
            type: "object",
            properties: { attendees: { type: "array", items: { $ref: "#/components/schemas/Participant" } } },
          }),
          401: errorResponse("Not an admin token"),
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Register a participant (Admin)",
        description: "Creates a participant registration. No ticket is issued here.",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          required: ["eventId", "name", "email"],
          properties: {
            eventId: str(),
            name: str({ minLength: 2 }),
            email: str({ format: "email" }),
            phone: str({ minLength: 6 }),
            stack: strEnum(STACKS),
            gender: strEnum(GENDERS),
          },
        }),
        responses: {
          201: jsonResponse("Created", { type: "object", properties: { participant: { type: "object" } } }),
          400: errorResponse("Invalid details"),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Event not found"),
          409: errorResponse("Email already registered for this event"),
        },
      },
    },
    "/api/admin/guests": {
      get: {
        tags: ["Admin"],
        summary: "List guests",
        description: "Guests the admin added (super admin sees all), live and checked-in.",
        security: bearer,
        responses: {
          200: jsonResponse("Guest list", {
            type: "object",
            properties: { guests: { type: "array", items: { type: "object" } } },
          }),
          401: errorResponse("Not an admin token"),
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Add a guest and issue a ticket",
        description: "Guests are vouched for by the admin — no email verification; the ticket is emailed.",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          required: ["name", "email", "eventId"],
          properties: {
            name: str({ minLength: 2 }),
            email: str({ format: "email" }),
            guestType: strEnum(GUEST_TYPES),
            eventId: str(),
          },
        }),
        responses: {
          201: jsonResponse("Guest created, ticket issued", {
            type: "object",
            properties: { guest: { type: "object" } },
          }),
          400: errorResponse("Invalid details"),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Event not found"),
          409: errorResponse("Email already registered / at capacity"),
        },
      },
    },
    "/api/admin/events": {
      get: {
        tags: ["Admin"],
        summary: "List all events (incl. drafts)",
        security: bearer,
        responses: {
          200: jsonResponse("Events", {
            type: "object",
            properties: { events: { type: "array", items: { $ref: "#/components/schemas/Event" } } },
          }),
          401: errorResponse("Not an admin token"),
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Create an event (Admin)",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          required: ["name", "slug", "startTime"],
          properties: {
            name: str({ minLength: 2 }),
            slug: str({ pattern: "^[a-z0-9-]+$" }),
            category: strEnum(EVENT_CATEGORIES),
            type: strEnum(EVENT_TYPES),
            startTime: str({ format: "date-time" }),
            endTime: str({ format: "date-time", nullable: true }),
            gallery: { type: "array", items: str({ format: "uri" }) },
            organiser: str(),
            maxAttendees: { type: "integer", minimum: 0 },
            details: str(),
            rules: { type: "array", items: str() },
            price: str(),
            location: str(),
            isPublished: { type: "boolean" },
          },
        }),
        responses: {
          201: jsonResponse("Event created", { type: "object", properties: { event: { type: "object" } } }),
          400: errorResponse("Invalid details"),
          401: errorResponse("Not an admin token"),
          409: errorResponse("Slug already exists"),
        },
      },
    },
    "/api/admin/events/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      patch: {
        tags: ["Admin"],
        summary: "Update event settings (Admin)",
        description: "Any subset of the event fields, including `status` (DRAFT/OPEN/CLOSED).",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: str({ minLength: 2 }),
            category: strEnum(EVENT_CATEGORIES),
            type: strEnum(EVENT_TYPES),
            startTime: str({ format: "date-time" }),
            endTime: str({ format: "date-time", nullable: true }),
            gallery: { type: "array", items: str({ format: "uri" }) },
            organiser: str(),
            maxAttendees: { type: "integer", minimum: 0 },
            details: str(),
            rules: { type: "array", items: str() },
            price: str(),
            location: str(),
            isPublished: { type: "boolean" },
            status: strEnum(EVENT_STATUSES),
          },
        }),
        responses: {
          200: jsonResponse("Updated", { type: "object", properties: { event: { type: "object" } } }),
          400: errorResponse("Invalid settings"),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Event not found"),
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete an event (Admin)",
        description: "Removes the event and all its participants, guests and tickets.",
        security: bearer,
        responses: {
          200: jsonResponse("Deleted", { type: "object", properties: { deleted: { type: "boolean" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Event not found"),
        },
      },
    },
    "/api/admin/events/{id}/poster": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      post: {
        tags: ["Admin"],
        summary: "Add an image to the event gallery (Admin)",
        description: "multipart/form-data with an `image` image field (max 8MB). Appended to the gallery.",
        security: bearer,
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: { image: str({ format: "binary" }) },
              },
            },
          },
        },
        responses: {
          200: jsonResponse("Image stored", {
            type: "object",
            properties: { url: str(), gallery: { type: "array", items: str() } },
          }),
          400: errorResponse("No image / wrong type / too large"),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Event not found"),
        },
      },
    },
    "/api/admin/notifications": {
      get: {
        tags: ["Admin"],
        summary: "List notifications",
        security: bearer,
        responses: {
          200: jsonResponse("Latest 50 notifications and the unread count", {
            type: "object",
            properties: {
              notifications: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: str(),
                    kind: strEnum(NOTIFICATION_KINDS),
                    severity: strEnum(NOTIFICATION_SEVERITIES),
                    title: str(),
                    body: str(),
                    read: { type: "boolean" },
                    at: str({ format: "date-time" }),
                  },
                },
              },
              unread: { type: "integer" },
            },
          }),
          401: errorResponse("Not an admin token"),
        },
      },
      patch: {
        tags: ["Admin"],
        summary: "Mark notifications read",
        description: "Marks the given ids read, or everything when `ids` is omitted.",
        security: bearer,
        requestBody: jsonBody(
          { type: "object", properties: { ids: { type: "array", items: str() } } },
          false
        ),
        responses: {
          200: jsonResponse("New unread count", { type: "object", properties: { unread: { type: "integer" } } }),
          401: errorResponse("Not an admin token"),
        },
      },
    },

    /* ------------------------------------------------ Admin — dashboard stats */
    "/api/admin/dashboard": {
      get: {
        tags: ["Admin"],
        summary: "Global + attendance statistics",
        description:
          "Global counts (events by lifecycle, guests, tickets generated/sent/scanned) and " +
          "attendance analytics (current/total/rate/average, hourly + daily check-ins).",
        security: bearer,
        responses: {
          200: jsonResponse("Dashboard stats", {
            type: "object",
            properties: {
              global: {
                type: "object",
                properties: {
                  totalEvents: { type: "integer" },
                  totalGuests: { type: "integer" },
                  totalTicketsGenerated: { type: "integer" },
                  totalTicketsSent: { type: "integer" },
                  totalTicketsScanned: { type: "integer" },
                  activeEvents: { type: "integer" },
                  completedEvents: { type: "integer" },
                  upcomingEvents: { type: "integer" },
                },
              },
              attendance: {
                type: "object",
                properties: {
                  currentAttendance: { type: "integer" },
                  totalAttendance: { type: "integer" },
                  liveAttendanceRate: { type: "integer" },
                  averageAttendance: { type: "number" },
                  hourlyCheckins: { type: "array", items: { type: "object" } },
                  dailyCheckins: { type: "array", items: { type: "object" } },
                },
              },
            },
          }),
          401: errorResponse("Not an admin token"),
        },
      },
    },

    /* -------------------------------------------------- Admin — scanner mgmt */

    /* --------------------------------------------- Admin — participant detail */
    "/api/admin/attendees/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      get: {
        tags: ["Admin"],
        summary: "Participant profile (identity, ticket, attendance, plus-one)",
        security: bearer,
        responses: {
          200: jsonResponse("Profile", {
            type: "object",
            properties: {
              participant: { type: "object" },
              ticket: { type: "object", nullable: true },
              attendance: { type: "object" },
              plusOne: { type: "object", nullable: true },
            },
          }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Participant not found"),
        },
      },
      patch: {
        tags: ["Admin"],
        summary: "Edit participant / approve / reject",
        description: "Rejecting revokes any live ticket and frees the seat.",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: str({ minLength: 2 }),
            phone: str({ minLength: 6 }),
            stack: strEnum(STACKS),
            gender: strEnum(GENDERS),
            registrationStatus: strEnum(["PENDING", "APPROVED", "REJECTED"]),
          },
        }),
        responses: {
          200: jsonResponse("Updated", { type: "object", properties: { participant: { type: "object" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Participant not found"),
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete participant (+ plus-one + tickets)",
        security: bearer,
        responses: {
          200: jsonResponse("Deleted", { type: "object", properties: { deleted: { type: "boolean" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Participant not found"),
        },
      },
    },
    "/api/admin/attendees/export": {
      get: {
        tags: ["Admin"],
        summary: "Export the participant list as CSV",
        description: "Takes the same filters as the list endpoint, so the CSV matches the table.",
        security: bearer,
        parameters: [
          { name: "event", in: "query", schema: str(), description: "Filter by event id." },
          { name: "stack", in: "query", schema: str() },
          { name: "status", in: "query", schema: str() },
          { name: "registrationStatus", in: "query", schema: str() },
          { name: "plusOne", in: "query", schema: str({ enum: ["none", "has"] }) },
          { name: "q", in: "query", schema: str(), description: "Name / email / phone search." },
        ],
        responses: {
          200: { description: "text/csv participant list", content: { "text/csv": { schema: str() } } },
          401: errorResponse("Not an admin token"),
        },
      },
    },
    "/api/admin/guests/export": {
      get: {
        tags: ["Admin"],
        summary: "Export the guest list as CSV",
        description: "Takes the same filters as the list endpoint, so the CSV matches the table.",
        security: bearer,
        parameters: [
          { name: "event", in: "query", schema: str(), description: "Filter by event id." },
          { name: "type", in: "query", schema: str(), description: "Filter by guest type." },
          { name: "q", in: "query", schema: str(), description: "Name / email search." },
        ],
        responses: {
          200: { description: "text/csv guest list", content: { "text/csv": { schema: str() } } },
          401: errorResponse("Not an admin token"),
        },
      },
    },
    "/api/admin/tickets/export": {
      get: {
        tags: ["Admin"],
        summary: "Export the ticket list as CSV",
        description: "Takes the same filters as the list endpoint, so the CSV matches the table.",
        security: bearer,
        parameters: [
          { name: "event", in: "query", schema: str(), description: "Filter by event id." },
          { name: "status", in: "query", schema: str(), description: "VALID / USED / REVOKED." },
          { name: "q", in: "query", schema: str(), description: "Number / holder / event search." },
        ],
        responses: {
          200: { description: "text/csv ticket list", content: { "text/csv": { schema: str() } } },
          401: errorResponse("Not an admin token"),
        },
      },
    },

    /* ------------------------------------------ Admin — ticket reset workflow */
    "/api/admin/tickets/{id}/resend": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      post: {
        tags: ["Admin"],
        summary: "Resend the ticket email (same QR)",
        security: bearer,
        responses: {
          200: jsonResponse("Resent", { type: "object", properties: { ticket: { type: "object" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Ticket not found"),
          409: errorResponse("Cancelled / no active holder"),
        },
      },
    },
    "/api/admin/tickets/{id}/reset": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      post: {
        tags: ["Admin"],
        summary: "Reset ticket — new QR + number, auto-emailed",
        description: "Invalidates the old QR, mints a fresh code + ticket number, and re-sends the email.",
        security: bearer,
        responses: {
          200: jsonResponse("Reset", { type: "object", properties: { ticket: { type: "object" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Ticket not found"),
          409: errorResponse("No active holder"),
        },
      },
    },
    "/api/admin/tickets/{id}/revoke": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      post: {
        tags: ["Admin"],
        summary: "Revoke a ticket (frees the seat)",
        security: bearer,
        responses: {
          200: jsonResponse("Revoked", { type: "object", properties: { ticket: { type: "object" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Ticket not found"),
          409: errorResponse("Already revoked"),
        },
      },
    },

    /* ------------------------------------------------- Admin — guest detail */
    "/api/admin/guests/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      get: {
        tags: ["Admin"],
        summary: "Guest profile (identity, ticket, inviter, scan history)",
        security: bearer,
        responses: {
          200: jsonResponse("Profile", {
            type: "object",
            properties: {
              guest: { type: "object" },
              ticket: { type: "object", nullable: true },
              attendance: { type: "object" },
            },
          }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Guest not found"),
        },
      },
      patch: {
        tags: ["Admin"],
        summary: "Edit guest information",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          properties: {
            name: str({ minLength: 2 }),
            email: str({ format: "email" }),
            guestType: strEnum(GUEST_TYPES),
            profile: str({ format: "uri", nullable: true }),
          },
        }),
        responses: {
          200: jsonResponse("Updated", { type: "object", properties: { guest: { type: "object" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Guest not found"),
          409: errorResponse("Email already registered"),
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a guest (+ ticket, frees the seat)",
        security: bearer,
        responses: {
          200: jsonResponse("Deleted", { type: "object", properties: { deleted: { type: "boolean" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Guest not found"),
        },
      },
    },

    /* ----------------------------------------------- Admin — ticket registry */
    "/api/admin/tickets": {
      get: {
        tags: ["Admin"],
        summary: "List tickets",
        security: bearer,
        parameters: [
          { name: "event", in: "query", schema: str(), description: "Event id." },
          { name: "status", in: "query", schema: strEnum(TICKET_STATUSES) },
        ],
        responses: {
          200: jsonResponse("Tickets", {
            type: "object",
            properties: { tickets: { type: "array", items: { $ref: "#/components/schemas/Ticket" } } },
          }),
          401: errorResponse("Not an admin token"),
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Generate a ticket for a participant or guest",
        description: "Idempotent — returns the existing ticket if one is already issued.",
        security: bearer,
        requestBody: jsonBody({
          type: "object",
          properties: {
            participantId: str({ description: "Exactly one of participantId / guestId." }),
            guestId: str(),
            email: { type: "boolean", description: "Email the ticket (default true)." },
          },
        }),
        responses: {
          201: jsonResponse("Ticket generated", {
            type: "object",
            properties: { ticket: { $ref: "#/components/schemas/Ticket" } },
          }),
          400: errorResponse("Provide exactly one holder id"),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Holder not found"),
          409: errorResponse("Event at capacity"),
        },
      },
    },
    "/api/admin/tickets/{id}": {
      parameters: [{ name: "id", in: "path", required: true, schema: str() }],
      get: {
        tags: ["Admin"],
        summary: "View a ticket (QR + scan history)",
        security: bearer,
        responses: {
          200: jsonResponse("Ticket", {
            type: "object",
            properties: {
              ticket: { $ref: "#/components/schemas/Ticket" },
              history: { type: "array", items: { type: "object" } },
            },
          }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Ticket not found"),
        },
      },
      delete: {
        tags: ["Admin"],
        summary: "Delete a ticket (frees the seat)",
        security: bearer,
        responses: {
          200: jsonResponse("Deleted", { type: "object", properties: { deleted: { type: "boolean" } } }),
          401: errorResponse("Not an admin token"),
          404: errorResponse("Ticket not found"),
        },
      },
    },
  
} as const;
