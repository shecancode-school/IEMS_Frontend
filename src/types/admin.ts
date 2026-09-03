/* Shared admin domain types + enum constants, mirroring the backend models and
   the OpenAPI spec (src/lib/openapi.ts). One source of truth for the admin UI. */

export const EVENT_CATEGORIES = [
  "SheCanCODE",
  "Entrepreneurship",
  "Web Fundamentals",
  "Advanced Backend",
  "Advanced Frontend",
  "Mentorship",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const EVENT_TYPES = [
  "WORKSHOP",
  "BOOTCAMP",
  "MEETUP",
  "CONFERENCE",
  "WEBINAR",
  "HACKATHON",
  "SEMINAR",
  "OTHER",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export const STACKS = ["FRONTEND", "BACKEND", "FULLSTACK", "MOBILE", "DATA", "OTHER"] as const;
export type Stack = (typeof STACKS)[number];

export const GENDERS = ["FEMALE", "MALE", "OTHER"] as const;
export type Gender = (typeof GENDERS)[number];

export const RELATIONSHIPS = [
  "RELATIVE",
  "FRIEND",
  "COLLEAGUE",
  "PARTNER",
  "MENTOR",
  "OTHER",
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const PARTICIPANT_STATUSES = ["PENDING", "VERIFIED", "COMPLETE"] as const;
export type ParticipantStatus = (typeof PARTICIPANT_STATUSES)[number];

export const REGISTRATION_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

export const GUEST_TYPES = [
  "VIP",
  "SPEAKER",
  "SPONSOR",
  "MEDIA",
  "PARTNER",
  "PLUS_ONE",
  "GENERAL",
] as const;
export type GuestType = (typeof GUEST_TYPES)[number];

export const ADMIN_ROLES = ["ADMIN", "CEO", "FACILITATOR", "ACADEMIC", "STAFF"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/* the two roles that keep the full admin console */
export const PRIVILEGED_ROLES = ["ADMIN", "CEO"] as const;
export const isPrivileged = (role?: AdminRole | null) =>
  role === "ADMIN" || role === "CEO";

/* human labels for the role pickers and calendar lanes */
export const ROLE_LABELS: Record<AdminRole, string> = {
  ADMIN: "Administrator",
  CEO: "CEO",
  FACILITATOR: "Facilitator",
  ACADEMIC: "Academic staff",
  STAFF: "Staff",
};

/* Routes and nav items gate on capabilities, not on role names, so adding a
   role later is a one-line change here instead of a grep across the codebase. */
export type Capability =
  | "staff:manage"
  | "events:write"
  | "attendees:write"
  | "tickets:write"
  | "scanners:manage"
  | "emails:send"
  | "calendar:write"
  | "calendar:viewAll"
  | "bookings:host";

const CONSOLE: readonly Capability[] = [
  "staff:manage",
  "events:write",
  "attendees:write",
  "tickets:write",
  "scanners:manage",
  "emails:send",
  "calendar:write",
  "calendar:viewAll",
  "bookings:host",
];

export const ROLE_CAPABILITIES: Record<AdminRole, readonly Capability[]> = {
  ADMIN: CONSOLE,
  CEO: CONSOLE,
  FACILITATOR: [
    "events:write",
    "attendees:write",
    "tickets:write",
    "emails:send",
    "calendar:write",
    "calendar:viewAll",
    "bookings:host",
  ],
  ACADEMIC: ["calendar:write", "calendar:viewAll", "bookings:host"],
  STAFF: ["calendar:write", "bookings:host"],
};

export const can = (role: AdminRole | string | undefined | null, cap: Capability): boolean =>
  !!role && (ROLE_CAPABILITIES[role as AdminRole]?.includes(cap) ?? false);

export const capabilitiesFor = (role: AdminRole): readonly Capability[] =>
  ROLE_CAPABILITIES[role] ?? [];

/* ------------------------------------------------- Calendar & booking enums */
export const EVENT_MODES = ["IN_PERSON", "ONLINE", "HYBRID"] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export const ACTIVITY_TYPES = [
  "CLASS",
  "MENTORSHIP",
  "REVIEW",
  "MEETING",
  "OFFICE_HOURS",
  "OTHER",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_VISIBILITY = ["ORG", "PRIVATE", "PUBLIC"] as const;
export type ActivityVisibility = (typeof ACTIVITY_VISIBILITY)[number];

export const ACTIVITY_STATUSES = ["SCHEDULED", "CANCELLED", "DESYNCED"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "CANCELLED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const GOOGLE_ACCOUNT_STATUSES = ["CONNECTED", "REVOKED", "ERROR"] as const;
export type GoogleAccountStatus = (typeof GOOGLE_ACCOUNT_STATUSES)[number];

/* What an issued API key may read. Declared here rather than in the model so
   the console can render the scope picker without pulling mongoose into the
   browser bundle; models/ApiKey re-exports it.

   Read-only, both of them. A write scope would need a much harder conversation
   about what a third party may create on the organisation's calendar.

     calendar:read      published events and public sessions, with details
     calendar:freebusy  when bookable staff are busy — times only, never titles */
export const API_KEY_SCOPES = ["calendar:read", "calendar:freebusy"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const CALENDAR_SOURCES = ["EVENT", "ACTIVITY", "BOOKING", "GOOGLE"] as const;
export type CalendarSource = (typeof CALENDAR_SOURCES)[number];

export const TICKET_STATUSES = ["VALID", "USED", "REVOKED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/* ------------------------------------------------------------------ Events */
export type AdminEvent = {
  id: string;
  name: string;
  slug: string;
  category: EventCategory;
  type: EventType;
  startTime: string;
  endTime: string | null;
  gallery: string[];
  organiser: string;
  maxAttendees: number;
  details: string;
  rules: string[];
  status: EventStatus;
  price: string;
  location: string;
  mode: EventMode;
  meetLink: string | null;
  host: { id: string; name: string } | null;
  isPublished: boolean;
};

/* ------------------------------------------------------------ Participants */
type EventRef = { id: string; name?: string; startTime?: string; status?: string } | null;
type TicketRef = {
  code?: string;
  number?: string;
  status: TicketStatus;
  sentAt?: string | null;
  scannedAt: string | null;
} | null;

export type AdminParticipant = {
  id: string;
  type: "PARTICIPANT";
  name: string;
  email: string;
  phone?: string | null;
  stack: Stack | null;
  gender: Gender | null;
  status: ParticipantStatus;
  registrationStatus: RegistrationStatus;
  profilePicture: string | null;
  event: EventRef;
  ticket: TicketRef;
};

export type ScanHistoryItem = { at: string; result: string; scanner: string | null };

export type ParticipantProfile = {
  participant: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    stack: Stack | null;
    gender: Gender | null;
    profilePicture: string | null;
    status: ParticipantStatus;
    registrationStatus: RegistrationStatus;
    registeredAt: string;
    event: { id: string; name: string; startTime: string } | null;
  };
  ticket: {
    id: string;
    ticketNumber: string;
    status: TicketStatus;
    sentAt: string | null;
    scannedAt: string | null;
    qrDataUrl: string;
  } | null;
  attendance: { checkInTime: string | null; history: ScanHistoryItem[] };
  plusOne: {
    id: string;
    name: string;
    email: string;
    guestType: GuestType;
    attendanceStatus: string;
    checkInTime: string | null;
  } | null;
};

/* ----------------------------------------------------------------- Guests */
export type AdminGuest = {
  id: string;
  name: string;
  email: string;
  guestType: GuestType;
  invitedBy: string | null;
  eventId: string | null;
  eventName: string | null;
  addedAt: string;
  ticket: TicketRef;
};

export type GuestProfile = {
  guest: {
    id: string;
    name: string;
    email: string;
    profile: string | null;
    guestType: GuestType;
    registeredAt: string;
    event: { id: string; name: string; startTime: string } | null;
    inviter: { id: string; name: string; email: string } | null;
  };
  ticket: {
    id: string;
    ticketNumber: string;
    status: TicketStatus;
    sentAt: string | null;
    scannedAt: string | null;
    qrDataUrl: string;
  } | null;
  attendance: { checkInTime: string | null; history: ScanHistoryItem[] };
};

/* ---------------------------------------------------------------- Tickets */
export type AdminTicket = {
  id: string;
  ticketNumber: string;
  participantId: string;
  participantName: string;
  ownerType: "Participant" | "Guest";
  eventId: string;
  eventName: string | null;
  registeredAt: string;
  status: TicketStatus;
  scannedAt: string | null;
  cancelledAt: string | null;
  qrDataUrl?: string;
};

/* --------------------------------------------------------------- Scanners */
export type AdminScanner = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

/* ------------------------------------------------------------------ Staff */
export type AdminStaff = {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  title: string | null;
  avatarUrl: string | null;
  bio: string | null;
  active: boolean;
  /* explicit grant to operate the gate scanner — a per-account override that
     lets any staff member scan without a separate device login */
  canScan: boolean;
  createdAt: string;
};

/* ---------------------------------------------------------- Notifications */
export type AdminNotification = {
  id: string;
  kind: "CHECK_IN" | "SCAN_ALERT" | "GUEST_ADDED" | "SYSTEM";
  severity: "info" | "success" | "warning" | "error";
  title: string;
  body: string;
  read: boolean;
  at: string;
};

/* ---------------------------------------------------------------- Audit */
export type AuditRow = {
  id: string;
  actorName: string;
  actorEmail: string;
  action: string;
  category: "AUTH" | "STAFF" | "CALENDAR" | "BOOKING" | "EVENT" | "TICKET" | "SYSTEM";
  targetLabel: string;
  targetType: string;
  targetId: string;
  summary: string;
  changed: string[];
  at: string;
};

/* -------------------------------------------------------------- Dashboard */
export type DashboardStats = {
  global: {
    totalEvents: number;
    totalGuests: number;
    totalTicketsGenerated: number;
    totalTicketsSent: number;
    totalTicketsScanned: number;
    activeEvents: number;
    completedEvents: number;
    upcomingEvents: number;
  };
  attendance: {
    currentAttendance: number;
    totalAttendance: number;
    liveAttendanceRate: number;
    averageAttendance: number;
    hourlyCheckins: { hour: string; count: number }[];
    dailyCheckins: { day: string; count: number }[];
  };
};

export type EventStat = {
  event: {
    id: string;
    name: string;
    slug: string;
    startTime: string;
    endTime: string | null;
    location: string;
    category: string;
    type: string;
    price: string;
    gallery: string[];
    status: EventStatus;
    maxAttendees: number;
    isPublished: boolean;
  };
  fullness: { issued: number; capacity: number };
  checkedIn: number;
  totalAttendees: number;
  participants: number;
  guests: number;
  confirmed: number;
  plusOneCount: number;
  totalGuestsIncludingPlusOnes: number;
  ticketsSent: number;
  ticketsPending: number;
  ticketsScanned: number;
  attendancePercentage: number;
  remainingCapacity: number | null;
  faces: { name: string; photoUrl: string }[];
  byStack: { _id: { stack: string | null; status: string }; n: number }[];
  tickets: Record<string, number>;
};

/* --------------------------------------------------------------- Emails */
export const EMAIL_KINDS = [
  "MAGIC_LINK",
  "CONFIRMATION",
  "PLUS_ONE_INVITE",
  "TICKET",
  "TICKET_NUDGE",
  "REMINDER",
  "PROGRESS_REMINDER",
  "PLUS_ONE_REVOKED",
  "UPDATE",
  "BOOKING_CONFIRMED",
  "BOOKING_HOST_NOTICE",
  "BOOKING_CANCELLED",
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export type EmailLogRow = {
  id: string;
  kind: EmailKind;
  to: string;
  subject: string;
  status: "SENT" | "FAILED";
  error: string | null;
  at: string;
};

export type EmailFunnelRow = {
  eventId: string;
  eventName: string;
  started: number;
  neverVerified: number;
  verifiedNotCompleted: number;
  completed: number;
};

export type EmailReport = {
  totals: {
    sent: number;
    failed: number;
    sentLast7d: number;
    byKind: Record<EmailKind, { sent: number; failed: number }>;
  };
  upcoming: {
    ticketQueued: number;
    awaitingTicketEmail: number;
    confirmationQueued: number;
    reminderPool: number;
    total: number;
  };
  funnel: {
    overall: Omit<EmailFunnelRow, "eventId" | "eventName"> & {
      abandoned: number;
      completionRate: number;
    };
    perEvent: EmailFunnelRow[];
  };
};

export type EmailTemplatePreview = {
  /* a kind, or a guest-type pass variant like "TICKET_VIP" */
  id: string;
  name: string;
  description: string;
  subject: string;
  html: string;
};

export type EmailDetail = EmailLogRow & { html: string };

export type SendPassResult = {
  requested: number;
  sent: number;
  failed: number;
  results: {
    id: string;
    name: string;
    email: string;
    action: "TICKET" | "NUDGE";
    ok: boolean;
    error?: string;
  }[];
};

/* result of a daily progress-reminder run (cron or admin "run now") */
export type ReminderSummary = {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
};

/* per-event engagement stats (GET /api/admin/events/[id]/stats) */
export type EventEngagement = {
  funnel: { pending: number; verified: number; complete: number; total: number };
  reminderPool: {
    verifyEmail: number;
    finishProfile: number;
    invitePlusOne: number;
    total: number;
  };
  plusOne: { has: number; none: number };
  emails: { total: number; byKind: Record<EmailKind, { sent: number; failed: number }> };
};

/* ------------------------------------------------------------- Calendar */
/* Every calendar surface renders one normalised shape, whatever the item
   actually came from — a ticketed Event, a staff Activity, a 1:1 Booking, or
   the viewer's own Google Calendar. One chip component, one sort, one lane
   packer. */
export type CalendarItem = {
  id: string;
  source: CalendarSource;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  ownerId: string | null;
  ownerName: string | null;
  type: string | null;
  mode: EventMode | null;
  location: string;
  meetLink: string | null;
  status: string | null;
  /* where clicking it goes in the console; null for read-only Google items */
  href: string | null;
  /* true when the details were withheld and only the busy block is shown */
  redacted: boolean;
  /* Set for activities only: who can see this on the public site. It is what
     lets the grid mark, at a glance, which of your blocks the world can read —
     the difference between an internal note and a published session is not
     something anyone should have to open a dialog to find out.
     Null on redacted items: the visibility of a block you are not allowed to
     read is itself a detail you are not allowed to read. */
  visibility: ActivityVisibility | null;
};

/* One event as the calendar's detail panel reads it — GET /api/admin/events/:id.
   Narrower than AdminEvent on purpose: no attendee or ticket data, because a
   wider set of roles can read this than can open the console's event pages. */
export type CalendarEventDetail = {
  id: string;
  name: string;
  slug: string;
  category: string;
  type: string;
  startTime: string;
  endTime: string | null;
  organiser: string;
  maxAttendees: number;
  registeredCount: number;
  details: string;
  status: string;
  price: string;
  location: string;
  isPublished: boolean;
  mode: EventMode;
  meetLink: string | null;
  host: string | null;
  archivedAt: string | null;
};

export type CalendarPerson = {
  id: string;
  name: string;
  role: AdminRole;
  title: string | null;
  googleConnected: boolean;
  bookable: boolean;
};

export type DirectoryStatus = "BUSY" | "FREE" | "INACTIVE";

export type DirectoryPerson = {
  id: string;
  name: string;
  photoUrl: string | null;
  role: AdminRole;
  title: string | null;
  googleConnected: boolean;
  bookable: boolean;
  status: DirectoryStatus;
  nowLabel: string | null;
};

export type CalendarFeed = {
  from: string;
  to: string;
  timezone: string;
  people: CalendarPerson[];
  items: CalendarItem[];
  /* set when the viewer's own Google connection could not be read, so the UI
     can say "your Google events are missing" instead of quietly omitting them */
  googleError: string | null;
};

export type AdminActivity = {
  id: string;
  title: string;
  description: string;
  type: ActivityType;
  start: string;
  end: string;
  mode: EventMode;
  location: string;
  visibility: ActivityVisibility;
  attendees: { email: string; name: string }[];
  eventId: string | null;
  meetLink: string | null;
  googleEventId: string | null;
  status: ActivityStatus;
  owner: { id: string; name: string; role: AdminRole } | null;
};
