import { requireAdmin } from "@/lib/auth";
import { unauthorized } from "@/lib/http";
import { csvFilename, csvResponse } from "@/lib/csv";
import { listParticipantRows, participantFiltersFrom } from "@/lib/participantList";

/* Admin: export the participant list as CSV. Honours every filter the table
   applies (?event=, ?stack=, ?status=, ?registrationStatus=, ?plusOne=, ?q=)
   so the download matches what's on screen. */
export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return unauthorized();

  const filters = participantFiltersFrom(new URL(req.url).searchParams);
  const participants = await listParticipantRows(filters, { limit: 10_000 });

  const header = [
    "Name",
    "Email",
    "Phone",
    "Stack",
    "Gender",
    "Status",
    "Registration",
    "Event",
    "Ticket Number",
    "Ticket Status",
    "Ticket Sent",
    "Checked In",
  ];
  const rows = participants.map((p) => [
    p.name,
    p.email,
    p.phone ?? "",
    p.stack ?? "",
    p.gender ?? "",
    p.status,
    p.registrationStatus ?? "archived",
    p.event?.name ?? "",
    p.ticket?.number ?? "",
    p.ticket?.status ?? "",
    p.ticket?.sentAt ? "yes" : "no",
    p.ticket?.scannedAt ? new Date(p.ticket.scannedAt).toISOString() : "",
  ]);

  return csvResponse(
    csvFilename("participants", [filters.registrationStatus, filters.status, filters.stack]),
    header,
    rows
  );
}
