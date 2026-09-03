import { randomBytes } from "node:crypto";
import { Booking, type BookingDoc } from "@/models";
import { sha256 } from "@/lib/crypto";
import { insertEvent, patchEvent } from "@/lib/google/calendar";
import { invalidateAdmin } from "@/lib/google/cache";
import { getGoogleSession } from "@/lib/google/tokens";
import { sendBookingConfirmationEmail, sendBookingHostNoticeEmail } from "@/lib/mailer";
import { notifyAdmins } from "@/lib/notify";
import { publishContentChange } from "@/lib/scanBus";
import { appUrl } from "@/lib/appUrl";
import { eventDayISO, formatEventDateTime } from "@/lib/time";
import { recordAudit } from "@/lib/audit";
import {
  loadBookableHost,
  loadBookableHostByAdmin,
  slotsFor,
  type BookableHost,
} from "./hosts";
import { slotIsOffered } from "./slots";

/* Taking a booking, once, for both doors into it.

   There are two: the public /book/<slug> page, and a staff member booking on
   someone's behalf — the walk-in who is standing in front of you. They differ
   only in who is asking, so everything that actually matters (re-checking the
   slot against live availability, claiming it atomically, mirroring it to
   Google, emailing both sides, writing the audit line) lives here rather than
   being written twice and drifting.

   The one thing that is NOT shared is authorisation: each route decides who is
   allowed to call this before it does. */

export type BookingActor =
  /* an anonymous visitor on the public booking page */
  | { kind: "PUBLIC" }
  /* a staff member booking for someone else, in person or over the phone */
  | { kind: "ADMIN"; staffId: string };

export type BookingRequest = {
  name: string;
  email: string;
  phone?: string;
  topic?: string;
  /** the exact slot start the caller chose — never trusted, re-checked below */
  start: string;
};

export type BookingCreated = {
  id: string;
  start: string;
  end: string;
  hostName: string;
  meetLink: string | null;
  cancelUrl: string;
};

export type BookingOutcome =
  | { ok: true; booking: BookingCreated }
  | { ok: false; status: number; message: string };

export async function createBooking(
  host: BookableHost,
  body: BookingRequest,
  actor: BookingActor
): Promise<BookingOutcome> {
  const hostId = String(host.admin._id);
  const start = new Date(body.start);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, status: 400, message: "That is not a valid time" };
  }
  const day = eventDayISO(start);

  /* 1. Is this still a real, free slot? Recomputed from the host's rules and
        live free/busy rather than trusting the list the browser was shown,
        which may be a minute old — and which a determined caller could have
        skipped entirely.

        This applies to staff too. A booking made from the console goes through
        exactly the same availability check as a public one: "I work here" is
        not a reason to be allowed to double-book a colleague. */
  const { days } = await slotsFor(host, day, day);
  const slot = slotIsOffered(days, start);
  if (!slot) {
    return { ok: false, status: 409, message: "That time is no longer available — pick another slot" };
  }

  /* 2. Claim it. The partial unique index on { host, start } where active is
        the actual guard: two simultaneous requests produce one insert and one
        E11000, so there is no window between checking and writing. */
  const rawToken = randomBytes(32).toString("base64url");
  let booking;
  try {
    booking = await Booking.create({
      host: hostId,
      requesterName: body.name,
      requesterEmail: body.email.toLowerCase(),
      requesterPhone: body.phone ?? "",
      topic: body.topic ?? "",
      start: slot.start,
      end: slot.end,
      status: "CONFIRMED",
      active: true,
      cancelTokenHash: sha256(rawToken),
      source: actor.kind,
    });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return { ok: false, status: 409, message: "Someone just took that time — pick another slot" };
    }
    throw err;
  }

  /* 3. Put it on the host's Google Calendar with a Meet link. A failure here
        must NOT lose the booking: a confirmed slot with a missing video link
        is far better than telling a real person their booking failed. */
  let meetLink: string | null = null;
  try {
    const session = await getGoogleSession(hostId);
    if (session) {
      const created = await insertEvent(hostId, {
        title: `${body.name} — ${host.admin.name}`,
        description: body.topic
          ? `Booked through IEMS.\n\n${body.topic}`
          : "Booked through IEMS.",
        start: slot.start,
        end: slot.end,
        attendees: [{ email: body.email, name: body.name }],
        withMeet: true,
        /* we send our own branded confirmation carrying both the Meet link and
           the cancel link, so a second invite from Google would be noise */
        sendUpdates: "none",
      });
      booking.googleEventId = created.id;
      booking.meetLink = created.meetLink;
      meetLink = created.meetLink;
      await booking.save();
    }
  } catch {
    await notifyAdmins({
      kind: "SYSTEM",
      severity: "warning",
      title: "Booking created without a Google event",
      body: `${body.name} booked ${host.admin.name} for ${formatEventDateTime(slot.start)}, but the Google Calendar entry could not be created.`,
    });
  }

  invalidateAdmin(hostId);
  /* every calendar in the product refetches off this — the host's own
     schedule, the org board, the public timetable */
  publishContentChange("calendar");

  /* The audit line names whoever actually did it. A staff member booking on
     someone's behalf is a different act from that person booking themselves,
     and the ledger has to be able to tell them apart. */
  await recordAudit(
    actor.kind === "ADMIN"
      ? {
          actorId: actor.staffId,
          action: "booking.create",
          target: { type: "booking", id: booking._id.toString(), label: host.admin.name },
          summary: `Booked ${body.name} in with ${host.admin.name} for ${formatEventDateTime(slot.start)}`,
        }
      : {
          actorId: null,
          actorName: body.name,
          actorEmail: body.email.toLowerCase(),
          action: "booking.create",
          target: { type: "booking", id: booking._id.toString(), label: host.admin.name },
          summary: `Booked a slot with ${host.admin.name} for ${formatEventDateTime(slot.start)}`,
        }
  );

  const cancelUrl = appUrl(`/book/cancel/${rawToken}`);
  const when = `${formatEventDateTime(slot.start)} (Kigali time, UTC+2)`;

  /* email failures must not fail the booking either — it is already made */
  await Promise.allSettled([
    sendBookingConfirmationEmail({
      to: body.email,
      name: body.name,
      hostName: host.admin.name,
      when,
      meetLink,
      cancelUrl,
      topic: body.topic ?? "",
      /* lets the email carry an "Add to Google Calendar" link and an .ics —
         the requester is not staff, so this is the only way the meeting
         reaches their own calendar */
      start: slot.start,
      end: slot.end,
      bookingId: booking._id.toString(),
    }),
    sendBookingHostNoticeEmail({
      to: host.admin.email,
      hostName: host.admin.name,
      requesterName: body.name,
      requesterEmail: body.email,
      when,
      meetLink,
      topic: body.topic ?? "",
    }),
  ]);

  return {
    ok: true,
    booking: {
      id: booking._id.toString(),
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      hostName: host.admin.name,
      meetLink,
      cancelUrl,
    },
  };
}

