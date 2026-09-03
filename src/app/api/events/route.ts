import { dbConnect } from "@/lib/db";
import { Admin, Event } from "@/models";
import { ok } from "@/lib/http";
import { subscribeContentChanges } from "@/lib/scanBus";
import { toVenueEvent } from "@/lib/eventView";
import { bookingSlugs, publicActivities } from "@/lib/calendar/publicFeed";
import { addDaysISO, eventDayISO, kigaliDayEnd, kigaliDayStart } from "@/lib/time";
import type { VenueEvent } from "@/lib/events";

/* Public events feed for the landing page calendar / up-next card.

   It carries two kinds of item: ticketed events, and the staff sessions
   someone explicitly marked PUBLIC. Both arrive in the same shape, so the
   whole public site reads one feed and one cache.

   Responses are cached in-process for CACHE_TTL_MS and marked cacheable
   downstream, so the DB isn't hit on every visitor. */

const CACHE_TTL_MS = 60_000;

/* How much of the timetable the public calendar can reach.

   These bound what the month arrows can show: MonthCalendar lets a visitor
   walk PAST_MONTHS back and FUTURE_MONTHS forward, and a month outside this
   window would render confidently empty while the database says otherwise.
   Keep the two in step — src/components/MonthCalendar.tsx. */
const PAST_DAYS = 200;
const FUTURE_DAYS = 400;

let cache: { at: number; events: VenueEvent[] } | null = null;

/* admin edits bust the cache instantly so live subscribers refetch fresh data */
const globalSub = globalThis as unknown as { __iemsEventsCacheSub?: boolean };
if (!globalSub.__iemsEventsCacheSub) {
  globalSub.__iemsEventsCacheSub = true;
  subscribeContentChanges(() => {
    cache = null;
  });
}

async function loadEvents(): Promise<VenueEvent[]> {
  await dbConnect();
  const now = new Date();
  const today = eventDayISO(now);

  const [events, activities] = await Promise.all([
    Event.find({
      status: { $ne: "DRAFT" },
      isPublished: true,
      archivedAt: null,
    }).sort({ startTime: 1 }),
    publicActivities(
      kigaliDayStart(addDaysISO(today, -PAST_DAYS)),
      kigaliDayEnd(addDaysISO(today, FUTURE_DAYS)),
      now
    ),
  ]);

  /* Host names come from one extra indexed lookup rather than a populate:
     populating rewrites EventDoc's `host` from an ObjectId to a document and
     the mapper below still expects the plain shape. */
  const hostIds = [...new Set(events.flatMap((e) => (e.host ? [e.host.toString()] : [])))];
  const hosts = hostIds.length
    ? await Admin.find({ _id: { $in: hostIds }, active: true }).select("name")
    : [];
  const hostName = new Map(hosts.map((h) => [h._id.toString(), h.name]));
  /* the same booking slug the activities carry, so an event and a session run
     by the same person group into one person's calendar */
  const hostSlug = await bookingSlugs(hosts.map((h) => h._id.toString()));

  const items: VenueEvent[] = [
    ...events.map((e) => {
      const id = e.host?.toString();
      return toVenueEvent(
        e,
        now,
        id ? (hostName.get(id) ?? null) : null,
        id ? (hostSlug.get(id) ?? null) : null
      );
    }),
    ...activities,
  ];

  /* one chronological list, so the calendar grid and the upcoming list both
     get their items in order without sorting again */
  return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function GET() {
  if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
    cache = { at: Date.now(), events: await loadEvents() };
  }
  const res = ok({ events: cache.events });
  /* max-age=0 keeps browsers revalidating so SSE-triggered refetches see
     fresh data the moment an admin edits an event */
  res.headers.set("Cache-Control", "public, max-age=0, s-maxage=30, stale-while-revalidate=300");
  return res;
}
