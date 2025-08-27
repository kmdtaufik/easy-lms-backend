import mongoose, { Schema, Types, Document, model } from "mongoose";

export interface IChapter extends Document {
  title: string;
  position: number; // order within the course
  course: Types.ObjectId; // parent course
  lessons: Types.ObjectId[]; // child lessons
  createdAt: Date;
  updatedAt: Date;
}

const chapterSchema = new Schema<IChapter>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    position: { type: Number, required: true, min: 1 },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    lessons: [{ type: Schema.Types.ObjectId, ref: "Lesson" }],
  },
  { timestamps: true, collection: "chapters" }
);

//indexing
chapterSchema.index({ course: 1 });
chapterSchema.index({ createdAt: -1 });

// --- Cascade + ref cleanup on delete (query middleware: findByIdAndDelete/findOneAndDelete)
chapterSchema.pre("findOneAndDelete", async function (next) {
  const query = this.getQuery();
  const doc = await (this as any).model.findOne(query).select("_id course");
  if (!doc) return next();

  const Lesson = mongoose.model("Lesson");
  await Lesson.deleteMany({ chapter: doc._id });

  // remove this chapter's id from its course
  await mongoose
    .model("Course")
    .updateOne({ _id: doc.course }, { $pull: { chapters: doc._id } });

  next();
});

// --- Cascade + ref cleanup on delete (document middleware: doc.deleteOne())
chapterSchema.pre(
  "deleteOne",
  { document: true, query: false },
  async function (next) {
    const chapterId = (this as any)._id;
    const courseId = (this as any).course;

    const Lesson = mongoose.model("Lesson");
    await Lesson.deleteMany({ chapter: chapterId });

    await mongoose
      .model("Course")
      .updateOne({ _id: courseId }, { $pull: { chapters: chapterId } });

    next();
  }
);

export const Chapter = model<IChapter>("Chapter", chapterSchema);
