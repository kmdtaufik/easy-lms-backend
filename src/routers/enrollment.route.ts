import express from "express";
import { EnrollmentController } from "@/db/controllers/enrollment.controller";

const router: express.Router = express.Router();

// CREATE enrollment
router.post("/", EnrollmentController.create);

// GET all enrollments
router.get("/", EnrollmentController.getAll);

// GET enrollment statistics
router.get("/stats", EnrollmentController.getStats);

// GET user's enrollments
router.get("/user/:userId", EnrollmentController.getUserEnrollments);

// GET course enrollments
router.get("/course/:courseId", EnrollmentController.getCourseEnrollments);

// Check enrollment status
router.get("/check/:courseId", EnrollmentController.checkEnrollment);

// GET enrollment by ID
router.get("/:id", EnrollmentController.getById);

// UPDATE enrollment
router.put("/:id", EnrollmentController.update);

// UPDATE enrollment progress
router.patch("/:id/progress", EnrollmentController.updateProgress);

// DELETE enrollment
router.delete("/:id", EnrollmentController.delete);

export default router;
