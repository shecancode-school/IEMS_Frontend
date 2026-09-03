import {
  str,
  strEnum,
  ACTIVITY_TYPES,
  ACTIVITY_VISIBILITY,
  ADMIN_ROLES,
  BOOKING_STATUSES,
  EVENT_MODES,
} from "./shared";

/* Schemas for the calendar, booking and staff surfaces. Kept apart from the
   original components block so the two can be reviewed independently. */

export const calendarSchemas = {
  CalendarItem: {
    type: "object",
    description:
      "One block on a calendar, whatever it came from. `redacted` is true when the details " +
      "were withheld and only the busy block is shown — someone else's private activity, or a " +
      "booking you do not host.",
    properties: {
      id: str({ description: 'Namespaced, e.g. "activity:65f…" or "google:abc".' }),
      source: strEnum(["EVENT", "ACTIVITY", "BOOKING", "GOOGLE"]),
      title: str(),
      start: str({ format: "date-time" }),
      end: str({ format: "date-time" }),
      allDay: { type: "boolean" },
      ownerId: str({ nullable: true }),
      ownerName: str({ nullable: true }),
      type: str({ nullable: true }),
      mode: { ...strEnum(EVENT_MODES), nullable: true },
      location: str(),
      meetLink: str({ nullable: true }),
      status: str({ nullable: true }),
      href: str({ nullable: true, description: "Where clicking it goes; null when read-only." }),
      redacted: { type: "boolean" },
    },
  },

  CalendarPerson: {
    type: "object",
    properties: {
      id: str(),
      name: str(),
      role: strEnum(ADMIN_ROLES),
      title: str({ nullable: true }),
      googleConnected: { type: "boolean" },
      bookable: { type: "boolean" },
    },
  },

  CalendarFeed: {
    type: "object",
    properties: {
      from: str({ format: "date" }),
      to: str({ format: "date" }),
      timezone: str({ example: "Africa/Kigali" }),
      people: { type: "array", items: { $ref: "#/components/schemas/CalendarPerson" } },
      items: { type: "array", items: { $ref: "#/components/schemas/CalendarItem" } },
      googleError: str({
        nullable: true,
        description:
          "Set when your own Google connection could not be read, so the UI can say the events " +
          "are missing rather than quietly omitting them.",
      }),
    },
  },

  Activity: {
    type: "object",
    properties: {
      id: str(),
      title: str(),
      description: str(),
      type: strEnum(ACTIVITY_TYPES),
      start: str({ format: "date-time" }),
      end: str({ format: "date-time" }),
      mode: strEnum(EVENT_MODES),
      location: str(),
      visibility: strEnum(ACTIVITY_VISIBILITY),
      attendees: {
        type: "array",
        items: { type: "object", properties: { email: str(), name: str() } },
      },
      eventId: str({ nullable: true }),
      meetLink: str({ nullable: true }),
      googleEventId: str({ nullable: true }),
      status: strEnum(["SCHEDULED", "CANCELLED", "DESYNCED"]),
      owner: {
        type: "object",
        nullable: true,
        properties: { id: str(), name: str(), role: strEnum(ADMIN_ROLES) },
      },
    },
  },

  BookingHost: {
    type: "object",
    properties: {
      slug: str({ description: "Their public booking page: /book/<slug>" }),
      name: str(),
      role: strEnum(ADMIN_ROLES),
      title: str({ nullable: true }),
      bio: str(),
      avatarUrl: str({ nullable: true }),
      slotMinutes: { type: "integer" },
      online: {
        type: "boolean",
        description: "True when a Google Meet link can actually be created for them.",
      },
    },
  },

  SlotDay: {
    type: "object",
    properties: {
      day: str({ format: "date" }),
      slots: {
        type: "array",
        items: {
          type: "object",
          properties: { start: str({ format: "date-time" }), end: str({ format: "date-time" }) },
        },
      },
    },
  },

  AdminBooking: {
    type: "object",
    properties: {
      id: str(),
      requesterName: str(),
      requesterEmail: str({ format: "email" }),
      requesterPhone: str(),
      topic: str(),
      start: str({ format: "date-time" }),
      end: str({ format: "date-time" }),
      status: strEnum(BOOKING_STATUSES),
      meetLink: str({ nullable: true }),
      source: strEnum(["PUBLIC", "ADMIN"]),
      createdAt: str({ format: "date-time" }),
      cancelledAt: str({ format: "date-time", nullable: true }),
      cancelledBy: str({ nullable: true }),
    },
  },

  CancellableBooking: {
    type: "object",
    properties: {
      id: str(),
      hostName: str(),
      hostTitle: str({ nullable: true }),
      requesterName: str(),
      start: str({ format: "date-time" }),
      end: str({ format: "date-time" }),
      topic: str(),
      status: strEnum(BOOKING_STATUSES),
      meetLink: str({ nullable: true }),
    },
  },

  Availability: {
    type: "object",
    description: "Booking rules. Times are Kigali wall-clock strings, not instants.",
    properties: {
      bookable: { type: "boolean" },
      slug: str({ pattern: "^[a-z0-9-]+$" }),
      headline: str({ maxLength: 120 }),
      bio: str({ maxLength: 1000 }),
      timezone: str({ example: "Africa/Kigali" }),
      slotMinutes: { type: "integer", minimum: 5, maximum: 480 },
      bufferMinutes: {
        type: "integer",
        minimum: 0,
        maximum: 240,
        description: "Protected gap either side of a booking.",
      },
      leadTimeMinutes: { type: "integer", minimum: 0, description: "Minimum notice required." },
      horizonDays: { type: "integer", minimum: 1, maximum: 365 },
      maxPerDay: { type: "integer", minimum: 0, description: "0 means no limit." },
      weekly: {
        type: "array",
        items: {
          type: "object",
          properties: {
            weekday: { type: "integer", minimum: 0, maximum: 6, description: "0 = Sunday" },
            start: str({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$", example: "09:00" }),
            end: str({ pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$", example: "17:00" }),
          },
        },
      },
      blackouts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            start: str({ format: "date-time" }),
            end: str({ format: "date-time" }),
            reason: str(),
          },
        },
      },
    },
  },

  StaffMember: {
    type: "object",
    properties: {
      id: str(),
      name: str(),
      email: str({ format: "email" }),
      role: strEnum(ADMIN_ROLES),
      title: str({ nullable: true }),
      avatarUrl: str({ nullable: true }),
      bio: str({ nullable: true }),
      active: { type: "boolean" },
      googleConnected: { type: "boolean" },
      createdAt: str({ format: "date-time" }),
    },
  },
} as const;
