import mongoose, { Document } from "mongoose";

export type SyncRunKind = "plan" | "correction";
export type SyncRunOutcome = "done" | "stopped-429" | "error";

/**
 * One entry in a Sync budget month's history: a `plan` run (which machine,
 * what it reserved and sent, how it ended, where its Sync plan file is) or a
 * `correction` made with `budget --set`. A plan record without `finishedAt`
 * is a run that never finished. Written only by src/scripts/googleSync.ts.
 */
export interface ISyncRun extends Document {
  /** "YYYY-MM" in America/Los_Angeles: the month the run reserved from. */
  month: string;
  kind: SyncRunKind;
  host: string;
  startedAt: Date;
  finishedAt?: Date;
  reserved: number;
  sent: number;
  outcome?: SyncRunOutcome;
  planPath?: string;
  /** Corrections only. */
  reason?: string;
  /** Corrections only: the `spent` the month was set to. */
  setTo?: number;
}

const SyncRunSchema = new mongoose.Schema({
  month: { type: String, required: true, index: true },
  kind: { type: String, enum: ["plan", "correction"], required: true },
  host: { type: String, required: true },
  startedAt: { type: Date, required: true },
  finishedAt: { type: Date },
  reserved: { type: Number, required: true, default: 0 },
  sent: { type: Number, required: true, default: 0 },
  outcome: { type: String, enum: ["done", "stopped-429", "error"] },
  planPath: { type: String },
  reason: { type: String },
  setTo: { type: Number },
});

export default mongoose.model<ISyncRun>("SyncRun", SyncRunSchema);
