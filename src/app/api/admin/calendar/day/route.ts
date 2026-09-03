import { dbConnect } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { buildFeed } from "@/lib/calendar/query";
import { ok, fail, unauthorized } from "@/lib/http";

/* The general daily calendar: one Kigali day, grouped into per-person lanes,
   so "who is doing what today" is a single request.

   GET /api/admin/calendar/day?date=YYYY-MM-DD */
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  const params = new URL(req.url).searchParams;
  const date = params.get("date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail("A `date` query in YYYY-MM-DD format is required");
  }

  await dbConnect();
  const feed = await buildFeed(staff, {
    from: date,
    to: date,
    includeGoogle: params.get("includeGoogle") === "1",
  });

  /* items with no owner (org-wide events without a host) go in their own lane
     so they are visible rather than silently dropped */
  const lanes = feed.people.map((person) => ({
    person,
    items: feed.items.filter((i) => i.ownerId === person.id),
  }));
  const unassigned = feed.items.filter((i) => !i.ownerId);

  return ok({ ...feed, date, lanes, unassigned });
}
