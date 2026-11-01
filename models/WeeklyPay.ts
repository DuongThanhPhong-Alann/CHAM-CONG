import mongoose, { Schema } from "mongoose";

const WeeklyPaySchema = new Schema(
  {
    employeeName: { type: String, required: true, trim: true },
    weekStart: { type: String, required: true },
    hourlyRate: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

WeeklyPaySchema.index({ employeeName: 1, weekStart: 1 }, { unique: true });

const WeeklyPay = mongoose.models.WeeklyPay || mongoose.model("WeeklyPay", WeeklyPaySchema);
export default WeeklyPay;
