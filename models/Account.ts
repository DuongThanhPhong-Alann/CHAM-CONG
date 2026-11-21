import mongoose, { Schema, type InferSchemaType } from "mongoose";

const PasskeySchema = new Schema(
  {
    id: { type: String, required: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, required: true, default: 0 },
    transports: { type: [String], default: [] },
  },
  { _id: false },
);

const AccountSchema = new Schema(
  {
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    passwordSalt: { type: String, required: true, select: false },
    passkeys: { type: [PasskeySchema], default: [] },
    role: { type: String, enum: ["admin", "user"], default: "user", required: true },
  },
  { timestamps: true },
);

export type AccountDocument = InferSchemaType<typeof AccountSchema>;
export type PasskeyCredentialRecord = {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
};
const Account = mongoose.models.Account || mongoose.model("Account", AccountSchema);
export default Account;
