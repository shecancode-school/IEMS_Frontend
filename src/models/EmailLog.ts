import { Schema, model, models, type Model, type Types } from "mongoose";

/* every outbound message the platform can produce */
export const EMAIL_KINDS = [
  "MAGIC_LINK", // verify-your-email login link
  "CONFIRMATION", // registration confirmed after first verification
  "PLUS_ONE_INVITE", // a participant invited their plus-one
  "TICKET", // the event pass with QR + PDF
  "TICKET_NUDGE", // admin nudge: finish your registration to receive your pass
  "REMINDER", // "your event is coming up"
  "UPDATE", // admin broadcast about an event
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const EMAIL_STATUSES = ["SENT", "FAILED"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/* One row per send attempt. Powers the admin Emails report (how many went
   out, to whom, which failed) and lets an admin open the exact HTML a
   recipient saw. */
export interface EmailLogDoc {
  _id: Types.ObjectId;
  kind: EmailKind;
  to: string;
  subject: string;
  /** the rendered body as delivered — attachments (QR/PDF) are not stored */
  html: string;
  status: EmailStatus;
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const EmailLogSchema = new Schema<EmailLogDoc>(
  {
    kind: { type: String, enum: EMAIL_KINDS, required: true },
    to: { type: String, required: true, lowercase: true, trim: true },
    subject: { type: String, required: true },
    html: { type: String, default: "" },
    status: { type: String, enum: EMAIL_STATUSES, required: true },
    error: { type: String, default: null },
  },
  { timestamps: true }
);

EmailLogSchema.index({ createdAt: -1 });
EmailLogSchema.index({ kind: 1, status: 1 });
/* email bodies carry names + addresses — same 90-day PII sweep as
   notifications */
EmailLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const EmailLog: Model<EmailLogDoc> =
  (models.EmailLog as Model<EmailLogDoc>) ?? model<EmailLogDoc>("EmailLog", EmailLogSchema);
