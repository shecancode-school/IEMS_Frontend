import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Ticket } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { resetTicket } from "@/lib/tickets";
import { ok, fail, unauthorized, notFound } from "@/lib/http";

/* Admin: reset a ticket — the old QR is invalidated, a brand-new QR + ticket
   number are generated, and a fresh ticket email is sent automatically. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Ticket");

  await dbConnect();
  const ticket = await Ticket.findById(id);
  if (!ticket) return notFound("Ticket");

  const done = await resetTicket(ticket);
  if (!done) return fail("This ticket has no active holder to reset", 409);
  return ok({
    ticket: {
      id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      resetCount: ticket.resetCount,
      sentAt: ticket.sentAt,
    },
  });
}
