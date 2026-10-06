import mongoose, { Document } from "mongoose";

/**
 * One US Pacific month of the Google sync's Sync budget, shared by every
 * machine that runs the sync. `reserved` is held by runs in flight (or left
 * by a killed run until `budget --set` clears it); `spent` is what finished
 * runs actually sent. Written only by src/scripts/googleSync.ts.
 */
export interface ISyncBudgetMonth extends Document {
  /** "YYYY-MM" in America/Los_Angeles. */
  month: string;
  spent: number;
  reserved: number;
}

const SyncBudgetMonthSchema = new mongoose.Schema({
  month: { type: String, required: true, unique: true },
  spent: { type: Number, required: true, default: 0 },
  reserved: { type: Number, required: true, default: 0 },
});

export default mongoose.model<ISyncBudgetMonth>("SyncBudgetMonth", SyncBudgetMonthSchema);