export { loadBookableHost, loadBookableHostByAdmin };

export type BookingRescheduled = {
  id: string;
  start: string;
  end: string;
  hostName: string;
  meetLink: string | null;
};

export type RescheduleOutcome =
  | { ok: true; booking: BookingRescheduled }
  | { ok: false; status: number; message: string };

/* Moving a booking to a different time.

   The rules are the create path's rules: the new slot is recomputed from the
   host's availability and live free/busy rather than trusted from the browser,
   and the partial unique index is what actually claims it. The one difference
   is that the booking's own block is released first — otherwise a booking
   always clashes with itself and no move is ever possible.

   The Google entry is PATCHed rather than deleted and re-created, so the Meet
   link already sitting in the requester's inbox keeps working. */
export async function rescheduleBooking(
  booking: BookingDoc & { save: () => Promise<unknown> },
  newStartISO: string,
  actor: { staffId: string }
): Promise<RescheduleOutcome> {
  if (booking.status === "CANCELLED") {
    return { ok: false, status: 409, message: "That booking is cancelled — it cannot be moved" };
  }

  const start = new Date(newStartISO);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, status: 400, message: "That is not a valid time" };
  }

  const hostId = booking.host.toString();
  const host = await loadBookableHostByAdmin(hostId);
  if (!host) {
    return {
      ok: false,
      status: 409,
      message: "That host is no longer taking bookings, so this cannot be moved",
    };
  }

  const day = eventDayISO(start);
  const { days } = await slotsFor(host, day, day, new Date(), {
    start: booking.start,
    end: booking.end,
  });
  const slot = slotIsOffered(days, start);
  if (!slot) {
    return { ok: false, status: 409, message: "That time is not available — pick another slot" };
  }

  const previous = booking.start;
  booking.start = slot.start;
  booking.end = slot.end;

  /* The cancel link is a hash of a token we never kept, so a fresh one has to
     be minted to be able to send a working link with the new time. That
     retires the link in the original email — which is the honest outcome: it
     described a meeting that no longer exists at that hour. */
  const rawToken = randomBytes(32).toString("base64url");
  booking.cancelTokenHash = sha256(rawToken);

  try {
    await booking.save();
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) {
      return { ok: false, status: 409, message: "Someone just took that time — pick another slot" };
    }
    throw err;
  }

  /* Same rule as creation: a Google failure must not lose the move. The row is
     already saved and the people involved are about to be told. */
  if (booking.googleEventId) {
    try {
      await patchEvent(hostId, booking.googleEventId, { start: slot.start, end: slot.end });
    } catch {
      await notifyAdmins({
        kind: "SYSTEM",
        severity: "warning",
        title: "Booking moved without updating Google",
        body: `${booking.requesterName}'s booking with ${host.admin.name} moved to ${formatEventDateTime(slot.start)}, but the Google Calendar entry still shows the old time.`,
      });
    }
  }

  invalidateAdmin(hostId);
  publishContentChange("calendar");

  await recordAudit({
    actorId: actor.staffId,
    action: "booking.reschedule",
    target: { type: "booking", id: booking._id.toString(), label: host.admin.name },
    summary: `Moved ${booking.requesterName}'s booking with ${host.admin.name} from ${formatEventDateTime(previous)} to ${formatEventDateTime(slot.start)}`,
  });

  const when = `${formatEventDateTime(slot.start)} (Kigali time, UTC+2)`;
  await Promise.allSettled([
    sendBookingConfirmationEmail({
      to: booking.requesterEmail,
      name: booking.requesterName,
      hostName: host.admin.name,
      when,
      meetLink: booking.meetLink ?? null,
      cancelUrl: appUrl(`/book/cancel/${rawToken}`),
      topic: booking.topic ?? "",
      start: slot.start,
      end: slot.end,
      bookingId: booking._id.toString(),
    }),
    sendBookingHostNoticeEmail({
      to: host.admin.email,
      hostName: host.admin.name,
      requesterName: booking.requesterName,
      requesterEmail: booking.requesterEmail,
      when,
      meetLink: booking.meetLink ?? null,
      topic: booking.topic ?? "",
    }),
  ]);

  return {
    ok: true,
    booking: {
      id: booking._id.toString(),
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      hostName: host.admin.name,
      meetLink: booking.meetLink ?? null,
    },
  };
}
