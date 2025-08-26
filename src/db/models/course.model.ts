import mongoose from "mongoose";

const { Schema, model } = mongoose;

const courseSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    fileKey: {
      type: String,
      required: [true, "File key is required"],
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [10, "Description must be at least 10 characters"],
    },
    duration: {
      type: Number,
      required: [true, "Duration is required"],
      min: [0, "Duration cannot be negative"],
    },
    level: {
      type: String,
      required: [true, "Level is required"],
      enum: ["Beginner", "Intermediate", "Advanced"],
      default: "Beginner",
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      trim: true,
    },
    smallDescription: {
      type: String,
      required: [true, "Small description is required"],
      trim: true,
      maxlength: [500, "Small description cannot exceed 500 characters"],
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^[a-z0-9-]+$/,
        "Slug can only contain lowercase letters, numbers, and hyphens",
      ],
    },
    status: {
      type: String,
      required: [true, "Status is required"],
      enum: ["Draft", "Published", "Archived"],
      default: "Draft",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // 🔑 NEW: Chapters relation
    chapters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chapter" }],
  },
  {
    collection: "courses",
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes
courseSchema.index({ category: 1, status: 1 });
courseSchema.index({ createdBy: 1 });
courseSchema.index({ createdAt: -1 });

// Pre-save updatedAt
courseSchema.pre("save", function (next) {
  if (this.isModified() && !this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

// Virtual for formatted price
courseSchema.virtual("formattedPrice").get(function () {
  return `$${this.price.toFixed(2)}`;
});

// Virtual for formatted duration
courseSchema.virtual("formattedDuration").get(function () {
  const hours = Math.floor(this.duration);
  const minutes = Math.round((this.duration - hours) * 60);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
});

// --- 🔑 Cascade delete: remove chapters & lessons when course is deleted
courseSchema.pre("findOneAndDelete", async function (next) {
  const courseId = (this as any).getQuery()._id;
  if (!courseId) return next();

  const Chapter = mongoose.model("Chapter");
  const Lesson = mongoose.model("Lesson");

  // find all chapters for this course
  const chapters = await Chapter.find({ course: courseId }).select("_id");

  // delete lessons under those chapters
  await Lesson.deleteMany({ chapter: { $in: chapters.map((c) => c._id) } });

  // delete the chapters
  await Chapter.deleteMany({ course: courseId });

  next();
});

courseSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    const courseId = (this as any)._id;
    if (!courseId) return next();

    const Chapter = mongoose.model("Chapter");
    const Lesson = mongoose.model("Lesson");

    const chapters = await Chapter.find({ course: courseId }).select("_id");
    await Lesson.deleteMany({ chapter: { $in: chapters.map((c) => c._id) } });
    await Chapter.deleteMany({ course: courseId });

    next();
  },
);

const Course = model("Course", courseSchema);
export { Course };
