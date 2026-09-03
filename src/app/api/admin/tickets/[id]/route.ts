import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Event, Guest, Participant, ScanLog, Ticket } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { buildTicketView } from "@/lib/tickets";
import { ok, unauthorized, notFound } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

/* Admin: view a single ticket (with QR + scan history). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Ticket");

  await dbConnect();
  const ticket = await Ticket.findById(id);
  if (!ticket) return notFound("Ticket");

  const logs = await ScanLog.find({ ticket: ticket._id })
    .sort({ createdAt: -1 })
    .populate("scannedByScanner", "name")
    .populate("scannedByAdmin", "name");

  return ok({
    ticket: await buildTicketView(ticket, { qr: true }),
    history: logs.map((l) => ({
      at: l.createdAt,
      result: l.result,
      scanner:
        (l.scannedByScanner as unknown as { name?: string } | null)?.name ??
        (l.scannedByAdmin as unknown as { name?: string } | null)?.name ??
        null,
    })),
  });
}

/* Admin: delete a ticket, free its seat (if live) and clear the holder ref. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Ticket");

  await dbConnect();
  const ticket = await Ticket.findById(id);
  if (!ticket) return notFound("Ticket");

  await Ticket.deleteOne({ _id: ticket._id });
  /* clear the holder's back-reference */
  if (ticket.holderType === "Participant") {
    await Participant.updateOne({ _id: ticket.holderId, ticket: ticket._id }, { ticket: null });
  } else {
    await Guest.updateOne({ _id: ticket.holderId, ticket: ticket._id }, { ticket: null });
  }
  /* a non-revoked ticket held a seat — give it back */
  if (ticket.status !== "REVOKED") {
    await Event.findOneAndUpdate(
      { _id: ticket.event, registeredCount: { $gt: 0 } },
      { $inc: { registeredCount: -1 } }
    );
  }

  await recordAudit({
    actorId: admin.id,
    req,
    action: "ticket.delete",
    target: { type: "ticket", id: ticket._id.toString(), label: ticket.ticketNumber },
    summary:
      `Deleted pass ${ticket.ticketNumber}` +
      (ticket.status !== "REVOKED" ? ", releasing its seat" : ""),
  });

  return ok({ deleted: true });
}
