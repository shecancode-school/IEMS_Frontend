import { Schema, model, models, type Model, type Types } from "mongoose";
import { endOfEventDay } from "@/lib/time";
import { EVENT_MODES, type EventMode } from "@/types/admin";

export { EVENT_MODES };
export type { EventMode };

/* IRO's real program areas — drives the public calendar colour coding */
export const EVENT_CATEGORIES = [
  "SheCanCODE",
  "Entrepreneurship",
  "Web Fundamentals",
  "Advanced Backend",
  "Advanced Frontend",
  "Mentorship",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/* the format the session takes — drives filtering + the badge on the card */
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

/* DRAFT: being prepared, not visible
   OPEN: taking registrations right now
   CLOSED: registrations closed / event finished */
export const EVENT_STATUSES = ["DRAFT", "OPEN", "CLOSED"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export interface EventDoc {
  /** 2. id of the event */
  _id: Types.ObjectId;
  /** 1. name of the event */
  name: string;
  /** 3. slug of the event */
  slug: string;
  /** 4. category */
  category: EventCategory;
  /** 5. type of the event */
  type: EventType;
  /** 6. start time of the event */
  startTime: Date;
  /** 7. end time of the event — optional; the public site hides it if unset */
  endTime?: Date | null;
  /** 8. event gallery (Cloudinary image URLs) */
  gallery: string[];
  /** 9. event organiser */
  organiser: string;
  /** 10. max number of attendees — minimum of zero (0 = unlimited/uncapped) */
  maxAttendees: number;
  /** atomic capacity counter — reserved slots (non-revoked tickets). Source of
      truth for concurrency-safe capacity checks; reconciled with tickets. */
  registeredCount: number;
  /** 11. details on the event */
  details: string;
  /** 12. rules and regulations of the event */
  rules: string[];
  /** 13. status */
  status: EventStatus;
  /** 14. price */
  price: string;
  /** 15. location */
  location: string;
  /** 16. is published — gate that exposes the event on the public calendar */
  isPublished: boolean;
  /* IN_PERSON | ONLINE | HYBRID. Online and hybrid events carry a Meet link
     that is emailed to registrants along with their pass. */
  mode: EventMode;
  meetLink?: string | null;
  googleEventId?: string | null;
  /* the staff member running it — puts the event in their lane on the org
     calendar, and owns the Google Calendar copy that holds the Meet link */
  host?: Types.ObjectId | null;
  /** archived events are hidden from the public site + active lists */
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const EventSchema = new Schema<EventDoc>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    category: { type: String, enum: EVENT_CATEGORIES, default: "Mentorship" },
    type: { type: String, enum: EVENT_TYPES, default: "WORKSHOP" },
    startTime: { type: Date, required: true },
    endTime: { type: Date, default: null },
    gallery: { type: [String], default: [] },
    organiser: { type: String, trim: true, default: "Igire Rwanda Organization" },
    maxAttendees: { type: Number, default: 0, min: 0 },
    registeredCount: { type: Number, default: 0, min: 0 },
    details: { type: String, default: "" },
    rules: { type: [String], default: [] },
    status: { type: String, enum: EVENT_STATUSES, default: "DRAFT" },
    price: { type: String, default: "Free" },
    location: { type: String, default: "" },
    isPublished: { type: Boolean, default: false },
    mode: { type: String, enum: EVENT_MODES, default: "IN_PERSON" },
    meetLink: { type: String, default: "" },
    googleEventId: { type: String, default: null },
    host: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Event: Model<EventDoc> =
  (models.Event as Model<EventDoc>) ?? model<EventDoc>("Event", EventSchema);

/* Every ticket expires when its event wraps up: the explicit end time when
   one is set, otherwise the end of the event day (in Kigali time — computing
   it in server-local time shifted the deadline on UTC hosts). */
export function eventDeadline(event: Pick<EventDoc, "startTime" | "endTime">): Date {
  if (event.endTime) return new Date(event.endTime);
  return endOfEventDay(event.startTime);
}
