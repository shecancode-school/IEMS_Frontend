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
