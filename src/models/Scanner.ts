/* LEGACY — retained for history only.

   Standalone gate-device accounts were retired when sign-in became Google-only:
   scanning is now a duty an administrator grants to a staff account (canScan),
   so whoever works the door signs in as themselves and every check-in is
   attributed to a real person. No new Scanner documents are created and these
   accounts can no longer sign in; the collection stays so ScanLog rows written
   before the change still name whoever performed the scan.
*/
import { Schema, model, models, type Model, type Types } from "mongoose";

/* A Scanner account used to sign in on the gate device to check guests in. Created and
   managed by an Admin; authenticates with email + password like an admin, but
   is a distinct role with a much narrower permission set. */
export interface ScannerDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  active: boolean;
  createdBy?: Types.ObjectId | null;
  lastSeenAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ScannerSchema = new Schema<ScannerDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    active: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
    lastSeenAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Scanner: Model<ScannerDoc> =
  (models.Scanner as Model<ScannerDoc>) ?? model<ScannerDoc>("Scanner", ScannerSchema);
