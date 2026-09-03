import { dbConnect } from "@/lib/db";
import { Admin } from "@/models";
import { requireStaff, signIcsToken, verifyIcsToken } from "@/lib/auth";
import { buildFeed } from "@/lib/calendar/query";
import { buildIcs, icsResponse } from "@/lib/calendar/ics";
import { appUrl } from "@/lib/appUrl";
import { addDaysISO, eventDayISO } from "@/lib/time";
import { ok, unauthorized } from "@/lib/http";

/* A subscribable calendar feed, so a staff member can see their IEMS schedule
   inside Google Calendar or Outlook without opening the console.

   Two ways in:
     GET (bearer)         → mints the subscription URL for the signed-in person
     GET ?token=<ics jwt> → the feed itself, fetched by the calendar client
*/

/* Calendar clients poll for years; a window this size keeps the response small
   while covering anything anyone would want to see. */
const PAST_DAYS = 30;
const FUTURE_DAYS = 180;

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");

  if (!token) {
    /* no token — this is the console asking for its own subscription link */
    const staff = await requireStaff(req);
    if (!staff) return unauthorized();
    const issued = await signIcsToken(staff.id);
    return ok({
      url: appUrl(`/api/calendar/ics?token=${issued}`),
      /* webcal:// makes most desktop clients subscribe on click rather than
         downloading a one-off snapshot */
      webcalUrl: appUrl(`/api/calendar/ics?token=${issued}`).replace(/^https?:/, "webcal:"),
    });
  }

  const adminId = await verifyIcsToken(token);
  if (!adminId) return unauthorized();

  await dbConnect();
  const admin = await Admin.findById(adminId).select("name role active");
  if (!admin?.active) return unauthorized();

  const today = eventDayISO(new Date());
  const feed = await buildFeed(
    { id: adminId, role: admin.role },
    {
      from: addDaysISO(today, -PAST_DAYS),
      to: addDaysISO(today, FUTURE_DAYS),
      mineOnly: true,
      /* the subscriber's Google Calendar already holds their Google events —
         echoing them back would duplicate every entry */
      includeGoogle: false,
    }
  );

  const ics = buildIcs(
    feed.items.map((item) => ({
      uid: `${item.id}@iems.igirerwanda.org`,
      start: new Date(item.start),
      end: new Date(item.end),
      title: item.title,
      description: item.meetLink ? `Join: ${item.meetLink}` : "",
      location: item.location,
      url: item.href ? appUrl(item.href) : undefined,
    })),
    `IEMS — ${admin.name}`
  );

  return icsResponse(ics, "iems-schedule.ics");
}
