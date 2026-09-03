import { dbConnect } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { Availability } from "@/models";
import { connectedAdminIds } from "@/lib/google/tokens";
import { staffRoster } from "@/lib/calendar/query";
import { can } from "@/types/admin";
import { ok, unauthorized } from "@/lib/http";

/* The roster behind the calendar's person filter. Someone without
   calendar:viewAll only ever sees themselves, so the filter shows one entry
   rather than leaking the shape of the org. */
export async function GET(req: Request) {
  const staff = await requireStaff(req);
  if (!staff) return unauthorized();

  await dbConnect();
  const all = await staffRoster();
  const visible = can(staff.role, "calendar:viewAll")
    ? all
    : all.filter((a) => a._id.toString() === staff.id);

  const ids = visible.map((a) => a._id.toString());
  const connected = await connectedAdminIds(ids);
  const bookable = new Set(
    (await Availability.find({ admin: { $in: ids }, bookable: true }).select("admin")).map((a) =>
      a.admin.toString()
    )
  );

  return ok({
    people: visible.map((a) => ({
      id: a._id.toString(),
      name: a.name,
      role: a.role,
      title: a.title ?? null,
      googleConnected: connected.has(a._id.toString()),
      bookable: bookable.has(a._id.toString()),
      isYou: a._id.toString() === staff.id,
    })),
  });
}
