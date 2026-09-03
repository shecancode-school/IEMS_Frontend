import { dbConnect } from "@/lib/db";
import { loadBookableHost, slotsFor } from "@/lib/scheduling/hosts";
import { addDaysISO, dayRangeISO, eventDayISO, EVENT_TZ } from "@/lib/time";
import { ok, fail, notFound } from "@/lib/http";

/* One call per browse is enough for a month of a single host, and it stops a
   crafted range from fanning out into a long series of Google requests. */
const MAX_DAYS = 31;

/* Public: when is this person free?
   GET /api/book/<slug>/slots?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const params = new URL(req.url).searchParams;

  const today = eventDayISO(new Date());
  const from = params.get("from") ?? today;
  const to = params.get("to") ?? addDaysISO(from, 13);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return fail("`from` and `to` must be YYYY-MM-DD dates");
  }
  if (to < from) return fail("`to` must not be before `from`");
  if (dayRangeISO(from, to).length > MAX_DAYS) {
    return fail(`Ask for at most ${MAX_DAYS} days at a time`);
  }

  await dbConnect();
  const host = await loadBookableHost(slug);
  if (!host) return notFound("Booking page");

  const { days, googleOk } = await slotsFor(host, from, to);

  return ok({
    slug: host.availability.slug,
    name: host.admin.name,
    timezone: EVENT_TZ,
    slotMinutes: host.availability.slotMinutes,
    from,
    to,
    days: days.map((d) => ({
      day: d.day,
      slots: d.slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString() })),
    })),
    /* false means we could not read their Google calendar, so these times may
       clash with something we cannot see. The page says so rather than
       pretending the list is authoritative. */
    complete: googleOk,
  });
}
