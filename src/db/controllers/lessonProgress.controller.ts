import express from "express";
import { LessonProgress, Lesson } from "@/db/models/lesson.model";
import { Enrollment } from "@/db/models/enrollment.model";
import { User } from "@/db/models/auth.model";
import mongoose from "mongoose";

// Add interface for progress object to fix TypeScript errors
interface ProgressData {
  completed: boolean;
  user?: mongoose.Types.ObjectId;
  lesson?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  _id?: any;
}

export class LessonProgressController {
  // CREATE or UPDATE lesson progress
  static async createOrUpdate(req: any, res: express.Response) {
    try {
      const { lessonId } = req.params;
      const { completed = true } = req.body;
      const userId = req.user.id;

      // Validate lesson exists
      const lesson = await Lesson.findById(lessonId).populate("chapter");
      if (!lesson) {
        return res.status(404).json({ message: "Lesson not found" });
      }

      // Get the course ID from the lesson's chapter
      const chapter = await mongoose.model("Chapter").findById(lesson.chapter);
      if (!chapter) {
        return res.status(404).json({ message: "Chapter not found" });
      }

      // Check if user is enrolled in the course
      const enrollment = await Enrollment.findOne({
        user: userId,
        course: chapter.course,
        status: { $in: ["active", "completed"] },
      });

      if (!enrollment) {
        return res.status(403).json({
          message: "You must be enrolled in this course to track progress",
        });
      }

      // Find existing progress or create new
      let lessonProgress = await LessonProgress.findOne({
        user: userId,
        lesson: lessonId,
      });

      if (lessonProgress) {
        // Update existing progress
        lessonProgress.completed = completed;
        await lessonProgress.save();
      } else {
        // Create new progress
        lessonProgress = new LessonProgress({
          user: userId,
          lesson: lessonId,
          completed,
        });
        await lessonProgress.save();

        // Add progress reference to lesson and user
        await Promise.all([
          Lesson.findByIdAndUpdate(lessonId, {
            $addToSet: { lessonProgress: lessonProgress._id },
          }),
          User.findByIdAndUpdate(userId, {
            $addToSet: { lessonProgress: lessonProgress._id },
          }),
        ]);
      }

      // Populate lesson and user data
      await lessonProgress.populate([
        { path: "lesson", select: "title position chapter" },
        { path: "user", select: "name email" },
      ]);

      res.status(200).json({
        message: completed
          ? "Lesson marked as completed"
          : "Lesson marked as incomplete",
        data: lessonProgress,
      });
    } catch (error) {
      console.error("Create/Update lesson progress error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // GET lesson progress for a specific lesson and user
  static async getByLessonAndUser(req: any, res: express.Response) {
    try {
      const { lessonId } = req.params;
      const userId = req.user.id;

      const lessonProgress = await LessonProgress.findOne({
        user: userId,
        lesson: lessonId,
      }).populate([
        { path: "lesson", select: "title position chapter" },
        { path: "user", select: "name email" },
      ]);

      if (!lessonProgress) {
        return res.status(404).json({
          message: "No progress found for this lesson",
          data: { completed: false },
        });
      }

      res.status(200).json({ data: lessonProgress });
    } catch (error) {
      console.error("Get lesson progress error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // GET all lesson progress for a user in a chapter
  static async getChapterProgress(req: any, res: express.Response) {
    try {
      const { chapterId } = req.params;
      const userId = req.user.id;

      // Get all lessons in the chapter
      const lessons = await Lesson.find({ chapter: chapterId })
        .select("_id title position")
        .sort({ position: 1 });

      const lessonIds = lessons.map((lesson) => lesson._id);

      // Get progress for all lessons
      const progressRecords = await LessonProgress.find({
        user: userId,
        lesson: { $in: lessonIds },
      }).populate("lesson", "title position");

      // Create a map of lesson progress with proper typing
      const progressMap: Record<string, ProgressData> = progressRecords.reduce(
        (acc, progress) => {
          acc[progress.lesson._id.toString()] = {
            completed: progress.completed,
            user: progress.user,
            lesson: progress.lesson._id,
            createdAt: progress.createdAt,
            updatedAt: progress.updatedAt,
            _id: progress._id,
          };
          return acc;
        },
        {} as Record<string, ProgressData>,
      );

      // Combine lessons with their progress
      const chapterProgress = lessons.map((lesson: any) => ({
        lesson: lesson,
        progress: progressMap[lesson._id.toString()] ?? { completed: false },
      }));

      // Calculate completion stats
      const totalLessons = lessons.length;
      const completedLessons = progressRecords.filter(
        (p) => p.completed,
      ).length;
      const completionPercentage =
        totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0;

      res.status(200).json({
        data: {
          chapterId,
          lessons: chapterProgress,
          stats: {
            totalLessons,
            completedLessons,
            completionPercentage,
          },
        },
      });
    } catch (error) {
      console.error("Get chapter progress error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // GET all lesson progress for a user in a course
  static async getCourseProgress(req: any, res: express.Response) {
    try {
      const { courseId } = req.params;
      const userId = req.user.id;

      // Get all chapters and lessons for the course
      const chapters = await mongoose
        .model("Chapter")
        .find({ course: courseId })
        .select("_id title position")
        .sort({ position: 1 });

      const chapterIds = chapters.map((chapter) => chapter._id);

      const lessons = await Lesson.find({ chapter: { $in: chapterIds } })
        .select("_id title position chapter")
        .sort({ chapter: 1, position: 1 });

      const lessonIds = lessons.map((lesson) => lesson._id);

      // Get progress for all lessons
      const progressRecords = await LessonProgress.find({
        user: userId,
        lesson: { $in: lessonIds },
      }).populate("lesson", "title position chapter");

      // Create progress map with proper typing
      const progressMap: Record<string, ProgressData> = progressRecords.reduce(
        (acc, progress) => {
          acc[progress.lesson._id.toString()] = {
            completed: progress.completed,
            user: progress.user,
            lesson: progress.lesson._id,
            createdAt: progress.createdAt,
            updatedAt: progress.updatedAt,
            _id: progress._id,
          };
          return acc;
        },
        {} as Record<string, ProgressData>,
      );

      // Group lessons by chapter and add progress
      const courseProgress = chapters.map((chapter) => {
        const chapterLessons = lessons
          .filter(
            (lesson) => lesson.chapter.toString() === chapter._id.toString(),
          )
          .map((lesson: any) => ({
            lesson,
            progress: progressMap[lesson._id.toString()] ?? {
              completed: false,
            },
          }));

        const completedInChapter = chapterLessons.filter(
          (l) => l.progress.completed,
        ).length;
        const chapterCompletionPercentage =
          chapterLessons.length > 0
            ? Math.round((completedInChapter / chapterLessons.length) * 100)
            : 0;

        return {
          chapter,
          lessons: chapterLessons,
          stats: {
            totalLessons: chapterLessons.length,
            completedLessons: completedInChapter,
            completionPercentage: chapterCompletionPercentage,
          },
        };
      });

      // Calculate overall course stats
      const totalLessons = lessons.length;
      const completedLessons = progressRecords.filter(
        (p) => p.completed,
      ).length;
      const overallCompletionPercentage =
        totalLessons > 0
          ? Math.round((completedLessons / totalLessons) * 100)
          : 0;

      res.status(200).json({
        data: {
          courseId,
          chapters: courseProgress,
          stats: {
            totalChapters: chapters.length,
            totalLessons,
            completedLessons,
            completionPercentage: overallCompletionPercentage,
          },
        },
      });
    } catch (error) {
      console.error("Get course progress error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // GET user's overall progress across all courses
  static async getUserProgress(req: any, res: express.Response) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Get user's enrollments
      const enrollments = await Enrollment.find({
        user: userId,
        status: { $in: ["active", "completed"] },
      })
        .populate("course", "title slug")
        .limit(limitNum)
        .skip(skip)
        .sort({ createdAt: -1 });

      // Get progress for each enrolled course
      const progressData = await Promise.all(
        enrollments.map(async (enrollment) => {
          const courseId = enrollment.course._id;

          // Get all lessons in this course
          const chapters = await mongoose
            .model("Chapter")
            .find({ course: courseId });
          const chapterIds = chapters.map((c) => c._id);
          const lessons = await Lesson.find({ chapter: { $in: chapterIds } });
          const lessonIds = lessons.map((l) => l._id);

          // Get user's progress for this course
          const progressRecords = await LessonProgress.find({
            user: userId,
            lesson: { $in: lessonIds },
          });

          const totalLessons = lessons.length;
          const completedLessons = progressRecords.filter(
            (p) => p.completed,
          ).length;
          const completionPercentage =
            totalLessons > 0
              ? Math.round((completedLessons / totalLessons) * 100)
              : 0;

          return {
            enrollment,
            progress: {
              totalLessons,
              completedLessons,
              completionPercentage,
              lastActivity:
                progressRecords.length > 0
                  ? Math.max(
                      ...progressRecords.map((p) =>
                        new Date(p.updatedAt).getTime(),
                      ),
                    )
                  : null,
            },
          };
        }),
      );

      // Overall user stats
      const totalProgress = await LessonProgress.countDocuments({
        user: userId,
      });
      const completedProgress = await LessonProgress.countDocuments({
        user: userId,
        completed: true,
      });

      res.status(200).json({
        data: progressData,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: enrollments.length,
        },
        stats: {
          totalProgressRecords: totalProgress,
          totalCompletedLessons: completedProgress,
        },
      });
    } catch (error) {
      console.error("Get user progress error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // DELETE lesson progress
  static async delete(req: any, res: express.Response) {
    try {
      const { lessonId } = req.params;
      const userId = req.user.id;

      const lessonProgress = await LessonProgress.findOneAndDelete({
        user: userId,
        lesson: lessonId,
      });

      if (!lessonProgress) {
        return res.status(404).json({ message: "Lesson progress not found" });
      }

      res.status(200).json({ message: "Lesson progress deleted successfully" });
    } catch (error) {
      console.error("Delete lesson progress error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }

  // ADMIN: Get lesson progress analytics
  static async getAnalytics(req: any, res: express.Response) {
    try {
      const { courseId, chapterId, lessonId } = req.query;

      let matchConditions: any = {};

      // Build aggregation pipeline based on query parameters
      const pipeline: any[] = [
        {
          $lookup: {
            from: "lessons",
            localField: "lesson",
            foreignField: "_id",
            as: "lessonData",
          },
        },
        { $unwind: "$lessonData" },
      ];

      if (lessonId) {
        matchConditions.lesson = new mongoose.Types.ObjectId(
          lessonId as string,
        );
      }

      if (chapterId) {
        matchConditions["lessonData.chapter"] = new mongoose.Types.ObjectId(
          chapterId as string,
        );
      }

      if (courseId) {
        pipeline.push(
          {
            $lookup: {
              from: "chapters",
              localField: "lessonData.chapter",
              foreignField: "_id",
              as: "chapterData",
            },
          },
          { $unwind: "$chapterData" },
        );
        matchConditions["chapterData.course"] = new mongoose.Types.ObjectId(
          courseId as string,
        );
      }

      if (Object.keys(matchConditions).length > 0) {
        pipeline.push({ $match: matchConditions });
      }

      // Add analytics aggregation
      pipeline.push(
        {
          $group: {
            _id: {
              lesson: "$lesson",
              lessonTitle: "$lessonData.title",
              completed: "$completed",
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: {
              lesson: "$_id.lesson",
              lessonTitle: "$_id.lessonTitle",
            },
            completedCount: {
              $sum: { $cond: [{ $eq: ["$_id.completed", true] }, "$count", 0] },
            },
            totalCount: { $sum: "$count" },
          },
        },
        {
          $project: {
            lessonId: "$_id.lesson",
            lessonTitle: "$_id.lessonTitle",
            completedCount: 1,
            totalCount: 1,
            completionRate: {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$completedCount", "$totalCount"] },
                    100,
                  ],
                },
                2,
              ],
            },
          },
        },
        { $sort: { completionRate: -1 } },
      );

      const analytics = await LessonProgress.aggregate(pipeline);

      res.status(200).json({ data: analytics });
    } catch (error) {
      console.error("Get lesson progress analytics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
}
