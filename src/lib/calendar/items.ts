import type { EventDoc } from "@/models/Event";
import type { CalendarActivityDoc } from "@/models/CalendarActivity";
import type { BookingDoc } from "@/models/Booking";
import type { NormalizedGoogleEvent } from "@/lib/google/calendar";
import type { CalendarItem } from "@/types/admin";

/* Turning each source into the one shape the calendar renders. Kept out of the
   route handlers so the visibility rules live in a single readable place —
   they are the part that would leak private information if they drifted. */

type Owner = { id: string; name: string } | null;

export function eventToItem(e: EventDoc): CalendarItem {
  return {
    id: `event:${e._id.toString()}`,
    source: "EVENT",
    title: e.name,
    start: e.startTime.toISOString(),
    end: (e.endTime ?? e.startTime).toISOString(),
    allDay: false,
    ownerId: e.host ? e.host.toString() : null,
    ownerName: null,
    type: e.type,
    mode: e.mode ?? "IN_PERSON",
    location: e.location ?? "",
    meetLink: e.meetLink || null,
    status: e.status,
    href: `/admin/events/${e._id.toString()}`,
    redacted: false,
    /* only activities have one */
    visibility: null,
  };
}

/* A PRIVATE activity still has to occupy the person's lane — otherwise the
   calendar would show them free when they are not — but nobody except the
   owner learns what it is. */
export function activityToItem(
  a: CalendarActivityDoc,
  owner: Owner,
  opts: { canSeeDetail: boolean }
): CalendarItem {
  const redacted = !opts.canSeeDetail;
  return {
    id: `activity:${a._id.toString()}`,
    source: "ACTIVITY",
    title: redacted ? "Busy" : a.title,
    start: a.start.toISOString(),
    end: a.end.toISOString(),
    allDay: false,
    ownerId: a.owner.toString(),
    ownerName: owner?.name ?? null,
    type: redacted ? null : a.type,
    mode: redacted ? null : a.mode,
    location: redacted ? "" : a.location,
    meetLink: redacted ? null : (a.meetLink || null),
    status: a.status,
    href: redacted ? null : `/admin/calendar?activity=${a._id.toString()}`,
    redacted,
    visibility: redacted ? null : a.visibility,
  };
}

/* A booking carries someone else's name, email and topic. The host and
   administrators see all of it; anyone else browsing the org calendar sees
   only that the host is occupied. */
export function bookingToItem(
  b: BookingDoc,
  owner: Owner,
  opts: { canSeeDetail: boolean }
): CalendarItem {
  const redacted = !opts.canSeeDetail;
  return {
    id: `booking:${b._id.toString()}`,
    source: "BOOKING",
    title: redacted ? "Busy" : `${b.requesterName} (booking)`,
    start: b.start.toISOString(),
    end: b.end.toISOString(),
    allDay: false,
    ownerId: b.host.toString(),
    ownerName: owner?.name ?? null,
    type: null,
    mode: b.meetLink ? "ONLINE" : null,
    location: "",
    meetLink: redacted ? null : (b.meetLink || null),
    status: b.status,
    href: redacted ? null : "/admin/bookings",
    redacted,
    /* only activities have one */
    visibility: null,
  };
}

/* Only ever built for the viewer's own calendar — see the guard in
   /api/admin/calendar. These are not persisted anywhere. */
export function googleToItem(g: NormalizedGoogleEvent, owner: Owner): CalendarItem {
  return {
    id: `google:${g.id}`,
    source: "GOOGLE",
    title: g.title,
    start: g.start.toISOString(),
    end: g.end.toISOString(),
    allDay: g.allDay,
    ownerId: owner?.id ?? null,
    ownerName: owner?.name ?? null,
    type: null,
    mode: g.meetLink ? "ONLINE" : null,
    location: g.location,
    meetLink: g.meetLink,
    status: null,
    href: g.htmlLink,
    redacted: false,
    /* only activities have one */
    visibility: null,
  };
}

export const byStart = (a: CalendarItem, b: CalendarItem) =>
  a.start.localeCompare(b.start) || a.end.localeCompare(b.end);
