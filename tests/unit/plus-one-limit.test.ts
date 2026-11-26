import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const mocks = vi.hoisted(() => ({
  eventFindById: vi.fn(),
  eventUpdateOne: vi.fn(),
  eventDistinct: vi.fn(),
  guestDistinct: vi.fn(),
  guestExists: vi.fn(),
  participantCount: vi.fn(),
  notifyAdmins: vi.fn(),
}));
vi.mock("@/models", () => ({
  Event: { findById: mocks.eventFindById, updateOne: mocks.eventUpdateOne, distinct: mocks.eventDistinct },
  Participant: { countDocuments: mocks.participantCount },
  Guest: { distinct: mocks.guestDistinct, exists: mocks.guestExists },
}));
vi.mock("@/lib/notify", () => ({ notifyAdmins: mocks.notifyAdmins }));

import { canAddPlusOne, confirmPlusOnePlace, countPlusOnes, syncPlusOneSlots } from "@/lib/plusOneSlots";
import { plusOnePlaces } from "@/models/Event";
import { renderRegistrationConfirmation } from "@/lib/mailer";

const eventId = new Types.ObjectId();
const ids = (n: number) => Array.from({ length: n }, () => new Types.ObjectId());
const participant = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  event: eventId,
  status: "VERIFIED",
  plusOne: null as Types.ObjectId | null,
  ...over,
});
/** an event with this limit, `live` plus-one guests on the list and `checkedIn` already at the gate */
const setup = (limit: number, live: Types.ObjectId[], checkedIn = 0) => {
  mocks.eventFindById.mockReturnValue({
    select: vi.fn().mockResolvedValue({ _id: eventId, name: "Demo Day", plusOneLimit: limit }),
  });
  mocks.guestDistinct.mockResolvedValue(live);
  mocks.participantCount.mockResolvedValue(checkedIn);
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.guestExists.mockResolvedValue(null);
  mocks.eventUpdateOne.mockResolvedValue({});
});

describe("plusOnePlaces", () => {
  it("treats a limit of 0 as unlimited", () => {
    expect(plusOnePlaces({ plusOneLimit: 0, plusOneSlotsTaken: 12 })).toEqual({ limit: 0, taken: 12, remaining: null, full: false });
  });
  it("reports full once every place is claimed", () => {
    expect(plusOnePlaces({ plusOneLimit: 40, plusOneSlotsTaken: 40 })).toMatchObject({ remaining: 0, full: true });
    expect(plusOnePlaces({ plusOneLimit: 40, plusOneSlotsTaken: 39 })).toMatchObject({ remaining: 1, full: false });
  });
});

describe("counting plus-ones", () => {
  it("counts only guests actually added, plus those already checked in", async () => {
    setup(40, ids(34), 2);
    expect(await countPlusOnes(eventId)).toBe(36);
    expect(mocks.eventUpdateOne).toHaveBeenCalledWith(
      { _id: eventId, plusOneSlotsTaken: { $ne: 36 } },
      { $set: { plusOneSlotsTaken: 36 } }
    );
  });
  it("recounts every event and writes only the counter", async () => {
    setup(40, ids(34));
    mocks.eventDistinct.mockResolvedValue([eventId]);
    await syncPlusOneSlots();
    expect(mocks.eventUpdateOne).toHaveBeenCalledWith(
      { _id: eventId, plusOneSlotsTaken: { $ne: 34 } },
      { $set: { plusOneSlotsTaken: 34 } }
    );
  });
});

describe("canAddPlusOne", () => {
  it("refuses until the email is verified", async () => {
    setup(40, []);
    expect(await canAddPlusOne(participant({ status: "PENDING" }))).toBe(false);
  });
  it("lets an accepted participant add one while places remain", async () => {
    setup(40, ids(34));
    expect(await canAddPlusOne(participant())).toBe(true);
  });
  it("does not reserve anything for accepting", async () => {
    setup(40, ids(34));
    await canAddPlusOne(participant());
    expect(mocks.eventUpdateOne).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $inc: expect.anything() }));
  });
  it("refuses once the added guests reach the limit", async () => {
    setup(40, ids(40));
    expect(await canAddPlusOne(participant())).toBe(false);
  });
  it("keeps the plus-one for someone who already has one, even when full", async () => {
    setup(40, ids(40));
    expect(await canAddPlusOne(participant({ plusOne: new Types.ObjectId() }))).toBe(true);
  });
  it("never limits when the limit is 0", async () => {
    setup(0, ids(500));
    expect(await canAddPlusOne(participant())).toBe(true);
  });
});

describe("confirmPlusOnePlace", () => {
  it("keeps the guest that takes the last place and tells admins it's full", async () => {
    const live = ids(40);
    setup(40, live);
    expect(await confirmPlusOnePlace({ _id: live[39], event: eventId })).toBe(true);
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: "Plus-one places are full for Demo Day" }));
  });
  it("rejects a guest created past the limit in a race", async () => {
    const live = ids(41);
    setup(40, live);
    expect(await confirmPlusOnePlace({ _id: live[40], event: eventId })).toBe(false);
    expect(await confirmPlusOnePlace({ _id: live[39], event: eventId })).toBe(true);
  });
  it("counts checked-in plus-ones ahead of new ones", async () => {
    const live = ids(39);
    setup(40, live, 2);
    expect(await confirmPlusOnePlace({ _id: live[38], event: eventId })).toBe(false);
  });
});

describe("registration confirmation email", () => {
  it("doesn't mention plus-ones at all when no place is left", () => {
    const { html } = renderRegistrationConfirmation({ name: "Aline", eventName: "Demo Day", plusOne: { allowed: false, limit: 40 } });
    expect(html).not.toMatch(/plus-one/i);
    expect(html).not.toMatch(/full|filled/i);
  });
  it("offers the plus-one without counts to those who got a place", () => {
    const { html } = renderRegistrationConfirmation({ name: "Aline", eventName: "Demo Day", plusOne: { allowed: true, limit: 40 } });
    expect(html).toContain("You can also bring a plus-one");
    expect(html).not.toMatch(/40 plus-one|places/);
  });
  it("mentions no limit when plus-ones are unlimited", () => {
    const { html } = renderRegistrationConfirmation({ name: "Aline", eventName: "Demo Day", plusOne: { allowed: true, limit: 0 } });
    expect(html).toContain("You can also bring a plus-one");
    expect(html).not.toContain("places");
  });
});
