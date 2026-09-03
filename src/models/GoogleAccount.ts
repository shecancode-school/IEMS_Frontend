import { Schema, model, models, type Model, type Types } from "mongoose";
import { GOOGLE_ACCOUNT_STATUSES, type GoogleAccountStatus } from "@/types/admin";

export { GOOGLE_ACCOUNT_STATUSES };
export type { GoogleAccountStatus };

/* One connected Google account per staff member. Tokens are stored as
   AES-256-GCM ciphertext (lib/crypto.ts) — never in plaintext, never logged.

   googleSub is unique on purpose: without it, three people all connecting the
   shared info@ mailbox would silently collapse to one calendar and every
   availability lookup would return the same busy blocks. */
export interface GoogleAccountDoc {
  _id: Types.ObjectId;
  admin: Types.ObjectId;
  googleSub: string;
  email: string;
  scopes: string[];
  refreshToken: string;
  accessToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  calendarId: string;
  status: GoogleAccountStatus;
  lastError?: string | null;
  lastUsedAt?: Date | null;
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const GoogleAccountSchema = new Schema<GoogleAccountDoc>(
  {
    admin: { type: Schema.Types.ObjectId, ref: "Admin", required: true, unique: true },
    googleSub: { type: String, required: true, unique: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    scopes: { type: [String], default: [] },
    refreshToken: { type: String, required: true },
    accessToken: { type: String, default: null },
    accessTokenExpiresAt: { type: Date, default: null },
    calendarId: { type: String, default: "primary" },
    status: { type: String, enum: GOOGLE_ACCOUNT_STATUSES, default: "CONNECTED" },
    lastError: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
    connectedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true }
);

export const GoogleAccount: Model<GoogleAccountDoc> =
  (models.GoogleAccount as Model<GoogleAccountDoc>) ??
  model<GoogleAccountDoc>("GoogleAccount", GoogleAccountSchema);
