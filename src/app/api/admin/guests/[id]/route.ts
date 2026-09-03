import { isValidObjectId } from "mongoose";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, ScanLog, Ticket, GUEST_TYPES } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { ticketQrDataUrl } from "@/lib/qr";
import { ok, fail, unauthorized, notFound } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

/* Admin: full profile of a single guest — identity, ticket + QR, who invited
   them, and their scan history. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Guest");

  await dbConnect();
  const g = await Guest.findById(id);
  if (!g) {
    /* checked-in guests lose their Guest record but live on as a ticket
       holder snapshot — the list links those rows by ticket id, so resolve
       them here instead of 404ing */
    const snap = await Ticket.findOne({ _id: id, holderType: "Guest", "holder.name": { $exists: true } });
    if (snap) return snapshotGuest(snap);
    return notFound("Guest");
  }

  const [event, ticket, inviter] = await Promise.all([
    Event.findById(g.event),
    Ticket.findOne({ holderType: "Guest", holderId: g._id }),
    g.inviter ? Participant.findById(g.inviter).select("name email") : Promise.resolve(null),
  ]);

  const logs = ticket
    ? await ScanLog.find({ ticket: ticket._id })
        .sort({ createdAt: -1 })
        .populate("scannedByAdmin", "name")
        .populate("scannedByScanner", "name")
    : [];

  return ok({
    guest: {
      id: g._id,
      name: g.name,
      email: g.email,
      profile: g.profile ?? null,
      guestType: g.guestType,
      registeredAt: g.createdAt,
      event: event ? { id: event._id, name: event.name, startTime: event.startTime } : null,
      inviter: inviter ? { id: inviter._id, name: inviter.name, email: inviter.email } : null,
    },
    ticket: ticket
      ? {
          id: ticket._id,
          ticketNumber: ticket.ticketNumber,
          status: ticket.status,
          sentAt: ticket.sentAt ?? null,
          scannedAt: ticket.scannedAt ?? null,
          qrDataUrl: await ticketQrDataUrl(ticket.code, {
            name: g.name,
            type: g.guestType,
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
  });
}

/* Build the guest-detail payload from a ticket holder snapshot, for guests
   whose live record was removed after they checked in. */
async function snapshotGuest(ticket: InstanceType<typeof Ticket>) {
  const [event, logs] = await Promise.all([
    Event.findById(ticket.event),
    ScanLog.find({ ticket: ticket._id })
      .sort({ createdAt: -1 })
      .populate("scannedByAdmin", "name")
      .populate("scannedByScanner", "name"),
  ]);
  const holder = ticket.holder!;

  return ok({
    guest: {
      id: ticket._id,
      name: holder.name,
      email: holder.email,
      profile: holder.photoUrl ?? null,
      guestType: holder.label ?? "GENERAL",
      registeredAt: ticket.issuedAt,
      event: event ? { id: event._id, name: event.name, startTime: event.startTime } : null,
      inviter: null,
    },
    ticket: {
      id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      sentAt: ticket.sentAt ?? null,
      scannedAt: ticket.scannedAt ?? null,
      qrDataUrl: await ticketQrDataUrl(ticket.code, {
        name: holder.name,
        type: holder.label ?? "GENERAL",
        eventName: event?.name,
      }),
    },
    attendance: {
      checkInTime: ticket.scannedAt ?? null,
      history: logs.map((l) => ({
        at: l.createdAt,
        result: l.result,
        scanner:
          (l.scannedByScanner as unknown as { name?: string } | null)?.name ??
          (l.scannedByAdmin as unknown as { name?: string } | null)?.name ??
          null,
      })),
    },
  });
}

const PatchBody = z
  .object({
    name: z.string().min(2),
    email: z.string().email(),
    guestType: z.enum(GUEST_TYPES),
    profile: z.string().url().nullable(),
  })
  .partial();

/* Admin: edit guest information. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Guest");

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Invalid guest details");

  await dbConnect();
  const g = await Guest.findById(id);
  if (!g) return notFound("Guest");

  const d = parsed.data;
  if (d.name !== undefined) g.name = d.name;
  if (d.email !== undefined) g.email = d.email.toLowerCase();
  if (d.guestType !== undefined) g.guestType = d.guestType;
  if (d.profile !== undefined) g.profile = d.profile;
  try {
    await g.save();
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return fail("That email is already registered for this event", 409);
    }
    throw err;
  }

  await recordAudit({
    actorId: admin.id,
    req,
    action: "guest.update",
    target: { type: "guest", id: g._id.toString(), label: g.name },
    summary: `Updated guest ${g.name}`,
  });

  return ok({ guest: { id: g._id, name: g.name, email: g.email, guestType: g.guestType } });
}

/* Admin: delete a guest, their ticket, and free the seat. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Guest");

  await dbConnect();
  const g = await Guest.findById(id);
  if (!g) return notFound("Guest");

  const liveTicket = await Ticket.countDocuments({
    holderType: "Guest",
    holderId: g._id,
    status: { $ne: "REVOKED" },
  });

  await Promise.all([
    Guest.deleteOne({ _id: g._id }),
    Ticket.deleteMany({ holderType: "Guest", holderId: g._id }),
    /* if this guest was a plus-one, clear the inviter's back-reference */
    g.inviter ? Participant.updateOne({ _id: g.inviter }, { plusOne: null }) : Promise.resolve(),
  ]);
  if (liveTicket > 0) {
    await Event.findOneAndUpdate(
      { _id: g.event, registeredCount: { $gt: 0 } },
      { $inc: { registeredCount: -1 } }
    );
  }

  await recordAudit({
    actorId: admin.id,
    req,
    action: "guest.delete",
    target: { type: "guest", id: g._id.toString(), label: g.name },
    summary:
      `Deleted guest ${g.name} <${g.email}>` +
      (liveTicket > 0 ? ", releasing their seat" : ""),
  });

  return ok({ deleted: true });
}
