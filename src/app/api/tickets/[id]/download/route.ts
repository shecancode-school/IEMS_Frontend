import { isValidObjectId } from "mongoose";
import { dbConnect } from "@/lib/db";
import { Event, Ticket } from "@/models";
import { getAuth } from "@/lib/auth";
import { ticketQrPngBuffer } from "@/lib/qr";
import { ticketPdfBuffer } from "@/lib/ticketPdf";
import { ticketIdentity, participantOwnsTicket } from "@/lib/tickets";
import { fetchImageBuffer } from "@/lib/imageFetch";
import { unauthorized, forbidden, notFound } from "@/lib/http";

/* Stream the printable PDF pass. Owner (participant) or admin only. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getAuth(req);
  if (!auth || auth.kind === "scanner") return unauthorized();

  const { id } = await ctx.params;
  if (!isValidObjectId(id)) return notFound("Ticket");

  await dbConnect();
  const ticket = await Ticket.findById(id);
  if (!ticket) return notFound("Ticket");

  if (auth.kind === "attendee" && !(await participantOwnsTicket(ticket, auth.sub))) {
    return forbidden();
  }

  const [event, who] = await Promise.all([Event.findById(ticket.event), ticketIdentity(ticket)]);

  /* fetch the profile photo and event poster concurrently — either can be slow
     or missing without holding up (or breaking) the PDF */
  const posterUrl = event?.gallery?.[0] ?? null;
  const [photo, eventImage] = await Promise.all([
    fetchImageBuffer(who.photoUrl),
    fetchImageBuffer(posterUrl),
  ]);

  const qr = await ticketQrPngBuffer(ticket.code, {
    name: who.name,
    type: who.type,
    eventName: event?.name,
  });
  const pdf = await ticketPdfBuffer({
    name: who.name,
    type: who.type,
    eventName: event?.name ?? "Event",
    eventDate: event?.startTime,
    venue: event?.location,
    code: ticket.code,
    qrPng: qr,
    photo,
    eventImage,
    eventType: event?.type,
    price: event?.price,
    organiser: event?.organiser,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ticket-${ticket.ticketNumber}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
