import express from "express";
import mongoose from "mongoose";
import { Lesson } from "@/db/models/lesson.model";
import { Chapter } from "@/db/models/chapter.model";

export class LessonController {
  static async create(req: express.Request, res: express.Response) {
    try {
      const { title, description, thumbnailKey, videoKey, chapterId } =
        req.body;
      const chapter = await Chapter.findById(chapterId);
      if (!chapter)
        return res.status(404).json({ message: "Chapter not found" });

      const lesson = new Lesson({
        title,
        description,
        thumbnailKey,
        videoKey,
        chapter: chapterId,
      });
      await lesson.save();

      chapter.lessons.push(lesson._id as mongoose.Types.ObjectId); // ✅ cast to ObjectId
      await chapter.save();

      res.status(201).json(lesson);
    } catch (error) {
      res.status(500).json({ message: "Failed to create lesson", error });
    }
  }

  static async getAll(req: express.Request, res: express.Response) {
    try {
      const filter = req.query.chapterId
        ? { chapter: req.query.chapterId }
        : {};
      const lessons = await Lesson.find(filter);
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
      const lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true,
      });
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });
      res.status(200).json(lesson);
    } catch (error) {
      res.status(500).json({ message: "Failed to update lesson", error });
    }
  }

  static async delete(req: express.Request, res: express.Response) {
    try {
      const lesson = await Lesson.findById(req.params.id);
      if (!lesson) return res.status(404).json({ message: "Lesson not found" });

      // remove lesson reference from chapter
      await Chapter.findByIdAndUpdate(lesson.chapter, {
        $pull: { lessons: lesson._id },
      });

      await lesson.deleteOne();
      res.status(200).json({ message: "Lesson deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete lesson", error });
    }
  }
}
