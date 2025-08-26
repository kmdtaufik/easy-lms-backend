import express from "express";
import { LessonController } from "@/db/controllers/lesson.controller";

const router: express.Router = express.Router();

// CREATE a lesson
router.post("/", LessonController.create);

// GET all lessons (optional: filter by chapter)
router.get("/", LessonController.getAll);

// GET a lesson by ID
router.get("/:id", LessonController.getById);

// UPDATE a lesson
router.put("/:id", LessonController.update);

// DELETE a lesson
router.delete("/:id", LessonController.delete);

export default router;
