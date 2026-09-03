import type { EventDoc } from "@/models/Event";

/* One definition of "this programme is live", used everywhere it matters.

   A programme is live when it has been published, is out of draft, and has not
   been archived. That is exactly the filter the public events feed already
   applies, and stating it once means the dashboard, the mailer and the public
   site can never disagree about whether an event is real.

   CLOSED counts as live on purpose: registration has ended, but the people
   holding a pass still need their dashboard and still need their reminders. */
export type ProgrammeState = Pick<EventDoc, "status" | "isPublished" | "archivedAt">;

export function isLiveProgramme(e: ProgrammeState | null | undefined): boolean {
  if (!e) return false;
  return e.isPublished && e.status !== "DRAFT" && !e.archivedAt;
}

/* Why it is not live, in words a participant or an administrator can act on.
   Returns null when it IS live, so callers can write:

     const why = programmeBlockedReason(event);
     if (why) return fail(why, 403);
*/
export function programmeBlockedReason(e: ProgrammeState | null | undefined): string | null {
  if (!e) return "This programme no longer exists.";
  if (e.archivedAt) return "This programme has been archived.";
  if (!e.isPublished) return "This programme has not been published yet.";
  if (e.status === "DRAFT") return "This programme is still a draft.";
  return null;
}
