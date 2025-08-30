import mongoose, { Schema, Types, Document, model } from "mongoose";

export interface ILesson extends Document {
  position: number; // order within the chapter
  title: string;
  description?: string;
  thumbnailKey?: string;
  videoKey?: string;
  chapter: Types.ObjectId; // parent chapter
  lessonProgress: Types.ObjectId[]; // Fixed: should be array
  createdAt: Date;
  updatedAt: Date;
}

export interface ILessonProgress extends Document {
  completed: boolean;
  user: Types.ObjectId;
  lesson: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const lessonSchema = new Schema<ILesson>(
  {
    position: { type: Number, default: 0, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true },
    thumbnailKey: { type: String, trim: true },
    videoKey: { type: String, trim: true },
    chapter: { type: Schema.Types.ObjectId, ref: "Chapter", required: true },
    lessonProgress: [{ type: Schema.Types.ObjectId, ref: "LessonProgress" }],
  },
  { timestamps: true, collection: "lessons" },
);

lessonSchema.index({ chapter: 1, createdAt: -1 });

// --- Ref cleanup on delete (query middleware: findByIdAndDelete/findOneAndDelete)
lessonSchema.pre("findOneAndDelete", async function (next) {
  const doc = await (this as any).model
    .findOne(this.getQuery())
    .select("_id chapter");
  if (!doc) return next();

  await mongoose
    .model("Chapter")
    .updateOne({ _id: doc.chapter }, { $pull: { lessons: doc._id } });

  // Clean up lesson progress records
  await mongoose.model("LessonProgress").deleteMany({ lesson: doc._id });

  next();
});

// --- Ref cleanup on delete (document middleware: doc.deleteOne())
lessonSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    const lessonId = (this as any)._id;
    const chapterId = (this as any).chapter;

    await mongoose
      .model("Chapter")
      .updateOne({ _id: chapterId }, { $pull: { lessons: lessonId } });

    // Clean up lesson progress records
    await mongoose.model("LessonProgress").deleteMany({ lesson: lessonId });

    next();
  },
);

const lessonProgressSchema = new Schema<ILessonProgress>(
  {
    completed: { type: Boolean, default: false },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lesson: {
      type: Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
    },
  },
  { timestamps: true, collection: "lessonProgress" },
);

// Clean up references when lesson progress is deleted
lessonProgressSchema.pre("findOneAndDelete", async function (next) {
  const doc = await (this as any).model
    .findOne(this.getQuery())
    .select("_id lesson user");
  if (!doc) return next();

  // Remove from lesson's progress array
  await mongoose
    .model("Lesson")
    .updateOne({ _id: doc.lesson }, { $pull: { lessonProgress: doc._id } });

  // Remove from user's progress array
  await mongoose
    .model("User")
    .updateOne({ _id: doc.user }, { $pull: { lessonProgress: doc._id } });

  next();
});

export const LessonProgress = model<ILessonProgress>(
  "LessonProgress",
  lessonProgressSchema,
);
export const Lesson = model<ILesson>("Lesson", lessonSchema);
