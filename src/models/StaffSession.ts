import { Schema, model, models, type Model, type Types } from "mongoose";

/* A signed-in staff session. The raw refresh token lives ONLY in an httpOnly
   cookie; this stores its SHA-256, the same shape RefreshToken uses for
   participants.

   Sessions are rows rather than pure JWTs so an administrator can see who is
   signed in from where and end a session immediately — the audit log needs a
   session to point at, and "sign this person out everywhere" has to be a real
   operation, not a wait for a token to expire. */
export interface StaffSessionDoc {
  _id: Types.ObjectId;
  admin: Types.ObjectId;
  tokenHash: string;
  /* rotation chain, for reuse detection */
  usedAt?: Date | null;
  replacedBy?: string | null;
  revokedAt?: Date | null;
  ip: string;
  userAgent: string;
  lastSeenAt: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSessionSchema = new Schema<StaffSessionDoc>(
  {
    admin: { type: Schema.Types.ObjectId, ref: "Admin", required: true },
    tokenHash: { type: String, required: true, unique: true },
    usedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    lastSeenAt: { type: Date, default: () => new Date() },
    /* TTL: Mongo removes the row once it expires, so the table cannot grow
       without bound as people sign in and out */
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true }
);

StaffSessionSchema.index({ admin: 1, createdAt: -1 });

export const StaffSession: Model<StaffSessionDoc> =
  (models.StaffSession as Model<StaffSessionDoc>) ??
  model<StaffSessionDoc>("StaffSession", StaffSessionSchema);
