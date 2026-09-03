import { dbConnect } from "@/lib/db";
import { Admin, Availability } from "@/models";
import { requireApiKey } from "@/lib/apiKey";
import { busyFor } from "@/lib/scheduling/hosts";
import { mergeIntervals } from "@/lib/scheduling/slots";
import {
  addDaysISO,
  dayRangeISO,
  eventDayISO,
  kigaliDayEnd,
  kigaliDayStart,
  EVENT_TZ,
} from "@/lib/time";
import { ok, fail } from "@/lib/http";

/* The busy feed: when the people who publish a booking page are not free.

   This exists so an integrator can show "next open time" on their own site
   without scraping the booking page, and it is deliberately the thinnest thing
   that answers that question:

     - Times only. No title, no attendee, no organiser, no location. What a
       staff member is doing at 2pm is not something an API key buys.
     - Only people who are bookable. Someone who has never published a booking
       page is not in this feed at all, at any size of window. Their working
       pattern is not public information.
     - Intervals are merged, so two back-to-back meetings read as one block.
       How many separate things somebody has on is itself a detail.

   That is the same shape of answer the anonymous /api/book/<slug>/slots page
   already gives the world, inverted — which is the test applied throughout:
   this endpoint may not reveal anything a visitor could not already work out
   from the public booking page. */

/* Deliberately shorter than the 366 days /api/v1/calendar allows. Each day of
   this window is a live Google free/busy query per host, so a year-wide ask
   would be a slow request for us and a rate-limit problem with Google. A month
   at a time is what "when can I book them" actually needs. */
const MAX_RANGE_DAYS = 62;

export async function GET(req: Request) {
  const auth = await requireApiKey(req, "calendar:freebusy");
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
  const to = params.get("to") ?? addDaysISO(from, 14);
  const slug = params.get("host")?.trim().toLowerCase() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return fail("`from` and `to` must be YYYY-MM-DD dates");
  }
  if (to < from) return fail("`to` must not be before `from`");
  if (dayRangeISO(from, to).length > MAX_RANGE_DAYS) {
    return fail(`Ask for at most ${MAX_RANGE_DAYS} days at a time`);
  }

  await dbConnect();
  const rules = await Availability.find({
    bookable: true,
    ...(slug ? { slug } : {}),
  }).select("admin slug slotMinutes");
  if (slug && rules.length === 0) return fail("No bookable host with that slug", 404);

  const admins = await Admin.find({
    _id: { $in: rules.map((r) => r.admin) },
    active: true,
  }).select("name");
  const nameById = new Map(admins.map((a) => [a._id.toString(), a.name]));

  const windowStart = kigaliDayStart(from);
  const windowEnd = kigaliDayEnd(to);

  const hosts = await Promise.all(
    rules
      .filter((r) => nameById.has(r.admin.toString()))
      .map(async (rule) => {
        const adminId = rule.admin.toString();
        const { busy, googleOk } = await busyFor(adminId, from, to);
        return {
          host: rule.slug,
          name: nameById.get(adminId)!,
          slotMinutes: rule.slotMinutes,
          /* clamped to the window before merging, so a meeting that started
             last week does not report last week's start time */
          busy: mergeIntervals(
            busy.map((b) => ({
              start: b.start < windowStart ? windowStart : b.start,
              end: b.end > windowEnd ? windowEnd : b.end,
            }))
          ).map((b) => ({ start: b.start.toISOString(), end: b.end.toISOString() })),
          /* false when their Google calendar could not be read, so the blocks
             below are their IEMS bookings alone and may be incomplete. Stated
             rather than smoothed over — a caller offering a time we said was
             free deserves to know how confident that answer is. */
          complete: googleOk,
        };
      })
  );

  const res = ok({
    from,
    to,
    timezone: EVENT_TZ,
    hosts: hosts.sort((a, b) => a.name.localeCompare(b.name)),
  });

  /* Shorter than the events feed: a booking taken thirty seconds ago has to
     stop looking free quickly. */
  res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
  return res;
}
