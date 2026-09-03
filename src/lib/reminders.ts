import { createHash, randomBytes } from "crypto";
import { dbConnect } from "./db";
import { Event, Participant, Guest, VerificationToken, EmailLog } from "@/models";
import { sendProgressReminderEmail, type ProgressStep } from "./mailer";
import { appUrl } from "./appUrl";
import { formatEventDate } from "./time";

export type ReminderSummary = {
  /** participants considered across all upcoming open events */
  scanned: number;
  /** reminder emails successfully sent */
  sent: number;
  /** reminder emails that failed to send */
  failed: number;
  /** participants with a step to do but skipped by the 24h de-dupe guard */
  skipped: number;
};

/* Don't re-nudge the same address more than once a (roughly) daily window, so a
   double-fired cron or a manual run right after the scheduled one never
   double-sends. 20h leaves the daily cadence intact. */
const DEDUPE_WINDOW_MS = 20 * 60 * 60 * 1000;

/* Where a participant sits in the flow → which reminder they need. Returns null
   when there is nothing left for them to do (fully registered, plus-one already
   invited). `hasPlusOne` is only consulted once they're COMPLETE. */
function nextStep(
  status: string,
  profilePicture: string | null | undefined,
  hasPlusOne: boolean
): ProgressStep | null {
  if (status === "PENDING") return "VERIFY";
  if (status === "VERIFIED" || !profilePicture) return "FINISH";
  /* COMPLETE with a photo — the only thing left is inviting their guest */
  return hasPlusOne ? null : "PLUS_ONE";
}

/* The daily status-aware reminder pass. Scans every upcoming, open, non-archived
   event and emails each participant a single reminder tailored to their next
   unfinished step — verify email, finish profile, or invite a plus-one — with a
   single-use sign-in link that works for all three. Safe to call from the Vercel
   cron endpoint or the admin "run now" action; idempotent within a 20h window. */
export async function runDailyReminders(): Promise<ReminderSummary> {
  await dbConnect();
  const now = new Date();

  const events = await Event.find({
    startTime: { $gt: now },
    archivedAt: null,
    status: "OPEN",
    /* an unpublished event is not a programme anyone should be hearing about —
       see isLiveProgramme in src/lib/programme.ts for the shared definition */
    isPublished: true,
  }).select("_id name startTime");

  const summary: ReminderSummary = { scanned: 0, sent: 0, failed: 0, skipped: 0 };
  if (events.length === 0) return summary;

  const dedupeCutoff = new Date(now.getTime() - DEDUPE_WINDOW_MS);

  for (const event of events) {
    /* skip rejected registrations — they shouldn't be chased to finish */
    const participants = await Participant.find({
      event: event._id,
      registrationStatus: { $ne: "REJECTED" },
    }).select("name email status profilePicture");
    if (participants.length === 0) continue;

    /* one query for "who already invited a plus-one" among the COMPLETE folks */
    const completeIds = participants
      .filter((p) => p.status === "COMPLETE")
      .map((p) => p._id);
    const invitedBy = new Set(
      completeIds.length
        ? (await Guest.find({ inviter: { $in: completeIds } }).select("inviter")).map((g) =>
            g.inviter?.toString()
          )
        : []
    );

    /* one query for "who was already reminded recently" */
    const emails = participants.map((p) => p.email);
    const recentlyReminded = new Set(
      (
        await EmailLog.find({
          to: { $in: emails },
          kind: "PROGRESS_REMINDER",
          createdAt: { $gt: dedupeCutoff },
        }).select("to")
      ).map((l) => l.to)
    );

    const whenLabel = `on ${formatEventDate(event.startTime, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })}`;

    for (const p of participants) {
      const step = nextStep(p.status, p.profilePicture, invitedBy.has(p._id.toString()));
      if (!step) continue;
      summary.scanned += 1;

      if (recentlyReminded.has(p.email)) {
        summary.skipped += 1;
        continue;
      }

      try {
        /* a fresh single-use sign-in link per reminder (same pattern as the
           admin pass-nudge). PENDING verifies with it; everyone else lands
           logged in on their dashboard. */
        const token = randomBytes(32).toString("hex");
        await VerificationToken.create({
          tokenHash: createHash("sha256").update(token).digest("hex"),
          purpose: "LOGIN",
          email: p.email,
          participant: p._id,
          expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
        });
        await sendProgressReminderEmail(
          p.email,
          p.name,
          event.name,
          step,
          appUrl(`/verify/${token}`),
          whenLabel
        );
        summary.sent += 1;
        /* keep in-run de-dupe honest if a person is in two events at once */
        recentlyReminded.add(p.email);
      } catch (err) {
        console.error("progress reminder failed", p.email, err);
        summary.failed += 1;
      }
    }
  }

  return summary;
}
