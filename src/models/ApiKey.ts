import { Schema, model, models, type Model, type Types } from "mongoose";
import { API_KEY_SCOPES, type ApiKeyScope } from "@/types/admin";

/* A third party's key for reading the public calendar from their own site.

   The raw key is generated once at approval, returned once, and never stored
   — only its SHA-256, the same shape Booking.cancelTokenHash and
   VerificationToken already use. `keyPrefix` IS stored in clear so an
   administrator can identify a key in a list ("iro_live_9f3a…") without that
   fragment being usable on its own.

   A request and a key are the same document at different stages of its life.
   Keeping them in one collection means the approval history — who asked, why,
   who said yes — stays attached to the credential instead of being a separate
   record nobody joins. */

export const API_KEY_STATUSES = ["PENDING", "ACTIVE", "REVOKED", "REJECTED"] as const;
export type ApiKeyStatus = (typeof API_KEY_STATUSES)[number];

export { API_KEY_SCOPES };
export type { ApiKeyScope };

export interface ApiKeyDoc {
  _id: Types.ObjectId;
  /* the request */
  label: string;
  organisation: string;
  contactName: string;
  contactEmail: string;
  website: string;
  purpose: string;
  /* the credential — only present once approved */
  keyHash?: string | null;
  keyPrefix?: string | null;
  scopes: ApiKeyScope[];
  status: ApiKeyStatus;
  /* per-minute ceiling, so one integrator cannot exhaust the service */
  rateLimitPerMinute: number;
  approvedBy?: Types.ObjectId | null;
  approvedAt?: Date | null;
  revokedAt?: Date | null;
  revokedReason?: string | null;
  lastUsedAt?: Date | null;
  requestCount: number;
  requestedIp: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<ApiKeyDoc>(
  {
    label: { type: String, required: true, trim: true },
    organisation: { type: String, default: "", trim: true },
    contactName: { type: String, required: true, trim: true },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    website: { type: String, default: "", trim: true },
    purpose: { type: String, default: "", trim: true },
    /* sparse: many PENDING rows legitimately have no key yet, and a plain
       unique index would treat every one of those nulls as a collision */
    keyHash: { type: String, default: null, unique: true, sparse: true },
    keyPrefix: { type: String, default: null },
    scopes: { type: [String], enum: API_KEY_SCOPES, default: ["calendar:read"] },
    status: { type: String, enum: API_KEY_STATUSES, default: "PENDING" },
    rateLimitPerMinute: { type: Number, default: 60, min: 1, max: 6000 },
    approvedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    approvedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
    requestCount: { type: Number, default: 0 },
    /* who asked, for spotting a flood of junk requests */
    requestedIp: { type: String, default: "" },
  },
  { timestamps: true }
);

ApiKeySchema.index({ status: 1, createdAt: -1 });
ApiKeySchema.index({ contactEmail: 1 });

export const ApiKey: Model<ApiKeyDoc> =
  (models.ApiKey as Model<ApiKeyDoc>) ?? model<ApiKeyDoc>("ApiKey", ApiKeySchema);
