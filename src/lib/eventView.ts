import { isValidObjectId } from "mongoose";
import { Event, eventDeadline, type EventDoc } from "@/models";
import { eventDayISO, formatEventTime } from "./time";
import type { VenueEvent } from "./events";

/* Resolve a public (published, non-draft) event by either its ObjectId or its
   slug — the read endpoints accept both. Returns null when not found/visible. */
export async function findPublicEvent(idOrSlug: string): Promise<EventDoc | null> {
  const or: Record<string, unknown>[] = [{ slug: idOrSlug }];
  if (isValidObjectId(idOrSlug)) or.push({ _id: idOrSlug });
  return Event.findOne({ status: { $ne: "DRAFT" }, isPublished: true, archivedAt: null, $or: or });
}

/* Lifecycle status computed from the clock + capacity, distinct from the
   manual registration gate (Event.status: DRAFT/OPEN/CLOSED). */
export type ComputedEventStatus = "Upcoming" | "Ongoing" | "Completed" | "Full";

export function computeStatus(event: EventDoc, now = new Date()): ComputedEventStatus {
  const deadline = eventDeadline(event);
  if (now > deadline) return "Completed";
  if (now >= event.startTime) return "Ongoing";
  if (event.maxAttendees > 0 && event.registeredCount >= event.maxAttendees) return "Full";
  return "Upcoming";
}

export function remainingSlots(event: EventDoc): number | null {
  if (event.maxAttendees <= 0) return null; // uncapped
  return Math.max(0, event.maxAttendees - event.registeredCount);
}

export function isFull(event: EventDoc): boolean {
  return event.maxAttendees > 0 && event.registeredCount >= event.maxAttendees;
}

/* The public event response shape required by the API spec. */
export function eventView(event: EventDoc, now = new Date()) {
  return {
    id: event._id,
    title: event.name,
    slug: event.slug,
    description: event.details,
    category: event.category,
    type: event.type,
    startTime: event.startTime,
    endTime: event.endTime ?? null,
    location: event.location,
    organiser: event.organiser,
    price: event.price,
    gallery: event.gallery,
    rules: event.rules,
    capacity: event.maxAttendees,
    registeredParticipants: event.registeredCount,
    remainingSlots: remainingSlots(event),
    isFull: isFull(event),
    status: computeStatus(event, now),
    /* the manual registration gate, kept separate from lifecycle status */
    registrationStatus: event.status,
    isPublished: event.isPublished,
  };
}

export function capacityView(event: EventDoc) {
  return {
    capacity: event.maxAttendees,
    registered: event.registeredCount,
    remaining: remainingSlots(event),
    isFull: isFull(event),
  };
}

/* day + clock strings are computed in the event timezone, never the server's
   — on UTC hosts the old server-local formatting showed times two hours off */

/* The landing-page calendar shape, now carrying capacity + lifecycle status. */
export function toVenueEvent(e: EventDoc, now = new Date()): VenueEvent {
  return {
    id: e.slug,
    title: e.name,
    category: e.category,
    date: eventDayISO(e.startTime),
    time: formatEventTime(e.startTime),
    endTime: e.endTime ? formatEventTime(e.endTime) : "",
    startsAt: e.startTime.toISOString(),
    endsAt: e.endTime ? e.endTime.toISOString() : null,
    space: e.location,
    price: e.price,
    description: e.details,
    type: e.type,
    organiser: e.organiser,
    posterUrl: e.gallery[0] ?? "",
    gallery: e.gallery,
    status: e.status === "OPEN" ? "OPEN" : "CLOSED",
    rules: e.rules,
    soldOut: e.status === "CLOSED" || isFull(e),
    capacity: e.maxAttendees,
    registeredParticipants: e.registeredCount,
    remainingSlots: remainingSlots(e),
    isFull: isFull(e),
    lifecycleStatus: computeStatus(e, now),
  };
}
