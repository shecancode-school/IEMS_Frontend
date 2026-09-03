import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Guest, Participant, Ticket, TICKET_STATUSES, type TicketStatus } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { buildTicketView, buildTicketViews, issueTicket, CapacityError, type Holder } from "@/lib/tickets";
import { ok, fail, unauthorized, notFound } from "@/lib/http";
import { recordAudit } from "@/lib/audit";
import type { QueryFilter } from "mongoose";
import type { TicketDoc } from "@/models";

/* Admin: list tickets, filterable by event / status. Capped at 500. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const url = new URL(req.url);
  const filter: QueryFilter<TicketDoc> = {};
  const event = url.searchParams.get("event");
  if (event) filter.event = event;
  const status = url.searchParams.get("status");
  if (status && (TICKET_STATUSES as readonly string[]).includes(status)) {
    filter.status = status as TicketStatus;
  }

  await dbConnect();
  const tickets = await Ticket.find(filter).sort({ issuedAt: -1 }).limit(500);
  return ok({ tickets: await buildTicketViews(tickets) });
}

const CreateBody = z
  .object({
    participantId: z.string().min(1).optional(),
    guestId: z.string().min(1).optional(),
    email: z.boolean().default(true),
  })
  .refine((d) => !!d.participantId !== !!d.guestId, {
    message: "Provide exactly one of participantId or guestId",
  });

/* Admin: generate a ticket for a participant or guest that doesn't have one.
   Idempotent — returns the existing ticket if already issued. */
export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Provide exactly one of participantId or guestId");

  await dbConnect();
  let holder: Holder | null = null;
  if (parsed.data.participantId) {
    const doc = await Participant.findById(parsed.data.participantId);
    if (doc) holder = { kind: "Participant", doc };
  } else {
    const doc = await Guest.findById(parsed.data.guestId);
    if (doc) holder = { kind: "Guest", doc };
  }
  if (!holder) return notFound("Holder");

  try {
    const ticket = await issueTicket(holder, { email: parsed.data.email });
    await recordAudit({
      actorId: admin.id,
      req,
      action: "ticket.create",
      target: { type: "ticket", id: ticket._id.toString(), label: ticket.ticketNumber },
      summary: `Issued pass ${ticket.ticketNumber}`,
    });
    return ok({ ticket: await buildTicketView(ticket, { qr: true }) }, 201);
  } catch (err) {
    if (err instanceof CapacityError) return fail(err.message, 409);
    throw err;
  }
}
