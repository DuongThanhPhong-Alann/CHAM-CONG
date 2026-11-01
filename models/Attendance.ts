import mongoose, { Schema, type InferSchemaType } from "mongoose";

const ShiftSchema = new Schema(
  {
    code: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    hours: { type: Number, required: true },
  },
  { _id: false },
);

const AttendanceSchema = new Schema(
  {
    employeeName: { type: String, required: true, trim: true },
    date: { type: String, required: true },
    shifts: { type: [ShiftSchema], required: true },
    coworkers: { type: [String], default: [] },
    totalHours: { type: Number, required: true },
  },
  { timestamps: true },
);

AttendanceSchema.index({ employeeName: 1, date: 1 }, { unique: true });

export type AttendanceDocument = InferSchemaType<typeof AttendanceSchema>;
const Attendance = mongoose.models.Attendance || mongoose.model("Attendance", AttendanceSchema);
export default Attendance;
