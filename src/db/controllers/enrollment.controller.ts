import express from "express";
import mongoose from "mongoose";
import { Enrollment } from "@/db/models/enrollment.model";
import { Course } from "@/db/models/course.model";
import { User } from "@/db/models/auth.model";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/lib/auth";

export class EnrollmentController {
  // CREATE enrollment
  static async create(req: express.Request, res: express.Response) {
    try {
      const { courseId } = req.body;

      // Get authenticated user
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = session.user.id;

      // Validate required fields
      if (!courseId) {
        return res.status(400).json({
          message: "Course ID is required",
        });
      }

      // Check if course exists
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      // Check if user is already enrolled
      const existingEnrollment = await Enrollment.findOne({
        user: userId,
        course: courseId,
      });

      if (existingEnrollment) {
        return res.status(400).json({
          message: "User is already enrolled in this course",
        });
      }

      // Create enrollment
      const enrollment = new Enrollment({
        user: userId,
        course: courseId,
        amount: course.price,
        status: "active", // Set to active immediately, or "pending" if payment required
      });

      await enrollment.save();

      // Add enrollment reference to user
      await User.findByIdAndUpdate(userId, {
        $push: { enrollments: enrollment._id },
      });

      // Populate the enrollment
      const populatedEnrollment = await Enrollment.findById(enrollment._id)
        .populate("user", "name email")
        .populate("course", "title fileKey price");

      res.status(201).json({
        message: "Enrollment created successfully",
        data: populatedEnrollment,
      });
    } catch (error: any) {
      console.error("Enrollment creation error:", error);

      if (error.code === 11000) {
        return res.status(400).json({
          message: "User is already enrolled in this course",
        });
      }

      res.status(500).json({
        message: "Failed to create enrollment",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // GET all enrollments with filtering
  static async getAll(req: express.Request, res: express.Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {};
      if (req.query.userId) filter.user = req.query.userId;
      if (req.query.courseId) filter.course = req.query.courseId;
      if (req.query.status) filter.status = req.query.status;

      const enrollments = await Enrollment.find(filter)
        .populate("user", "name email role")
        .populate("course", "title fileKey price status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Enrollment.countDocuments(filter);

      res.status(200).json({
        data: enrollments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error("Get enrollments error:", error);
      res.status(500).json({ message: "Failed to get enrollments" });
    }
  }

  // GET enrollment by ID
  static async getById(req: express.Request, res: express.Response) {
    try {
      const enrollment = await Enrollment.findById(req.params.id)
        .populate("user", "name email role")
        .populate("course", "title fileKey price status");

      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }

      res.status(200).json({ data: enrollment });
    } catch (error) {
      console.error("Get enrollment error:", error);
      res.status(500).json({ message: "Failed to get enrollment" });
    }
  }

  // GET user's enrollments
  static async getUserEnrollments(req: express.Request, res: express.Response) {
    try {
      // Get authenticated user
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const userId = req.params.userId || session.user.id;

      // Check if user is requesting their own enrollments or is admin
      if (userId !== session.user.id && session.user.role !== "admin") {
        return res.status(403).json({ message: "Access denied" });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const filter: any = { user: userId };
      if (req.query.status) filter.status = req.query.status;

      const enrollments = await Enrollment.find(filter)
        .populate("course", "title slug fileKey price status smallDescription")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Enrollment.countDocuments(filter);

      res.status(200).json({
        data: enrollments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error("Get user enrollments error:", error);
      res.status(500).json({ message: "Failed to get user enrollments" });
    }
  }

  // GET course enrollments
  static async getCourseEnrollments(
    req: express.Request,
    res: express.Response,
  ) {
    try {
      const courseId = req.params.courseId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      // Check if course exists
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ message: "Course not found" });
      }

      const filter: any = { course: courseId };
      if (req.query.status) filter.status = req.query.status;

      const enrollments = await Enrollment.find(filter)
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Enrollment.countDocuments(filter);

      res.status(200).json({
        data: enrollments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      console.error("Get course enrollments error:", error);
      res.status(500).json({ message: "Failed to get course enrollments" });
    }
  }

  // UPDATE enrollment
  static async update(req: express.Request, res: express.Response) {
    try {
      const updates = { ...req.body, updatedAt: new Date() };

      // Don't allow changing user or course
      delete updates.user;
      delete updates.course;

      const enrollment = await Enrollment.findByIdAndUpdate(
        req.params.id,
        updates,
        {
          new: true,
          runValidators: true,
        },
      )
        .populate("user", "name email")
        .populate("course", "title fileKey price");

      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }

      res.status(200).json({
        message: "Enrollment updated successfully",
        data: enrollment,
      });
    } catch (error: any) {
      console.error("Enrollment update error:", error);
      res.status(500).json({
        message: "Failed to update enrollment",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // UPDATE enrollment progress
  static async updateProgress(req: express.Request, res: express.Response) {
    try {
      const { progress } = req.body;
      const enrollmentId = req.params.id;

      if (progress < 0 || progress > 100) {
        return res.status(400).json({
          message: "Progress must be between 0 and 100",
        });
      }

      const enrollment = await Enrollment.findByIdAndUpdate(
        enrollmentId,
        {
          progress,
          updatedAt: new Date(),
          ...(progress >= 100 && {
            status: "completed",
            completedAt: new Date(),
          }),
        },
        { new: true, runValidators: true },
      )
        .populate("user", "name email")
        .populate("course", "title fileKey");

      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }

      res.status(200).json({
        message: "Progress updated successfully",
        data: enrollment,
      });
    } catch (error: any) {
      console.error("Progress update error:", error);
      res.status(500).json({
        message: "Failed to update progress",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // DELETE enrollment
  static async delete(req: express.Request, res: express.Response) {
    try {
      const enrollment = await Enrollment.findById(req.params.id);
      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }

      // Remove enrollment reference from user
      await User.findByIdAndUpdate(enrollment.user, {
        $pull: { enrollments: enrollment._id },
      });

      // Delete the enrollment
      await enrollment.deleteOne();

      res.status(200).json({
        message: "Enrollment deleted successfully",
      });
    } catch (error: any) {
      console.error("Enrollment deletion error:", error);
      res.status(500).json({
        message: "Failed to delete enrollment",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }

  // Check if user is enrolled in course
  static async checkEnrollment(req: express.Request, res: express.Response) {
    try {
      const { courseId } = req.params;

      // Get authenticated user
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.user?.id) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const enrollment = await Enrollment.findOne({
        user: session.user.id,
        course: courseId,
        status: { $in: ["active", "completed"] },
      });

      res.status(200).json({
        isEnrolled: !!enrollment,
        enrollment: enrollment || null,
      });
    } catch (error) {
      console.error("Check enrollment error:", error);
      res.status(500).json({ message: "Failed to check enrollment" });
    }
  }

  // Get enrollment statistics
  static async getStats(req: express.Request, res: express.Response) {
    try {
      const stats = await Enrollment.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            avgProgress: { $avg: "$progress" },
          },
        },
      ]);

      const totalEnrollments = await Enrollment.countDocuments();
      const totalRevenue = await Enrollment.aggregate([
        {
          $match: { status: { $in: ["active", "completed"] } },
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          },
        },
      ]);

      res.status(200).json({
        data: {
          byStatus: stats,
          totalEnrollments,
          totalRevenue: totalRevenue[0]?.total || 0,
        },
      });
    } catch (error) {
      console.error("Get enrollment stats error:", error);
      res.status(500).json({ message: "Failed to get enrollment statistics" });
    }
  }
}
