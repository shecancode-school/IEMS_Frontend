import { Admin, Availability, Booking, CalendarActivity, Event, type AdminDoc } from "@/models";
import { listEvents } from "@/lib/google/calendar";
import { googleErrorMessage } from "@/lib/google/errors";
import { connectedAdminIds, getGoogleSession } from "@/lib/google/tokens";
import { addDaysISO, dayRangeISO, kigaliDayEnd, kigaliDayStart, EVENT_TZ } from "@/lib/time";
import { can, type CalendarFeed, type CalendarItem, type CalendarPerson } from "@/types/admin";
import type { StaffAuth } from "@/lib/auth";
import { activityToItem, bookingToItem, byStart, eventToItem, googleToItem } from "./items";

/* A range this wide is nearly always a bug in the caller, and it would make us
   fan out a Google request per person per view. */
export const MAX_RANGE_DAYS = 92;

export type FeedOptions = {
  from: string;
  to: string;
  people?: string[];
  sources?: string[];
  includeGoogle?: boolean;
  /* /api/admin/calendar/me — restrict everything to the viewer */
  mineOnly?: boolean;
};

export function parseRange(params: URLSearchParams): { from: string; to: string } | string {
  const today = new Date().toISOString().slice(0, 10);
  const from = params.get("from") ?? today;
  const to = params.get("to") ?? addDaysISO(from, 6);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return "`from` and `to` must be YYYY-MM-DD dates";
  }
  if (to < from) return "`to` must not be before `from`";
  if (dayRangeISO(from, to).length > MAX_RANGE_DAYS) {
    return `Range too wide — at most ${MAX_RANGE_DAYS} days per request`;
  }
  return { from, to };
}

/* The org roster. Deliberately includes people with no Google connection —
   they still own activities and still need a lane on the calendar. */
export async function staffRoster(ids?: string[]): Promise<AdminDoc[]> {
  const filter = ids?.length ? { _id: { $in: ids }, active: true } : { active: true };
  return Admin.find(filter).sort({ name: 1 });
}

export async function buildFeed(viewer: StaffAuth, opts: FeedOptions): Promise<CalendarFeed> {
  const windowStart = kigaliDayStart(opts.from);
  const windowEnd = kigaliDayEnd(opts.to);
  const seesEveryone = can(viewer.role, "calendar:viewAll") && !opts.mineOnly;

  /* who the viewer is allowed to look at, intersected with who they asked for */
  const roster = await staffRoster(opts.mineOnly ? [viewer.id] : opts.people);
  const visiblePeople = seesEveryone ? roster : roster.filter((a) => a._id.toString() === viewer.id);
  const personIds = visiblePeople.map((a) => a._id.toString());
  const nameById = new Map(personIds.map((id, i) => [id, visiblePeople[i].name]));

  const wants = (source: string) => !opts.sources?.length || opts.sources.includes(source);
  const items: CalendarItem[] = [];

  /* --- ticketed events ------------------------------------------------- */
  if (wants("EVENT") && !opts.mineOnly) {
    const events = await Event.find({
      archivedAt: null,
      startTime: { $gte: windowStart, $lte: windowEnd },
    }).sort({ startTime: 1 });
    for (const e of events) items.push(eventToItem(e));
  } else if (wants("EVENT") && opts.mineOnly) {
    /* on "my schedule", only the events this person actually runs */
    const events = await Event.find({
      archivedAt: null,
      host: viewer.id,
      startTime: { $gte: windowStart, $lte: windowEnd },
    }).sort({ startTime: 1 });
    for (const e of events) items.push(eventToItem(e));
  }

  /* --- staff activities ------------------------------------------------ */
  if (wants("ACTIVITY")) {
    const activities = await CalendarActivity.find({
      owner: { $in: personIds },
      status: { $ne: "CANCELLED" },
      start: { $lte: windowEnd },
      end: { $gte: windowStart },
    }).sort({ start: 1 });

    for (const a of activities) {
      const ownerId = a.owner.toString();
      /* PRIVATE is private from everyone but its owner, whatever their role —
         a CEO seeing "calendar:viewAll" still doesn't get to read a
         facilitator's personal appointment. They see the busy block. */
      const canSeeDetail = a.visibility !== "PRIVATE" || ownerId === viewer.id;
      items.push(
        activityToItem(a, { id: ownerId, name: nameById.get(ownerId) ?? "" }, { canSeeDetail })
      );
    }
  }

  /* --- 1:1 bookings ---------------------------------------------------- */
  if (wants("BOOKING")) {
    const bookings = await Booking.find({
      host: { $in: personIds },
      active: true,
      start: { $lte: windowEnd },
      end: { $gte: windowStart },
    }).sort({ start: 1 });

    for (const b of bookings) {
      const hostId = b.host.toString();
      /* the requester's name, email and topic belong to the host — everyone
         else on the org calendar just needs to know the host is occupied */
      const canSeeDetail = hostId === viewer.id || can(viewer.role, "staff:manage");
      items.push(
        bookingToItem(b, { id: hostId, name: nameById.get(hostId) ?? "" }, { canSeeDetail })
      );
    }
  }

  /* --- the viewer's own Google Calendar -------------------------------- */
  let googleError: string | null = null;
  if (opts.includeGoogle && wants("GOOGLE")) {
    try {
      const session = await getGoogleSession(viewer.id);
      if (session) {
        const events = await listEvents(viewer.id, windowStart, windowEnd);
        const me = { id: viewer.id, name: nameById.get(viewer.id) ?? "" };
        for (const g of events) items.push(googleToItem(g, me));
      }
    } catch (err) {
      /* a dead Google connection must not take the whole calendar down with
         it — the rest of the feed is still correct and useful */
      googleError = googleErrorMessage(err);
    }
  }

  const connected = await connectedAdminIds(personIds);
  const bookable = new Set(
    (await Availability.find({ admin: { $in: personIds }, bookable: true }).select("admin")).map(
      (a) => a.admin.toString()
    )
  );
  const people: CalendarPerson[] = visiblePeople.map((a) => ({
    id: a._id.toString(),
    name: a.name,
    role: a.role,
    title: a.title ?? null,
    googleConnected: connected.has(a._id.toString()),
    bookable: bookable.has(a._id.toString()),
  }));

  return {
    from: opts.from,
    to: opts.to,
    timezone: EVENT_TZ,
    people,
    items: items.sort(byStart),
    googleError,
  };
}
