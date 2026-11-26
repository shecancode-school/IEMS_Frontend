import type { Types } from "mongoose";
import { Event, Guest, Participant } from "@/models";
import { notifyAdmins } from "./notify";

export const PLUS_ONE_FULL_MESSAGE =
  "Adding a plus-one isn't available for your registration. Your own registration is confirmed.";

export const PLUS_ONE_FULL_GUEST_MESSAGE =
  "This plus-one invite is no longer available.";

/* Plus-one places (Event.plusOneLimit, 0 = unlimited) are used up only by
   plus-one guests who actually exist: accepting the event invitation reserves
   nothing, so participants who never add a guest don't hold a place. A place
   counts while the guest is on the list, and stays counted after they check in
   (their Guest record is then archived onto the ticket, but the participant's
   plusOne reference remains). Deleting a plus-one frees the place. */

const liveFilter = (eventId: Types.ObjectId) => ({
  event: eventId,
  inviter: { $type: "objectId" as const },
});

/* Plus-ones that already checked in: the participant still points at a guest
   record that no longer exists. */
async function checkedInCount(eventId: Types.ObjectId, liveIds: Types.ObjectId[]) {
  return Participant.countDocuments({
    event: eventId,
    plusOne: { $ne: null, $nin: liveIds },
  });
}

/* Plus-ones counted toward the limit right now; also refreshes the cached
   counter the admin pages show. */
export async function countPlusOnes(eventId: Types.ObjectId): Promise<number> {
  const liveIds: Types.ObjectId[] = await Guest.distinct("_id", liveFilter(eventId));
  const taken = liveIds.length + (await checkedInCount(eventId, liveIds));
  await Event.updateOne(
    { _id: eventId, plusOneSlotsTaken: { $ne: taken } },
    { $set: { plusOneSlotsTaken: taken } }
  );
  return taken;
}

export async function plusOnesFull(eventId: Types.ObjectId): Promise<boolean> {
  const event = await Event.findById(eventId).select("plusOneLimit");
  const limit = event?.plusOneLimit ?? 0;
  if (limit <= 0) {
    void countPlusOnes(eventId).catch(() => {});
    return false;
  }
  return (await countPlusOnes(eventId)) >= limit;
}

/* Whether this participant may add (or keep) a plus-one: anyone who already
   has one keeps it; anyone else may add one while places remain. */
export async function canAddPlusOne(participant: {
  _id: Types.ObjectId;
  event: Types.ObjectId;
  status?: string;
  plusOne?: Types.ObjectId | null;
}): Promise<boolean> {
  if (participant.status === "PENDING") return false;
  if (participant.plusOne || (await Guest.exists({ inviter: participant._id }))) return true;
  return !(await plusOnesFull(participant.event));
}

/* Called right after a plus-one guest is created. Two people adding the last
   place at once both get created, so each checks its position: guests are
   ranked by creation (_id), checked-in plus-ones first. A guest past the limit
   must be removed by the caller. Returns whether this guest keeps its place. */
export async function confirmPlusOnePlace(guest: {
  _id: Types.ObjectId;
  event: Types.ObjectId;
}): Promise<boolean> {
  const event = await Event.findById(guest.event).select("name plusOneLimit");
  const limit = event?.plusOneLimit ?? 0;
  if (limit > 0) {
    const liveIds: Types.ObjectId[] = await Guest.distinct("_id", liveFilter(guest.event));
    const ahead =
      (await checkedInCount(guest.event, liveIds)) +
      liveIds.filter((id) => id.toString() <= guest._id.toString()).length;
    if (ahead > limit) return false;
    if (ahead === limit && event) {
      await notifyAdmins({
        kind: "SYSTEM",
        severity: "warning",
        title: `Plus-one places are full for ${event.name}`,
        body: `All ${limit} plus-one places have been used by added guests. Participants can no longer add a plus-one. Raise the limit on the event to reopen them.`,
        eventId: event._id,
      });
    }
  }
  await countPlusOnes(guest.event);
  return true;
}

/* Recount every event (or the given ones) from the guests that exist, so the
   counter shown to admins always equals the plus-ones actually added. Only the
   counter is written; no participant or guest data is touched. */
export async function syncPlusOneSlots(eventIds?: Types.ObjectId[]) {
  const ids: Types.ObjectId[] = eventIds ?? (await Event.distinct("_id"));
  await Promise.all(ids.map((id) => countPlusOnes(id)));
}
