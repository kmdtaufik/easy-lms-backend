import express from "express";
import mongoose from "mongoose";
import { Lesson } from "@/db/models/lesson.model";
import { Chapter } from "@/db/models/chapter.model";

export class LessonController {
  static async create(req: express.Request, res: express.Response) {
    try {
      const { title, description, thumbnailKey, videoKey, chapterId } =
        req.body;

      // Validate required fields
      if (!title || !chapterId) {
        return res.status(400).json({
          message: "Title and chapterId are required",
        });
      }

      // Check if chapter exists
      const chapter = await Chapter.findById(chapterId);
      if (!chapter) {
        return res.status(404).json({ message: "Chapter not found" });
      }

      // Count existing lessons in this chapter to determine next position
      const existingLessonsCount = await Lesson.countDocuments({
        chapter: chapterId,
      });

      // Create new lesson with calculated position
      const lesson = new Lesson({
        title,
        description,
        thumbnailKey,
        videoKey,
        position: existingLessonsCount + 1, // Add to the very last
        chapter: chapterId,
      });

      await lesson.save();

      // Add lesson reference to chapter
      chapter.lessons.push(lesson._id as mongoose.Types.ObjectId);
      await chapter.save();

      res.status(201).json({
        message: "Lesson created successfully",
        data: lesson,
      });
    } catch (error: any) {
      console.error("Lesson creation error:", error);
      res.status(500).json({
        message: "Failed to create lesson",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async getAll(req: express.Request, res: express.Response) {
    try {
      const filter = req.query.chapterId
        ? { chapter: req.query.chapterId }
        : {};
      const lessons = await Lesson.find(filter).sort({ position: 1 }); // Sort by position
      res.status(200).json(lessons);
    } catch (error) {
      res.status(500).json({ message: "Failed to get lessons", error });
    }
  }

  static async getById(req: express.Request, res: express.Response) {
    try {
      const lesson = await Lesson.findById(req.params.id);
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });
      res.status(200).json(lesson);
    } catch (error) {
      res.status(500).json({ message: "Failed to get lesson", error });
    }
  }

  static async update(req: express.Request, res: express.Response) {
    try {
      const updates = { ...req.body, updatedAt: new Date() };

      const lesson = await Lesson.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      });

      if (!lesson) return res.status(404).json({ message: "Lesson not found" });

      res.status(200).json({
        message: "Lesson updated successfully",
        data: lesson,
      });
    } catch (error: any) {
      console.error("Lesson update error:", error);
      res.status(500).json({
        message: "Failed to update lesson",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
  static async delete(req: express.Request, res: express.Response) {
    try {
      const lesson = await Lesson.findById(req.params.id);
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }

      const chapterId = lesson.chapter;
      const deletedPosition = lesson.position;

      // Remove lesson reference from chapter
      await Chapter.findByIdAndUpdate(chapterId, {
        $pull: { lessons: lesson._id },
      });

      // Delete the lesson
      await lesson.deleteOne();

      // Reorder remaining lessons to maintain sequential positions
      await Lesson.updateMany(
        { chapter: chapterId, position: { $gt: deletedPosition } },
        { $inc: { position: -1 } },
      );

      res.status(200).json({
        message: "Lesson deleted and positions updated successfully",
      });
    } catch (error: any) {
      console.error("Delete lesson error:", error);
      res.status(500).json({
        message: "Failed to delete lesson",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
}
