import mongoose, { Schema, type InferSchemaType } from "mongoose";

const AccountSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    passwordSalt: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "user"], default: "user", required: true },
  },
  { timestamps: true },
);

export type AccountDocument = InferSchemaType<typeof AccountSchema>;
const Account = mongoose.models.Account || mongoose.model("Account", AccountSchema);
export default Account;
