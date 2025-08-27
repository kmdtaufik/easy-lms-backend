import express from "express";
import mongoose from "mongoose";
import { Chapter } from "@/db/models/chapter.model";
import { Lesson } from "@/db/models/lesson.model";
import { Course } from "@/db/models/course.model";

export class ChapterController {
  static async create(req: express.Request, res: express.Response) {
    try {
      const { title, courseId } = req.body;

      // Validate required fields
      if (!title || !courseId) {
        return res.status(400).json({
          message: "Title and courseId are required",
        });
      }

      // Check if course exists
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Count existing chapters for this course to determine next position
      const existingChaptersCount = await Chapter.countDocuments({
        course: courseId,
      });

      // Create new chapter with calculated position
      const chapter = new Chapter({
        title,
        position: existingChaptersCount + 1, // Add to the very last
        course: courseId,
      });

      await chapter.save();

      // Add chapter reference to course
      course.chapters.push(chapter._id as mongoose.Types.ObjectId);
      await course.save();

      res.status(201).json({
        message: "Chapter created successfully",
        data: chapter,
      });
    } catch (error: any) {
      console.error("Chapter creation error:", error);
      res.status(500).json({
        message: "Failed to create chapter",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async getAll(req: express.Request, res: express.Response) {
    try {
      const filter = req.query.courseId ? { course: req.query.courseId } : {};
      const chapters = await Chapter.find(filter)
        .populate("lessons")
        .sort({ position: 1 }); // Sort by position
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
      const updates = { ...req.body, updatedAt: new Date() };

      const chapter = await Chapter.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      });

      if (!chapter)
        return res.status(404).json({ message: "Chapter not found" });

      res.status(200).json({
        message: "Chapter updated successfully",
        data: chapter,
      });
    } catch (error: any) {
      console.error("Chapter update error:", error);
      res.status(500).json({
        message: "Failed to update chapter",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  static async delete(req: express.Request, res: express.Response) {
    try {
      const chapter = await Chapter.findById(req.params.id);
      if (!chapter) {
        return res.status(404).json({ message: "Chapter not found" });
      }
      // Delete all lessons in this chapter
      await Lesson.deleteMany({ chapter: chapter._id });

      // Remove chapter reference from course
      await Course.findByIdAndUpdate(chapter.course, {
        $pull: { chapters: chapter._id },
      });

      // Delete the chapter
      await chapter.deleteOne();

      // Reorder remaining chapters to maintain sequential positions
      const remainingChapters = await Chapter.find({
        course: chapter.course,
      }).sort({ position: 1 });

      for (let i = 0; i < remainingChapters.length; i++) {
        remainingChapters[i].position = i + 1;
        await remainingChapters[i].save();
      }

      res.status(200).json({
        message: "Chapter and its lessons deleted successfully",
      });
    } catch (error: any) {
      console.error("Chapter deletion error:", error);
      res.status(500).json({
        message: "Failed to delete chapter",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
}
