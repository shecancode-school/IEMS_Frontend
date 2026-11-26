import { beforeEach, describe, expect, it, vi } from "vitest";
import { Types } from "mongoose";

const m = vi.hoisted(() => ({
  aggregate: vi.fn(),
  logUpdateMany: vi.fn(),
  eventFindById: vi.fn(),
  participantFindOne: vi.fn(),
  guestFindOne: vi.fn(),
  ticketFindOne: vi.fn(),
  distinct: vi.fn(),
  invite: vi.fn(),
  confirm: vi.fn(),
  resendTicket: vi.fn(),
}));
vi.mock("@/models", () => ({
  EmailLog: { aggregate: m.aggregate, updateMany: m.logUpdateMany },
  Event: { findById: m.eventFindById },
  Participant: { findOne: m.participantFindOne, find: () => ({ distinct: m.distinct }) },
  Guest: { findOne: m.guestFindOne, find: () => ({ distinct: m.distinct }) },
  Ticket: { findOne: m.ticketFindOne, find: () => ({ distinct: m.distinct }) },
}));
vi.mock("@/lib/mailer", () => ({ sendRegistrationConfirmation: m.confirm }));
vi.mock("@/lib/participantInvitation", () => ({ sendParticipantInvitation: m.invite }));
vi.mock("@/lib/tickets", () => ({ resendTicket: m.resendTicket }));
vi.mock("@/lib/plusOneSlots", () => ({ plusOnesFull: async () => false }));

import { retryFailedEmails, unresolvedFailures } from "@/lib/emailRetry";

const eventId = new Types.ObjectId();
const failedAt = new Date("2026-11-20T10:00:00Z");
const failure = (kind: string, to = "a@x.rw") => ({ _id: { kind, to }, status: "FAILED", at: failedAt });

beforeEach(() => {
  vi.resetAllMocks();
  m.distinct.mockResolvedValue(["a@x.rw"]);
  m.eventFindById.mockReturnValue({ select: vi.fn().mockResolvedValue({ name: "Demo Day", plusOneLimit: 40 }) });
});

describe("unresolvedFailures", () => {
  it("keeps only addresses whose latest attempt failed and was not resolved", async () => {
    m.aggregate.mockResolvedValue([failure("TICKET")]);
    expect(await unresolvedFailures(["a@x.rw"], "TICKET")).toEqual([{ kind: "TICKET", to: "a@x.rw", failedAt }]);
    const pipeline = m.aggregate.mock.calls[0][0];
    expect(pipeline[1]).toEqual({ $sort: { createdAt: -1 } });
    expect(pipeline.at(-1)).toEqual({ $match: { status: "FAILED", resolvedAt: null } });
  });
});

describe("retryFailedEmails", () => {
  it("re-sends a verify link to someone who still hasn't verified", async () => {
    m.aggregate.mockResolvedValue([failure("MAGIC_LINK")]);
    m.participantFindOne.mockResolvedValue({ email: "a@x.rw", name: "Aline", status: "PENDING", registrationStatus: "APPROVED" });
    const r = await retryFailedEmails(eventId, "MAGIC_LINK");
    expect(m.invite).toHaveBeenCalledOnce();
    expect(r?.sent).toEqual(["a@x.rw"]);
  });

  it("never sends a verify link again once they verified, and settles the failure", async () => {
    m.aggregate.mockResolvedValue([failure("MAGIC_LINK")]);
    m.participantFindOne.mockResolvedValue({ status: "VERIFIED", registrationStatus: "APPROVED" });
    const r = await retryFailedEmails(eventId, "MAGIC_LINK");
    expect(m.invite).not.toHaveBeenCalled();
    expect(r?.skipped).toEqual([{ to: "a@x.rw", reason: "Already verified their email" }]);
    expect(m.logUpdateMany).toHaveBeenCalledWith(
      { kind: "MAGIC_LINK", to: "a@x.rw", status: "FAILED", resolvedAt: null },
      { $set: { resolvedAt: expect.any(Date) } }
    );
  });

  it("does not resend a ticket that was delivered after the failure", async () => {
    m.aggregate.mockResolvedValue([failure("TICKET")]);
    m.participantFindOne.mockResolvedValue({ _id: new Types.ObjectId() });
    m.ticketFindOne.mockResolvedValue({ status: "VALID", sentAt: new Date("2026-11-21T10:00:00Z") });
    const r = await retryFailedEmails(eventId, "TICKET");
    expect(m.resendTicket).not.toHaveBeenCalled();
    expect(r?.skipped[0].reason).toBe("Ticket was delivered after the failure");
  });

  it("resends a ticket that never arrived", async () => {
    m.aggregate.mockResolvedValue([failure("TICKET")]);
    m.participantFindOne.mockResolvedValue({ _id: new Types.ObjectId() });
    m.ticketFindOne.mockResolvedValue({ status: "VALID", sentAt: null });
    m.resendTicket.mockResolvedValue(true);
    const r = await retryFailedEmails(eventId, "TICKET");
    expect(r?.sent).toEqual(["a@x.rw"]);
  });

  it("reports a send that fails again without marking it resolved", async () => {
    m.aggregate.mockResolvedValue([failure("CONFIRMATION")]);
    m.participantFindOne.mockResolvedValue({ email: "a@x.rw", name: "Aline", registrationStatus: "APPROVED", plusOneAllowed: true });
    m.confirm.mockRejectedValue(new Error("SMTP down"));
    const r = await retryFailedEmails(eventId, "CONFIRMATION");
    expect(r?.failed).toEqual([{ to: "a@x.rw", error: "SMTP down" }]);
    expect(m.logUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses a second retry of the same kind while one is running", async () => {
    let release!: () => void;
    m.aggregate.mockReturnValue(new Promise((r) => { release = () => r([]); }));
    const first = retryFailedEmails(eventId, "TICKET");
    expect(await retryFailedEmails(eventId, "TICKET")).toBeNull();
    release();
    await first;
  });
});
