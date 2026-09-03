/* components: security schemes and the shared response schemas. Moved out of
   the single 1600-line spec file so the path modules stay readable. */

import { str, strEnum } from "./shared";
import {
  SCAN_RESULTS,
  EVENT_CATEGORIES,
  EVENT_STATUSES,
  EVENT_TYPES,
  GENDERS,
  GUEST_TYPES,
  PARTICIPANT_STATUSES,
  STACKS,
  TICKET_STATUSES,
} from "./shared";

export const components = {
    securitySchemes: {
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description:
          "A key issued to an integrator, for reading the organisation's calendar from " +
          "another website. Request one at [/docs](/docs) — an administrator reviews every " +
          "request, and the key is emailed on approval. Keys are read-only " +
          "(`calendar:read`) and rate limited per key.",
      },
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description:
          "Send `Authorization: Bearer <accessToken>`. Attendee access tokens last " +
          "15 minutes; obtain the first from `/api/auth/verify` and refresh at " +
          "`/api/auth/refresh`. Staff do not use bearer tokens at all — they sign in " +
          "with Google and carry an httpOnly session cookie.",
      },
      refreshAuth: {
        type: "apiKey",
        in: "cookie",
        name: "iems_refresh",
        description:
          "httpOnly rotating refresh cookie set by `/api/auth/verify`. Sent " +
          "automatically by the browser to `/api/auth/refresh` and `/api/auth/logout`.",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: str({ example: "Unauthorized" }) },
        required: ["error"],
      },
      TicketRef: {
        type: "object",
        nullable: true,
        properties: {
          code: str(),
          status: strEnum(TICKET_STATUSES),
          scannedAt: str({ format: "date-time", nullable: true }),
        },
      },
      Event: {
        type: "object",
        properties: {
          id: str(),
          name: str(),
          slug: str(),
          category: strEnum(EVENT_CATEGORIES),
          type: strEnum(EVENT_TYPES),
          startTime: str({ format: "date-time" }),
          endTime: str({ format: "date-time", nullable: true }),
          gallery: { type: "array", items: str({ format: "uri" }) },
          organiser: str(),
          maxAttendees: { type: "integer", minimum: 0, description: "0 means uncapped." },
          details: str(),
          rules: { type: "array", items: str() },
          status: strEnum(EVENT_STATUSES),
          price: str(),
          location: str(),
          isPublished: { type: "boolean" },
        },
      },
      Participant: {
        type: "object",
        properties: {
          id: str(),
          event: str({ description: "Id of the event attending." }),
          name: str(),
          email: str({ format: "email" }),
          phone: str({ nullable: true }),
          stack: strEnum(STACKS),
          gender: strEnum(GENDERS),
          profilePicture: str({ nullable: true }),
          status: strEnum(PARTICIPANT_STATUSES),
          plusOne: str({ nullable: true, description: "Id of the guest they invited." }),
          ticket: str({ nullable: true, description: "Id of their ticket." }),
        },
      },
      Guest: {
        type: "object",
        properties: {
          id: str(),
          event: str({ description: "Id of the event attending." }),
          name: str(),
          profile: str({ nullable: true }),
          email: str({ format: "email" }),
          guestType: strEnum(GUEST_TYPES),
          ticket: str({ nullable: true, description: "Id of their ticket." }),
          inviter: str({ nullable: true, description: "Id of the participant who invited them." }),
        },
      },
      PublicEvent: {
        type: "object",
        description: "Public event view returned by the read endpoints.",
        properties: {
          id: str(),
          title: str(),
          slug: str(),
          description: str(),
          category: strEnum(EVENT_CATEGORIES),
          type: strEnum(EVENT_TYPES),
          startTime: str({ format: "date-time" }),
          endTime: str({ format: "date-time", nullable: true }),
          location: str(),
          organiser: str(),
          price: str(),
          gallery: { type: "array", items: str({ format: "uri" }) },
          rules: { type: "array", items: str() },
          capacity: { type: "integer", description: "0 = uncapped." },
          registeredParticipants: { type: "integer" },
          remainingSlots: { type: "integer", nullable: true, description: "null when uncapped." },
          isFull: { type: "boolean" },
          status: strEnum(["Upcoming", "Ongoing", "Completed", "Full"]),
          registrationStatus: strEnum(EVENT_STATUSES),
          isPublished: { type: "boolean" },
        },
      },
      Capacity: {
        type: "object",
        properties: {
          eventId: str(),
          capacity: { type: "integer" },
          registered: { type: "integer" },
          remaining: { type: "integer", nullable: true },
          isFull: { type: "boolean" },
        },
      },
      EventStats: {
        type: "object",
        properties: {
          eventId: str(),
          title: str(),
          status: strEnum(["Upcoming", "Ongoing", "Completed", "Full"]),
          capacity: { type: "integer" },
          registered: { type: "integer" },
          remaining: { type: "integer", nullable: true },
          isFull: { type: "boolean" },
          participants: { type: "integer" },
          guests: { type: "integer" },
          checkedIn: { type: "integer" },
          byStack: { type: "object", additionalProperties: { type: "integer" } },
        },
      },
      Ticket: {
        type: "object",
        properties: {
          id: str({ description: "Ticket ID." }),
          ticketNumber: str({ description: "Unique human-readable number, e.g. WTN-000042." }),
          participantId: str({ description: "Ticket owner (holder) id." }),
          participantName: str(),
          ownerType: strEnum(["Participant", "Guest"]),
          eventId: str(),
          eventName: str({ nullable: true }),
          registeredAt: str({ format: "date-time" }),
          status: strEnum(TICKET_STATUSES),
          scannedAt: str({ format: "date-time", nullable: true }),
          cancelledAt: str({ format: "date-time", nullable: true }),
          qrDataUrl: str({ nullable: true, description: "Base64 PNG QR; present on single-ticket reads." }),
        },
      },
      ScanEvent: {
        type: "object",
        properties: {
          at: str({ format: "date-time" }),
          result: strEnum(SCAN_RESULTS),
          eventName: str({ nullable: true }),
          usedAt: str({ format: "date-time", nullable: true }),
          expiresAt: str({ format: "date-time", nullable: true }),
          attendee: {
            type: "object",
            nullable: true,
            properties: { fullName: str(), type: str(), photoUrl: str({ nullable: true }) },
          },
        },
      },
    },
  
} as const;
