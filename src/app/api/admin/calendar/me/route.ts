import { dbConnect } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { buildFeed, parseRange } from "@/lib/calendar/query";
import { ok, fail, unauthorized } from "@/lib/http";

/* My schedule: the caller's own activities, the events they host, and their
   own Google Calendar. Google is included by default here — this is the one
   view where seeing your real day is the entire point. */
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  const params = new URL(req.url).searchParams;
  const range = parseRange(params);
  if (typeof range === "string") return fail(range);

  await dbConnect();
  const feed = await buildFeed(staff, {
    ...range,
    mineOnly: true,
    includeGoogle: params.get("includeGoogle") !== "0",
  });
  return ok(feed);
}
