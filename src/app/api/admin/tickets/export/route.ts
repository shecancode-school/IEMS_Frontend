import { dbConnect } from "@/lib/db";
import { Ticket, TICKET_STATUSES, type TicketStatus, type TicketDoc } from "@/models";
import { requireAdmin } from "@/lib/auth";
import { buildTicketViews } from "@/lib/tickets";
import { csvFilename, csvResponse, matchesQuery } from "@/lib/csv";
import { unauthorized } from "@/lib/http";
import type { QueryFilter } from "mongoose";

/* Admin: export the ticket list as CSV. Honours the table's filters
   (?event=, ?status=, ?q=) so the download matches what's on screen. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const params = new URL(req.url).searchParams;
  const filter: QueryFilter<TicketDoc> = {};
  const event = params.get("event");
  if (event) filter.event = event;
  const status = params.get("status");
  if (status && (TICKET_STATUSES as readonly string[]).includes(status)) {
    filter.status = status as TicketStatus;
  }
  const q = params.get("q");

  await dbConnect();
  const tickets = await Ticket.find(filter).sort({ issuedAt: -1 }).limit(10_000);
  const views = await buildTicketViews(tickets);
  const sentAt = new Map(tickets.map((t) => [t._id.toString(), t.sentAt ?? null]));

  const header = [
    "Ticket Number",
    "Holder",
    "Holder Type",
    "Event",
    "Status",
    "Issued",
    "Ticket Sent",
    "Checked In",
    "Cancelled",
  ];
  const rows = views
    /* same joined string the tickets table searches on */
    .filter((t) => matchesQuery(`${t.ticketNumber} ${t.participantName} ${t.eventName ?? ""}`, q))
    .map((t) => [
      t.ticketNumber,
      t.participantName,
      t.ownerType,
      t.eventName ?? "",
      t.status,
      t.registeredAt ? new Date(t.registeredAt).toISOString() : "",
      sentAt.get(String(t.id)) ? "yes" : "no",
      t.scannedAt ? new Date(t.scannedAt).toISOString() : "",
      t.cancelledAt ? new Date(t.cancelledAt).toISOString() : "",
    ]);

  return csvResponse(csvFilename("tickets", [status]), header, rows);
}
