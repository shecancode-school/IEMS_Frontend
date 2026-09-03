import { randomUUID } from "crypto";
import type { HydratedDocument, Types } from "mongoose";
import {
  Event,
  Guest,
  Participant,
  Ticket,
  eventDeadline,
  nextSequence,
  type EventDoc,
  type GuestDoc,
  type ParticipantDoc,
  type TicketHolderType,
} from "@/models";
import { ticketQrPngBuffer, ticketQrDataUrl } from "./qr";
import { fetchImageBuffer } from "./imageFetch";
import { appUrl } from "./appUrl";
import { sendTicketEmail } from "./mailer";
import { ticketPdfBuffer } from "./ticketPdf";
import type { TicketDoc } from "@/models";

/* A ticket holder is either a Participant or a Guest. The two collections
   store the same person differently, so everything downstream works off this
   normalized view. */
export type Holder =
  | { kind: "Participant"; doc: ParticipantDoc }
  | { kind: "Guest"; doc: GuestDoc };

type HolderView = {
  name: string;
  email: string;
  phone: string | null;
  photoUrl: string | null;
  /** stack (participant) or guest type — the pass badge + subtitle */
  label: string | null;
  /** coarse type shown on the QR / gate */
  type: string;
};

export function holderView(holder: Holder): HolderView {
  if (holder.kind === "Participant") {
    const p = holder.doc;
    return {
      name: p.name,
      email: p.email,
      phone: p.phone ?? null,
      photoUrl: p.profilePicture ?? null,
      label: p.stack ?? null,
      type: "PARTICIPANT",
    };
  }
  const g = holder.doc;
  return {
    name: g.name,
    email: g.email,
    phone: null,
    photoUrl: g.profile ?? null,
    label: g.guestType,
    type: g.guestType,
  };
}

/* subtitle under the name on the pass */
export async function roleLine(holder: Holder): Promise<string> {
  if (holder.kind === "Participant") {
    const stack = holder.doc.stack;
    if (stack) return `${stack.charAt(0)}${stack.slice(1).toLowerCase()} stack`;
    return "Participant";
  }
  const g = holder.doc;
  if (g.guestType === "PLUS_ONE") {
    const inviter = g.inviter ? await Participant.findById(g.inviter) : null;
    return inviter ? `Guest of ${inviter.name}` : "Plus-one";
  }
  return `${g.guestType.charAt(0)}${g.guestType.slice(1).toLowerCase()}`;
}

export class CapacityError extends Error {
  constructor() {
    super("This event has reached its maximum capacity");
  }
}

const holderRef = (
  holder: Holder
): { holderType: TicketHolderType; holderId: Types.ObjectId } => ({
  holderType: holder.kind,
  holderId: holder.doc._id,
});

/* Atomically claim one slot on an event. A single conditional update is the
   whole concurrency story: two registrations racing for the last seat can't
   both win, because Mongo applies the guarded $inc serially. Returns the
   updated event, or null when the event is already full. Uncapped events
   (maxAttendees 0) always succeed. */
export async function reserveSlot(eventId: Types.ObjectId | string): Promise<EventDoc | null> {
  return Event.findOneAndUpdate(
    {
      _id: eventId,
      $expr: {
        $or: [
          { $eq: ["$maxAttendees", 0] },
          { $lt: ["$registeredCount", "$maxAttendees"] },
        ],
      },
    },
    { $inc: { registeredCount: 1 } },
    { new: true }
  );
}

/* Give a reserved slot back (cancellation, revoke, or a failed issue). Floored
   at zero so a double-release can't drive the counter negative. */
export async function releaseSlot(eventId: Types.ObjectId | string): Promise<void> {
  await Event.findOneAndUpdate(
    { _id: eventId, registeredCount: { $gt: 0 } },
    { $inc: { registeredCount: -1 } }
  );
}

/* Non-mutating capacity peek — used before sending a magic link. */
export async function hasCapacity(event: EventDoc): Promise<boolean> {
  return event.maxAttendees <= 0 || event.registeredCount < event.maxAttendees;
}

/* mint a short, unique, human-readable ticket number, e.g. WTN-000042.
   Prefix = up to 3 letters from the event name; sequence is per-event. */
