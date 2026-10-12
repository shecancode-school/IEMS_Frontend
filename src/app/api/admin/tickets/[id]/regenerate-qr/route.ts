import { randomUUID } from "crypto";
import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Event, Ticket } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { ticketQrDataUrl } from "@/lib/qr";
import { ticketIdentity } from "@/lib/tickets";
import { ok, unauthorized, notFound, fail } from "@/lib/http";

/* Admin: rotate a ticket's QR secret. The old QR/code is invalidated the
   moment `code` changes, so a leaked screenshot can be revoked without
   cancelling the ticket. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Ticket");

  await dbConnect();
  const ticket = await Ticket.findById(id);
  if (!ticket) return notFound("Ticket");
  if (ticket.status === "REVOKED") return fail("This ticket has been cancelled", 409);

  ticket.code = randomUUID();
  await ticket.save();

  const [event, who] = await Promise.all([Event.findById(ticket.event), ticketIdentity(ticket)]);
  const qrDataUrl = await ticketQrDataUrl(ticket.code, {
    name: who.name,
    type: who.type,
    eventName: event?.name,
  });

  return ok({ ticket: { id: ticket._id, ticketNumber: ticket.ticketNumber }, qrDataUrl });
}
