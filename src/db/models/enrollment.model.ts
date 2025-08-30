// models/enrollment.model.ts
import mongoose from "mongoose";

const { Schema, model } = mongoose;
const enrollmentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "active", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true, collection: "enrollments" },
);

// Prevent duplicate enrollments (same user in same course)
enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

const Enrollment = model("Enrollment", enrollmentSchema);
export { Enrollment };
