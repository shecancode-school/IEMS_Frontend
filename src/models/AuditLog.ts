import { Schema, model, models, type Model, type Types } from "mongoose";

/* An append-only record of who did what.

   Read it like a bank statement: one line per action, always naming the actor,
   the action, the thing acted on and when. Nothing here is ever updated or
   deleted by application code — a correction is a new entry, not an edit.

   The actor's name and the target's label are DENORMALISED on purpose. An
   audit line has to stay readable after the account is renamed or the record
   it refers to is deleted, which a populate() would not survive. */
export const AUDIT_CATEGORIES = ["AUTH", "STAFF", "CALENDAR", "BOOKING", "EVENT", "TICKET", "SYSTEM"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

export interface AuditLogDoc {
  _id: Types.ObjectId;
  actor: Types.ObjectId | null;
  actorName: string;
  actorEmail: string;
  /* dotted verb, e.g. "auth.signin", "staff.role_changed", "booking.cancelled" */
  action: string;
  category: AuditCategory;
  targetType: string;
  targetId: string;
  targetLabel: string;
  /* one plain sentence a person can read without decoding anything */
  summary: string;
  /* only the fields that actually changed, as { field: { from, to } } */
  changes?: Record<string, { from: unknown; to: unknown }> | null;
  ip: string;
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
}

const AuditLogSchema = new Schema<AuditLogDoc>(
  {
    actor: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    actorName: { type: String, default: "System" },
    actorEmail: { type: String, default: "" },
    action: { type: String, required: true },
    category: { type: String, enum: AUDIT_CATEGORIES, default: "SYSTEM" },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    targetLabel: { type: String, default: "" },
    summary: { type: String, default: "" },
    changes: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

/* the three ways the ledger is read: newest first, by person, by thing */
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
AuditLogSchema.index({ category: 1, createdAt: -1 });

export const AuditLog: Model<AuditLogDoc> =
  (models.AuditLog as Model<AuditLogDoc>) ?? model<AuditLogDoc>("AuditLog", AuditLogSchema);
