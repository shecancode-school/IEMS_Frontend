import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Ticket } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { resendTicket } from "@/lib/tickets";
import { ok, fail, unauthorized, notFound } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

/* Admin: re-email the existing ticket (same QR). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Ticket");

  await dbConnect();
  const ticket = await Ticket.findById(id);
  if (!ticket) return notFound("Ticket");
  if (ticket.status === "REVOKED") return fail("This ticket has been cancelled", 409);

  const sent = await resendTicket(ticket);
  if (!sent) return fail("This ticket has no active holder to email", 409);
  await recordAudit({
    actorId: admin.id,
    req,
    action: "ticket.resend",
    target: { type: "ticket", id: ticket._id.toString(), label: ticket.ticketNumber },
    summary: `Re-sent pass ${ticket.ticketNumber} by email`,
  });

  return ok({ ticket: { id: ticket._id, ticketNumber: ticket.ticketNumber, sentAt: ticket.sentAt } });
}