async function mintTicketNumber(event: EventDoc): Promise<string> {
  const prefix =
    event.name
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "TKT";
  const seq = await nextSequence(`ticket:${event._id.toString()}`);
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

/* Called when a participant completes registration (photo submitted) or an
   admin/participant adds a guest. Idempotent: returns the existing ticket.
   Reserves a capacity slot atomically before creating the ticket. */
export async function issueTicket(holder: Holder, opts: { email?: boolean } = {}) {
  const { holderType, holderId } = holderRef(holder);
  const existing = await Ticket.findOne({ holderType, holderId });
  if (existing) return existing;

  /* claim the seat first; a full event stops here without side effects */
  const event = await reserveSlot(holder.doc.event);
  if (!event) throw new CapacityError();

  let ticket;
  try {
    ticket = await Ticket.create({
      code: randomUUID(),
      ticketNumber: await mintTicketNumber(event),
      event: event._id,
      holderType,
      holderId,
    });
  } catch (err) {
    /* creation failed after reserving — hand the seat back */
    await releaseSlot(event._id);
    throw err;
  }

  /* back-reference so the holder record can find its ticket */
  if (holder.kind === "Participant") {
    await Participant.updateOne({ _id: holderId }, { ticket: ticket._id });
  } else {
    await Guest.updateOne({ _id: holderId }, { ticket: ticket._id });
  }

  if (opts.email !== false) {
    /* build the PDF + send the email in the background so the visitor gets
       their pass on screen at once; the ticket is valid either way and the
       email lands moments later */
    void emailTicket(holder, event, ticket.code)
      .then(async () => {
        ticket.sentAt = new Date();
        await ticket.save();
      })
      .catch((err) => {
        /* ticket stays valid even if the email bounces; it's on the dashboard */
        console.error("ticket email failed", err);
      });
  }
  return ticket;
}

/* Load the live Participant/Guest holder behind a ticket, as a Holder. Returns
   null after check-in (holder deleted) — admin actions target live tickets. */
export async function holderOfTicket(ticket: TicketDoc): Promise<Holder | null> {
  if (ticket.holderType === "Participant") {
    const doc = await Participant.findById(ticket.holderId);
    return doc ? { kind: "Participant", doc } : null;
  }
  const doc = await Guest.findById(ticket.holderId);
  return doc ? { kind: "Guest", doc } : null;
}

/* Re-send the existing ticket email. Returns false if there's no live holder
   (e.g. already checked in). */
export async function resendTicket(ticket: HydratedDocument<TicketDoc>): Promise<boolean> {
  const holder = await holderOfTicket(ticket);
  const event = await Event.findById(ticket.event);
  if (!holder || !event) return false;
  await emailTicket(holder, event, ticket.code);
  ticket.sentAt = new Date();
  await ticket.save();
  return true;
}

/* Reset a ticket: rotate the code (old QR is invalidated) AND mint a fresh
   ticket number, then re-email. The seat is unchanged. */
export async function resetTicket(ticket: HydratedDocument<TicketDoc>): Promise<boolean> {
  const holder = await holderOfTicket(ticket);
  const event = await Event.findById(ticket.event);
  if (!holder || !event) return false;
  ticket.code = randomUUID();
  ticket.ticketNumber = await mintTicketNumber(event);
  ticket.status = "VALID";
  ticket.scannedAt = null;
  ticket.resetCount += 1;
  await ticket.save();
  await emailTicket(holder, event, ticket.code);
  ticket.sentAt = new Date();
  await ticket.save();
  return true;
}

export async function emailTicket(holder: Holder, event: EventDoc, code: string) {
  const view = holderView(holder);
  const qr = await ticketQrPngBuffer(code, {
    name: view.name,
    type: view.type,
    eventName: event.name,
  });
  const url = appUrl(`/ticket/${code}`);
  const role = await roleLine(holder);

  /* pull the profile photo and event poster concurrently — the poster becomes
     the pass background (PDF) and email banner. Either can fail without
     invalidating the pass. */
  const posterUrl = event.gallery?.[0] ?? null;
  const [photo, eventImage] = await Promise.all([
    fetchImageBuffer(view.photoUrl),
    fetchImageBuffer(posterUrl),
  ]);

  const pdf = await ticketPdfBuffer({
    name: view.name,
    role,
    type: view.type,
    eventName: event.name,
    eventDate: event.startTime,
    venue: event.location,
    code,
    qrPng: qr,
    photo,
    eventImage,
    eventType: event.type,
    price: event.price,
    organiser: event.organiser,
  });

  await sendTicketEmail({
    to: view.email,
    name: view.name,
    role,
    photoUrl: view.photoUrl,
    type: view.type,
    eventName: event.name,
    eventDate: event.startTime,
    venue: event.location,
    eventImage: posterUrl,
    ticketCode: code,
    ticketUrl: url,
    /* online and hybrid events carry the join link on the pass email, so a
       registrant has the QR and the Meet link in the same message */
    meetLink: event.mode !== "IN_PERSON" ? event.meetLink || null : null,
    validUntil: eventDeadline(event),
    qrPng: qr,
    pdf,
  });
}

/* Resolve the human identity behind a ticket, whether the holder record is
   still live (Participant/Guest) or has been archived to the ticket snapshot
   at check-in. */
export async function ticketIdentity(ticket: TicketDoc): Promise<{
  name: string;
  email: string;
  type: string;
  photoUrl: string | null;
}> {
  if (ticket.holderType === "Participant" && ticket.holderId) {
    const p = await Participant.findById(ticket.holderId);
    if (p)
      return { name: p.name, email: p.email, type: "PARTICIPANT", photoUrl: p.profilePicture ?? null };
  } else if (ticket.holderType === "Guest" && ticket.holderId) {
    const g = await Guest.findById(ticket.holderId);
    if (g) return { name: g.name, email: g.email, type: g.guestType, photoUrl: g.profile ?? null };
  }
  /* archived snapshot fallback — also covers legacy tickets that predate the
     polymorphic holder fields (holderType/holderId may be undefined). */
  return {
    name: ticket.holder?.name ?? "Attendee",
    email: ticket.holder?.email ?? "",
    type: ticket.holder?.label ?? ticket.holderType?.toUpperCase() ?? "GUEST",
    photoUrl: ticket.holder?.photoUrl ?? null,
  };
}

/* The API ticket response shape (spec fields). Set qr:true to include a QR
   data URL — omit it for lists to keep payloads light. */
export async function buildTicketView(ticket: TicketDoc, opts: { qr?: boolean } = {}) {
  const [event, who] = await Promise.all([Event.findById(ticket.event), ticketIdentity(ticket)]);
  return {
    id: ticket._id,
    ticketNumber: ticket.ticketNumber,
    participantId: ticket.holderId,
    participantName: who.name,
    ownerType: ticket.holderType,
    eventId: ticket.event,
    eventName: event?.name ?? null,
    registeredAt: ticket.issuedAt,
    status: ticket.status,
    scannedAt: ticket.scannedAt ?? null,
    cancelledAt: ticket.cancelledAt ?? null,
    ...(opts.qr
      ? {
          qrDataUrl: await ticketQrDataUrl(ticket.code, {
            name: who.name,
            type: who.type,
            eventName: event?.name,
          }),
        }
      : {}),
  };
}

/* Batch equivalent of buildTicketView for list endpoints. A naive
   `tickets.map(buildTicketView)` runs 2 queries per ticket (event + holder) —
   ~1000 round-trips for a 500-row list. This resolves every event and holder in
   three `$in` queries total, then assembles the views from in-memory maps.
   Intended for lists, so it never embeds a QR image (that's a per-item cost). */
export async function buildTicketViews(tickets: TicketDoc[]) {
  const eventIds = new Set<string>();
  const participantIds = new Set<string>();
  const guestIds = new Set<string>();
  for (const t of tickets) {
    if (t.event) eventIds.add(t.event.toString());
    if (!t.holderId) continue;
    if (t.holderType === "Participant") participantIds.add(t.holderId.toString());
    else if (t.holderType === "Guest") guestIds.add(t.holderId.toString());
  }

  const [events, participants, guests] = await Promise.all([
    Event.find({ _id: { $in: [...eventIds] } }).select("name"),
    Participant.find({ _id: { $in: [...participantIds] } }).select("name email profilePicture"),
    Guest.find({ _id: { $in: [...guestIds] } }).select("name email guestType profile"),
  ]);
  const eventName = new Map(events.map((e) => [e._id.toString(), e.name]));
  const participantById = new Map(participants.map((p) => [p._id.toString(), p]));
  const guestById = new Map(guests.map((g) => [g._id.toString(), g]));

  const identityOf = (t: TicketDoc) => {
    if (t.holderType === "Participant" && t.holderId) {
      const p = participantById.get(t.holderId.toString());
      if (p) return { name: p.name, type: "PARTICIPANT" };
    } else if (t.holderType === "Guest" && t.holderId) {
      const g = guestById.get(t.holderId.toString());
      if (g) return { name: g.name, type: g.guestType };
    }
    /* archived snapshot / legacy fallback — matches ticketIdentity() */
    return {
      name: t.holder?.name ?? "Attendee",
      type: t.holder?.label ?? t.holderType?.toUpperCase() ?? "GUEST",
    };
  };

  return tickets.map((t) => {
    const who = identityOf(t);
    return {
      id: t._id,
      ticketNumber: t.ticketNumber,
      participantId: t.holderId,
      participantName: who.name,
      ownerType: t.holderType,
      eventId: t.event,
      eventName: (t.event && eventName.get(t.event.toString())) ?? null,
      registeredAt: t.issuedAt,
      status: t.status,
      scannedAt: t.scannedAt ?? null,
      cancelledAt: t.cancelledAt ?? null,
    };
  });
}

/* Whether a participant may view/act on a ticket: their own participant
   ticket, or a guest ticket for a plus-one they invited. */
export async function participantOwnsTicket(
  ticket: TicketDoc,
  participantId: string
): Promise<boolean> {
  if (ticket.holderType === "Participant") {
    return ticket.holderId.toString() === participantId;
  }
  const g = await Guest.findById(ticket.holderId);
  return g?.inviter?.toString() === participantId;
}

/* Cancel a ticket and free its capacity slot. Idempotent-ish: only a VALID
   ticket can be cancelled. */
export async function cancelTicket(ticket: HydratedDocument<TicketDoc>): Promise<void> {
  ticket.status = "REVOKED";
  ticket.cancelledAt = new Date();
  await ticket.save();
  await releaseSlot(ticket.event);
}
