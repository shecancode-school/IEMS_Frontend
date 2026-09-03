import { dbConnect } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { buildFeed, parseRange } from "@/lib/calendar/query";
import { ok, fail, unauthorized } from "@/lib/http";

/* The unified calendar feed — ticketed events, staff activities and (only for
   the caller themselves) their own Google Calendar, merged into one sorted
   list of identically-shaped items.

   GET /api/admin/calendar?from&to&people=<id,id>&sources=EVENT,ACTIVITY&includeGoogle=1

   Any staff account may call it. What comes back is scoped by role inside
   buildFeed: without calendar:viewAll you see only yourself, and a PRIVATE
   activity belonging to someone else is always reduced to a busy block. */
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  const params = new URL(req.url).searchParams;
  const range = parseRange(params);
  if (typeof range === "string") return fail(range);

  const list = (key: string) =>
    params.get(key)?.split(",").map((v) => v.trim()).filter(Boolean) ?? undefined;

  await dbConnect();
  const feed = await buildFeed(staff, {
    ...range,
    people: list("people"),
    sources: list("sources"),
    includeGoogle: params.get("includeGoogle") === "1",
  });
  return ok(feed);
}
