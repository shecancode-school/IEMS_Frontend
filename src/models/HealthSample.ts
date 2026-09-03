import { Schema, model, models, type Model, type Types } from "mongoose";

/* One recorded health check for a single service, rolled up into the uptime
   bars. Auto-expires after ~95 days so the collection stays small.

   `source` is the field that makes the history mean anything. Samples used to
   be written only when an administrator had the status page open, so a service
   was recorded as healthy exactly for the hours somebody was watching it and
   the bars quietly described attendance rather than uptime. A cron-written
   sample is a real measurement; a web-written one is a side effect of someone
   looking. They have to be distinguishable. */
export interface HealthSampleDoc {
  _id: Types.ObjectId;
  service: string;
  ok: boolean;
  ms: number;
  /* what the probe reported — kept so a past failure can be read back rather
     than being a bare red bar with no explanation */
  detail?: string | null;
  error?: string | null;
  source: "web" | "cron" | "cli";
  at: Date;
}

const HealthSampleSchema = new Schema<HealthSampleDoc>({
  service: { type: String, required: true },
  ok: { type: Boolean, required: true },
  ms: { type: Number, default: 0 },
  detail: { type: String, default: null },
  error: { type: String, default: null },
  /* rows written before this field existed came from the status page, which
     was the only writer — so "web" is the honest default for them */
  source: { type: String, enum: ["web", "cron", "cli"], default: "web" },
  at: { type: Date, default: () => new Date() },
});

/* index for per-service time-range rollups + TTL cleanup */
HealthSampleSchema.index({ service: 1, at: -1 });
/* "when did the monitor last run" — read on every status page load */
HealthSampleSchema.index({ source: 1, at: -1 });
HealthSampleSchema.index({ at: 1 }, { expireAfterSeconds: 95 * 24 * 60 * 60 });

export const HealthSample: Model<HealthSampleDoc> =
  (models.HealthSample as Model<HealthSampleDoc>) ??
  model<HealthSampleDoc>("HealthSample", HealthSampleSchema);
