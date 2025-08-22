import mongoose from "mongoose";
import { required } from "zod/mini";

const { Schema, model } = mongoose;

const courseSchema = new Schema(
  {
    _id: { type: String },
    title: { type: String, required: true },
    fileKey: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    duration: { type: Number, required: true },
    level: {
      type: String,
      required: true,
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    catagory: { type: String, required: true },
    smallDescription: { type: String, required: true },
    slug: { type: String, required: true, unique: true },

    status: {
      type: String,
      required: true,
      enum: ["Draft", "Published", "Archived"],
      default: "Draft",
    },

    //one-to-many relationship with User
    createdBy: { type: String, ref: "User", required: true },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "courses" },
);

const Course = model("Course", courseSchema);

export { courseSchema };
