import express from "express";
import { ChapterController } from "@/db/controllers/chapter.controller";

const router: express.Router = express.Router();

// CREATE a chapter
router.post("/", ChapterController.create);

// GET all chapters (optional: filter by course)
router.get("/", ChapterController.getAll);

// GET a single chapter by ID
router.get("/:id", ChapterController.getById);

// UPDATE a chapter
router.put("/:id", ChapterController.update);

// DELETE a chapter
router.delete("/:id", ChapterController.delete);

export default router;
