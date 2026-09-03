import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import {
  Event,
  Guest,
  Participant,
  ScanLog,
  Ticket,
  GENDERS,
  STACKS,
  REGISTRATION_STATUSES,
} from "@/models";
import { requireAdmin } from "@/lib/auth";
import { ticketQrDataUrl } from "@/lib/qr";
import { ok, fail, unauthorized, notFound } from "@/lib/http";
import { recordAudit, diff } from "@/lib/audit";

/* Admin: full profile of a single participant — identity, ticket + QR, scan
   history, and their plus-one. (§7 Individual Guest View) */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Participant");

  await dbConnect();
  const p = await Participant.findById(id);
  if (!p) return notFound("Participant");

  const [event, ticket, plusOne] = await Promise.all([
    Event.findById(p.event),
    Ticket.findOne({ holderType: "Participant", holderId: p._id }),
    Guest.findOne({ inviter: p._id }),
  ]);

  /* scan history: every gate event for this participant's ticket */
  const logs = ticket
    ? await ScanLog.find({ ticket: ticket._id })
        .sort({ createdAt: -1 })
        .populate("scannedByAdmin", "name")
        .populate("scannedByScanner", "name")
    : [];

  const plusOneTicket = plusOne
    ? await Ticket.findOne({ holderType: "Guest", holderId: plusOne._id })
    : null;

  return ok({
    participant: {
      id: p._id,
      name: p.name,
      email: p.email,
      phone: p.phone ?? null,
      stack: p.stack ?? null,
      gender: p.gender ?? null,
      profilePicture: p.profilePicture ?? null,
      status: p.status,
      registrationStatus: p.registrationStatus,
      registeredAt: p.createdAt,
      event: event ? { id: event._id, name: event.name, startTime: event.startTime } : null,
    },
    ticket: ticket
      ? {
          id: ticket._id,
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          sentAt: ticket.sentAt ?? null,
          scannedAt: ticket.scannedAt ?? null,
          qrDataUrl: await ticketQrDataUrl(ticket.code, {
            name: p.name,
            type: "PARTICIPANT",
            eventName: event?.name,
          }),
        }
      : null,
    attendance: {
      checkInTime: ticket?.scannedAt ?? null,
      history: logs.map((l) => ({
        at: l.createdAt,
        result: l.result,
        scanner:
          (l.scannedByScanner as unknown as { name?: string } | null)?.name ??
          (l.scannedByAdmin as unknown as { name?: string } | null)?.name ??
          null,
      })),
    },
    plusOne: plusOne
      ? {
          id: plusOne._id,
          name: plusOne.name,
          email: plusOne.email,
          guestType: plusOne.guestType,
          attendanceStatus: plusOneTicket?.status === "USED" ? "CHECKED_IN" : "REGISTERED",
          checkInTime: plusOneTicket?.scannedAt ?? null,
        }
      : null,
  });
}

const PatchBody = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(6),
    stack: z.enum(STACKS),
    gender: z.enum(GENDERS),
    registrationStatus: z.enum(REGISTRATION_STATUSES),
  })
  .partial();

/* Admin: edit participant info, and/or approve/reject the registration. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Participant");

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid participant details");

  await dbConnect();
  const p = await Participant.findById(id);
  if (!p) return notFound("Participant");

  /* snapshot before mutating, so the ledger records what actually moved
     rather than restating every field that was sent */
  const before = {
    name: p.name,
    email: p.email,
    phone: p.phone ?? "",
    stack: p.stack,
    gender: p.gender,
    registrationStatus: p.registrationStatus,
  };

  const d = parsed.data;
  if (d.name !== undefined) p.name = d.name;
  if (d.email !== undefined) p.email = d.email.toLowerCase();
  if (d.phone !== undefined) p.phone = d.phone;
  if (d.stack !== undefined) p.stack = d.stack;
  if (d.gender !== undefined) p.gender = d.gender;
  if (d.registrationStatus !== undefined) p.registrationStatus = d.registrationStatus;
  try {
    await p.save();
  } catch (err: unknown) {
    /* unique (event,email) — another registration already uses this address */
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("That email is already registered for this event", 409);
    }
    throw err;
  }

  /* rejecting revokes any live ticket + frees the seat */
  if (d.registrationStatus === "REJECTED") {
    const ticket = await Ticket.findOne({
      holderType: "Participant",
      holderId: p._id,
      status: "VALID",
    });
    if (ticket) {
      ticket.status = "REVOKED";
      ticket.cancelledAt = new Date();
      await ticket.save();
      await Event.findOneAndUpdate(
        { _id: p.event, registeredCount: { $gt: 0 } },
        { $inc: { registeredCount: -1 } }
      );
    }
  }

  const changes = diff(before, {
    name: p.name,
    email: p.email,
    phone: p.phone ?? "",
    stack: p.stack,
    gender: p.gender,
    registrationStatus: p.registrationStatus,
  });

  await recordAudit({
    actorId: admin.id,
    req,
    action: "attendee.update",
    target: { type: "participant", id: p._id.toString(), label: p.name },
    summary: `Updated participant ${p.name}`,
    changes,
  });

  return ok({
    participant: {
      id: p._id,
      name: p.name,
      registrationStatus: p.registrationStatus,
    },
  });
}

/* Admin: delete a participant, their plus-one, and their tickets. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Participant");

  await dbConnect();
  const p = await Participant.findById(id);
  if (!p) return notFound("Participant");

  const plusOnes = await Guest.find({ inviter: p._id }).select("_id");
  const holderIds = [p._id, ...plusOnes.map((g) => g._id)];
  const liveTickets = await Ticket.countDocuments({
    holderId: { $in: holderIds },
    status: { $ne: "REVOKED" },
  });

  await Promise.all([
    Participant.deleteOne({ _id: p._id }),
    Guest.deleteMany({ inviter: p._id }),
    Ticket.deleteMany({ holderId: { $in: holderIds } }),
  ]);
  /* release the seats the live tickets held */
  if (liveTickets > 0) {
    await Event.findOneAndUpdate(
      { _id: p.event, registeredCount: { $gte: liveTickets } },
      { $inc: { registeredCount: -liveTickets } }
    );
  }

  await recordAudit({
    actorId: admin.id,
    req,
    action: "attendee.delete",
    target: { type: "participant", id: p._id.toString(), label: p.name },
    summary:
      `Deleted participant ${p.name} <${p.email}>` +
      (plusOnes.length ? ` and their plus-one` : "") +
      (liveTickets > 0 ? `, releasing ${liveTickets} seat${liveTickets === 1 ? "" : "s"}` : ""),
  });

  return ok({ deleted: true });
}
