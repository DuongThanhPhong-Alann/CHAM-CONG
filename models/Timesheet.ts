import mongoose, { Schema, type InferSchemaType } from "mongoose";

const TimesheetSchema = new Schema(
  {
    ownerId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    logicKey: { type: String, required: true, default: "standard" },
  },
  { timestamps: true },
);

TimesheetSchema.index({ ownerId: 1, name: 1 }, { unique: true });

export type TimesheetDocument = InferSchemaType<typeof TimesheetSchema>;
const Timesheet = mongoose.models.Timesheet || mongoose.model("Timesheet", TimesheetSchema);
export default Timesheet;
