import express from "express";
import mongoose from "mongoose";
import { Chapter } from "@/db/models/chapter.model";
import { Lesson } from "@/db/models/lesson.model";
import { Course } from "@/db/models/course.model";

export class ChapterController {
  static async create(req: express.Request, res: express.Response) {
    try {
      const { title, position, courseId } = req.body;
      const course = await Course.findById(courseId);
      if (!course) return res.status(404).json({ message: "Course not found" });

      const chapter = new Chapter({ title, position, course: courseId });
      await chapter.save();

      course.chapters.push(chapter._id as mongoose.Types.ObjectId); // ✅ cast to ObjectId
      await course.save();

      res.status(201).json(chapter);
    } catch (error) {
      res.status(500).json({ message: "Failed to create chapter", error });
    }
  }

  static async getAll(req: express.Request, res: express.Response) {
    try {
      const filter = req.query.courseId ? { course: req.query.courseId } : {};
      const chapters = await Chapter.find(filter).populate("lessons");
      res.status(200).json(chapters);
    } catch (error) {
      res.status(500).json({ message: "Failed to get chapters", error });
    }
  }

  static async getById(req: express.Request, res: express.Response) {
    try {
      const chapter = await Chapter.findById(req.params.id).populate("lessons");
      if (!chapter)
        return res.status(404).json({ message: "Chapter not found" });
      res.status(200).json(chapter);
    } catch (error) {
      res.status(500).json({ message: "Failed to get chapter", error });
    }
  }

  static async update(req: express.Request, res: express.Response) {
    try {
      const chapter = await Chapter.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!chapter)
        return res.status(404).json({ message: "Chapter not found" });
      res.status(200).json(chapter);
    } catch (error) {
      res.status(500).json({ message: "Failed to update chapter", error });
    }
  }

  static async delete(req: express.Request, res: express.Response) {
    try {
      const chapter = await Chapter.findById(req.params.id);
      if (!chapter)
        return res.status(404).json({ message: "Chapter not found" });

      // delete lessons
      await Lesson.deleteMany({ chapter: chapter._id });

      // remove chapter reference from course
      await Course.findByIdAndUpdate(chapter.course, {
        $pull: { chapters: chapter._id },
      });

      await chapter.deleteOne();
      res.status(200).json({ message: "Chapter and its lessons deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete chapter", error });
    }
  }
}
