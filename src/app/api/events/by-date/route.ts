import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { eventView } from "@/lib/eventView";
import { kigaliDayStart, kigaliDayEnd } from "@/lib/time";
import { ok, fail } from "@/lib/http";

/* Public: events whose start time falls on a given calendar day.
   GET /api/events/by-date?date=YYYY-MM-DD */
export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return fail("A `date` query in YYYY-MM-DD format is required");
  }
  /* the day window is a KIGALI day, not the server's — `new Date("…T00:00:00")`
     parses in the host timezone and slid the window by two hours on a UTC box */
  const dayStart = kigaliDayStart(date);
  if (Number.isNaN(dayStart.getTime())) return fail("Invalid date");
  const dayEnd = kigaliDayEnd(date);

  await dbConnect();
  const now = new Date();
  const events = await Event.find({
    status: { $ne: "DRAFT" },
    isPublished: true,
    archivedAt: null,
    startTime: { $gte: dayStart, $lte: dayEnd },
  }).sort({ startTime: 1 });
  return ok({ date, events: events.map((e) => eventView(e, now)) });
}
