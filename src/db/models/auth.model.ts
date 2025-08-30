import mongoose from "mongoose";
import { required } from "zod/mini";

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    emailVerified: { type: Boolean, required: true },
    image: { type: String },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    banned: { type: Boolean, default: false },
    banReason: { type: String, default: null },
    banExpires: { type: Date, default: null },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },

    enrollments: [{ type: Schema.Types.ObjectId, ref: "Enrollment" }],
    lessonProgress: [{ type: Schema.Types.ObjectId, ref: "LessonProgress" }],

    // For Stripe integration
    stripeCustomerId: { type: String, unique: true },
  },
  { collection: "user" },
);

const sessionSchema = new Schema(
  {
    _id: { type: String },
    expiresAt: { type: Date, required: true },
    token: { type: String, required: true, unique: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    userId: { type: String, ref: "User", required: true },
    impersonatedBy: { type: String, ref: "User", default: null },
  },
  { collection: "session" },
);

const accountSchema = new Schema(
  {
    _id: { type: String },
    accountId: { type: String, required: true },
    providerId: { type: String, required: true },
    userId: { type: String, ref: "User", required: true },
    accessToken: { type: String },
    refreshToken: { type: String },
    idToken: { type: String },
    accessTokenExpiresAt: { type: Date },
    refreshTokenExpiresAt: { type: Date },
    scope: { type: String },
    password: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  { collection: "account" },
);

const verificationSchema = new Schema(
  {
    _id: { type: String },
    identifier: { type: String, required: true },
    value: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date },
    updatedAt: { type: Date },
  },
  { collection: "verification" },
);

const rateLimitSchema = new Schema(
  {
    _id: { type: String, required: true },
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    lastRequest: { type: Number, required: true },
  },
  { collection: "rateLimit" },
);

const User = model("User", userSchema);
const Session = model("Session", sessionSchema);
const Account = model("Account", accountSchema);
const Verification = model("Verification", verificationSchema);
const RateLimit = model("RateLimit", rateLimitSchema);

export { User, Session, Account, Verification, RateLimit };
