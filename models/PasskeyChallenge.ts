import mongoose, { Schema } from "mongoose";

export type PasskeyChallengePurpose = "register" | "authenticate";
export type PasskeyChallengeRecord = {
  challenge: string;
  accountId: string | null;
  purpose: PasskeyChallengePurpose;
  expiresAt: Date;
};

const PasskeyChallengeSchema = new Schema(
  {
    _id: { type: String, required: true },
    accountId: { type: String, default: null },
    purpose: { type: String, enum: ["register", "authenticate"], required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, collection: "passkey_challenges" },
);

const PasskeyChallenge = mongoose.models.PasskeyChallenge || mongoose.model("PasskeyChallenge", PasskeyChallengeSchema);
export default PasskeyChallenge;
