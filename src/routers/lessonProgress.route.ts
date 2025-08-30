import express from "express";
import { LessonProgressController } from "@/db/controllers/lessonProgress.controller";

const router: express.Router = express.Router();

// Static & longer paths first
router.get("/admin/analytics", LessonProgressController.getAnalytics);
router.get("/user/all", LessonProgressController.getUserProgress);
router.get("/chapter/:chapterId", LessonProgressController.getChapterProgress);
router.get("/course/:courseId", LessonProgressController.getCourseProgress);

// Dynamic parameter routes last
router.get("/:lessonId", LessonProgressController.getByLessonAndUser);
router.post("/:lessonId", LessonProgressController.createOrUpdate);
router.delete("/:lessonId", LessonProgressController.delete);

export default router;
