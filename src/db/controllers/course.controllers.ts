// controllers/course.controller.ts
import slugify from "slugify";
import express from "express";
import { Course } from "../models/course.model";
import { User } from "../models/auth.model"; // ✅ Import User for population
import { Chapter } from "../models/chapter.model";
import { Lesson } from "../models/lesson.model";
import { s3FileDelete } from "@/services/s3";

export class CourseController {
  // CREATE
  static async create(req: express.Request, res: express.Response) {
    try {
      const {
        title,
        fileKey,
        price,
        description,
        duration,
        level,
        category,
        smallDescription,
        slug,
        status,
        createdBy,
      } = req.body;

      if (
        !title ||
        !fileKey ||
        !description ||
        !smallDescription ||
        !createdBy
      ) {
        return res.status(400).json({
          message: "Missing required fields",
          required: [
            "title",
            "fileKey",
            "description",
            "smallDescription",
            "createdBy",
          ],
        });
      }

      if (price < 0 || duration < 0) {
        return res.status(400).json({
          message: "Price and duration must be positive numbers",
        });
      }

      let finalSlug = slug
        ? slugify(slug, { lower: true, strict: true })
        : slugify(title, { lower: true, strict: true });

      const existing = await Course.findOne({ slug: finalSlug });
      if (existing) finalSlug = `${finalSlug}-${Date.now()}`;

      const course = new Course({
        title,
        fileKey,
        price: Number(price),
        description,
        duration: Number(duration),
        level,
        category,
        smallDescription,
        slug: finalSlug,
        status,
        createdBy, // This must be a valid User _id
      });

      const saved = await course.save();
      const populated = await saved.populate("createdBy", "name email role"); // ✅ populate immediately

      res.status(201).json({
        message: "Course created successfully",
        data: populated,
      });
    } catch (error: any) {
      if (process.env.NODE_ENV !== "production") console.error(error);

      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map(
          (err: any) => err.message,
        );
        return res.status(400).json({ message: "Validation failed", errors });
      }

      if (error.code === 11000) {
        return res
          .status(400)
          .json({ message: "Course with this slug already exists" });
      }

      res.status(500).json({ message: "Failed to create course" });
    }
  }

  // GET all with pagination and population
  static async getAll(req: express.Request, res: express.Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const filter: any = {};
      if (req.query.status) filter.status = req.query.status;
      if (req.query.category) filter.category = req.query.category;
      if (req.query.level) filter.level = req.query.level;

      const courses = await Course.find(filter)
        .populate("createdBy", "name email role") // ✅ populate
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Course.countDocuments(filter);

      res.status(200).json({
        data: courses,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.error(error);
      res.status(500).json({ message: "Couldn't get courses" });
    }
  }

  // GET by ID
  static async getById(req: express.Request, res: express.Response) {
    try {
      const course = await Course.findById(req.params.id)
        .populate("createdBy", "name email role image") // creator info
        .populate({
          path: "chapters", // populate chapters
          options: { sort: { position: 1 } }, // optional: sort by chapter position
          populate: {
            path: "lessons", // populate lessons inside each chapter
            options: { sort: { position: 1 } }, // optional: sort lessons by position
          },
        });

      if (!course) return res.status(404).json({ message: "Course not found" });

      res.status(200).json({ data: course });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.error(error);
      res.status(500).json({ message: "Couldn't get course" });
    }
  }

  // GET by slug
  static async getBySlug(req: express.Request, res: express.Response) {
    try {
      const course = await Course.findOne({ slug: req.params.slug }).populate(
        "createdBy",
        "name email role",
      );
      if (!course) return res.status(404).json({ message: "Course not found" });
      res.status(200).json({ data: course });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.error(error);
      res.status(500).json({ message: "Couldn't get course" });
    }
  }

  // UPDATE
  static async update(req: express.Request, res: express.Response) {
    try {
      const updates = { ...req.body, updatedAt: new Date() };
      Object.keys(updates).forEach(
        (key) => updates[key] === undefined && delete updates[key],
      );

      if (updates.price !== undefined && updates.price < 0)
        return res.status(400).json({ message: "Price must be positive" });
      if (updates.duration !== undefined && updates.duration < 0)
        return res.status(400).json({ message: "Duration must be positive" });

      if (updates.slug) {
        let newSlug = slugify(updates.slug, { lower: true, strict: true });
        const exists = await Course.findOne({
          slug: newSlug,
          _id: { $ne: req.params.id },
        });
        if (exists) newSlug = `${newSlug}-${Date.now()}`;
        updates.slug = newSlug;
      }

      const course = await Course.findByIdAndUpdate(req.params.id, updates, {
        new: true,
        runValidators: true,
      }).populate("createdBy", "name email role");

      if (!course) return res.status(404).json({ message: "Course not found" });

      res
        .status(200)
        .json({ message: "Course updated successfully", data: course });
    } catch (error: any) {
      if (process.env.NODE_ENV !== "production") console.error(error);

      if (error.name === "ValidationError") {
        const errors = Object.values(error.errors).map(
          (err: any) => err.message,
        );
        return res.status(400).json({ message: "Validation failed", errors });
      }

      if (error.code === 11000)
        return res
          .status(400)
          .json({ message: "Course with this slug already exists" });

      res.status(500).json({ message: "Failed to update course" });
    }
  }

  // DELETE course (cascade: remove chapters + lessons)
  static async delete(req: express.Request, res: express.Response) {
    try {
      const course = await Course.findById(req.params.id);
      if (!course) return res.status(404).json({ message: "Course not found" });

      //  delete all chapters + lessons
      const chapters = await Chapter.find({ course: course._id });
      for (const chapter of chapters) {
        const lessons = await Lesson.find({ chapter: chapter._id });
        for (const lesson of lessons) {
          if (lesson.thumbnailKey) await s3FileDelete(lesson.thumbnailKey);
          if (lesson.videoKey) await s3FileDelete(lesson.videoKey);
        }
        await Lesson.deleteMany({ chapter: chapter._id }); // delete lessons under chapter
        // no need to delete chapter here, will do bulk delete after loop
      }
      await Chapter.deleteMany({ course: course._id });

      //delte filkey from s3
      if (course.fileKey) await s3FileDelete(course.fileKey);

      // finally delete the course
      await course.deleteOne();

      res.status(200).json({
        message: "Course and related chapters/lessons deleted successfully",
      });
    } catch (error) {
      if (process.env.NODE_ENV !== "production") console.error(error);
      res.status(500).json({ message: "Failed to delete course" });
    }
  }
}
