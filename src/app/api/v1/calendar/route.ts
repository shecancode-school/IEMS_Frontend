import { dbConnect } from "@/lib/db";
import { Admin, Event } from "@/models";
import { requireApiKey } from "@/lib/apiKey";
import { publicActivities } from "@/lib/calendar/publicFeed";
import { toVenueEvent } from "@/lib/eventView";
import { addDaysISO, dayRangeISO, eventDayISO, kigaliDayEnd, kigaliDayStart, EVENT_TZ } from "@/lib/time";
import { ok, fail } from "@/lib/http";
import type { VenueEvent } from "@/lib/events";

/* The integration feed: published events and public staff sessions in one
   list, for embedding the organisation's calendar in another website.

   This is versioned (`/api/v1/`) and key-authenticated, unlike `/api/events`
   which stays anonymous because the marketing site renders itself with it.
   The split matters: the anonymous route can change shape whenever the
   landing page needs it to, while this one is a promise to outside callers. */

const MAX_RANGE_DAYS = 366;

export async function GET(req: Request) {
  const auth = await requireApiKey(req, "calendar:read");
  if (!auth.ok) {
    const res = fail(auth.message, auth.status);
    if (auth.error === "rate_limited") res.headers.set("Retry-After", String(auth.retryAfter));
    if (auth.error === "missing" || auth.error === "invalid") {
      res.headers.set("WWW-Authenticate", 'ApiKey realm="IEMS", header="x-api-key"');
    }
    return res;
  }

  const params = new URL(req.url).searchParams;
  const today = eventDayISO(new Date());
  const from = params.get("from") ?? today;
  const to = params.get("to") ?? addDaysISO(from, 90);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return fail("`from` and `to` must be YYYY-MM-DD dates");
  }
  if (to < from) return fail("`to` must not be before `from`");
  if (dayRangeISO(from, to).length > MAX_RANGE_DAYS) {
    return fail(`Ask for at most ${MAX_RANGE_DAYS} days at a time`);
  }

  const windowStart = kigaliDayStart(from);
  const windowEnd = kigaliDayEnd(to);
  const now = new Date();

  await dbConnect();
  const [events, activities] = await Promise.all([
    Event.find({
      status: { $ne: "DRAFT" },
      isPublished: true,
      archivedAt: null,
      startTime: { $gte: windowStart, $lte: windowEnd },
    }).sort({ startTime: 1 }),
    publicActivities(windowStart, windowEnd, now),
  ]);

  const hostIds = [...new Set(events.flatMap((e) => (e.host ? [e.host.toString()] : [])))];
  const hosts = hostIds.length
    ? await Admin.find({ _id: { $in: hostIds }, active: true }).select("name")
    : [];
  const hostName = new Map(hosts.map((h) => [h._id.toString(), h.name]));

  const items: VenueEvent[] = [
    ...events.map((e) =>
      toVenueEvent(e, now, e.host ? (hostName.get(e.host.toString()) ?? null) : null)
    ),
    ...activities,
  ].sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const res = ok({
    from,
    to,
    timezone: EVENT_TZ,
    count: items.length,
    items: items.map((i) => ({
      id: i.id,
      kind: i.kind,
      title: i.title,
      category: i.category,
      type: i.type,
      host: i.host,
      start: i.startsAt,
      end: i.endsAt,
      /* the Kigali calendar day, so a caller can bucket by day without
         re-deriving the timezone themselves */
      day: i.date,
      location: i.space,
      price: i.price,
      status: i.lifecycleStatus,
      capacity: i.capacity || null,
      remaining: i.remainingSlots,
      url: i.kind === "EVENT" ? `/events/${i.id}` : null,
    })),
  });

  /* short public cache: the feed changes only when someone publishes */
  res.headers.set("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=600");
  return res;
}
