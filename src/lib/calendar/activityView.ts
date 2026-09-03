import type { CalendarActivityDoc } from "@/models/CalendarActivity";
import type { AdminActivity, AdminRole } from "@/types/admin";

type OwnerRef = { _id: unknown; name: string; role: AdminRole } | null | undefined;

/* Shared shape for the activity endpoints. `owner` is populated on list/detail
   and left null when it wasn't asked for. */
export function activityView(a: CalendarActivityDoc, owner?: OwnerRef): AdminActivity {
  return {
    id: a._id.toString(),
    title: a.title,
    description: a.description,
    type: a.type,
    start: a.start.toISOString(),
    end: a.end.toISOString(),
    mode: a.mode,
    location: a.location,
    visibility: a.visibility,
    attendees: a.attendees.map((x) => ({ email: x.email, name: x.name })),
    eventId: a.event ? a.event.toString() : null,
    meetLink: a.meetLink || null,
    googleEventId: a.googleEventId ?? null,
    status: a.status,
    owner: owner
      ? { id: String(owner._id), name: owner.name, role: owner.role }
      : null,
  };
}
