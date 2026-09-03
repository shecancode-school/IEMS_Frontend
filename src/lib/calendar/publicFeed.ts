import { Admin, Availability, CalendarActivity } from "@/models";
import { dbConnect } from "@/lib/db";
import { eventDayISO, formatEventTime } from "@/lib/time";
import type { VenueEvent } from "@/lib/events";

/* What an anonymous visitor may see of the organisation's timetable.

   Two rules, and both are load-bearing:

   1. PUBLIC is the ONLY visibility that leaves this module, and the Mongo
      query says so. Fetching everything and filtering in the component would
      still ship internal titles in the JSON payload — a public feed is
      readable by anyone with the URL, whatever the UI chooses to draw.

   2. Only these fields are projected. `description`, `attendees`,
      `googleEventId` and — most importantly — `meetLink` are deliberately
      absent. A Meet link on a public page is an open door to the call. */

export type PublicActivity = VenueEvent & { kind: "ACTIVITY" };

/* Activities are informational on the public site, so the fields that only
   make sense for a ticketed event are flattened to inert values rather than
   faked. Nothing offers to register for one. */
export async function publicActivities(
  from: Date,
  to: Date,
  now: Date = new Date()
): Promise<PublicActivity[]> {
  await dbConnect();

  const activities = await CalendarActivity.find({
    visibility: "PUBLIC",
    status: { $ne: "CANCELLED" as const },
    start: { $lte: to },
    end: { $gte: from },
  })
    .select("title type start end mode location owner")
    .sort({ start: 1 });

  if (!activities.length) return [];

  /* one lookup for the names rather than a populate per row */
  const ownerIds = [...new Set(activities.map((a) => a.owner.toString()))];
  const owners = await Admin.find({ _id: { $in: ownerIds }, active: true }).select("name title");
  const ownerById = new Map(owners.map((o) => [o._id.toString(), o]));
  const slugByOwner = await bookingSlugs(owners.map((o) => o._id.toString()));

  /* a session run by someone who has since been deactivated keeps its slot on
     the calendar but loses the attribution — better than naming a former
     colleague on a public page */
  return activities.map((a) => {
    const owner = ownerById.get(a.owner.toString());
    return {
      id: `activity-${a._id.toString()}`,
      title: a.title,
      kind: "ACTIVITY" as const,
      host: owner?.name ?? null,
      hostSlug: owner ? (slugByOwner.get(owner._id.toString()) ?? null) : null,
      category: null,
      mode: a.mode,
      date: eventDayISO(a.start),
      time: formatEventTime(a.start),
      endTime: formatEventTime(a.end),
      startsAt: a.start.toISOString(),
      endsAt: a.end.toISOString(),
      /* online sessions say so instead of naming an empty room */
      space: a.mode === "ONLINE" ? "Online" : a.location,
      price: "",
      description: "",
      type: a.type,
      organiser: owner?.title ?? "Igire Rwanda Organization",
      posterUrl: "",
      gallery: [],
      status: "CLOSED" as const,
      rules: [],
      soldOut: false,
      capacity: 0,
      registeredParticipants: 0,
      remainingSlots: null,
      isFull: false,
      lifecycleStatus:
        a.end < now ? ("Completed" as const) : a.start <= now ? ("Ongoing" as const) : ("Upcoming" as const),
    };
  });
}

/* Which of these people take bookings, keyed by admin id.

   Keyed by ID rather than by name on purpose: two colleagues can share a name,
   and a name-keyed map would hand one person's booking page out under the
   other's sessions. The slug itself is already public — it is the /book/<slug>
   URL — so returning it here exposes nothing new. */
export async function bookingSlugs(adminIds: string[]): Promise<Map<string, string>> {
  if (!adminIds.length) return new Map();
  await dbConnect();
  const rows = await Availability.find({
    admin: { $in: adminIds },
    bookable: true,
  }).select("admin slug");
  return new Map(rows.map((r) => [r.admin.toString(), r.slug]));
}
