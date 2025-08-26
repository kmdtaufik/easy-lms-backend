import mongoose, { Schema, Types, Document, model } from "mongoose";

export interface ILesson extends Document {
  title: string;
  description?: string;
  thumbnailKey?: string;
  videoKey?: string;
  chapter: Types.ObjectId; // parent chapter
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

    next();
  },
);

export const Lesson = model<ILesson>("Lesson", lessonSchema);
