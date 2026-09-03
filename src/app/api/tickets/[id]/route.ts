import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Ticket } from "@/models";
import { requireTicketViewer } from "@/lib/auth";
import { buildTicketView, participantOwnsTicket } from "@/lib/tickets";
import { ok, unauthorized, forbidden, notFound } from "@/lib/http";

/* A ticket by id — visible to its owner (the participant) or any admin. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
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

  return ok({ ticket: await buildTicketView(ticket, { qr: true }) });
}
