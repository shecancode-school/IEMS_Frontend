import { Schema, model, models, type Model, type Types } from "mongoose";
import { ADMIN_ROLES, type AdminRole } from "@/types/admin";

/* Staff roles. ADMIN and CEO are privileged (full console); FACILITATOR,
   ACADEMIC and STAFF are calendar-only accounts — they own their schedule,
   their activities and their bookings, and nothing else. Guards live in
   lib/auth.ts (requireAdmin = ADMIN|CEO, requireStaff = any of these).

   The enum is single-sourced from types/admin.ts and re-exported here so
   `import { ADMIN_ROLES } from "@/models"` keeps working. types/admin.ts has
   no imports of its own, so pulling it into a model is safe on the server. */
export {
  ADMIN_ROLES,
  PRIVILEGED_ROLES,
  ROLE_LABELS,
  ROLE_CAPABILITIES,
  capabilitiesFor,
  can,
} from "@/types/admin";
export type { AdminRole, Capability } from "@/types/admin";

export interface AdminDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash?: string | null;
  role: AdminRole;
  /* shown on the org calendar and the public booking page */
  title?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  /* Google identity, filled in at sign-in */
  googleSub?: string | null;
  photoUrl?: string | null;
  lastSignInAt?: Date | null;
  /* Gate duty is a grant an administrator makes, not a property of the role:
     any staff member can be handed a phone and asked to scan for one event. */
  canScan: boolean;
  createdBy?: Types.ObjectId | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSchema = new Schema<AdminDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /* Optional now that sign-in is Google-only. Legacy accounts created before
       the change may still carry a hash; nothing reads it. */
    passwordHash: { type: String, default: null },
    role: { type: String, enum: ADMIN_ROLES, default: "ADMIN" },
    title: { type: String, trim: true, default: null },
    avatarUrl: { type: String, default: null },
    bio: { type: String, trim: true, default: null },
    googleSub: { type: String, default: null, index: true, sparse: true },
    photoUrl: { type: String, default: null },
    lastSignInAt: { type: Date, default: null },
    canScan: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Admin: Model<AdminDoc> =
  (models.Admin as Model<AdminDoc>) ?? model<AdminDoc>("Admin", AdminSchema);
