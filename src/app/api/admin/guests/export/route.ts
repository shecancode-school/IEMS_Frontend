import { requireAdmin } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { csvFilename, csvResponse } from "@/lib/csv";
import { guestFiltersFrom, listGuestRows } from "@/lib/guestList";

/* Admin: export the guest list as CSV. Honours every filter the table applies
   (?event=, ?type=, ?q=) so the download matches what's on screen. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const params = new URL(req.url).searchParams;
  const filters = guestFiltersFrom(params);
  const guests = await listGuestRows(filters, { limit: 10_000 });

  const header = [
    "Name",
    "Email",
    "Type",
    "Event",
    "Invited By",
    "Added",
    "Ticket Number",
    "Ticket Status",
    "Ticket Sent",
    "Checked In",
  ];
  const rows = guests.map((g) => [
    g.name,
    g.email,
    g.guestType,
    g.eventName ?? "",
    g.invitedBy ?? "Admin",
    g.addedAt ? new Date(g.addedAt).toISOString() : "",
    g.ticket?.number ?? "",
    g.ticket?.status ?? "",
    g.ticket?.sentAt ? "yes" : "no",
    g.ticket?.scannedAt ? new Date(g.ticket.scannedAt).toISOString() : "",
  ]);

  return csvResponse(csvFilename("guests", [filters.guestType]), header, rows);
}
