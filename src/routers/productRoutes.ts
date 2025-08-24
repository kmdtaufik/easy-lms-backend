import { deleteFile, fileUpload } from "@/services/s3";
import express from "express";

const router: express.Router = express.Router();

router.post("/s3/upload", fileUpload);
router.delete("/s3/delete", deleteFile);

export default router;
