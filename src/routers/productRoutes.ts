import { CourseController } from "@/db/controllers/course.controllers";
import { deleteFile, fileUpload } from "@/services/s3";
import express from "express";

const router: express.Router = express.Router();

router.post("/s3/upload", fileUpload);
router.delete("/s3/delete", deleteFile);
router.post("/", CourseController.create);
router.get("/", CourseController.getAll);
router.get("/:id", CourseController.getById);
router.put("/:id", CourseController.update);
router.delete("/:id", CourseController.delete);

export default router;
