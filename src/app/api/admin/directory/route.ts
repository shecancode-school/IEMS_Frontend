import { requireStaff } from "@/lib/auth";
import { directorySnapshot } from "@/lib/calendar/directory";
import { ok, unauthorized } from "@/lib/http";

/* The team directory: a "right now" snapshot of every staff member — photo,
   role, title, Google connection, bookability, and whether they are currently
   engaged (derived from activities, bookings, hosted events and Google busy).

   GET /api/admin/directory */

export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();
  return ok({ people: await directorySnapshot(staff) });
}
