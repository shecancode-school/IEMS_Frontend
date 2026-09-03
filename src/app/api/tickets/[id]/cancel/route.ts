import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Ticket } from "@/models";
import { requireTicketViewer } from "@/lib/auth";
import { cancelTicket, participantOwnsTicket } from "@/lib/tickets";
import { ok, fail, unauthorized, forbidden, notFound } from "@/lib/http";
import { recordAudit } from "@/lib/audit";

/* Cancel a ticket and release its capacity slot. Owner (participant) or admin;
   only a still-VALID ticket can be cancelled. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  /* the owning attendee (bearer) or a staff member (session cookie) */
  const viewer = await requireTicketViewer(req);
  if (!viewer) return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Ticket");

  await dbConnect();
  const ticket = await Ticket.findById(id);
  if (!ticket) return notFound("Ticket");

  if (viewer.kind === "attendee" && !(await participantOwnsTicket(ticket, viewer.id))) {
    return forbidden();
  }
  if (ticket.status !== "VALID") {
    return fail(`This ticket is ${ticket.status.toLowerCase()} and can't be cancelled`, 409);
  }

  await cancelTicket(ticket);
  await recordAudit({
    actorId: viewer.kind === "staff" ? viewer.id : null,
    actorName: viewer.kind === "attendee" ? "Attendee (self-service)" : undefined,
    req,
    action: "ticket.cancel",
    target: { type: "ticket", id: ticket._id.toString(), label: ticket.ticketNumber },
    summary:
      viewer.kind === "staff"
        ? `Cancelled pass ${ticket.ticketNumber} on the holder's behalf`
        : `Holder cancelled pass ${ticket.ticketNumber}`,
  });

  return ok({ ticket: { id: ticket._id, status: ticket.status, cancelledAt: ticket.cancelledAt } });
}
